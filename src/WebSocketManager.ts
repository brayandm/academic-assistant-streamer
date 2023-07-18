import * as dotenv from "dotenv";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

type WebSocketManagerProps = {
  port?: number;
  callback?: (connectionId: string, message: string) => void;
  asyncCallback?: (
    connectionId: string,
    messages: AsyncGenerator<string>
  ) => void;
  onCloseConnection?: (connectionId: string) => void;
};

type PromiseResolver<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void | null;
};

class WebSocketManager {
  private server: WebSocket.Server;
  private connections: { [key: string]: WebSocket } = {};
  private connectionUser: { [key: string]: string } = {};
  private userConection: { [key: string]: string } = {};
  private setup: {
    [key: string]: PromiseResolver<string>;
  } = {};

  constructor({
    port = 8080,
    callback = () => {
      return;
    },
    asyncCallback = () => {
      return;
    },
    onCloseConnection = () => {
      return;
    },
  }: WebSocketManagerProps) {
    this.server = new WebSocket.Server({ port: port });

    dotenv.config();

    this.server.on("connection", (connection) => {
      const connectionId = uuidv4();

      const messages: string[] = [];

      this.setup[connectionId] = {} as PromiseResolver<string>;

      this.setup[connectionId].promise = new Promise((resolve) => {
        this.setup[connectionId].resolve = resolve;
      });

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
        if (JSON.parse(message.toString())["setup"]) {
          this.setup[connectionId].resolve(
            JSON.stringify(JSON.parse(message.toString())["setup"])
          );
          return;
        }
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

  setUserConnection = async (userId: string, connectionId: string) => {
    if (this.userConection[userId]) {
      console.log(
        "Closing connection, because user already has a connection active"
      );
      this.connections[connectionId].close(1000, "Closing connection");
    } else {
      this.userConection[userId] = connectionId;
      this.connectionUser[connectionId] = userId;
    }
  };

  getSetup = async (connectionId: string) => {
    return await this.setup[connectionId].promise;
  };

  closeConnection = (connectionId: string) => {
    if (this.connections[connectionId]) {
      this.connections[connectionId].close(1000, "Closing connection");
    }
  };

  sendMessage = (connectionId: string, message: string) => {
    if (this.connections[connectionId]) {
      this.connections[connectionId].send(message);
    }
  };

  private storeConnection = (connectionId: string, connection: WebSocket) => {
    console.log(`Received a new connection (ID: ` + connectionId + `)`);
    this.connections[connectionId] = connection;
    console.log(
      `Total connections open: ` + Object.keys(this.connections).length
    );
  };

  private deleteConnection = (connectionId: string) => {
    console.log(`Connection closed (ID: ` + connectionId + `)`);

    delete this.connections[connectionId];
    delete this.setup[connectionId];
    if (this.connectionUser[connectionId]) {
      delete this.userConection[this.connectionUser[connectionId]];
      delete this.connectionUser[connectionId];
    }

    console.log(
      `Total connections open: ` + Object.keys(this.connections).length
    );
  };
}

export default WebSocketManager;
