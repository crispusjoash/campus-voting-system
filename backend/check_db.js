const pool = require("./db");

async function run() {
  try {
    // Check if Audit_Logs exists
    const logsRes = await pool.query("SELECT to_regclass('public.Audit_Logs') as exists");
    console.log("Audit_Logs exists:", logsRes.rows[0].exists !== null);
    
    // Check if Positions exists
    const posRes = await pool.query("SELECT to_regclass('public.Positions') as exists");
    console.log("Positions exists:", posRes.rows[0].exists !== null);

    // Let's also check Voters is_approved
    const voters = await pool.query("SELECT * FROM Voters ORDER BY id DESC LIMIT 2");
    console.log("Latest voters:", voters.rows);

  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
