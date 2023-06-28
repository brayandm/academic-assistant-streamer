import * as dotenv from "dotenv";
import WebSocketManager from "./WebSocketManager";
import {
  StartStreamTranscriptionCommand,
  TranscribeStreamingClient,
} from "@aws-sdk/client-transcribe-streaming";
import { AwsCredentialIdentity } from "@aws-sdk/types";

dotenv.config();

const canCloseConnection: { [key: string]: Promise<void> } = {};

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

  async function* getStream(): AsyncGenerator<InputStream> {
    while (true) {
      if (stopSignal) break;

      if (stream.length > 0) {
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

    webSocketManager.closeConnection(connectionId);

    if (closeConnection[connectionId]) {
      closeConnection[connectionId](null);
      closeConnection[connectionId] = null;
    }
  };

  const TIME_OUT = 3000;
  const TIME_TO_SLEEP = 5000;
  const SAMPLE_RATE = 44100;

  timeoutId[connectionId] = setTimeout(() => {
    onTimeout[connectionId](true);
  }, TIME_TO_SLEEP);

  const command = new StartStreamTranscriptionCommand({
    LanguageCode: "es-US",
    MediaEncoding: "pcm",
    MediaSampleRateHertz: SAMPLE_RATE,
    AudioStream: getStream(),
  });

  console.log("Sending data to AWS Transcribe... at time", new Date());
  const data = await transcribeClient.send(command);

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

  console.log("Destroying TranscribeClient... at time", new Date());

  transcribeClient.destroy();

  console.log("TranscribeClient destroyed... at time", new Date());

  if (promiseResolverClientDestroy) {
    promiseResolverClientDestroy(null);
    promiseResolverClientDestroy = null;
  }
};

const onCloseConnection = async (connectionId: string) => {
  if (timeoutId[connectionId]) clearTimeout(timeoutId[connectionId]);

  onTimeout[connectionId](true);
  await canCloseConnection[connectionId];
};

const webSocketManager = new WebSocketManager(
  8082,
  () => {
    return;
  },
  asyncCallback,
  onCloseConnection
);
