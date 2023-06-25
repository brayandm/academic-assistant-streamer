import WebSocketManager from "./WebSocketManager";

const callback = (connectionId: string, message: string) => {
  console.log("Message received:", message);
};

const webSocketManager = new WebSocketManager(callback);
