import * as dotenv from "dotenv";
import WebSocketManager from "./WebSocketManager";
import { AwsCredentialIdentity } from "@aws-sdk/types";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import axios from "axios";

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
      response.data["message"] !== "Access granted"
    ) {
      console.log("Access denied");
      webSocketManager.closeConnection(connectionId);
      return;
    }
  } catch (e) {
    console.log("Error while requesting access control");
    webSocketManager.closeConnection(connectionId);
    return;
  }

  console.log("Message received:", JSON.parse(message));

  const input = JSON.parse(message) as Input;

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
    Text: `<speak>${input.text}</speak>`,
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
    }
    webSocketManager.closeConnection(connectionId);
  });
};

const webSocketManager = new WebSocketManager({
  port: Number(process.env.AWS_POLLY_PORT),
  callback: callback,
});
