import React, { useState } from "react";
import API_URL from "../config";
import { isValidReg, formatReg, deriveSchoolId, deriveEmail } from "../utils/mmust";

const ZONES = ["Non Residence","Hall 1","Hall 2","Hall 3","Hall 4 Male","Hall 4 Female"];
const SCHOOLS = ["SCI", "SONMAPS", "SOM", "SEBE", "SAVET", "SONAS", "SOBE", "SEDU", "SASS", "SDMHA", "SPHBST"];


const EMPTY = { registration_number:"", full_name:"", gender:"Male", residence_zone:"Non Residence", email_address:"", school_id:"" };

export default function ManualVoterForm({ token, onSuccess, onError }) {
  const [form, setForm]     = useState(EMPTY);
  const [regErr, setRegErr] = useState("");
  const [loading, setLoading] = useState(false);

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
    try {
      const res  = await fetch(`${API_URL}/api/admin/register-voter`, {
        method: "POST",
        headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) { onSuccess("Voter registered! Default password: " + form.registration_number.toLowerCase()); setForm(EMPTY); }
      else onError(data.message);
    } catch { onError("Server error."); }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div className="form-group">
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

      <div className="form-group">
        <label className="form-label">Full Name</label>
        <input className="form-control" placeholder="Student full name"
          value={form.full_name} onChange={e => setForm({...form, full_name:e.target.value})} required />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div className="form-group">
          <label className="form-label">Gender</label>
          <select className="form-control" value={form.gender}
            onChange={e => setForm({...form, gender:e.target.value})}>
            <option>Male</option><option>Female</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Residence Zone</label>
          <select className="form-control" value={form.residence_zone}
            onChange={e => setForm({...form, residence_zone:e.target.value})}>
            {ZONES.map(z => <option key={z}>{z}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div className="form-group">
          <label className="form-label">Email (optional)</label>
          <input className="form-control" type="email"
            placeholder="leave blank to auto-generate"
            value={form.email_address}
            onChange={e => setForm({...form, email_address:e.target.value})} />
        </div>
        <div className="form-group">
          <label className="form-label">School Placement</label>
          <select className="form-control" value={form.school_id}
            onChange={e => setForm({...form, school_id:e.target.value})} required>
            <option value="">Select a School</option>
            {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {form.school_id && (
            <p style={{ fontSize:11, color:"#d97706", margin:"3px 0 0" }}>⚠ Verify if auto-selected school is correct</p>
          )}
        </div>
      </div>

      <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#1e40af" }}>
        ℹ Default password will be the registration number in lowercase.
      </div>

      <button type="submit" disabled={loading} className="btn btn-primary">
        {loading ? <><span className="spinner" /> Registering…</> : "Register Voter"}
      </button>
    </form>
  );
}
