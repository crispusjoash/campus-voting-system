const pool = require("./db");
async function run() {
  try {
    const res = await pool.query("SELECT id, registration_number, is_approved, full_name FROM Voters");
    console.log("Voters:", res.rows);
  } catch(e) {} finally { pool.end(); }
}
run();
