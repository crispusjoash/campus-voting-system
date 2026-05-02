import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from "recharts";
import API_URL from "../config";

const API = API_URL;
const ZONES = ["Non Residence", "Hall 1", "Hall 2", "Hall 3", "Hall 4 Male", "Hall 4 Female"];

const NAV = [
  { id: "ballot",      icon: "🗳️", label: "My Ballot" },
  { id: "profile",     icon: "🪪", label: "My Profile" },
  { id: "application", icon: "📋", label: "Application" },
  { id: "results",     icon: "📊", label: "Results" },
];

export default function VoterDashboard() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [tab, setTab] = useState("ballot");
  const [voterInfo, setVoterInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [electionStatus, setElectionStatus] = useState("Pending");

  // Ballot state
  const [ballotPositions, setBallotPositions] = useState([]);
  const [selections, setSelections] = useState({});
  const [stage, setStage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [voteSuccess, setVoteSuccess] = useState(false);

  // Profile state
  const [newZone, setNewZone] = useState("");
  const [profileMsg, setProfileMsg] = useState(null);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Application state
  const [vieStatus, setVieStatus] = useState(null);
  const [availablePositions, setAvailablePositions] = useState([]);
  const [vieForm, setVieForm] = useState({ position_id: "", photo: null });
  const [vieMsg, setVieMsg] = useState(null);
  const [submittingVie, setSubmittingVie] = useState(false);

  // Results state
  const [tally, setTally] = useState([]);
  const [filterCat, setFilterCat] = useState("ALL");

  const token = () => localStorage.getItem("voterToken");

  const apiFetch = async (url, opts = {}) => {
    const { headers: h, ...rest } = opts;
    const res = await fetch(API + url, { ...rest, headers: { Authorization: `Bearer ${token()}`, ...h } });
    const data = await res.json();
    return { ok: res.ok, data };
  };

  const handleLogout = () => { localStorage.removeItem("voterToken"); navigate("/login"); };

  useEffect(() => {
    if (!token()) return navigate("/login");
    try {
      const payload = JSON.parse(atob(token().split(".")[1]));
      setVoterInfo(payload);
      setNewZone(payload.residence_zone || "");
      loadAll(payload);
    } catch { navigate("/login"); }
  }, []);

  const loadAll = async (payload) => {
    setLoading(true);
    try {
      const [vs, pos, tRes] = await Promise.all([
        apiFetch("/api/voter/vie-status"),
        apiFetch("/api/voter/positions"),
        apiFetch("/api/tally"),
      ]);
      if (vs.ok) {
        setVieStatus(vs.data);
        setElectionStatus(vs.data.election_status);
        if (payload.has_voted && vs.data.election_status !== "Pending") {
          setVoteSuccess(true);
        }
      }
      if (pos.ok && Array.isArray(pos.data)) setAvailablePositions(pos.data);
      if (tRes.ok) setTally(tRes.data);

      if (payload?.isActive) {
        const { ok, data } = await apiFetch("/api/voter/ballot");
        if (ok) setBallotPositions(data.ballot || []);
        else {
          // If 403 because already voted, just show success screen or results
          if (data.message.includes("already")) setVoteSuccess(true);
          else if (data.message.includes("not active")) {
            setVoterInfo(prev => ({...prev, isActive: false}));
          }
          else setError(data.message);
        }
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const updateProfile = async (e) => {
    e.preventDefault(); setUpdatingProfile(true); setProfileMsg(null);
    const { ok, data } = await apiFetch("/api/voter/profile", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ residence_zone: newZone }),
    });
    if (ok) {
      localStorage.setItem("voterToken", data.token);
      const p = JSON.parse(atob(data.token.split(".")[1]));
      setVoterInfo(p);
      setProfileMsg({ type: "success", text: "Profile updated successfully." });
    } else { setProfileMsg({ type: "danger", text: data.message }); }
    setUpdatingProfile(false);
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    const fd = new FormData();
    fd.append("photo", file);
    const { ok, data } = await apiFetch("/api/voter/photo", { method: "POST", body: fd });
    if (ok) {
      localStorage.setItem("voterToken", data.token);
      const p = JSON.parse(atob(data.token.split(".")[1]));
      setVoterInfo(p);
      setProfileMsg({ type: "success", text: "Photo updated successfully." });
    } else { setProfileMsg({ type: "danger", text: data.message }); }
    setUploadingPhoto(false);
  };

  const submitVie = async (e) => {
    e.preventDefault(); setSubmittingVie(true); setVieMsg(null);
    const fd = new FormData();
    fd.append("position_id", vieForm.position_id);
    if (vieForm.photo) fd.append("photo", vieForm.photo);
    const { ok, data } = await apiFetch("/api/voter/vie", { method: "POST", body: fd });
    if (ok) { setVieMsg({ type: "success", text: data.message }); setVieStatus({ applied: true, candidate: data.candidate }); }
    else setVieMsg({ type: "danger", text: data.message });
    setSubmittingVie(false);
  };

  const selectCandidate = (posId, cId) => {
    setSelections(p => ({ ...p, [posId]: [cId] }));
  };

  const abstain = () => {
    const posId = ballotPositions[stage].id;
    setSelections(p => ({ ...p, [posId]: [] })); // Empty selection = abstain
    setStage(s => s + 1);
  };

  const castVote = async () => {
    setSubmitting(true);
    const { ok, data } = await apiFetch("/api/voter/cast", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateIds: Object.values(selections).flat() }),
    });
    if (ok) { setVoteSuccess(true); }
    else setError(data.message);
    setSubmitting(false);
  };

  const initials = voterInfo?.full_name
    ? voterInfo.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  const filteredTally = tally.filter(p => {
    if (filterCat === "ALL") return true;
    return p.target_group === filterCat;
  });

  if (loading) return (
    <div style={S.center}><div className="spinner spinner-dark" style={{ width: 36, height: 36 }} /><p style={{ marginTop: 12 }}>Loading Student Dashboard…</p></div>
  );

  return (
    <div className="app-shell" style={S.shell}>
      {/* ── Sidebar ── */}
      <aside className="app-sidebar" style={S.sidebar}>
        <div>
          <div style={S.sideTop}>
            <div style={S.avatar}>
              {voterInfo?.profile_photo_url 
                ? <img src={`${API}${voterInfo.profile_photo_url}`} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                : initials}
            </div>
            <div style={{ overflow: "hidden" }}>
              <p style={S.name}>{voterInfo?.full_name || "Student"}</p>
              <p style={S.sub}>{voterInfo?.school_id || "MMUST"}</p>
            </div>
          </div>
          <div style={S.statusPill}>
            <div style={{ ...S.dot, background: voterInfo?.isActive ? "#4ade80" : "#f59e0b" }} />
            {voterInfo?.isActive ? "Election Live" : "Portal Active"}
          </div>
          <nav style={{ marginTop: 8 }}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => setTab(n.id)} style={{ ...S.navBtn, ...(tab === n.id ? S.navActive : {}) }}>
                <span style={{ fontSize: 18 }}>{n.icon}</span>
                <span>{n.label}</span>
                {tab === n.id && <div className="nav-bar-indicator" style={S.navBar} />}
              </button>
            ))}
          </nav>
        </div>
        <button onClick={handleLogout} style={S.logout}>🚪 Sign Out</button>
      </aside>

      {/* ── Main ── */}
      <main className="app-main" style={S.main}>
        {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>{error}</div>}

        {/* ─ BALLOT ─ */}
        {tab === "ballot" && (
          voteSuccess ? (
            <div style={S.center}>
              <div style={S.successCircle}>✓</div>
              <h1 style={{ marginTop: 20 }}>Ballot Submitted</h1>
              <p style={{ marginTop: 8, maxWidth: 360, textAlign: "center", color: "#6b7280" }}>Your voice has been recorded securely. Thank you for participating in the electoral process.</p>
              <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => setTab("results")}>View Live Results</button>
            </div>
          ) : electionStatus === "Pending" ? (
            <div>
              <h2 style={{ marginBottom: 4 }}>My Ballot</h2>
              <p style={{ marginBottom: 24 }}>Official voting has not commenced yet.</p>
              <div className="card" style={S.glassCard}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
                <h3>Waiting for Election Launch</h3>
                <p style={{ marginTop: 8, color: "#6b7280" }}>The electoral commission will open the ballot soon. Please ensure your profile is up to date in the <strong>My Profile</strong> section.</p>
              </div>
            </div>
          ) : !voterInfo?.isActive ? (
            <div>
              <h2 style={{ marginBottom: 4 }}>My Ballot</h2>
              <p style={{ marginBottom: 24 }}>The election has concluded.</p>
              <div className="card" style={S.glassCard}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🛑</div>
                <h3>Voting Closed</h3>
                <p style={{ marginTop: 8, color: "#6b7280" }}>Voting is no longer available. You can view the final outcomes in the <strong>Results</strong> tab.</p>
                <button className="btn btn-ghost" style={{ marginTop: 20 }} onClick={() => setTab("results")}>View Results →</button>
              </div>
            </div>
          ) : ballotPositions.length === 0 ? (
            <div className="card" style={S.glassCard}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
              <h3>No Eligible Positions</h3>
              <p style={{ color: "#6b7280" }}>We couldn't find any positions for your specific school or residential zone.</p>
            </div>
          ) : stage === ballotPositions.length ? (
            // Review Stage
            <div style={{ maxWidth: 600 }}>
              <h2 style={{ marginBottom: 4 }}>Review Ballot</h2>
              <p style={{ marginBottom: 24 }}>Double-check your selections before final submission.</p>
              <div className="card" style={{ padding: 28 }}>
                {ballotPositions.map(pos => {
                  const selIds = selections[pos.id] || [];
                  const c = pos.candidates.find(x => selIds.includes(x.id));
                  return (
                    <div key={pos.id} style={S.reviewRow}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#6b7280", margin: "0 0 4px" }}>{pos.title}</p>
                        {c ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <p style={{ fontWeight: 600, margin: 0 }}>{c.full_name}</p>
                            <span className="badge badge-success">Selected</span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <p style={{ fontWeight: 600, margin: 0, color: "#9ca3af" }}>Abstained</p>
                            <span className="badge badge-gray">No Vote</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div style={S.warningBox}>
                  🔒 Once cast, your vote is anonymized and cannot be retrieved or modified.
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
                  <button className="btn btn-ghost" onClick={() => setStage(s => s - 1)}>Back</button>
                  <button className="btn btn-primary" disabled={submitting} onClick={castVote} style={{ minWidth: 200, height: 48 }}>
                    {submitting ? "Processing..." : "Cast Final Ballot"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Voting Step
            <div style={{ maxWidth: 700 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
                <div>
                  <span className="badge badge-info" style={{ marginBottom: 8 }}>Step {stage + 1} of {ballotPositions.length}</span>
                  <h2 style={{ margin: 0, fontSize: 24 }}>{ballotPositions[stage].title}</h2>
                </div>
                <p style={{ fontSize: 13, color: "#6b7280" }}>Select one candidate or abstain.</p>
              </div>
              
              <div style={S.progressContainer}>
                {ballotPositions.map((_, i) => (
                  <div key={i} style={{ ...S.progressBar, background: i < stage ? "#16a34a" : i === stage ? "#1a56a4" : "#e5e7eb" }} />
                ))}
              </div>

              <div className="candidate-grid-container" style={S.candidateGrid}>
                {ballotPositions[stage].candidates.map(c => {
                  const isSel = (selections[ballotPositions[stage].id] || []).includes(c.id);
                  return (
                    <div key={c.id} onClick={() => selectCandidate(ballotPositions[stage].id, c.id)} style={{ ...S.modernCandCard, ...(isSel ? S.modernCandSel : {}) }}>
                      <div style={S.modernCandTop}>
                        {c.photo_url ? <img src={`${API}${c.photo_url}`} style={S.modernCandImg} /> : <div style={S.modernCandPlaceholder}>{c.full_name[0]}</div>}
                        {isSel && <div style={S.selOverlay}>✓ Selected</div>}
                      </div>
                      <div style={{ padding: 16, textAlign: "center" }}>
                        <p style={{ fontWeight: 700, margin: 0, fontSize: 15 }}>{c.full_name}</p>
                        <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0" }}>{c.gender}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, alignItems: "center" }}>
                {stage > 0 ? <button className="btn btn-ghost" onClick={() => setStage(s => s - 1)}>Previous</button> : <div />}
                <div style={{ display: "flex", gap: 12 }}>
                  <button className="btn btn-ghost" onClick={abstain}>Abstain from this position</button>
                  <button className="btn btn-primary" style={{ padding: "0 32px", height: 44 }} disabled={!(selections[ballotPositions[stage].id]?.length > 0)} onClick={() => setStage(s => s + 1)}>
                    Next Position →
                  </button>
                </div>
              </div>
            </div>
          )
        )}

        {/* ─ PROFILE (Digital ID Card Style) ─ */}
        {tab === "profile" && (
          <div style={{ maxWidth: 800 }}>
            <h2 style={{ marginBottom: 4 }}>Student Identity</h2>
            <p style={{ marginBottom: 32, color: "#6b7280" }}>Official digital voter identification card.</p>
            
            <div className="responsive-grid-2" style={{ alignItems: "start" }}>
              {/* ID Card */}
              <div className="id-card-container" style={S.idCard}>
                <div style={S.idHeader}>
                  <div style={S.idLogo}>
                    <span style={{ fontSize: 18 }}>🛡️</span>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", lineHeight: 1 }}>MMUST</span>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.7)" }}>ELECTIONS 2026</span>
                    </div>
                  </div>
                  <div style={S.idChip} />
                </div>
                
                <div style={S.idBody}>
                  <div style={S.idPhotoContainer}>
                    {voterInfo?.profile_photo_url ? (
                      <img src={`${API}${voterInfo.profile_photo_url}`} style={S.idPhoto} alt="Profile" />
                    ) : (
                      <div style={S.idPhotoPlaceholder}>{initials}</div>
                    )}
                    <button style={S.changePhotoBtn} onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}>
                      {uploadingPhoto ? "..." : "📸"}
                    </button>
                  </div>
                  
                  <div style={S.idDetails}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={S.idLabel}>STUDENT NAME</label>
                      <p style={S.idValue}>{voterInfo?.full_name}</p>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={S.idLabel}>REGISTRATION NO.</label>
                        <p style={S.idValueSmall}>{voterInfo?.registration_number}</p>
                      </div>
                      <div>
                        <label style={S.idLabel}>GENDER</label>
                        <p style={S.idValueSmall}>{voterInfo?.gender}</p>
                      </div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <label style={S.idLabel}>SCHOOL / FACULTY</label>
                      <p style={S.idValueSmall}>{voterInfo?.school_id}</p>
                    </div>
                  </div>
                </div>
                
                <div style={S.idFooter}>
                  <div style={S.idBarcode} />
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>VOTER SECURE TOKEN: {voterInfo?.student_id?.toString().padStart(6, '0')}</span>
                </div>
                <input type="file" ref={fileInputRef} style={{ display: "none" }} accept="image/*" onChange={handlePhotoUpload} />
              </div>

              {/* Edit Details */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {profileMsg && <div className={`alert alert-${profileMsg.type}`}>{profileMsg.text}</div>}
                <div className="card" style={{ padding: 24 }}>
                  <h3 style={{ fontSize: 15, marginBottom: 16 }}>Update Residence</h3>
                  <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>Your residence zone determines your eligibility for hall-based positions.</p>
                  <form onSubmit={updateProfile}>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                      <label className="form-label">Residential Zone</label>
                      <select className="form-control" value={newZone} onChange={e => setNewZone(e.target.value)} disabled={voterInfo?.isActive}>
                        {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                      </select>
                    </div>
                    <button type="submit" className="btn btn-primary btn-full" disabled={updatingProfile || voterInfo?.isActive || newZone === voterInfo?.residence_zone}>
                      {updatingProfile ? "Saving..." : "Save Residence Update"}
                    </button>
                    {voterInfo?.isActive && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 8, textAlign: "center" }}>⚠️ Locked while election is live.</p>}
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─ RESULTS ─ */}
        {tab === "results" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>Election Analytics</h2>
                <p style={{ margin: 0, color: "#6b7280" }}>Real-time results and voting statistics.</p>
              </div>
              <div style={S.filterGroup}>
                {["ALL", "SCHOOL", "RESIDENTIAL"].map(cat => (
                  <button key={cat} onClick={() => setFilterCat(cat)} style={{ ...S.filterBtn, ...(filterCat === cat ? S.filterActive : {}) }}>
                    {cat === "ALL" ? "Campus" : cat === "SCHOOL" ? "School" : "Residential"}
                  </button>
                ))}
              </div>
            </div>

            {filteredTally.length === 0 ? (
              <div style={S.center}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
                <h3>No Data Available</h3>
                <p style={{ color: "#6b7280" }}>Results will appear here as soon as they are processed.</p>
              </div>
            ) : (
              <div className="responsive-grid-2">
                {filteredTally.map(pos => (
                  <div key={pos.id} className="card" style={{ padding: 24 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                      <h3 style={{ margin: 0, fontSize: 15 }}>{pos.title}</h3>
                      <span className="badge badge-info">{pos.candidates?.length || 0} candidates</span>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={pos.candidates} layout="vertical" margin={{ left: 20, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="full_name" type="category" width={100} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                        <Bar dataKey="vote_count" radius={[0, 4, 4, 0]} barSize={20}>
                          {pos.candidates.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? "#1e40af" : "#64748b"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─ APPLICATION ─ */}
        {tab === "application" && (
          <div style={{ maxWidth: 600 }}>
            <h2 style={{ marginBottom: 4 }}>Candidacy Application</h2>
            <p style={{ marginBottom: 32, color: "#6b7280" }}>Submit your intention to vie for a position.</p>
            {/* Same application logic as before but with consistent styling */}
            {vieStatus?.applied ? (
              <div className="card" style={{ padding: 28 }}>
                <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 24 }}>
                  {vieStatus.candidate.photo_url
                    ? <img src={`${API}${vieStatus.candidate.photo_url}`} style={{ width: 80, height: 80, borderRadius: 12, objectFit: "cover" }} />
                    : <div style={{ ...S.avatar, width: 80, height: 80, borderRadius: 12 }}>{initials}</div>
                  }
                  <div>
                    <h3 style={{ margin: 0 }}>{voterInfo?.full_name}</h3>
                    <p style={{ color: "#6b7280", margin: "4px 0" }}>Candidate for <strong>{vieStatus.candidate.position_title}</strong></p>
                    <span className={`badge ${vieStatus.candidate.is_approved ? "badge-success" : "badge-warning"}`}>
                      {vieStatus.candidate.is_approved ? "✓ Approved" : "⏳ Pending Approval"}
                    </span>
                  </div>
                </div>
              </div>
            ) : !voterInfo?.isActive ? (
              <div className="card" style={{ padding: 28 }}>
                <h3>Submit Intent</h3>
                {vieMsg && <div className={`alert alert-${vieMsg.type}`} style={{ marginTop: 16 }}>{vieMsg.text}</div>}
                <form onSubmit={submitVie} style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 20 }}>
                  <div className="form-group">
                    <label className="form-label">Target Position</label>
                    <select className="form-control" value={vieForm.position_id} onChange={e => setVieForm({ ...vieForm, position_id: e.target.value })} required>
                      <option value="">-- Choose Position --</option>
                      {availablePositions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Candidate Portrait</label>
                    <input type="file" className="form-control" onChange={e => setVieForm({ ...vieForm, photo: e.target.files[0] })} />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={submittingVie}>
                    {submittingVie ? "Submitting..." : "Submit Candidacy Request"}
                  </button>
                </form>
              </div>
            ) : (
              <div className="card" style={S.glassCard}>
                <h3>Applications Closed</h3>
                <p style={{ color: "#6b7280" }}>The election is currently live. Applications are no longer being accepted.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const S = {
  shell: { display: "flex", height: "100vh", overflow: "hidden", background: "#f8fafc" },
  sidebar: { width: 220, background: "#1e293b", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "24px 0", borderRight: "1px solid #e2e8f0" },
  sideTop: { display: "flex", alignItems: "center", gap: 12, padding: "0 20px 24px", borderBottom: "1px solid rgba(255,255,255,0.1)" },
  avatar: { width: 42, height: 42, borderRadius: "50%", background: "#334155", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 16, overflow: "hidden" },
  name: { fontSize: 14, fontWeight: 700, color: "#fff", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  sub: { fontSize: 11, color: "#94a3b8", margin: 0 },
  statusPill: { display: "flex", alignItems: "center", gap: 8, margin: "20px 20px 8px", padding: "6px 12px", background: "rgba(255,255,255,0.05)", borderRadius: 50, fontSize: 11, color: "#cbd5e1" },
  dot: { width: 6, height: 6, borderRadius: "50%" },
  navBtn: { display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 20px", background: "none", border: "none", color: "#94a3b8", fontSize: 16, fontWeight: 500, cursor: "pointer", textAlign: "left", position: "relative", transition: "0.2s" },
  navActive: { color: "#fff", background: "rgba(255,255,255,0.08)" },
  navBar: { position: "absolute", left: 0, top: "20%", bottom: "20%", width: 3, background: "#3b82f6", borderRadius: "0 4px 4px 0" },
  logout: { margin: "0 20px", padding: "10px 16px", background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8, fontSize: 13, cursor: "pointer", transition: "0.2s" },
  main: { flex: 1, padding: "40px", overflowY: "auto" },
  glassCard: { padding: "48px", textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" },
  progressContainer: { display: "flex", gap: 8, marginBottom: 32 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, transition: "0.3s" },
  candidateGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 20 },
  modernCandCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "0.2s" },
  modernCandSel: { borderColor: "#2563eb", boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.1)" },
  modernCandTop: { height: 180, background: "#f1f5f9", position: "relative" },
  modernCandImg: { width: "100%", height: "100%", objectFit: "cover" },
  modernCandPlaceholder: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, fontWeight: 800, color: "#cbd5e1" },
  selOverlay: { position: "absolute", inset: 0, background: "rgba(37, 99, 235, 0.7)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 },
  reviewRow: { padding: "16px 0", borderBottom: "1px solid #f1f5f9" },
  warningBox: { marginTop: 24, padding: 16, background: "#fff7ed", border: "1px solid #ffedd5", borderRadius: 12, fontSize: 12, color: "#9a3412", textAlign: "center" },
  idCard: { width: 380, height: 240, background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)", borderRadius: 20, padding: 24, position: "relative", overflow: "hidden", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)", display: "flex", flexDirection: "column", justifyContent: "space-between" },
  idHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  idLogo: { display: "flex", alignItems: "center", gap: 8 },
  idChip: { width: 36, height: 28, background: "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)", borderRadius: 6 },
  idBody: { display: "flex", gap: 20, alignItems: "center" },
  idPhotoContainer: { position: "relative", width: 90, height: 110, background: "#fff", borderRadius: 8, padding: 4, flexShrink: 0 },
  idPhoto: { width: "100%", height: "100%", objectFit: "cover", borderRadius: 4 },
  idPhotoPlaceholder: { width: "100%", height: "100%", background: "#f1f5f9", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#cbd5e1" },
  changePhotoBtn: { position: "absolute", bottom: -8, right: -8, width: 28, height: 28, borderRadius: "50%", background: "#fff", border: "1px solid #e2e8f0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, boxShadow: "0 2px 4px rgba(0,0,0,0.1)" },
  idDetails: { flex: 1 },
  idLabel: { fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 1, margin: 0 },
  idValue: { fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 },
  idValueSmall: { fontSize: 11, fontWeight: 600, color: "#fff", margin: 0 },
  idFooter: { display: "flex", justifyContent: "space-between", alignItems: "flex-end" },
  idBarcode: { width: 100, height: 20, background: "linear-gradient(90deg, #fff 1%, #fff 5%, transparent 5%, transparent 10%, #fff 10%, #fff 15%, transparent 15%, transparent 18%, #fff 18%, #fff 25%)", backgroundSize: "12px 100%" },
  filterGroup: { display: "flex", background: "#fff", padding: 4, borderRadius: 10, border: "1px solid #e2e8f0" },
  filterBtn: { padding: "8px 16px", border: "none", background: "none", fontSize: 13, fontWeight: 600, color: "#64748b", cursor: "pointer", borderRadius: 8, transition: "0.2s" },
  filterActive: { background: "#1e293b", color: "#fff" },
  center: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh" },
  successCircle: { width: 80, height: 80, borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 },
};
