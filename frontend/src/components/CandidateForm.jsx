import React, { useState, useRef, useEffect } from "react";
import API_URL from "../config";

const ZONES = ["Non Residence","Hall 1","Hall 2","Hall 3","Hall 4 Male","Hall 4 Female"];

// SCI prefixes — auto-detected from reg number
const SCI_PREFIXES = ["BIT","COM","ETS","ITE","SCF","SIK","SIT"];

// Standard format: SIT/B/01-00001/2023
// Parts: [3-letter code] / [level] / [2-digit campus]-[5-digit serial] / [4-digit year]
const REG_REGEX = /^[A-Z]{3}\/[BDCMP]\/\d{2}-\d{5}\/\d{4}$/;
const isValidReg = (r) => REG_REGEX.test(r.toUpperCase());

// Auto-format as user types into: XXX/X/XX-XXXXX/XXXX
const formatReg = (raw) => {
  // Keep only letters and digits, uppercase
  const c = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  // Segments: program(3), level(1), campus(2), serial(5), year(4)
  const prog   = c.slice(0, 3);
  const level  = c.slice(3, 4);
  const campus = c.slice(4, 6);
  const serial = c.slice(6, 11);
  const year   = c.slice(11, 15);

  let out = prog;
  if (level)  out += "/" + level;
  if (campus) out += "/" + campus;
  if (serial) out += "-" + serial;
  if (year)   out += "/" + year;
  return out;
};

