import WebSocket from "ws";

const ws = new WebSocket("ws://127.0.0.1:8080/", {
  perMessageDeflate: false,
});

ws.on("error", console.error);

ws.on("open", function open() {
  const data = [{ role: "user", content: "Cual es la capital de Cuba?" }];
  ws.send(JSON.stringify(data));
});

ws.on("message", function message(data) {
  console.log("received: %s", data.slice(0));
});
