const { kafka } = require("./client"); // Kafka client
const { pool } = require("./db"); // Database pool

async function initConsumer(webSocketServer) {
  const consumer = kafka.consumer({ groupId: "polling-group" });

  try {
    // Connect to the Kafka consumer
    await consumer.connect();
    console.log("Connected to Kafka consumer");

    // Subscribe to the 'poll-votes' topic
    await consumer.subscribe({ topic: "poll-votes", fromBeginning: true });
    console.log("Subscribed to 'poll-votes' topic");

    // Kafka consumer message handler
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const vote = JSON.parse(message.value.toString());

        // Establish a connection to the database
        const client = await pool.connect();
        try {
          // Update the vote count for the selected option in the poll
          const updateVoteQuery = `
            UPDATE poll_options 
            SET vote_count = vote_count + 1 
            WHERE id = $1
          `;
          await client.query(updateVoteQuery, [vote.optionId]);

          console.log(
            `Vote recorded for option ID: ${vote.optionId} in poll ID: ${vote.pollId}`
          );

          // Fetch the updated poll results, ordered by vote count
          const pollResultsQuery = `
            SELECT id, option_text, vote_count 
            FROM poll_options 
            WHERE poll_id = $1 
            ORDER BY vote_count DESC
          `;
          const pollResults = await client.query(pollResultsQuery, [
            vote.pollId,
          ]);

          // Broadcast real-time update of poll results to all connected clients
          webSocketServer.broadcastPollUpdate(vote.pollId, pollResults.rows);
          console.log("Poll results broadcasted");

          // Fetch the leaderboard, ordered by vote count, and limit to top 10
          const leaderboardQuery = `
            SELECT p.title, po.option_text, po.vote_count
            FROM poll_options po
            JOIN polls p ON po.poll_id = p.id
            ORDER BY po.vote_count DESC
            LIMIT 10
          `;
          const leaderboard = await client.query(leaderboardQuery);

          // Broadcast real-time leaderboard update to all connected clients
          webSocketServer.broadcastLeaderboardUpdate(leaderboard.rows);
          console.log("Leaderboard broadcasted");
        } catch (error) {
          console.error("Error processing vote:", error);
        } finally {
          // Always release the database client after the operation
          client.release();
        }
      },
    });

    // Graceful shutdown for Kafka consumer on process termination
    process.on("SIGINT", async () => {
      console.log("Shutting down Kafka consumer...");
      await consumer.disconnect();
      console.log("Kafka consumer disconnected");
    });
  } catch (error) {
    console.error("Error initializing Kafka consumer:", error);
  }
}

module.exports = initConsumer;
