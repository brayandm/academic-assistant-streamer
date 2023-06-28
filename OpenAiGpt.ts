import * as dotenv from "dotenv";
import WebSocketManager from "./WebSocketManager";

dotenv.config();

const callback = async (connectionId: string, message: string) => {
  console.log("Message received:", JSON.parse(message));

  const input = JSON.parse(message);

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
      webSocketManager.closeConnection(connectionId);
      break;
    }
  }
};

const webSocketManager = new WebSocketManager({
  port: 8080,
  callback: callback,
});
