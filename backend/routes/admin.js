const express  = require("express");
const bcrypt   = require("bcrypt");
const jwt      = require("jsonwebtoken");
const multer   = require("multer");
const csv      = require("csv-parser");
const fs       = require("fs");
const path     = require("path");
const pool     = require("../db");

const router    = express.Router();
const jwtSecret = process.env.JWT_SECRET || "campusVotingSecretKey2026";

// ─── Multer: CSV uploads (temp) ───────────────────────────────────────────────
const csvUpload = multer({ dest: "uploads/tmp/" });

// ─── Multer: Candidate photos (persistent, with original extension) ───────────
const photoStorage = multer.diskStorage({
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
const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },                // 5 MB cap
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, WEBP or GIF images are allowed."), false);
  },
});

// ─── MMUST School → Course-code prefix map ───────────────────────────────────
// Keys are the 3-letter course-code prefix from the registration number.
// Values are the official MMUST school abbreviations.
const SCHOOL_MAP = {
  // School of Computing and Informatics (SCI) – confirmed prefixes
  BIT: "SCI", COM: "SCI", ETS: "SCI", ITE: "SCI",
  SCF: "SCI", SIK: "SCI", SIT: "SCI",

  // School of Nursing, Midwifery and Paramedical Sciences (SONMAPS)
  NCN: "SONMAPS", NCG: "SONMAPS", BSN: "SONMAPS",
  BPN: "SONMAPS", BPM: "SONMAPS", DPN: "SONMAPS",

  // School of Medicine (SOM)
  MBB: "SOM", MED: "SOM",

  // School of Engineering and the Built Environment (SEBE)
  BCE: "SEBE", BEE: "SEBE", BME: "SEBE", BTE: "SEBE",
  BCT: "SEBE", BCI: "SEBE", DIE: "SEBE", DCE: "SEBE", DME: "SEBE",

  // School of Agriculture, Veterinary Sciences & Technology (SAVET)
  BAG: "SAVET", BVM: "SAVET", BFS: "SAVET", DAG: "SAVET", DFS: "SAVET",

  // School of Natural Sciences (SONAS)
  BCH: "SONAS", BPS: "SONAS", BBT: "SONAS",
  BCS: "SONAS", BMT: "SONAS", DCH: "SONAS",

  // School of Business and Economics (SOBE)
  BBA: "SOBE", BAC: "SOBE", ECO: "SOBE", BCO: "SOBE",
  DBA: "SOBE", DBM: "SOBE", BCM: "SOBE",

  // School of Education (SEDU)
  BED: "SEDU", EDS: "SEDU", EDA: "SEDU", SED: "SEDU",
  DED: "SEDU", BES: "SEDU",

  // School of Arts and Social Sciences (SASS)
  BAS: "SASS", SOC: "SASS", LIN: "SASS", HIS: "SASS",
  BAA: "SASS", BSW: "SASS", BPY: "SASS", DSS: "SASS", PRC: "SASS",

  // School of Disaster Management & Humanitarian Assistance (SDMHA)
  BDM: "SDMHA", DDM: "SDMHA", HDM: "SDMHA",

  // School of Public Health, Biomedical Sciences & Technology (SPHBST)
  BPH: "SPHBST", BBM: "SPHBST", BHN: "SPHBST", DPH: "SPHBST",
};

// SCI-auto-detected prefixes (for reference in frontend logic)
const SCI_PREFIXES = ["BIT","COM","ETS","ITE","SCF","SIK","SIT"];

/**
 * deriveSchoolId
 * Parses the program-code prefix from the reg number and returns the school ID.
 * If the prefix is in SCHOOL_MAP the school is auto-detected; otherwise "GENERAL".
 */
const deriveSchoolId = (registration_number) => {
  const prefix = registration_number.split("/")[0].toUpperCase().trim();
  return SCHOOL_MAP[prefix] || "UNKNOWN";
};

/**
 * deriveEmail
 * Primary format: SIT/B/01-00001/2023  →  sitb01-000012023@student.mmust.ac.ke
 * Formula: [program][level][campus]-[serial][year]@student.mmust.ac.ke
 */
