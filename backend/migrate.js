const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function migrate() {
  try {
    const sqlPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log("Executing schema.sql...");
    await pool.query(sql);
    console.log("Database schema successfully updated!");

    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
