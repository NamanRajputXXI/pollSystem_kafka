const WebSocket = require("websocket");

class WebSocketServer {
  constructor(httpServer) {
    this.wss = new WebSocket.server({ httpServer });
    this.clients = new Set();

    this.wss.on("request", (req) => {
      const connection = req.accept(null, req.origin);
      this.clients.add(connection);

      connection.on("close", () => {
        this.clients.delete(connection);
      });
    });
  }

  broadcastPollUpdate(pollId, results) {
    this.clients.forEach((client) => {
      client.send(
        JSON.stringify({
          type: "poll_update",
          pollId,
          results,
        })
      );
    });
  }

  broadcastLeaderboardUpdate(leaderboard) {
    this.clients.forEach((client) => {
      client.send(
        JSON.stringify({
          type: "leaderboard_update",
          leaderboard,
        })
      );
    });
  }
}

module.exports = WebSocketServer;