export default function CandidateForm({ token, onSuccess, onError }) {
  const [reg, setReg]               = useState("");
  const [regStatus, setRegStatus]   = useState(null); // null | "checking" | voter | "error"
  const [positions, setPositions]   = useState([]);
  const [positionId, setPositionId] = useState("");
  const [photo, setPhoto]           = useState(null);
  const [preview, setPreview]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    fetch(`${API_URL}/api/admin/positions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setPositions(d); if(d.length > 0) setPositionId(d[0].id); })
      .catch(() => {});
  }, [token]);

  // ── Reg number input handler (auto-format + uppercase) ──────────────────
  const handleRegInput = (e) => {
    const formatted = formatReg(e.target.value);
    setReg(formatted);
    setRegStatus(null);
  };

  // ── Lookup student in voter registry ────────────────────────────────────
  const lookupStudent = async () => {
    if (!isValidReg(reg)) {
      setRegStatus({ error: "Invalid format. Expected: ABC/B/01/12345/2024" });
      return;
    }
    setRegStatus("checking");
    try {
      const res  = await fetch(`${API_URL}/api/admin/lookup-voter?reg=${encodeURIComponent(reg)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setRegStatus({ voter: data.voter });
      } else {
        setRegStatus({ error: data.message });
      }
    } catch {
      setRegStatus({ error: "Could not reach server." });
    }
  };

  // ── Photo picker ────────────────────────────────────────────────────────
  const handlePhoto = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!regStatus?.voter) {
      onError("Please look up and confirm the student first.");
      return;
    }
    setLoading(true);
    const fd = new FormData();
    fd.append("voter_registration_number", reg);
    fd.append("full_name",    regStatus.voter.full_name);
    fd.append("gender",       regStatus.voter.gender);
    fd.append("position_id",  positionId);
    if (photo) fd.append("photo", photo);

    try {
      const res  = await fetch(`${API_URL}/api/admin/candidates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess("Candidate registered successfully!");
        setReg(""); setRegStatus(null); setPhoto(null); setPreview(null);
        if(positions.length > 0) setPositionId(positions[0].id);
      } else {
        onError(data.message);
      }
    } catch {
      onError("Server error.");
    }
    setLoading(false);
  };

  const voter = regStatus?.voter;

  return (
    <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* ── Registration Number ── */}
      <div className="form-group">
        <label className="form-label">Student Registration Number</label>
        <div style={{ display:"flex", gap:8 }}>
          <input
            className="form-control"
            style={{ fontFamily:"monospace", textTransform:"uppercase", letterSpacing:1 }}
            placeholder="e.g. SIT/B/01-00001/2023"
            value={reg}
            onChange={handleRegInput}
            maxLength={20}
            required
          />
          <button type="button" className="btn btn-ghost"
            onClick={lookupStudent} disabled={regStatus === "checking"}>
            {regStatus === "checking" ? "…" : "Verify"}
          </button>
        </div>
        <p style={{ fontSize:11, color:"#9ca3af", margin:"3px 0 0" }}>
          Format: PROG/LEVEL/CAMPUS-SERIAL/YEAR &nbsp;·&nbsp; e.g. SIT/B/01-00001/2023
        </p>

        {/* Status feedback */}
        {regStatus?.error && (
          <div className="alert alert-danger" style={{ marginTop:8 }}>⚠ {regStatus.error}</div>
        )}
        {voter && (
          <div style={S.voterCard}>
            <div style={S.voterAvatar}>{voter.full_name[0]}</div>
            <div>
              <p style={{ fontWeight:700, margin:0 }}>{voter.full_name}</p>
              <p style={{ fontSize:12, color:"#6b7280", margin:0 }}>
                {voter.gender} · {voter.school_id} · {voter.residence_zone}
              </p>
              <p style={{ fontSize:11, color:"#9ca3af", margin:0 }}>{voter.email_address}</p>
            </div>
            <span className="badge badge-success" style={{ marginLeft:"auto" }}>✓ Verified</span>
          </div>
        )}
      </div>

      {/* ── Position Type ── */}
      <div className="form-group">
        <label className="form-label">Position</label>
        <select className="form-control" value={positionId}
          onChange={e => setPositionId(e.target.value)} required>
          {positions.map(p => (
            <option key={p.id} value={p.id}>
              {p.title} ({p.target_group}{p.target_value ? `: ${p.target_value}` : ''})
            </option>
          ))}
        </select>
        {positions.length === 0 && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>You need to create Positions in the Election Config tab first.</p>}
      </div>

      {/* ── Photo Upload ── */}
      <div className="form-group">
        <label className="form-label">Candidate Photo (optional)</label>
        <div style={S.photoRow}>
          <div style={{ ...S.photoPreview, background: preview ? "transparent" : "#f3f4f6" }}
            onClick={() => fileRef.current.click()}>
            {preview
              ? <img src={preview} alt="preview" style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:8 }} />
              : <span style={{ color:"#9ca3af", fontSize:24 }}>📷</span>
            }
          </div>
          <div style={{ flex:1 }}>
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => fileRef.current.click()}>
              {photo ? "Change Photo" : "Upload Photo"}
            </button>
            {photo && (
              <button type="button" className="btn btn-ghost btn-sm"
                style={{ marginLeft:8 }}
                onClick={() => { setPhoto(null); setPreview(null); }}>
                Remove
              </button>
            )}
            <p style={{ fontSize:11, color:"#9ca3af", marginTop:6 }}>
              JPEG, PNG or WEBP · Max 5 MB
            </p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
              style={{ display:"none" }} onChange={handlePhoto} />
          </div>
        </div>
      </div>

      <button type="submit" disabled={loading || !voter} className="btn btn-primary">
        {loading ? <><span className="spinner" /> Registering…</> : "Register Candidate"}
      </button>
    </form>
  );
}

const S = {
  voterCard: {
    display:"flex", alignItems:"center", gap:12, padding:"12px 14px",
    background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, marginTop:8,
  },
  voterAvatar: {
    width:38, height:38, borderRadius:"50%", background:"#16a34a", color:"#fff",
    display:"flex", alignItems:"center", justifyContent:"center",
    fontWeight:700, fontSize:16, flexShrink:0,
  },
  photoRow:    { display:"flex", alignItems:"flex-start", gap:14 },
  photoPreview:{
    width:80, height:80, borderRadius:8, border:"2px dashed #d1d5db",
    display:"flex", alignItems:"center", justifyContent:"center",
    cursor:"pointer", flexShrink:0, overflow:"hidden",
  },
};
