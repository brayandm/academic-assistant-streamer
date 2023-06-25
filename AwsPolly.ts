import * as dotenv from "dotenv";
import WebSocketManager from "./WebSocketManager";
import { AwsCredentialIdentity } from "@aws-sdk/types";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

dotenv.config();

const callback = async (connectionId: string, message: string) => {
  console.log("Message received:", JSON.parse(message));

  const input = JSON.parse(message);

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
    LanguageCode: "es-ES",
    Text: `<speak>${input.text}</speak>`,
    VoiceId: "Lucia",
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

const webSocketManager = new WebSocketManager(8081, callback);
