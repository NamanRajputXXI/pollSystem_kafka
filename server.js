const express = require("express");
const http = require("http");
const { kafka } = require("./client");
const { pool, initDatabase } = require("./db");
const WebSocketServer = require("./webSocket");
const initConsumer = require("./kafka-consumer");

const app = express();
const server = http.createServer(app);
const webSocketServer = new WebSocketServer(server);

app.use(express.json());

// Create Poll
app.get("/", async (req, res) => {
  res.send("hello this is the polling App");
});
app.post("/polls", async (req, res) => {
  const { title, options } = req.body;

  if (!title || !Array.isArray(options) || options.length === 0) {
    return res.status(400).json({ error: "Invalid poll data" });
  }

  const client = await pool.connect();
  try {
    const pollResult = await client.query(
      "INSERT INTO polls (title) VALUES ($1) RETURNING id",
      [title]
    );
    const pollId = pollResult.rows[0].id;

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

// Vote on Poll
app.post("/polls/:pollId/vote", async (req, res) => {
  const { optionId } = req.body;
  const { pollId } = req.params;

  if (!optionId || !pollId) {
    return res
      .status(400)
      .json({ error: "Poll ID and Option ID are required" });
  }

  const producer = kafka.producer();
  await producer.connect();

  try {
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

// Leaderboard
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

async function startServer() {
  await initDatabase();
  await initConsumer(webSocketServer);

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    server.close();
    process.exit(0);
  });
}

startServer();
