const pool = require("./db");

async function run() {
  try {
    const logs = await pool.query("SELECT * FROM Audit_Logs ORDER BY id DESC LIMIT 5");
    console.log("Latest logs:", logs.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
