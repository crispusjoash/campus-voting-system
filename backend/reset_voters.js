const pool = require("./db");

async function run() {
  try {
    await pool.query("DELETE FROM Voters");
    console.log("Voters list has been cleared.");
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
