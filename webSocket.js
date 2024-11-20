const WebSocketServer = require("websocket").server;
const http = require("http");

class WebSocketServerClass {
  constructor(httpServer) {
    this.wss = new WebSocketServer({
      httpServer: httpServer,
      autoAcceptConnections: false, // Don't accept automatically, we'll handle requests manually
    });
    this.clients = new Set();

    // Handle the connection requests
    this.wss.on("request", (req) => {
      const connection = req.accept(null, req.origin);
      this.clients.add(connection);

      connection.on("message", (message) => {
        console.log("Received message:", message);
        // Handle any incoming messages if needed
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

  // Function to broadcast poll updates to all connected clients
  broadcastPollUpdate(pollId, results) {
    this.clients.forEach((client) => {
      client.sendUTF(
        JSON.stringify({
          type: "poll-update", // Make sure this matches the frontend logic
          pollId,
          results,
        })
      );
    });
  }

  // Function to broadcast leaderboard updates to all connected clients
  broadcastLeaderboardUpdate(leaderboard) {
    this.clients.forEach((client) => {
      client.sendUTF(
        JSON.stringify({
          type: "leaderboard-update", // Broadcast leaderboard updates
          leaderboard,
        })
      );
    });
  }
}

module.exports = WebSocketServerClass;
