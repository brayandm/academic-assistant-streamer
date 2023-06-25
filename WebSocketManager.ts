import * as dotenv from "dotenv";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

class WebSocketManager {
  server: WebSocket.Server;
  connections: { [key: string]: WebSocket } = {};

  constructor() {
    this.server = new WebSocket.Server({ port: 8080 });

    dotenv.config();

    this.server.on("connection", (connection) => {
      const userId = uuidv4();

      this.storeConnection(userId, connection);

      connection.on("close", () => {
        this.deleteConnection(userId);
      });

      // connection.on("message", (message) => {
      //   console.log("Message received:", message);

      //   connection.binaryType = "arraybuffer";

      //   const arrayBuffer = new ArrayBuffer(123); // Tu ArrayBuffer de ejemplo
      //   const blob = new Blob([arrayBuffer]);

      //   connection.send(arrayBuffer);
      // });
    });

    console.log("Server running on port 8080");
  }

  storeConnection = (uuid: string, connection: WebSocket) => {
    console.log(`Received a new connection (ID: ` + uuid + `)`);
    this.connections[uuid] = connection;
    console.log(
      `Total connections open: ` + Object.keys(this.connections).length
    );
  };

  deleteConnection = (uuid: string) => {
    console.log(`Connection closed (ID: ` + uuid + `)`);
    delete this.connections[uuid];
    console.log(
      `Total connections open: ` + Object.keys(this.connections).length
    );
  };
}

export default WebSocketManager;
