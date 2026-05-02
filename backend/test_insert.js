const pool = require("./db");

async function run() {
  try {
    await pool.query(
      "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
      ["TEST", "Test log", 1]
    );
    console.log("Success!");
  } catch (err) {
    console.error("DB Error:", err.message);
  } finally {
    pool.end();
  }
}
run();
