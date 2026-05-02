import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API_URL from "../config";
import { isValidReg, formatReg, deriveSchoolId, deriveEmail } from "../utils/mmust";

const SCHOOLS = ["SCI", "SONMAPS", "SOM", "SEBE", "SAVET", "SONAS", "SOBE", "SEDU", "SASS", "SDMHA", "SPHBST"];
const ZONES = ["Non Residence","Hall 1","Hall 2","Hall 3","Hall 4 Male","Hall 4 Female"];

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    registration_number: "",
    full_name: "",
    email_address: "",
    gender: "Male",
    school_id: "",
    residence_zone: "Non Residence"
  });
  const [regErr, setRegErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleReg = (e) => {
    const v = formatReg(e.target.value);
    
    // Auto-detect school
    const autoSchool = deriveSchoolId(v);
    
    // Auto-generate email if the reg is fully valid, otherwise keep trying
    const autoEmail = isValidReg(v) ? deriveEmail(v) : (v.replace(/[^A-Z0-9]/gi, "").toLowerCase() + "@student.mmust.ac.ke");

    setForm(f => ({ 
      ...f, 
      registration_number: v,
      school_id: autoSchool || f.school_id,
      email_address: autoEmail
    }));
    
    setRegErr(v.length >= 20 && !isValidReg(v)
      ? "Format: ABC/B/01/12345/2024 (e.g. BIT/D/01/03380/2019)"
      : "");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValidReg(form.registration_number)) {
      setRegErr("Please enter a valid MMUST registration number.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: data.message });
        setForm({ registration_number: "", full_name: "", email_address: "", gender: "Male", school_id: "SCI", residence_zone: "Non Residence" });
      } else {
        setMessage({ type: "danger", text: data.message });
      }
    } catch (err) {
      setMessage({ type: "danger", text: "Network error. Please try again." });
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5", padding: 20 }}>
      <div className="card" style={{ maxWidth: 500, width: "100%", padding: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h2 style={{ color: "#1a56a4", margin: "0 0 8px" }}>Voter Registration</h2>
          <p style={{ color: "#6b7280", margin: 0 }}>Register to vote in the upcoming MMUST student elections.</p>
        </div>

        {message && (
          <div className={`alert alert-${message.type}`} style={{ marginBottom: 20 }}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Registration Number</label>
            <input 
              className={`form-control ${regErr ? "form-control-error" : ""}`}
              style={{ fontFamily:"monospace", textTransform:"uppercase", letterSpacing:1,
                borderColor: regErr ? "#dc2626" : undefined }}
              placeholder="e.g. SIT/B/01-00001/2023"
              value={form.registration_number} 
              onChange={handleReg} 
              maxLength={20}
              required 
            />
            {regErr
              ? <p style={{ fontSize:11, color:"#dc2626", margin:"3px 0 0" }}>⚠ {regErr}</p>
              : <p style={{ fontSize:11, color:"#9ca3af", margin:"3px 0 0" }}>
                  Format: PROG/LEVEL/CAMPUS-SERIAL/YEAR
                </p>
            }
            {isValidReg(form.registration_number) && (
              <p style={{ fontSize:11, color:"#16a34a", margin:"3px 0 0" }}>✓ Valid format</p>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Full Name</label>
            <input 
              className="form-control" 
              placeholder="John Doe"
              value={form.full_name} 
              onChange={e => setForm({...form, full_name: e.target.value})} 
              required 
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Email Address (Optional)</label>
            <input 
              type="email"
              className="form-control" 
              placeholder="Leave blank to auto-generate"
              value={form.email_address} 
              onChange={e => setForm({...form, email_address: e.target.value})} 
            />
          </div>

          <div style={{ display: "flex", gap: 16 }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Gender</label>
              <select className="form-control" value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">School</label>
              <select className="form-control" value={form.school_id} onChange={e => setForm({...form, school_id: e.target.value})} required>
                <option value="">Select a School</option>
                {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {form.school_id && (
                <p style={{ fontSize:11, color:"#d97706", margin:"3px 0 0" }}>⚠ Verify if auto-selected school is correct</p>
              )}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Residence Zone</label>
            <select className="form-control" value={form.residence_zone} onChange={e => setForm({...form, residence_zone: e.target.value})}>
              {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }} disabled={loading}>
            {loading ? "Submitting..." : "Submit Registration"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Already registered? <button onClick={() => navigate("/")} className="btn-ghost" style={{ padding: 0, textDecoration: "underline", border: "none", background: "none", color: "#1a56a4", cursor: "pointer" }}>Log in here</button>
          </p>
        </div>
      </div>
    </div>
  );
}
