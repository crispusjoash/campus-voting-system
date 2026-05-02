const pool = require("./db");
async function run() {
  try {
    const res = await pool.query("SELECT id, email FROM Admins");
    console.log("Admins:", res.rows);
  } catch(e) {} finally { pool.end(); }
}
run();
