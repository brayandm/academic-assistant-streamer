import * as dotenv from "dotenv";
import WebSocketManager from "./WebSocketManager";
import {
  StartStreamTranscriptionCommand,
  TranscribeStreamingClient,
} from "@aws-sdk/client-transcribe-streaming";
import { AwsCredentialIdentity } from "@aws-sdk/types";
import wav from "wav";
import Stream from "stream";
import { exec } from "child_process";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const canCloseConnection: { [key: string]: Promise<void> } = {};

const dontCallOnTimeoutOnClose: { [key: string]: boolean } = {};

const closeConnection: { [key: string]: (value: unknown) => void | null } = {};

const timeoutId: { [key: string]: NodeJS.Timeout | undefined } = {};

const onTimeout: { [key: string]: (isAsleep: boolean) => void } = {};

type InputStream = {
  AudioEvent: {
    AudioChunk: Uint8Array;
  };
};

const asyncCallback = async (
  connectionId: string,
  messages: AsyncGenerator<string>
) => {
  const setup = JSON.parse(await webSocketManager.getSetup(connectionId)) as {
    token: string;
    language: string;
  };

  let user_id: number;

  try {
    const response = await axios.post(
      process.env.BACKEND_URL + "/api/v1/streamer/task/access-control",
      {
        token: setup.token,
        task_type: "SPEECH_TO_TEXT",
      },
      {
        headers: { "X-API-Key": process.env.STREAMER_API_TOKEN },
      }
    );

    if (
      response.status !== 200 ||
      response.data["message"] !== "Access granted" ||
      response.data["user_id"] === undefined
    ) {
      console.log("Access denied");

      webSocketManager.sendMessage(
        connectionId,
        JSON.stringify({
          data: null,
          isAsleep: true,
        })
      );

      dontCallOnTimeoutOnClose[connectionId] = true;

      webSocketManager.closeConnection(connectionId);

      if (closeConnection[connectionId]) {
        closeConnection[connectionId](null);
        closeConnection[connectionId] = null;
      }

      return;
    }

    user_id = response.data["user_id"];
  } catch (e) {
    console.log("Error while requesting access control");

    webSocketManager.sendMessage(
      connectionId,
      JSON.stringify({
        data: null,
        isAsleep: true,
      })
    );

    dontCallOnTimeoutOnClose[connectionId] = true;

    webSocketManager.closeConnection(connectionId);

    if (closeConnection[connectionId]) {
      closeConnection[connectionId](null);
      closeConnection[connectionId] = null;
    }

    return;
  }

  canCloseConnection[connectionId] = new Promise((resolve) => {
    closeConnection[connectionId] = resolve;
  });

  const stream: InputStream[] = [];

  let promiseResolver: (value: unknown) => void | null = null;

  let stopSignal = false;

  let promiseResolverClientDestroy: (value: unknown) => void | null = null;

  const stopTransmition = () => {
    stopSignal = true;
    console.log("Sending stop Signal...");
    if (promiseResolver) {
      promiseResolver(null);
      promiseResolver = null;
    }
  };

  const chunks: Uint8Array[] = [];

  let seconds = 0;

  async function* getStream(): AsyncGenerator<InputStream> {
    while (true) {
      if (stopSignal) break;

      if (stream.length > 0) {
        chunks.push(stream[0].AudioEvent.AudioChunk);
        seconds += stream[0].AudioEvent.AudioChunk.length / 44100 / 2;
        yield stream.shift();
      } else {
        await new Promise((resolve) => {
          promiseResolver = resolve;
        });
      }
    }
  }

  const transformMessages = async () => {
    for await (const message of messages) {
      stream.push({
        AudioEvent: {
          AudioChunk: new Uint8Array(
            JSON.parse(message)["AudioEvent"]["AudioChunk"]
          ),
        },
      });
      if (promiseResolver) {
        promiseResolver(null);
        promiseResolver = null;
      }
    }
  };

  transformMessages();

  const awsCredentials: AwsCredentialIdentity = {
    accessKeyId: process.env.AWS_ACCESS_KEY || "",
    secretAccessKey: process.env.AWS_SECRET_KEY || "",
  };

  const transcribeClient = new TranscribeStreamingClient({
    region: process.env.AWS_REGION || "",
    credentials: awsCredentials,
  });

  onTimeout[connectionId] = async (isAsleep: boolean) => {
    stopTransmition();

    console.log("Waiting for client to be destroyed...");

    await new Promise((resolve) => {
      promiseResolverClientDestroy = resolve;
    });

    console.log("Closing connection... at time", new Date());

    if (isAsleep) {
      webSocketManager.sendMessage(
        connectionId,
        JSON.stringify({
          data: null,
          isAsleep: true,
        })
      );
    } else {
      webSocketManager.sendMessage(
        connectionId,
        JSON.stringify({
          data: null,
          isAsleep: false,
        })
      );
    }

    dontCallOnTimeoutOnClose[connectionId] = true;

    webSocketManager.closeConnection(connectionId);

    if (closeConnection[connectionId]) {
      closeConnection[connectionId](null);
      closeConnection[connectionId] = null;
    }
  };

  const TIME_OUT = 2000;
  const TIME_TO_SLEEP = 5000;
  const SAMPLE_RATE = 44100;

  timeoutId[connectionId] = setTimeout(() => {
    onTimeout[connectionId](true);
  }, TIME_TO_SLEEP);

  const command = new StartStreamTranscriptionCommand({
    LanguageCode: setup.language,
    MediaEncoding: "pcm",
    MediaSampleRateHertz: SAMPLE_RATE,
    AudioStream: getStream(),
  });

  console.log("Sending data to AWS Transcribe... at time", new Date());
  const data = await transcribeClient.send(command);

  let transcription = "";

  for await (const event of data?.TranscriptResultStream || []) {
    for (const result of event.TranscriptEvent?.Transcript?.Results || []) {
      if (result.IsPartial === false) {
        const data = result.Alternatives
          ? result.Alternatives[0].Items
            ? result.Alternatives[0].Items
            : []
          : [];
        const noOfResults = data.length;
        for (let i = 0; i < noOfResults; i++) {
          if (timeoutId[connectionId]) clearTimeout(timeoutId[connectionId]);
          timeoutId[connectionId] = setTimeout(() => {
            onTimeout[connectionId](false);
          }, TIME_OUT);

          transcription += data[i].Content + " ";

          webSocketManager.sendMessage(
            connectionId,
            JSON.stringify({
              data: data[i].Content + " ",
              isAsleep: false,
            })
          );
        }
      }
    }
  }

  const outputFileStream = new wav.FileWriter(
    `recordings/${connectionId}.wav`,
    {
      sampleRate: SAMPLE_RATE,
      channels: 1,
    }
  );

  const uint8Array: Uint8Array = new Uint8Array(
    chunks.length * chunks[0].length
  );

  for (let i = 0; i < chunks.length; i++) {
    uint8Array.set(chunks[i], i * chunks[0].length);
  }

  new Stream.Readable({
    read() {
      this.push(Buffer.from(uint8Array));
      this.push(null);
    },
  }).pipe(outputFileStream);

  exec(
    `ffmpeg -i "recordings/${connectionId}.wav" "recordings/${connectionId}.mp3" && rm "recordings/${connectionId}.wav"`
  );

  console.log("Destroying TranscribeClient... at time", new Date());

  transcribeClient.destroy();

  console.log("TranscribeClient destroyed... at time", new Date());

  try {
    await axios.post(
      process.env.BACKEND_URL + "/api/v1/streamer/task/create",
      {
        task_id: uuidv4(),
        task_type: "SPEECH_TO_TEXT",
        task_status: "SUCCESS",
        user_id: user_id,
        input_type: "NULL",
        input: "empty",
        result_type: "TEXT",
        result: transcription ? transcription : ".",
        ai_models: JSON.stringify([
          {
            name: "aws-transcribe",
            option: "speech-to-text",
            usage_type: "seconds",
            usage: Math.ceil(seconds),
          },
        ]),
      },
      {
        headers: { "X-API-Key": process.env.STREAMER_API_TOKEN },
      }
    );
    console.log("Task result sent");
  } catch (e) {
    console.log("Error while sending task result");
  }

  if (promiseResolverClientDestroy) {
    promiseResolverClientDestroy(null);
    promiseResolverClientDestroy = null;
  }
};

const onCloseConnection = async (connectionId: string) => {
  if (!dontCallOnTimeoutOnClose[connectionId]) {
    console.log("Client close connection... at time", new Date());
    if (timeoutId[connectionId]) clearTimeout(timeoutId[connectionId]);
    onTimeout[connectionId](true);
  } else {
    console.log("Server close connection... at time", new Date());
  }

  await canCloseConnection[connectionId];
};

const webSocketManager = new WebSocketManager({
  port: Number(process.env.AWS_TRANSCRIBE_PORT),
  asyncCallback: asyncCallback,
  onCloseConnection: onCloseConnection,
});
