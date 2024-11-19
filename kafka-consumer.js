const { kafka } = require("./client");
const { pool } = require("./db");

async function initConsumer(webSocketServer) {
  const consumer = kafka.consumer({ groupId: "polling-group" });

  await consumer.connect();
  await consumer.subscribe({ topic: "poll-votes", fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const vote = JSON.parse(message.value.toString());
      const client = await pool.connect();
      try {
        // Update vote count
        await client.query(
          "UPDATE poll_options SET vote_count = vote_count + 1 WHERE id = $1",
          [vote.optionId]
        );

        // Fetch updated poll results
        const pollResults = await client.query(
          `SELECT id, option_text, vote_count 
           FROM poll_options 
           WHERE poll_id = $1 
           ORDER BY vote_count DESC`,
          [vote.pollId]
        );

        // Broadcast real-time update
        webSocketServer.broadcastPollUpdate(vote.pollId, pollResults.rows);

        // Fetch leaderboard and broadcast
        const leaderboard = await client.query(`
          SELECT p.title, po.option_text, po.vote_count 
          FROM poll_options po
          JOIN polls p ON po.poll_id = p.id
          ORDER BY po.vote_count DESC
          LIMIT 10
        `);
        webSocketServer.broadcastLeaderboardUpdate(leaderboard.rows);
      } catch (error) {
        console.error("Vote processing error:", error);
      } finally {
        client.release();
      }
    },
  });

  process.on("SIGINT", async () => {
    console.log("Shutting down Kafka consumer...");
    await consumer.disconnect();
  });
}

module.exports = initConsumer;
