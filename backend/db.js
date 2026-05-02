require('dotenv').config();
const { Pool } = require("pg");

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }, // Required for Render managed DB
      }
    : {
        user:     process.env.DB_USER     || "postgres",
        password: process.env.DB_PASSWORD || "12345",
        host:     process.env.DB_HOST     || "localhost",
        port:     process.env.DB_PORT     || 5432,
        database: process.env.DB_NAME     || "campus_voting_db",
      }
);

module.exports = pool;
