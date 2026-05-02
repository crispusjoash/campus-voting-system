const pool = require("./db");

async function migrate() {
  try {
    await pool.query("ALTER TABLE Voters ADD COLUMN IF NOT EXISTS profile_photo_url VARCHAR(500);");
    console.log("Migration successful: added profile_photo_url to Voters.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrate();
