import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API_URL from "../config";

const API = API_URL;
const ZONES = ["Non Residence","Hall 1","Hall 2","Hall 3","Hall 4 Male","Hall 4 Female"];

export default function VoterBallot() {
  const navigate = useNavigate();
  
  // App state
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [voterInfo, setVoterInfo]   = useState(null);
  
  // Ballot state
  const [ballotPositions, setBallotPositions] = useState([]);
  const [selections, setSelections] = useState({});
  const [stage, setStage]           = useState(0); // index in ballotPositions, or ballotPositions.length for review, +1 for success
  const [submitting, setSubmitting] = useState(false);

  // Profile update state
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [newZone, setNewZone] = useState("");
  const [profileMsg, setProfileMsg] = useState(null);

  // Candidate Application state
  const [vieStatus, setVieStatus] = useState(null);
  const [availablePositions, setAvailablePositions] = useState([]);
  const [vieForm, setVieForm] = useState({ position_id: "", photo: null });
  const [vieMsg, setVieMsg] = useState(null);
  const [submittingVie, setSubmittingVie] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("voterToken");
    if (!token) return navigate("/login");

    try {
      // Basic manual JWT decode for frontend state
      const payload = JSON.parse(atob(token.split('.')[1]));
      setVoterInfo(payload);
      setNewZone(payload.residence_zone);

      if (payload.isActive) {
        // Fetch dynamic ballot
        fetch(`${API}/api/voter/ballot`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then(d => { 
            if (d.message) throw new Error(d.message); 
            setBallotPositions(d.ballot || []); 
            setLoading(false); 
          })
          .catch(e => { setError(e.message); setLoading(false); });
      } else {
        // Fetch vie status and eligible positions
        Promise.all([
          fetch(`${API}/api/voter/vie-status`, { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.json()),
          fetch(`${API}/api/voter/positions`, { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.json())
        ])
        .then(([vs, pos]) => {
          if (!vs.message) setVieStatus(vs);
          if (!pos.message && Array.isArray(pos)) setAvailablePositions(pos);
          setLoading(false);
        })
        .catch(e => { console.error(e); setLoading(false); });
      }
    } catch (e) {
      navigate("/login");
    }
  }, [navigate]);

  const updateProfile = async (e) => {
    e.preventDefault();
    setUpdatingProfile(true);
    setProfileMsg(null);
    const token = localStorage.getItem("voterToken");
    try {
      const res = await fetch(`${API}/api/voter/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ residence_zone: newZone })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("voterToken", data.token);
        const payload = JSON.parse(atob(data.token.split('.')[1]));
        setVoterInfo(payload);
        setProfileMsg({ type: "success", text: "Profile updated successfully." });
      } else {
        setProfileMsg({ type: "danger", text: data.message });
      }
    } catch (err) {
      setProfileMsg({ type: "danger", text: "Network error." });
    }
    setUpdatingProfile(false);
  };

  const submitVie = async (e) => {
    e.preventDefault();
    setSubmittingVie(true);
    setVieMsg(null);
    const token = localStorage.getItem("voterToken");

    const formData = new FormData();
    formData.append("position_id", vieForm.position_id);
    if (vieForm.photo) formData.append("photo", vieForm.photo);

    try {
      const res = await fetch(`${API}/api/voter/vie`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setVieMsg({ type: "success", text: data.message });
        setVieStatus({ applied: true, candidate: data.candidate });
      } else {
        setVieMsg({ type: "danger", text: data.message });
      }
    } catch (err) {
      setVieMsg({ type: "danger", text: "Network error." });
    }
    setSubmittingVie(false);
  };

  const selectCandidate = (posId, candidateId) => {
    setSelections(prev => {
      const cur = prev[posId] || [];
      // Currently assuming max 1 selection for all positions for simplicity, 
      // but you can add max selection logic based on position configuration if needed.
      if (cur.includes(candidateId)) return { ...prev, [posId]: cur.filter(x => x !== candidateId) };
      return { ...prev, [posId]: [candidateId] };
    });
  };

  const castVote = async () => {
    setSubmitting(true);
    const token = localStorage.getItem("voterToken");
    const candidateIds = Object.values(selections).flat();
    try {
      const res  = await fetch(`${API}/api/voter/cast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ candidateIds }),
      });
      const data = await res.json();
      if (res.ok) { 
        setStage(ballotPositions.length + 1); 
        localStorage.removeItem("voterToken"); 
      }
      else { setError(data.message); setStage(0); }
    } catch { setError("Server error. Please try again."); }
    setSubmitting(false);
  };

  if (loading) return (
    <div style={S.center}>
      <div style={{ ...S.spinner }} />
      <p style={{ color:"#6b7280", marginTop: 12 }}>Loading your data…</p>
    </div>
  );

  if (error) return (
    <div style={S.center}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
      <h2 style={{ color:"#dc2626" }}>Error</h2>
      <p style={{ color:"#6b7280", marginTop: 8, maxWidth: 340, textAlign:"center" }}>{error}</p>
      <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => navigate("/login")}>Return to Login</button>
    </div>
  );

  // ── Waiting Room ──
  const handleLogout = () => {
    localStorage.removeItem("voterToken");
    navigate("/login");
  };

  if (voterInfo && !voterInfo.isActive) return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.headerLogo}>🎓</div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, color:"#fff", margin: 0 }}>MMUST Elections</p>
            <p style={{ fontSize: 11, color:"rgba(255,255,255,.6)", margin: 0 }}>Student Electoral Commission</p>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap: 12 }}>
          <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
            <div style={{...S.liveDot, background:"#f59e0b", boxShadow:"0 0 0 3px rgba(245,158,11,.3)"}} />
            <span style={{ fontSize: 12, color:"rgba(255,255,255,.8)" }}>Election Pending</span>
          </div>
          <button onClick={handleLogout} style={{ background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.3)", color:"#fff", borderRadius: 6, padding:"6px 14px", cursor:"pointer", fontSize: 12 }}>🚪 Logout</button>
        </div>
      </div>
      
      <div style={S.card}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px", color: "#111827" }}>Waiting Room</h2>
          <p style={{ color: "#6b7280", margin: 0, fontSize: 14 }}>The election has not started yet. You will be able to cast your vote once the admin opens the ballot.</p>
        </div>

        <div style={{ background: "#f3f4f6", padding: 20, borderRadius: 8 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Verify Your Profile</h3>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Please ensure your residence zone is correct before the election begins. You will only see candidates for your specific zone.</p>
          
          {profileMsg && <div className={`alert alert-${profileMsg.type}`} style={{ marginBottom: 16 }}>{profileMsg.text}</div>}
          
          <form onSubmit={updateProfile} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">School</label>
              <input className="form-control" value={voterInfo.school_id} disabled style={{ background: "#e5e7eb" }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Residence Zone</label>
              <select className="form-control" value={newZone} onChange={e => setNewZone(e.target.value)}>
                {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <button type="submit" disabled={updatingProfile || newZone === voterInfo.residence_zone} className="btn btn-primary" style={{ marginTop: 8 }}>
              {updatingProfile ? "Updating..." : "Update Profile"}
            </button>
          </form>
        </div>

        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: 20, borderRadius: 8, marginTop: 24 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#1e40af" }}>Vie for a Position</h3>
          
          {vieStatus && vieStatus.applied ? (
            <div>
              <p style={{ fontSize: 13, color: "#1e40af", marginBottom: 12 }}>You have submitted an application to run for office.</p>
              <div style={{ display: "flex", gap: 16, alignItems: "center", background: "#fff", padding: 16, borderRadius: 8, border: "1px solid #93c5fd" }}>
                {vieStatus.candidate.photo_url ? (
                  <img src={`${API}${vieStatus.candidate.photo_url}`} alt="Candidate" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", color: "#1e40af", fontWeight: 700, fontSize: 18 }}>
                    {voterInfo.full_name ? voterInfo.full_name[0] : "?"}
                  </div>
                )}
                <div>
                  <p style={{ margin: 0, fontWeight: 600, color: "#1e3a8a" }}>{vieStatus.candidate.position_title}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#3b82f6", marginTop: 4 }}>
                    Status: <span style={{ fontWeight: 600 }}>{vieStatus.candidate.is_approved ? "Approved ✓" : "Pending Admin Approval ⏳"}</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: "#1e40af", marginBottom: 16 }}>Interested in becoming a candidate? Submit your application below.</p>
              {vieMsg && <div className={`alert alert-${vieMsg.type}`} style={{ marginBottom: 16 }}>{vieMsg.text}</div>}
              
              <form onSubmit={submitVie} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ color: "#1e40af" }}>Select Position</label>
                  <select className="form-control" value={vieForm.position_id} onChange={e => setVieForm({...vieForm, position_id: e.target.value})} required>
                    <option value="">-- Choose Position --</option>
                    {availablePositions.map(p => (
                      <option key={p.id} value={p.id}>{p.title} ({p.target_group}{p.target_value ? ` - ${p.target_value}` : ""})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ color: "#1e40af" }}>Candidate Photo (Optional)</label>
                  <input type="file" className="form-control" accept="image/jpeg, image/png, image/webp" onChange={e => setVieForm({...vieForm, photo: e.target.files[0]})} />
                  <p style={{ fontSize: 11, color: "#3b82f6", marginTop: 4, marginBottom: 0 }}>Max size: 5MB. Must be JPG, PNG, or WEBP.</p>
                </div>
                <button type="submit" disabled={submittingVie || !vieForm.position_id} className="btn btn-primary" style={{ marginTop: 8, background: "#1e40af", border: "none" }}>
                  {submittingVie ? "Submitting..." : "Submit Application"}
                </button>
              </form>
            </div>
          )}
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop: 24 }}>
          <button onClick={() => window.location.reload()} className="btn btn-ghost">↻ Refresh</button>
          <button onClick={handleLogout} style={{ background:"none", border:"1px solid #e5e7eb", color:"#6b7280", borderRadius: 6, padding:"6px 14px", cursor:"pointer", fontSize: 13 }}>🚪 Logout</button>
        </div>
      </div>
    </div>
  );

  // ── Success Room ──
  if (stage === ballotPositions.length + 1) return (
    <div style={S.center}>
      <div style={S.successCircle}>✓</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 20 }}>Ballot Cast Successfully!</h1>
      <p style={{ color:"#6b7280", marginTop: 8, maxWidth: 340, textAlign:"center" }}>
        Your vote has been securely recorded. Thank you for participating in the MMUST Student Elections.
      </p>
      <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => navigate("/login")}>Exit</button>
    </div>
  );

  // ── Ballot UI ──
  const isReview = stage === ballotPositions.length;
  const currentPos = !isReview ? ballotPositions[stage] : null;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.headerLogo}>🎓</div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, color:"#fff", margin: 0 }}>MMUST Elections</p>
            <p style={{ fontSize: 11, color:"rgba(255,255,255,.6)", margin: 0 }}>Student Electoral Commission</p>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap: 12 }}>
          <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
            <div style={S.liveDot} />
            <span style={{ fontSize: 12, color:"rgba(255,255,255,.8)" }}>Election Active</span>
          </div>
          <button onClick={handleLogout} style={{ background:"rgba(255,255,255,.15)", border:"1px solid rgba(255,255,255,.3)", color:"#fff", borderRadius: 6, padding:"6px 14px", cursor:"pointer", fontSize: 12 }}>🚪 Logout</button>
        </div>
      </div>

      <div style={S.progressWrap}>
        {[...ballotPositions.map(p => p.title), "Review"].map((label, i) => {
          const done  = stage > i;
          const active = stage === i;
          return (
            <React.Fragment key={i}>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap: 4 }}>
                <div style={{ ...S.stepNum, background: done ? "#16a34a" : active ? "#1a56a4" : "#e5e7eb", color: (done||active) ? "#fff" : "#9ca3af" }}>
                  {done ? "✓" : (i + 1)}
                </div>
                <span style={{ fontSize: 10, color: active ? "#1a56a4" : done ? "#16a34a" : "#9ca3af", fontWeight: active ? 600 : 400, textAlign: "center", width: 60 }}>{label}</span>
              </div>
              {i < ballotPositions.length && <div style={{ flex:1, height: 2, background: done ? "#16a34a" : "#e5e7eb", marginBottom: 20, marginTop:-10 }} />}
            </React.Fragment>
          );
        })}
      </div>

      <div style={S.card}>
        {/* Dynamic Position Stages */}
        {!isReview && currentPos && (
          <div>
            <div style={S.stageHeader}>
              <h2 style={{ margin: 0 }}>{currentPos.title}</h2>
              <p style={{ margin:"4px 0 0", fontSize: 13, color:"#6b7280" }}>Select 1 candidate for this position.</p>
            </div>
            <div className="divider" />
            
            <div style={{ display:"flex", flexDirection:"column", gap: 8 }}>
              {currentPos.candidates.length === 0 ? (
                <EmptySlot msg="No candidates registered for this position." />
              ) : (
                currentPos.candidates.map(c => (
                  <CandidateCard key={c.id} candidate={c}
                    selected={(selections[currentPos.id] || []).includes(c.id)}
                    onSelect={() => selectCandidate(currentPos.id, c.id)} type="radio" />
                ))
              )}
            </div>

            <div style={S.navRow}>
              {stage > 0 ? (
                <button className="btn btn-ghost" onClick={() => setStage(s => s - 1)}>← Back</button>
              ) : <div />}
              <button className="btn btn-primary" onClick={() => setStage(s => s + 1)}>
                {stage === ballotPositions.length - 1 ? "Review Ballot →" : "Next Position →"}
              </button>
            </div>
          </div>
        )}

        {/* Review Stage */}
        {isReview && (
          <div>
            <div style={S.stageHeader}>
              <h2 style={{ margin: 0 }}>Review Your Selections</h2>
              <p style={{ margin:"4px 0 0", fontSize: 13, color:"#6b7280" }}>Please confirm your choices. Once submitted, your ballot cannot be changed.</p>
            </div>
            <div className="divider" />

            {Object.values(selections).flat().length === 0
              ? <EmptySlot msg="You haven't selected any candidates." />
              : (
                <div style={{ display:"flex", flexDirection:"column", gap: 10 }}>
                  {ballotPositions.map(pos => {
                    const selIds = selections[pos.id] || [];
                    if (selIds.length === 0) return null;
                    return selIds.map(id => {
                      const cand = pos.candidates.find(c => c.id === id);
                      if (!cand) return null;
                      return (
                        <div key={id} style={S.reviewRow}>
                          <div style={S.reviewAvatar}>{cand.full_name[0]}</div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 600, margin: 0, fontSize: 14 }}>{cand.full_name}</p>
                            <p style={{ fontSize: 12, color:"#6b7280", margin: 0 }}>{pos.title} · {cand.gender}</p>
                          </div>
                          <span className="badge badge-success">Selected</span>
                        </div>
                      );
                    })
                  })}
                </div>
              )
            }

            <div style={{ background:"#fef9c3", border:"1px solid #fde68a", borderRadius: 8, padding:"12px 14px", marginTop: 20, fontSize: 13, color:"#92400e" }}>
              ⚠ Your vote is anonymous and permanent. Please review carefully before confirming.
            </div>

            <div style={S.navRow}>
              <button className="btn btn-ghost" onClick={() => setStage(s => s - 1)}>← Back</button>
              <button className="btn btn-success" disabled={submitting} onClick={castVote} style={{ minWidth: 180 }}>
                {submitting ? <><span className="spinner" /> Casting Ballot…</> : "✓ Confirm & Cast Ballot"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────── */
function CandidateCard({ candidate, selected, onSelect, type }) {
  return (
    <label style={{ ...S.candCard, ...(selected ? S.candCardSelected : {}), cursor:"pointer" }}>
      <input type={type} checked={selected} onChange={onSelect} style={{ display:"none" }} />
      <div style={{ ...S.candAvatar, background: selected ? "#1a56a4" : "#e8f0fb", color: selected ? "#fff" : "#1a56a4" }}>
        {candidate.full_name[0]}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 600, margin: 0, fontSize: 14, color:"#111827" }}>{candidate.full_name}</p>
        <p style={{ fontSize: 12, color:"#6b7280", margin: 0 }}>{candidate.gender}</p>
      </div>
      <div style={{ ...S.checkCircle, background: selected ? "#1a56a4" : "transparent", border: selected ? "none" : "2px solid #d1d5db" }}>
        {selected && <span style={{ color:"#fff", fontSize: 13, lineHeight:1 }}>✓</span>}
      </div>
    </label>
  );
}

