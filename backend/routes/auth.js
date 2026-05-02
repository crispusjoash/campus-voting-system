const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const pool = require("../db");

const router = express.Router();
const jwtSecret = process.env.JWT_SECRET || "campusVotingSecretKey2026";

// Setup Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// Helper to generate a 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// POST /api/auth/login
// Step 1 of Auth: Verify password and send OTP
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check Election Status and Schedule first
    const statusRes = await pool.query("SELECT key_name, key_value FROM System_Config WHERE key_name IN ('election_status', 'election_start', 'election_end')");
    let status = 'Pending';
    let start = null;
    let end = null;
    statusRes.rows.forEach(r => {
      if (r.key_name === 'election_status') status = r.key_value;
      if (r.key_name === 'election_start') start = r.key_value;
      if (r.key_name === 'election_end') end = r.key_value;
    });

    let isActive = status === 'Active';
    
    if (status !== 'Completed' && start && end) {
      const now = new Date();
      const startTime = new Date(start);
      const endTime = new Date(end);
      if (now >= startTime && now <= endTime) {
        isActive = true;
      }
    }

    // Allow login even after completion to view results
    // if (status === 'Completed') {
    //     return res.status(403).json({ message: "The election has been completed." });
    // }

    const studentRes = await pool.query("SELECT * FROM Voters WHERE email_address = $1", [email]);
    if (studentRes.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const student = studentRes.rows[0];

    if (!student.is_approved) {
      return res.status(403).json({ message: "Your registration is pending admin approval." });
    }

    // Allow login even if voted, to view profile/results
    // if (student.has_voted) {
    //   return res.status(403).json({ message: "You have already cast your vote." });
    // }

    const validPassword = await bcrypt.compare(password, student.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate and store OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes

    await pool.query(
      "UPDATE Voters SET otp = $1, otp_expires_at = $2 WHERE id = $3",
      [otp, expiresAt, student.id]
    );

    // Only attempt to send email if configured, otherwise just log it for dev
    if (process.env.MAIL_USER && process.env.MAIL_PASS) {
      await transporter.sendMail({
        from: `"MMUST Electoral Commission" <${process.env.MAIL_USER}>`,
        to:   student.email_address,
        subject: "MMUST Student Elections – Your One-Time Password",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#1a56a4">MMUST Student Elections</h2>
            <p>Your One-Time Password (OTP) is:</p>
            <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111;padding:16px 0">${otp}</div>
            <p style="color:#6b7280;font-size:13px">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
          </div>`,
      });
    } else {
      console.log(`[DEV MODE] OTP for ${student.email_address}: ${otp}`);
    }

    res.json({ message: "OTP sent to your email.", step: "OTP_REQUIRED" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// POST /api/auth/verify-otp
// Step 2 of Auth: Verify OTP and issue JWT
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const studentRes = await pool.query("SELECT * FROM Voters WHERE email_address = $1", [email]);
    if (studentRes.rows.length === 0) {
      return res.status(401).json({ message: "Invalid request" });
    }

    const student = studentRes.rows[0];

    if (student.otp !== otp) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    if (new Date() > new Date(student.otp_expires_at)) {
      return res.status(401).json({ message: "OTP has expired. Please log in again." });
    }

    // Clear OTP
    await pool.query("UPDATE Voters SET otp = NULL, otp_expires_at = NULL WHERE id = $1", [student.id]);

    // Issue JWT Token
    // We should also include the current active status so frontend knows whether to show ballot or profile
    const statusRes = await pool.query("SELECT key_name, key_value FROM System_Config WHERE key_name IN ('election_status', 'election_start', 'election_end')");
    let status = 'Pending', start = null, end = null;
    statusRes.rows.forEach(r => {
      if (r.key_name === 'election_status') status = r.key_value;
      if (r.key_name === 'election_start') start = r.key_value;
      if (r.key_name === 'election_end') end = r.key_value;
    });

    let isActive = status === 'Active';
    if (status !== 'Completed' && start && end) {
      const now = new Date();
      if (now >= new Date(start) && now <= new Date(end)) isActive = true;
    }

    const token = jwt.sign(
      {
        student_id: student.id,
        registration_number: student.registration_number,
        full_name: student.full_name,
        school_id: student.school_id,
        gender: student.gender,
        residence_zone: student.residence_zone,
        profile_photo_url: student.profile_photo_url,
        has_voted: student.has_voted,
        isActive: isActive
      },
      jwtSecret,
      { expiresIn: "15m" }
    );

    res.json({ message: "Login successful!", token });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

// POST /api/auth/signup
// Step 1: Public endpoint for student self-registration
router.post("/signup", async (req, res) => {
  try {
    const { registration_number, full_name, gender, residence_zone, email_address, school_id } = req.body;

    if (!registration_number || !full_name || !gender || !residence_zone || !school_id)
      return res.status(400).json({ message: "Missing required fields." });

    const regUpper = registration_number.trim().toUpperCase();

    // Re-validate using same regex as admin
    if (!/^[A-Z]{3}\/[BDCMP]\/\d{2}-\d{5}\/\d{4}$/.test(regUpper))
      return res.status(400).json({ message: "Invalid registration number format." });

    const email = email_address?.trim().toLowerCase() || (regUpper.replace(/\//g, "").toLowerCase() + "@student.mmust.ac.ke");

    const existing = await pool.query(
      "SELECT id FROM Voters WHERE registration_number = $1 OR email_address = $2",
      [regUpper, email]
    );
    if (existing.rows.length > 0)
      return res.status(409).json({ message: "A voter with this reg number or email already exists." });

    const hashedPassword = await bcrypt.hash(regUpper.toLowerCase(), 10);

    const newVoter = await pool.query(
      `INSERT INTO Voters
         (registration_number, email_address, full_name, gender, residence_zone, school_id, password, is_approved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [regUpper, email, full_name, gender, residence_zone, school_id, hashedPassword, false]
    );

    res.status(201).json({ message: "Registration submitted successfully. Please wait for admin approval.", voter: newVoter.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

module.exports = router;
