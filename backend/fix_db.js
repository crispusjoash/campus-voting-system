const pool = require("./db");
async function run() {
  try {
    // Drop the foreign key constraint
    await pool.query("ALTER TABLE Audit_Logs DROP CONSTRAINT IF EXISTS audit_logs_admin_id_fkey");
    
    // Check if an admin exists, if not create a default one
    const admins = await pool.query("SELECT * FROM Admins");
    if (admins.rows.length === 0) {
      const bcrypt = require("bcrypt");
      const hash = await bcrypt.hash("admin123", 10);
      await pool.query("INSERT INTO Admins (id, email, password) VALUES (1, 'admin@mmust.ac.ke', $1)", [hash]);
      console.log("Created default admin@mmust.ac.ke");
    }
  } catch(e) {
    console.error(e);
  } finally { pool.end(); }
}
run();
