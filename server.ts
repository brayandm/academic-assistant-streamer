import * as dotenv from "dotenv";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const server = new WebSocket.Server({ port: 8080 });

const connections: { [key: string]: WebSocket } = {};

const storeConnection = (uuid: string, connection: WebSocket) => {
  console.log(`Received a new connection (ID: ` + uuid + `)`);
  connections[uuid] = connection;
  console.log(`Total connections open: ` + Object.keys(connections).length);
};

const deleteConnection = (uuid: string) => {
  console.log(`Connection closed (ID: ` + uuid + `)`);
  delete connections[uuid];
  console.log(`Total connections open: ` + Object.keys(connections).length);
};

server.on("connection", (connection) => {
  const userId = uuidv4();

  storeConnection(userId, connection);

  connection.on("close", () => {
    deleteConnection(userId);
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
