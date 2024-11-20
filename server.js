const express = require("express");
const http = require("http");
const { kafka } = require("./client");
const { pool, initDatabase } = require("./db");
const path = require("path");
const WebSocketServer = require("./webSocket");
const initConsumer = require("./kafka-consumer");

const app = express();
const server = http.createServer(app);
const webSocketServer = new WebSocketServer(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Root endpoint now serves index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Basic endpoint to test server
app.get("/", async (req, res) => {
  res.send("Hello, this is the polling App");
});

// Create Poll - POST /polls
app.post("/polls", async (req, res) => {
  const { title, options } = req.body;

  if (!title || !Array.isArray(options) || options.length === 0) {
    return res.status(400).json({ error: "Invalid poll data" });
  }

  const client = await pool.connect();
  try {
    // Insert poll into the polls table
    const pollResult = await client.query(
      "INSERT INTO polls (title) VALUES ($1) RETURNING id",
      [title]
    );
    const pollId = pollResult.rows[0].id;

    // Insert poll options
    const optionsQueries = options.map((option) =>
      client.query(
        "INSERT INTO poll_options (poll_id, option_text) VALUES ($1, $2)",
        [pollId, option]
      )
    );

    await Promise.all(optionsQueries);
    res.status(201).json({ pollId });
  } catch (error) {
    console.error("Error creating poll:", error);
    res.status(500).send("Internal server error");
  } finally {
    client.release();
  }
});

// Vote on Poll - POST /polls/:pollId/vote
app.post("/polls/:pollId/vote", async (req, res) => {
  const { optionId } = req.body;
  const { pollId } = req.params;

  if (!optionId || !pollId) {
    return res
      .status(400)
      .json({ error: "Poll ID and Option ID are required" });
  }

  const producer = kafka.producer();
  try {
    await producer.connect();

    await producer.send({
      topic: "poll-votes",
      messages: [
        {
          value: JSON.stringify({ pollId, optionId }),
        },
      ],
    });

    res.status(200).send("Vote registered");
  } catch (error) {
    console.error("Error sending vote to Kafka:", error);
    res.status(500).send("Internal server error");
  } finally {
    await producer.disconnect();
  }
});

// Get Poll Options - GET /polls/:pollId/options
app.get("/polls/:pollId/options", async (req, res) => {
  const { pollId } = req.params;

  if (!pollId) {
    return res.status(400).json({ error: "Poll ID is required" });
  }

  const client = await pool.connect();
  try {
    // Fetch poll options for the given pollId
    const result = await client.query(
      "SELECT id, option_text, vote_count FROM poll_options WHERE poll_id = $1",
      [pollId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Poll options not found" });
    }

    res.status(200).json({ options: result.rows });
  } catch (error) {
    console.error("Error fetching poll options:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// Leaderboard Endpoint - GET /leaderboard
app.get("/leaderboard", async (req, res) => {
  const client = await pool.connect();
  try {
    const leaderboard = await client.query(`
      SELECT p.title, po.option_text, po.vote_count
      FROM poll_options po
      JOIN polls p ON po.poll_id = p.id
      ORDER BY po.vote_count DESC
      LIMIT 10
    `);
    res.json(leaderboard.rows);
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).send("Internal server error");
  } finally {
    client.release();
  }
});

// Start Server
async function startServer() {
  try {
    // Initialize the database and Kafka consumer
    await initDatabase();
    await initConsumer(webSocketServer);

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Error during server startup:", error);
    process.exit(1); // Exit with a failure code if something goes wrong
  }

  // Graceful shutdown for server, WebSocket, and Kafka consumer
  process.on("SIGINT", async () => {
    console.log("Shutting down gracefully...");

    try {
      // Close the HTTP server
      await server.close();

      // Close the WebSocket server gracefully
      await webSocketServer.close();

      // Ensure Kafka consumer is disconnected
      await kafka.consumer({ groupId: "polling-group" }).disconnect();

      console.log("Server and Kafka consumer shut down.");
      process.exit(0); // Exit successfully
    } catch (shutdownError) {
      console.error("Error during graceful shutdown:", shutdownError);
      process.exit(1);
    }
  });
}

// Execute the server startup
startServer();
