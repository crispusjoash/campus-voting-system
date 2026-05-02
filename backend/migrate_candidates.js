const pool = require("./db");

async function run() {
  try {
    // 1. Add is_approved column to Candidates
    await pool.query(`ALTER TABLE Candidates ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;`);
    
    // 2. Set existing candidates to approved
    await pool.query(`UPDATE Candidates SET is_approved = TRUE WHERE is_approved IS FALSE;`);

    // 3. Update schema.sql to reflect this change
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.join(__dirname, 'schema.sql');
    let schema = fs.readFileSync(schemaPath, 'utf8');
    if (!schema.includes('is_approved BOOLEAN')) {
      schema = schema.replace(
        /active\s+BOOLEAN\s+DEFAULT\s+TRUE,/,
        `active                   BOOLEAN      DEFAULT TRUE,\n    is_approved              BOOLEAN      DEFAULT FALSE,`
      );
      fs.writeFileSync(schemaPath, schema);
      console.log("Updated schema.sql");
    }

    console.log("Database updated successfully.");
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
