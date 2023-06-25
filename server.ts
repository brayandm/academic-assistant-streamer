import * as dotenv from "dotenv";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const server = new WebSocket.Server({ port: Number(process.env.PORT!) });

const clients: { [key: string]: WebSocket } = {};

server.on("connection", (connection) => {
  const userId = uuidv4();

  console.log(`Received a new connection: ` + userId);

  clients[userId] = connection;

  connection.on("message", (message) => {
    console.log("Message received:", message);

    connection.binaryType = "arraybuffer";

    const arrayBuffer = new ArrayBuffer(123); // Tu ArrayBuffer de ejemplo
    const blob = new Blob([arrayBuffer]);

    connection.send(arrayBuffer);
  });
});

console.log("Server running on port 8080");
