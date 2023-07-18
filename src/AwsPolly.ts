import * as dotenv from "dotenv";
import WebSocketManager from "./WebSocketManager";
import { AwsCredentialIdentity } from "@aws-sdk/types";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

type Input = {
  text: string;
  languageCode: string;
  voiceId: string;
};

const callback = async (connectionId: string, message: string) => {
  const setup = JSON.parse(await webSocketManager.getSetup(connectionId)) as {
    token: string;
  };

  let user_id: number;
  let quota: number;

  try {
    const response = await axios.post(
      process.env.BACKEND_URL + "/api/v1/streamer/task/access-control",
      {
        token: setup.token,
        task_type: "TEXT_TO_SPEECH_NEURAL",
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
      webSocketManager.closeConnection(connectionId);
      return;
    }

    user_id = response.data["user_id"];
    quota = response.data["quota"]["aws-polly"];
  } catch (e) {
    console.log("Error while requesting access control");
    webSocketManager.closeConnection(connectionId);
    return;
  }

  console.log("Message received:", JSON.parse(message));

  const input = JSON.parse(message) as Input;

  const textToSpeech = `<speak>${input.text}</speak>`;

  if (quota < textToSpeech.length) {
    console.log("Quota exceeded");
    webSocketManager.closeConnection(connectionId);
  }

  const awsCredentials: AwsCredentialIdentity = {
    accessKeyId: process.env.AWS_ACCESS_KEY || "",
    secretAccessKey: process.env.AWS_SECRET_KEY || "",
  };

  const polly = new PollyClient({
    region: process.env.AWS_REGION || "",
    credentials: awsCredentials,
  });

  const params = {
    OutputFormat: "mp3",
    Engine: "neural",
    LanguageCode: input.languageCode,
    Text: textToSpeech,
    VoiceId: input.voiceId,
    TextType: "ssml",
  };

  polly.send(new SynthesizeSpeechCommand(params), async (error, data) => {
    if (error) {
      webSocketManager.sendMessage(
        connectionId,
        JSON.stringify({
          data: null,
        })
      );
    } else if (data) {
      webSocketManager.sendMessage(
        connectionId,
        JSON.stringify({
          data: Array.from(await data.AudioStream.transformToByteArray()),
        })
      );

      try {
        await axios.post(
          process.env.BACKEND_URL + "/api/v1/streamer/task/create",
          {
            task_id: uuidv4(),
            task_type: "TEXT_TO_SPEECH_NEURAL",
            task_status: "SUCCESS",
            user_id: user_id,
            input_type: "TEXT",
            input: `<speak>${input.text}</speak>`,
            result_type: "NULL",
            result: "empty",
            ai_models: JSON.stringify([
              {
                name: "aws-polly",
                option: "neural-voice",
                usage_type: "characters",
                usage: `<speak>${input.text}</speak>`.length,
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
    }
    webSocketManager.closeConnection(connectionId);
  });
};

const webSocketManager = new WebSocketManager({
  port: Number(process.env.AWS_POLLY_PORT),
  callback: callback,
});
