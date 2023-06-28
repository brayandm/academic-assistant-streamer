import * as dotenv from "dotenv";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

class WebSocketManager {
  server: WebSocket.Server;
  connections: { [key: string]: WebSocket } = {};

  constructor(
    port: number,
    callback: (connectionId: string, message: string) => void = () => {
      return;
    },
    asyncCallback: (
      connectionId: string,
      messages: AsyncGenerator<string>
    ) => void = () => {
      return;
    },
    onCloseConnection: (connectionId: string) => void = () => {
      return;
    }
  ) {
    this.server = new WebSocket.Server({ port: port });

    dotenv.config();

    this.server.on("connection", (connection) => {
      const connectionId = uuidv4();

      const messages: string[] = [];

      this.storeConnection(connectionId, connection);

      connection.on("close", async () => {
        await onCloseConnection(connectionId);
        this.deleteConnection(connectionId);
      });

      let promiseResolver: (value: unknown) => void | null = null;

      async function* getMessages(): AsyncGenerator<string> {
        while (true) {
          if (messages.length > 0) {
            yield messages.shift();
          } else {
            await new Promise((resolve) => {
              promiseResolver = resolve;
            });
          }
        }
      }

      asyncCallback(connectionId, getMessages());

      connection.on("message", (message) => {
        messages.push(message.toString());
        callback(connectionId, message.toString());
        if (promiseResolver) {
          promiseResolver(null);
          promiseResolver = null;
        }
      });
    });

    console.log(`Server running on port ${port}`);
  }

  closeConnection = (connectionId: string) => {
    if (this.connections[connectionId]) {
      this.connections[connectionId].close(1000, "Closing connection");
    }
  };

  storeConnection = (connectionId: string, connection: WebSocket) => {
    console.log(`Received a new connection (ID: ` + connectionId + `)`);
    this.connections[connectionId] = connection;
    console.log(
      `Total connections open: ` + Object.keys(this.connections).length
    );
  };

  deleteConnection = (connectionId: string) => {
    console.log(`Connection closed (ID: ` + connectionId + `)`);
    delete this.connections[connectionId];
    console.log(
      `Total connections open: ` + Object.keys(this.connections).length
    );
  };

  sendMessage = (connectionId: string, message: string) => {
    if (this.connections[connectionId]) {
      this.connections[connectionId].send(message);
    }
  };
}

export default WebSocketManager;
