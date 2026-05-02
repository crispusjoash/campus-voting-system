const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const pool = require("../db");

// ─── Multer: Voter profile photos ───────────────────────────────────────────────
const voterPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/voters");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, "voter-" + unique + path.extname(file.originalname).toLowerCase());
  },
});
const voterPhotoUpload = multer({
  storage: voterPhotoStorage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB limit
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, or WEBP images are allowed."), false);
  },
});

const router = express.Router();
const jwtSecret = process.env.JWT_SECRET || "campusVotingSecretKey2026";

// ─── Multer: Candidate photos ───────────────────────────────────────────────
const candidatePhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/candidates");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname).toLowerCase());
  },
});
const candidatePhotoUpload = multer({
  storage: candidatePhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, WEBP or GIF images are allowed."), false);
  },
});

// Middleware to authenticate voter token
const authenticateVoter = (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied. No token provided." });

  try {
    const verified = jwt.verify(token, jwtSecret);
    req.voter = verified; // Contains student_id, school_id, gender, residence_zone
    next();
  } catch (err) {
    res.status(400).json({ message: "Invalid token." });
  }
};

// GET /api/voter/ballot
// Dynamically fetches the ballot based on voter demographics and Positions
router.get("/ballot", authenticateVoter, async (req, res) => {
  try {
    const { school_id, residence_zone } = req.voter;

    // Fetch all positions that apply to this voter
    const positionsRes = await pool.query(
      `SELECT * FROM Positions 
       WHERE target_group = 'ALL' 
          OR (target_group = 'SCHOOL' AND target_value = $1)
          OR (target_group = 'RESIDENTIAL' AND target_value = $2)
       ORDER BY id ASC`,
      [school_id, residence_zone]
    );

    const positions = positionsRes.rows;

    if (positions.length === 0) {
      return res.json({ ballot: [] });
    }

    const posIds = positions.map(p => p.id);

    // Fetch candidates for these positions (only approved ones appear on the ballot)
    const candidatesRes = await pool.query(
      `SELECT * FROM Candidates WHERE position_id = ANY($1) AND active = true AND is_approved = true`,
      [posIds]
    );

    const candidates = candidatesRes.rows;

    // Attach candidates to their respective positions
    const ballot = positions.map(p => ({
      ...p,
      candidates: candidates.filter(c => c.position_id === p.id)
    }));

    res.json({ ballot });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// POST /api/voter/cast
// Strictly isolated database transaction to secure votes
router.post("/cast", authenticateVoter, async (req, res) => {
  const client = await pool.connect();
  try {
    const { student_id } = req.voter;
    const { candidateIds } = req.body; // Array of selected candidate IDs

    if (!Array.isArray(candidateIds)) {
      return res.status(400).json({ message: "Invalid ballot payload." });
    }

    await client.query("BEGIN");

    // 1. Check Election Status and Schedule
    const statusRes = await client.query("SELECT key_name, key_value FROM System_Config WHERE key_name IN ('election_status', 'election_start', 'election_end')");
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
      if (now >= new Date(start) && now <= new Date(end)) {
        isActive = true;
      }
    }

    if (!isActive) throw new Error("The election is not currently active.");

    // 2. Verify eligibility and lock row to prevent double-voting race conditions
    const voterRes = await client.query(
      "SELECT has_voted FROM Voters WHERE id = $1 FOR UPDATE", 
      [student_id]
    );
    
    if (voterRes.rows.length === 0) throw new Error("Voter not found.");
    if (voterRes.rows[0].has_voted) throw new Error("Voter has already cast their ballot.");

    // 2. Mark voter as having voted
    await client.query("UPDATE Voters SET has_voted = TRUE WHERE id = $1", [student_id]);

    // 3. Increment votes anonymously
    // If candidateIds is empty, it means the user abstained.
    if (candidateIds && candidateIds.length > 0) {
      for (const cId of candidateIds) {
        await client.query(
          "INSERT INTO Votes (candidate_id, vote_count) VALUES ($1, 1) ON CONFLICT (candidate_id) DO UPDATE SET vote_count = Votes.vote_count + 1",
          [cId]
        );
      }
    }

    await client.query("COMMIT");

    // 4. Trigger real-time update via Socket.io if attached to req
    if (req.io) {
      req.io.emit("TALLY_UPDATED");
    }

    res.json({ message: "Ballot successfully securely cast." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    // Determine status code based on error
    if (err.message.includes("already cast") || err.message.includes("not currently active")) {
      return res.status(403).json({ message: err.message });
    }
    res.status(500).send("Server Error");
  } finally {
    client.release();
  }
});

// PUT /api/voter/profile
// Allows voter to update their residence zone while election is pending
router.put("/profile", authenticateVoter, async (req, res) => {
  try {
    const { student_id } = req.voter;
    const { residence_zone } = req.body;

    if (!residence_zone) return res.status(400).json({ message: "Residence zone required." });

    // Ensure election is pending
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

    if (isActive) {
      return res.status(403).json({ message: "Cannot update profile while election is active." });
    }

    const updated = await pool.query(
      "UPDATE Voters SET residence_zone = $1 WHERE id = $2 RETURNING *",
      [residence_zone, student_id]
    );

    if (updated.rows.length === 0) return res.status(404).json({ message: "Voter not found." });

    // Issue new token with updated zone
    const student = updated.rows[0];
    const newToken = jwt.sign(
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

    res.json({ message: "Profile updated successfully.", token: newToken, voter: student });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── POST /api/voter/photo ───────────────────────────────────────────────────
router.post("/photo", authenticateVoter, voterPhotoUpload.single("photo"), async (req, res) => {
  try {
    const { student_id } = req.voter;
    if (!req.file) return res.status(400).json({ message: "No photo uploaded." });

    const photo_url = `/uploads/voters/${req.file.filename}`;
    
    // Update DB
    await pool.query("UPDATE Voters SET profile_photo_url = $1 WHERE id = $2", [photo_url, student_id]);

    // Re-fetch to issue updated token if needed, or just return new info
    const result = await pool.query("SELECT * FROM Voters WHERE id = $1", [student_id]);
    const student = result.rows[0];

    // Issue new token with updated photo
    const newToken = jwt.sign(
      {
        student_id: student.id,
        registration_number: student.registration_number,
        full_name: student.full_name,
        school_id: student.school_id,
        gender: student.gender,
        residence_zone: student.residence_zone,
        profile_photo_url: student.profile_photo_url,
        has_voted: student.has_voted,
        isActive: req.voter.isActive // preserve state
      },
      jwtSecret,
      { expiresIn: "15m" }
    );

    res.json({ message: "Photo uploaded successfully.", photo_url, token: newToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── GET /api/voter/positions ──────────────────────────────────────────────
// Fetch positions the voter is eligible for
router.get("/positions", authenticateVoter, async (req, res) => {
  try {
    const { school_id, residence_zone } = req.voter;
    const positionsRes = await pool.query(
      `SELECT * FROM Positions 
       WHERE target_group = 'ALL' 
          OR (target_group = 'SCHOOL' AND target_value = $1)
          OR (target_group = 'RESIDENTIAL' AND target_value = $2)
       ORDER BY id ASC`,
      [school_id, residence_zone]
    );
    res.json(positionsRes.rows);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── GET /api/voter/vie-status ─────────────────────────────────────────────
// Check if the student has already applied
router.get("/vie-status", authenticateVoter, async (req, res) => {
  try {
    const { student_id } = req.voter;
    const voterCheck = await pool.query("SELECT registration_number FROM Voters WHERE id = $1", [student_id]);
    if (voterCheck.rows.length === 0) return res.status(404).json({ message: "Voter not found." });
    
    const regUpper = voterCheck.rows[0].registration_number;
    
    const candRes = await pool.query(
      `SELECT c.*, p.title as position_title 
       FROM Candidates c
       JOIN Positions p ON c.position_id = p.id
       WHERE c.voter_registration_number = $1`, 
      [regUpper]
    );

    const statusRes = await pool.query("SELECT key_value FROM System_Config WHERE key_name = 'election_status'");
    const electionStatus = statusRes.rows.length > 0 ? statusRes.rows[0].key_value : 'Pending';

    if (candRes.rows.length > 0) {
      res.json({ applied: true, candidate: candRes.rows[0], election_status: electionStatus });
    } else {
      res.json({ applied: false, election_status: electionStatus });
    }
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── POST /api/voter/vie ───────────────────────────────────────────────────
// Submit an application to vie for a position
router.post("/vie", authenticateVoter, candidatePhotoUpload.single("photo"), async (req, res) => {
  try {
    const { student_id } = req.voter;
    const { position_id } = req.body;

    if (!position_id) return res.status(400).json({ message: "Position is required." });

    // Ensure election is pending
    const statusRes = await pool.query("SELECT key_value FROM System_Config WHERE key_name = 'election_status'");
    if (statusRes.rows.length > 0 && statusRes.rows[0].key_value !== 'Pending') {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ message: "Applications are only accepted while the election is pending." });
    }

    // Get Voter Details
    const voterCheck = await pool.query("SELECT registration_number, full_name, gender FROM Voters WHERE id = $1", [student_id]);
    if (voterCheck.rows.length === 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: "Voter not found." });
    }
    const voter = voterCheck.rows[0];

    // Check if already a candidate
    const dupCheck = await pool.query("SELECT id FROM Candidates WHERE voter_registration_number = $1", [voter.registration_number]);
    if (dupCheck.rows.length > 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(409).json({ message: "You have already applied for a position." });
    }

    const photo_url = req.file ? `/uploads/candidates/${req.file.filename}` : null;

    const newCandidate = await pool.query(
      `INSERT INTO Candidates
         (voter_registration_number, full_name, gender, position_id, photo_url, is_approved)
       VALUES ($1,$2,$3,$4,$5, FALSE) RETURNING *`,
      [voter.registration_number, voter.full_name, voter.gender, position_id, photo_url]
    );

    res.status(201).json({ message: "Application submitted successfully. Waiting for admin approval.", candidate: newCandidate.rows[0] });
  } catch (err) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} }
    console.error(err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

module.exports = router;
