import * as dotenv from "dotenv";
import WebSocketManager from "./WebSocketManager";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import GPT3Tokenizer from "gpt3-tokenizer";

dotenv.config();

const callback = async (connectionId: string, message: string) => {
  const setup = JSON.parse(await webSocketManager.getSetup(connectionId)) as {
    token: string;
  };

  const tokenizer = new GPT3Tokenizer({ type: "gpt3" });

  let user_id: number;
  let quota: number;

  try {
    const response = await axios.post(
      process.env.BACKEND_URL + "/api/v1/streamer/task/access-control",
      {
        token: setup.token,
        task_type: "CHAT_COMPLETION",
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
    quota = response.data["quota"]["gpt-3.5-turbo"];
    webSocketManager.setUserConnection(String(user_id), connectionId);
  } catch (e) {
    console.log("Error while requesting access control");
    webSocketManager.closeConnection(connectionId);
    return;
  }

  console.log("Message received:", JSON.parse(message));

  const input = JSON.parse(message);

  const encodedInput: { bpe: number[] } = tokenizer.encode(
    JSON.stringify(input)
  );

  if (quota < encodedInput.bpe.length) {
    console.log("Quota exceeded");
    webSocketManager.closeConnection(connectionId);
  }

  let output = "";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: input,
      stream: true,
    }),
  });
  const reader = response.body
    ?.pipeThrough(new TextDecoderStream())
    .getReader();
  if (!reader) return;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { value, done } = await reader.read();
    if (done) break;
    let dataDone = false;
    const arr = value.split("\n");
    arr.forEach((data) => {
      if (data.length === 0) return; // ignore empty message
      if (data.startsWith(":")) return; // ignore sse comment message
      if (data === "data: [DONE]") {
        dataDone = true;
        return;
      }
      const json = JSON.parse(data.substring(6));
      if (json.choices[0].delta.content) {
        output += json.choices[0].delta.content;

        webSocketManager.sendMessage(
          connectionId,
          JSON.stringify({
            data: json.choices[0].delta.content,
          })
        );
      }
    });
    if (dataDone) {
      webSocketManager.sendMessage(
        connectionId,
        JSON.stringify({
          data: null,
        })
      );
      break;
    }
  }

  const encodedOutput: { bpe: number[] } = tokenizer.encode(output);

  try {
    await axios.post(
      process.env.BACKEND_URL + "/api/v1/streamer/task/create",
      {
        task_id: uuidv4(),
        task_type: "CHAT_COMPLETION",
        task_status: "SUCCESS",
        user_id: user_id,
        input_type: "JSON",
        input: JSON.stringify(input),
        result_type: "TEXT",
        result: output,
        ai_models: JSON.stringify([
          {
            name: "gpt-3.5-turbo",
            option: "chat-completion",
            usage_type: "tokens",
            usage: encodedInput.bpe.length + encodedOutput.bpe.length,
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

  webSocketManager.closeConnection(connectionId);
};

const webSocketManager = new WebSocketManager({
  port: Number(process.env.OPENAIGPT_PORT),
  callback: callback,
});
