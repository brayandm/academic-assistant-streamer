import * as dotenv from "dotenv";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

class WebSocketManager {
  server: WebSocket.Server;
  connections: { [key: string]: WebSocket } = {};

  constructor(
    port: number,
    callback: (connectionId: string, message: string) => void
  ) {
    this.server = new WebSocket.Server({ port: port });

    dotenv.config();

    this.server.on("connection", (connection) => {
      const uuid = uuidv4();

      this.storeConnection(uuid, connection);

      connection.on("close", () => {
        this.deleteConnection(uuid);
      });

      connection.on("message", (message) => {
        callback(uuid, message.toString());
      });
    });

    console.log(`Server running on port ${port}`);
  }

  closeConnection = (uuid: string) => {
    if (this.connections[uuid]) {
      this.connections[uuid].close(1000, "Closing connection");
    }
  };

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

  sendMessage = (uuid: string, message: string) => {
    if (this.connections[uuid]) {
      this.connections[uuid].send(message);
    }
  };
}

export default WebSocketManager;
