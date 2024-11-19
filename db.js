const { Pool } = require("pg");

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "polling_system",
  user: "postgres",
  password: "Naman@123",
});

// Create tables
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS polls (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS poll_options (
        id SERIAL PRIMARY KEY,
        poll_id INTEGER REFERENCES polls(id),
        option_text TEXT NOT NULL,
        vote_count INTEGER DEFAULT 0
      );
    `);
  } catch (err) {
    console.error("Error initializing database:", err);
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