function EmptySlot({ msg }) {
  return (
    <div style={{ padding:"28px 0", textAlign:"center", color:"#9ca3af", fontSize: 13 }}>
      <span style={{ fontSize: 28, display:"block", marginBottom: 6 }}>📭</span>
      {msg}
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────── */
const S = {
  page:   { minHeight:"100vh", background:"#f0f2f5", fontFamily:"'Inter',sans-serif", paddingBottom: 40 },
  center: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh" },
  spinner:{ width: 36, height: 36, border:"3px solid #e5e7eb", borderTopColor:"#1a56a4", borderRadius:"50%", animation:"spin .6s linear infinite" },
  header: { background:"linear-gradient(135deg,#1a56a4,#0f3470)", padding:"16px 32px", display:"flex", alignItems:"center", justifyContent:"space-between" },
  headerLeft: { display:"flex", alignItems:"center", gap: 12 },
  headerLogo: { width: 38, height: 38, background:"rgba(255,255,255,.15)", borderRadius: 8, display:"flex", alignItems:"center", justifyContent:"center", fontSize: 20 },
  liveDot: { width: 8, height: 8, background:"#4ade80", borderRadius:"50%", boxShadow:"0 0 0 3px rgba(74,222,128,.3)" },
  progressWrap: { display:"flex", alignItems:"flex-start", maxWidth: 700, margin:"24px auto 0", padding:"0 24px" },
  stepNum: { width: 24, height: 24, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize: 11, fontWeight: 700, transition:"all .2s" },
  card:   { maxWidth: 600, margin:"20px auto 0", background:"#fff", border:"1px solid #dde1e9", borderRadius: 14, padding:"28px 32px", boxShadow:"0 4px 16px rgba(0,0,0,.07)" },
  stageHeader: { marginBottom: 4 },
  navRow: { display:"flex", justifyContent:"space-between", alignItems:"center", marginTop: 28, paddingTop: 20, borderTop:"1px solid #e5e7eb" },
  candCard: { display:"flex", alignItems:"center", gap: 14, padding:"13px 16px", border:"1px solid #e5e7eb", borderRadius: 10, transition:"all .15s", background:"#fff" },
  candCardSelected: { border:"1px solid #1a56a4", background:"#f0f5ff" },
  candAvatar: { width: 40, height: 40, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontWeight: 700, fontSize: 16, flexShrink: 0 },
  checkCircle: { width: 22, height: 22, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", flexShrink: 0, transition:"all .15s" },
  reviewRow: { display:"flex", alignItems:"center", gap: 14, padding:"12px 14px", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius: 10 },
  reviewAvatar: { width: 36, height: 36, borderRadius:"50%", background:"#1a56a4", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight: 700, fontSize: 15, flexShrink: 0 },
  successCircle: { width: 72, height: 72, borderRadius:"50%", background:"#dcfce7", color:"#16a34a", fontSize: 32, display:"flex", alignItems:"center", justifyContent:"center" },
};
