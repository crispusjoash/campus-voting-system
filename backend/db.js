require('dotenv').config();
const { Pool } = require("pg");

// ─── DATABASE CONNECTION ───────────────────────────────────────────────────
// When using Supabase Transaction Mode (port 6543 / PgBouncer), we must:
//   1. Append ?pgbouncer=true to disable prepared statements (PgBouncer
//      drops them between connections, causing 500 errors on multi-query routes)
//   2. Keep the pool small (max:2) to stay within Supabase free-tier limits
//
// IMPORTANT: If your password contains special characters (e.g. @, #, %),
// URL-encode them in DATABASE_URL. Example: @ → %40

function buildConfig() {
  if (process.env.DATABASE_URL) {
    let url = process.env.DATABASE_URL.trim();

    // Append pgbouncer=true if not already present (required for port 6543)
    if (!url.includes("pgbouncer=true")) {
      url += (url.includes("?") ? "&" : "?") + "pgbouncer=true";
    }

    return {
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }

  // Local development fallback
  return {
    user:     process.env.DB_USER     || "postgres",
    password: process.env.DB_PASSWORD || "12345",
    host:     process.env.DB_HOST     || "localhost",
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || "campus_voting_db",
  };
}

const pool = new Pool(buildConfig());

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err.message);
});

module.exports = pool;
