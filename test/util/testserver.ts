// Server for testing HTTP crawls!
// Ultra simple - only for running with mocha tests.

// Include HTTP
import * as http from "http";
import { Socket } from "net";
import { AnyObject } from "../../src/types";

const sockets: { [key: number]: Socket } = {};
let nextSocketId = 0;

export class Server extends http.Server {
  constructor(routes: AnyObject) {
    super();

    this.on("connection", (socket) => {
      const socketId = nextSocketId++;
      sockets[socketId] = socket;

      socket.on("close", () => {
        delete sockets[socketId];
      });
    });

    // Listen to events
    this.on("request", (req, res) => {

      function write(status: number, data: Buffer | string, customHeaders: AnyObject) {
        const headers: AnyObject = {
          "Content-Type": "text/html",
          "Content-Length": data instanceof Buffer ? data.length : Buffer.byteLength(data)
        };

        if (typeof customHeaders === "object") {
          Object.entries(customHeaders).forEach(([headerName, headerValue]) => {
            headers[headerName] = headerValue;
          });
        }

        setTimeout(() => {
          res.writeHead(status, http.STATUS_CODES[status], headers);
          res.write(data);
          res.end();
        }, 20);
      }

      function redir(to: string) {
        const data = `Redirecting you to ${to}`;

        res.writeHead(
          301,
          http.STATUS_CODES[301], {
          "Content-Type": "text/plain",
          "Content-Length": Buffer.byteLength(data),
          "Location": to
        });

        res.write(data);
        res.end();
      }

      if (routes[req.url] && typeof routes[req.url] === "function") {
        // Pass in a function that takes a status and some data to write back
        // out to the client
        routes[req.url](write, redir, req);
      } else {
        // Otherwise, a 404
        res.writeHead(404, "Page Not Found");
        res.write("Page not found.");
        res.end();
      }
    });

    this.on("error", (error) => {
      // If we've already started a server, don't worry that we couldn't
      // start another one.
      // This will happen, for instance, with mocha-watch.

      //@ts-ignore
      if (error.code === "EADDRINUSE") {
        return;
      }

      console.log(error);
      process.exit(1);
    });
  }

  destroy(callback: (err?: Error) => void): void {
    Object.values(sockets).forEach((socket) => {
      socket.destroy();
    });

    this.close(callback);
  }
}

