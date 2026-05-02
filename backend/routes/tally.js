const express = require("express");
const pool = require("../db");
const jwt = require("jsonwebtoken");

const router = express.Router();
const jwtSecret = process.env.JWT_SECRET || "campusVotingSecretKey2026";

// Middleware to authenticate any valid user (Admin or Voter)
const authenticateAny = (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied" });

  try {
    const verified = jwt.verify(token, jwtSecret);
    req.user = verified; // Store user info (role, id, etc.)
    next();
  } catch (err) {
    res.status(400).json({ message: "Invalid token" });
  }
};

// GET /api/tally
// Fetches the aggregated live tally
router.get("/", authenticateAny, async (req, res) => {
  try {
    const query = `
      SELECT c.id, c.full_name, c.gender, c.position_id, 
             COALESCE(v.vote_count, 0) as vote_count
      FROM Candidates c
      LEFT JOIN Votes v ON c.id = v.candidate_id
      WHERE c.is_approved = true AND c.active = true
      ORDER BY vote_count DESC
    `;
    
    const candidatesRes = await pool.query(query);
    const candidates = candidatesRes.rows;

    const positionsRes = await pool.query("SELECT * FROM Positions ORDER BY id ASC");
    const positions = positionsRes.rows.map(p => ({
      ...p,
      candidates: candidates.filter(c => c.position_id === p.id)
    }));

    res.json(positions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

module.exports = router;
