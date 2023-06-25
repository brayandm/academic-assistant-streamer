import WebSocket from "ws";

const ws = new WebSocket("ws://127.0.0.1:8080/", {
  perMessageDeflate: false,
});

ws.on("error", console.error);

ws.on("open", function open() {
  const data = "Hola mi nombre es Lucia";
  ws.send(
    JSON.stringify({
      text: data,
    })
  );
});

ws.on("message", function message(data) {
  console.log("received: %s", JSON.parse(data.toString())["data"]);
});
