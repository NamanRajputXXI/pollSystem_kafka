const WebSocketServer = require("websocket").server;
const http = require("http");

class WebSocketServerClass {
  constructor(httpServer) {
    this.wss = new WebSocketServer({
      httpServer: httpServer,
      autoAcceptConnections: false, // Don't accept automatically, let's handle the requests
    });
    this.clients = new Set();

    // Handle the connection requests
    this.wss.on("request", (req) => {
      const connection = req.accept(null, req.origin);
      this.clients.add(connection);

      connection.on("message", (message) => {
        console.log("Received message:", message);
        // You can handle any incoming messages here if needed
      });

      connection.on("close", () => {
        this.clients.delete(connection);
        console.log("Client disconnected");
      });

      connection.on("error", (error) => {
        console.error("Connection error:", error);
      });
    });
  }

  // Function to broadcast poll update to all connected clients
  broadcastPollUpdate(pollId, results) {
    this.clients.forEach((client) => {
      client.sendUTF(
        JSON.stringify({
          type: "poll_update",
          pollId,
          results,
        })
      );
    });
  }

  // Function to broadcast leaderboard update to all connected clients
  broadcastLeaderboardUpdate(leaderboard) {
    this.clients.forEach((client) => {
      client.sendUTF(
        JSON.stringify({
          type: "leaderboard_update",
          leaderboard,
        })
      );
    });
  }
}

module.exports = WebSocketServerClass;
