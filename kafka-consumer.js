// const { kafka } = require("./client");
// const { pool } = require("./db");

// async function initConsumer(webSocketServer) {
//   const consumer = kafka.consumer({ groupId: "polling-group" });

//   await consumer.connect();
//   await consumer.subscribe({ topic: "poll-votes", fromBeginning: true });

//   await consumer.run({
//     eachMessage: async ({ topic, partition, message }) => {
//       const vote = JSON.parse(message.value.toString());
//       const client = await pool.connect();
//       try {
//         // Update vote count
//         await client.query(
//           "UPDATE poll_options SET vote_count = vote_count + 1 WHERE id = $1",
//           [vote.optionId]
//         );

//         // Fetch updated poll results
//         const pollResults = await client.query(
//           `SELECT id, option_text, vote_count
//            FROM poll_options
//            WHERE poll_id = $1
//            ORDER BY vote_count DESC`,
//           [vote.pollId]
//         );

//         // Broadcast real-time update
//         webSocketServer.broadcastPollUpdate(vote.pollId, pollResults.rows);

//         // Fetch leaderboard and broadcast
//         const leaderboard = await client.query(`
//           SELECT p.title, po.option_text, po.vote_count
//           FROM poll_options po
//           JOIN polls p ON po.poll_id = p.id
//           ORDER BY po.vote_count DESC
//           LIMIT 10
//         `);
//         webSocketServer.broadcastLeaderboardUpdate(leaderboard.rows);
//       } catch (error) {
//         console.error("Vote processing error:", error);
//       } finally {
//         client.release();
//       }
//     },
//   });

//   process.on("SIGINT", async () => {
//     console.log("Shutting down Kafka consumer...");
//     await consumer.disconnect();
//   });
// }

// module.exports = initConsumer;

const { kafka } = require("./client");
const { pool } = require("./db");

async function initConsumer(webSocketServer) {
  const consumer = kafka.consumer({ groupId: "polling-group" });

  try {
    // Connect to Kafka consumer
    await consumer.connect();
    console.log("Connected to Kafka consumer");

    // Subscribe to the poll-votes topic
    await consumer.subscribe({ topic: "poll-votes", fromBeginning: true });
    console.log("Subscribed to 'poll-votes' topic");

    // Kafka consumer message handler
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const vote = JSON.parse(message.value.toString());

        // Establish a connection to the database
        const client = await pool.connect();
        try {
          // Update the vote count for the selected option
          await client.query(
            "UPDATE poll_options SET vote_count = vote_count + 1 WHERE id = $1",
            [vote.optionId]
          );
          console.log(
            `Vote recorded for option ID: ${vote.optionId} in poll ID: ${vote.pollId}`
          );

          // Fetch updated poll results ordered by vote count
          const pollResults = await client.query(
            `SELECT id, option_text, vote_count
             FROM poll_options
             WHERE poll_id = $1
             ORDER BY vote_count DESC`,
            [vote.pollId]
          );

          // Broadcast real-time update of poll results
          webSocketServer.broadcastPollUpdate(vote.pollId, pollResults.rows);
          console.log("Poll results broadcasted");

          // Fetch the leaderboard and broadcast the top 10 options
          const leaderboard = await client.query(`
            SELECT p.title, po.option_text, po.vote_count
            FROM poll_options po
            JOIN polls p ON po.poll_id = p.id
            ORDER BY po.vote_count DESC
            LIMIT 10
          `);

          // Broadcast real-time leaderboard update
          webSocketServer.broadcastLeaderboardUpdate(leaderboard.rows);
          console.log("Leaderboard broadcasted");
        } catch (error) {
          console.error("Error processing vote:", error);
        } finally {
          // Release the database client
          client.release();
        }
      },
    });

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
