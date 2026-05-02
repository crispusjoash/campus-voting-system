require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

async function seedAdmin() {
  try {
    const email = "admin@student.mmust.ac.ke";
    const password = "admin"; // Default password

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    // Insert or update the admin
    await pool.query(
      `INSERT INTO Admins (email, password) 
       VALUES ($1, $2) 
       ON CONFLICT (email) 
       DO UPDATE SET password = EXCLUDED.password`,
      [email, hash]
    );

    console.log("Admin account seeded successfully!");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
}

seedAdmin();