const deriveEmail = (registration_number) => {
  const raw   = registration_number.trim().toUpperCase();
  const parts = raw.split("/");
  if (parts.length === 4) {
    const [program, level] = parts;
    const [campus, serial] = parts[2].split("-");
    const year = parts[3];
    return `${program}${level}${campus}-${serial}${year}@student.mmust.ac.ke`.toLowerCase();
  }
  // Fallback: strip slashes (should never happen with validated input)
  return raw.replace(/\//g, "").toLowerCase() + "@student.mmust.ac.ke";
};

/**
 * validateRegNumber — only accepts: SIT/B/01-00001/2023
 * [3-letter program]/[level B|D|C|M|P]/[2-digit campus]-[5-digit serial]/[4-digit year]
 */
const REG_REGEX = /^[A-Z]{3}\/[BDCMP]\/\d{2}-\d{5}\/\d{4}$/;
const validateRegNumber = (reg) => REG_REGEX.test(reg.trim().toUpperCase());

// ─── JWT middleware ───────────────────────────────────────────────────────────
const authenticateAdmin = (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied. No token." });
  try {
    const verified = jwt.verify(token, jwtSecret);
    if (verified.role !== "admin") throw new Error("Not an admin");
    req.admin = verified;
    next();
  } catch {
    res.status(400).json({ message: "Invalid token." });
  }
};

// ─── POST /api/admin/login ────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM Admins WHERE email = $1", [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ message: "Invalid admin credentials." });

    const admin = result.rows[0];
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid)
      return res.status(401).json({ message: "Invalid admin credentials." });

    const token = jwt.sign({ admin_id: admin.id, role: "admin" }, jwtSecret, { expiresIn: "12h" });
    res.json({ message: "Admin login successful", token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── GET /api/admin/election-status ──────────────────────────────────────────
router.get("/election-status", authenticateAdmin, async (req, res) => {
  try {
    const r = await pool.query("SELECT key_name, key_value FROM System_Config WHERE key_name IN ('election_status', 'election_start', 'election_end')");
    const config = {};
    r.rows.forEach(row => { config[row.key_name] = row.key_value; });
    
    res.json({
      status: config.election_status || "Pending",
      election_start: config.election_start || null,
      election_end: config.election_end || null
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── POST /api/admin/election-status ─────────────────────────────────────────
router.post("/election-status", authenticateAdmin, async (req, res) => {
  try {
    const { status, election_start, election_end } = req.body;
    if (status && !["Pending", "Active", "Completed"].includes(status))
      return res.status(400).json({ message: "Invalid status value." });

    if (status) {
      await pool.query(
        "UPDATE System_Config SET key_value = $1 WHERE key_name = 'election_status'",
        [status]
      );
    }
    
    if (election_start !== undefined) {
      await pool.query(
        "INSERT INTO System_Config (key_name, key_value) VALUES ('election_start', $1) ON CONFLICT (key_name) DO UPDATE SET key_value = EXCLUDED.key_value",
        [election_start || ""]
      );
    }
    
    if (election_end !== undefined) {
      await pool.query(
        "INSERT INTO System_Config (key_name, key_value) VALUES ('election_end', $1) ON CONFLICT (key_name) DO UPDATE SET key_value = EXCLUDED.key_value",
        [election_end || ""]
      );
    }

    await pool.query(
      "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
      ["UPDATE_ELECTION_CONFIG", `Updated status to ${status || 'unchanged'} and schedule.`, req.admin.admin_id]
    );

    res.json({ message: `Election config updated`, status, election_start, election_end });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── GET /api/admin/lookup-voter?reg=XXX ─────────────────────────────────────
// Used by the candidate form to verify a student is in the voter registry.
router.get("/lookup-voter", authenticateAdmin, async (req, res) => {
  try {
    const reg = (req.query.reg || "").trim().toUpperCase();
    if (!reg) return res.status(400).json({ message: "Registration number required." });

    const result = await pool.query(
      "SELECT id, full_name, gender, school_id, residence_zone, email_address FROM Voters WHERE registration_number = $1",
      [reg]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Student not found in voter registry." });

    // Also check if they're already a candidate
    const dupCheck = await pool.query(
      "SELECT id FROM Candidates WHERE voter_registration_number = $1",
      [reg]
    );
    if (dupCheck.rows.length > 0)
      return res.status(409).json({ message: "This student is already registered as a candidate." });

    res.json({ voter: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── POST /api/admin/preview-voters  (CSV) ───────────────────────────────────
router.post("/preview-voters", authenticateAdmin, csvUpload.single("file"), (req, res) => {
  const rows    = [];
  const preview = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (row) => rows.push(row))
    .on("end", async () => {
      try {
        for (const row of rows) {
          const regNumber = (row["STUDENT REG."] || "").trim().toUpperCase();
          if (!regNumber) continue;

          const fullName = (row["STUDENT NAME"] || "Unknown").trim();
          let gender     = (row["SEX"] || "").trim().toUpperCase();
          gender = gender === "M" || gender === "MALE" ? "Male"
                 : gender === "F" || gender === "FEMALE" ? "Female"
                 : "Male";

          const residence = (row["RESIDENCE"] || "Non Residence").trim();
          const schoolId  = deriveSchoolId(regNumber);

          let email = (row["EMAIL"] || "").trim().toLowerCase();
          if (!email) email = deriveEmail(regNumber);

          const existing = await pool.query(
            "SELECT id FROM Voters WHERE registration_number = $1 OR email_address = $2",
            [regNumber, email]
          );
          const status = existing.rows.length > 0 ? "Duplicate" : "Valid";

          preview.push({ regNumber, fullName, gender, residence, schoolId, email, status });
        }

        fs.unlinkSync(req.file.path);
        res.json({ preview });
      } catch (err) {
        try { fs.unlinkSync(req.file.path); } catch {}
        res.status(500).json({ message: "Server Error", error: err.message });
      }
    })
    .on("error", (err) => {
      try { fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ message: "CSV parse error", error: err.message });
    });
});

// ─── POST /api/admin/confirm-voters ──────────────────────────────────────────
router.post("/confirm-voters", authenticateAdmin, async (req, res) => {
  try {
    const { validVoters } = req.body;
    let successfulInserts = 0;

    for (const voter of validVoters) {
      if (voter.status !== "Valid") continue;

      const defaultPassword  = voter.regNumber.toLowerCase();
      const hashedPassword   = await bcrypt.hash(defaultPassword, 10);

      await pool.query(
        `INSERT INTO Voters
           (registration_number, email_address, full_name, gender, residence_zone, school_id, password, is_approved)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        [voter.regNumber, voter.email, voter.fullName, voter.gender,
         voter.residence, voter.schoolId, hashedPassword, true]
      );
      successfulInserts++;
    }

    await pool.query(
      "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
      ["CONFIRM_CSV", `Bulk-uploaded ${successfulInserts} voters.`, req.admin.admin_id]
    );

    res.json({ message: "Voters imported successfully.", successfulInserts });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── POST /api/admin/register-voter ──────────────────────────────────────────
router.post("/register-voter", authenticateAdmin, async (req, res) => {
  try {
    const { registration_number, full_name, gender, residence_zone, email_address, school_id } = req.body;

    if (!registration_number || !full_name || !gender || !residence_zone)
      return res.status(400).json({ message: "Missing required fields." });

    const regUpper = registration_number.trim().toUpperCase();

    if (!validateRegNumber(regUpper))
      return res.status(400).json({
        message: "Invalid registration number format. Expected: ABC/B/01/12345/2024",
      });

    const finalSchoolId = school_id || deriveSchoolId(regUpper);
    const email    = email_address?.trim().toLowerCase() || deriveEmail(regUpper);

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
      [regUpper, email, full_name, gender, residence_zone, finalSchoolId, hashedPassword, true]
    );

    await pool.query(
      "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
      ["MANUAL_REGISTER", `Registered voter ${regUpper}.`, req.admin.admin_id]
    );

    res.status(201).json({ message: "Voter registered successfully.", voter: newVoter.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── GET /api/admin/voters ───────────────────────────────────────────────────
router.get("/voters", authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, registration_number, email_address, full_name, gender, residence_zone, school_id, is_approved, has_voted, created_at FROM Voters ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── PUT /api/admin/voters/:id ───────────────────────────────────────────────
router.put("/voters/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { registration_number, full_name, gender, residence_zone, email_address, school_id } = req.body;
    
    const regUpper = registration_number.trim().toUpperCase();
    if (!validateRegNumber(regUpper))
      return res.status(400).json({ message: "Invalid registration number format." });

    const updated = await pool.query(
      `UPDATE Voters 
       SET registration_number = $1, full_name = $2, gender = $3, residence_zone = $4, email_address = $5, school_id = $6
       WHERE id = $7 RETURNING id, registration_number, email_address, full_name, gender, residence_zone, school_id`,
      [regUpper, full_name, gender, residence_zone, email_address, school_id, id]
    );

    if (updated.rows.length === 0) return res.status(404).json({ message: "Voter not found." });

    await pool.query(
      "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
      ["UPDATE_VOTER", `Updated voter ${regUpper}.`, req.admin.admin_id]
    );

    res.json({ message: "Voter updated successfully.", voter: updated.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── PUT /api/admin/voters/:id/approve ───────────────────────────────────────
router.put("/voters/:id/approve", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await pool.query(
      "UPDATE Voters SET is_approved = true WHERE id = $1 RETURNING registration_number",
      [id]
    );
    if (updated.rows.length === 0) return res.status(404).json({ message: "Voter not found." });

    await pool.query(
      "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
      ["APPROVE_VOTER", `Approved voter ${updated.rows[0].registration_number}.`, req.admin.admin_id]
    );

    res.json({ message: "Voter approved successfully." });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── PUT /api/admin/voters/:id/reject ────────────────────────────────────────
router.put("/voters/:id/reject", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // For rejection, we just delete the pending record
    const deleted = await pool.query(
      "DELETE FROM Voters WHERE id = $1 AND is_approved = false RETURNING registration_number",
      [id]
    );
    if (deleted.rows.length === 0) return res.status(404).json({ message: "Pending voter not found." });

    await pool.query(
      "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
      ["REJECT_VOTER", `Rejected/Deleted pending voter ${deleted.rows[0].registration_number}.`, req.admin.admin_id]
    );

    res.json({ message: "Voter rejected and removed successfully." });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── DELETE /api/admin/voters/:id ────────────────────────────────────────────
router.delete("/voters/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get voter details for audit log before deleting
    const voterCheck = await pool.query("SELECT registration_number FROM Voters WHERE id = $1", [id]);
    if (voterCheck.rows.length === 0) return res.status(404).json({ message: "Voter not found." });
    const regNum = voterCheck.rows[0].registration_number;

    await pool.query("DELETE FROM Voters WHERE id = $1", [id]);

    await pool.query(
      "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
      ["DELETE_VOTER", `Deleted voter ${regNum}.`, req.admin.admin_id]
    );

    res.json({ message: "Voter deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── GET /api/admin/positions ──────────────────────────────────────────────
router.get("/positions", authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM Positions ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── POST /api/admin/positions ─────────────────────────────────────────────
router.post("/positions", authenticateAdmin, async (req, res) => {
  try {
    const { title, target_group, target_value } = req.body;
    if (!title || !target_group) return res.status(400).json({ message: "Title and Target Group required." });

    const newPos = await pool.query(
      "INSERT INTO Positions (title, target_group, target_value) VALUES ($1, $2, $3) RETURNING *",
      [title, target_group, target_value || null]
    );

    await pool.query(
      "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
      ["CREATE_POSITION", `Created position ${title}.`, req.admin.admin_id]
    );

    res.status(201).json(newPos.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── DELETE /api/admin/positions/:id ───────────────────────────────────────
router.delete("/positions/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const pos = await pool.query("SELECT title FROM Positions WHERE id = $1", [id]);
    if (pos.rows.length === 0) return res.status(404).json({ message: "Position not found." });

    await pool.query("DELETE FROM Positions WHERE id = $1", [id]);

    await pool.query(
      "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
      ["DELETE_POSITION", `Deleted position ${pos.rows[0].title}.`, req.admin.admin_id]
    );

    res.json({ message: "Position deleted." });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── POST /api/admin/candidates  (multipart/form-data with optional photo) ───
router.post(
  "/candidates",
  authenticateAdmin,
  photoUpload.single("photo"),
  async (req, res) => {
    try {
      const { voter_registration_number, full_name, gender, position_id } = req.body;

      // ── Validation ──────────────────────────────────────────────────────────
      if (!voter_registration_number || !full_name || !gender || !position_id)
        return res.status(400).json({ message: "Missing required fields." });

      const regUpper = voter_registration_number.trim().toUpperCase();

      // ── Verify student exists in voter registry ──────────────────────────
      const voterCheck = await pool.query(
        "SELECT id FROM Voters WHERE registration_number = $1",
        [regUpper]
      );
      if (voterCheck.rows.length === 0) {
        if (req.file) fs.unlinkSync(req.file.path); // clean up uploaded photo
        return res.status(404).json({
          message: "Student not found in voter registry. Register the student as a voter first.",
        });
      }

      // ── Duplicate candidate check ────────────────────────────────────────
      const dupCheck = await pool.query(
        "SELECT id FROM Candidates WHERE voter_registration_number = $1",
        [regUpper]
      );
      if (dupCheck.rows.length > 0) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(409).json({ message: "This student is already registered as a candidate." });
      }

      // ── Build photo URL (relative – served as static by Express) ────────
      const photo_url = req.file
        ? `/uploads/candidates/${req.file.filename}`
        : null;

      const newCandidate = await pool.query(
        `INSERT INTO Candidates
           (voter_registration_number, full_name, gender, position_id, photo_url, is_approved)
         VALUES ($1,$2,$3,$4,$5, TRUE) RETURNING *`,
        [regUpper, full_name, gender, position_id, photo_url]
      );

      await pool.query(
        "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
        ["REGISTER_CANDIDATE", `Registered candidate ${full_name} (${regUpper}).`, req.admin.admin_id]
      );

      res.status(201).json(newCandidate.rows[0]);
    } catch (err) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} }
      console.error(err);
      res.status(500).json({ message: "Server Error", error: err.message });
    }
  }
);

// ─── GET /api/admin/candidates ──────────────────────────────────────────────
router.get("/candidates", authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, p.title as position_title, p.target_group, p.target_value 
      FROM Candidates c 
      JOIN Positions p ON c.position_id = p.id 
      ORDER BY c.is_approved ASC, c.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── DELETE /api/admin/candidates/:id ────────────────────────────────────────
router.delete("/candidates/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const cand = await pool.query("SELECT full_name FROM Candidates WHERE id = $1", [id]);
    if (cand.rows.length === 0) return res.status(404).json({ message: "Candidate not found." });

    await pool.query("DELETE FROM Candidates WHERE id = $1", [id]);

    await pool.query(
      "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
      ["DELETE_CANDIDATE", `Deleted candidate ${cand.rows[0].full_name}.`, req.admin.admin_id]
    );

    res.json({ message: "Candidate deleted." });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── PUT /api/admin/candidates/:id/approve ───────────────────────────────────
router.put("/candidates/:id/approve", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await pool.query(
      "UPDATE Candidates SET is_approved = true WHERE id = $1 RETURNING full_name",
      [id]
    );
    if (updated.rows.length === 0) return res.status(404).json({ message: "Candidate not found." });

    await pool.query(
      "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
      ["APPROVE_CANDIDATE", `Approved candidate ${updated.rows[0].full_name}.`, req.admin.admin_id]
    );

    res.json({ message: "Candidate approved successfully." });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── PUT /api/admin/candidates/:id/reject ────────────────────────────────────
router.put("/candidates/:id/reject", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await pool.query(
      "DELETE FROM Candidates WHERE id = $1 AND is_approved = false RETURNING full_name",
      [id]
    );
    if (deleted.rows.length === 0) return res.status(404).json({ message: "Pending candidate not found." });

    await pool.query(
      "INSERT INTO Audit_Logs (action_type, description, admin_id) VALUES ($1,$2,$3)",
      ["REJECT_CANDIDATE", `Rejected pending candidate ${deleted.rows[0].full_name}.`, req.admin.admin_id]
    );

    res.json({ message: "Candidate application rejected." });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ─── GET /api/admin/audit-logs ───────────────────────────────────────────────
router.get("/audit-logs", authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.*, a.email as admin_email 
      FROM Audit_Logs l 
      LEFT JOIN Admins a ON l.admin_id = a.id 
      ORDER BY l.created_at DESC 
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

module.exports = router;
module.exports.SCI_PREFIXES = SCI_PREFIXES; // exported for tests
