import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import API_URL from "../config";
import CandidateForm from "./CandidateForm";
import ManualVoterForm from "./ManualVoterForm";

const SCHOOLS = ["SCI", "SONMAPS", "SOM", "SEBE", "SAVET", "SONAS", "SOBE", "SEDU", "SASS", "SDMHA", "SPHBST"];
const ZONES = ["Non Residence","Hall 1","Hall 2","Hall 3","Hall 4 Male","Hall 4 Female"];

const NAV = [
  { id:"tally",      label:"Live Tally",     icon:"📊" },
  { id:"approvals",  label:"Approvals",      icon:"✅" },
  { id:"voters",     label:"Voters List",    icon:"👥" },
  { id:"upload",     label:"CSV Upload",      icon:"📁" },
  { id:"manual",     label:"Add Voter",       icon:"👤" },
  { id:"candidates", label:"Candidates",      icon:"🗳️" },
  { id:"config",     label:"Election Config", icon:"⚙️" },
  { id:"logs",       label:"Audit Logs",      icon:"📜" },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [tab, setTab]         = useState("tally");
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState(null);
  const [status, setStatus]   = useState("Pending");
  const [electionStart, setElectionStart] = useState("");
  const [electionEnd, setElectionEnd] = useState("");
  const [tally, setTally]     = useState([]);
  const [voters, setVoters]   = useState([]);
  const [candidatesList, setCandidatesList] = useState([]);
  const [logs, setLogs]       = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingVoter, setEditingVoter] = useState(null);
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState([]);

  // Voter list filters & sorting
  const [filterSchool, setFilterSchool] = useState("");
  const [filterZone,   setFilterZone]   = useState("");
  const [filterGender, setFilterGender] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortCol, setSortCol] = useState("full_name");
  const [sortDir, setSortDir] = useState("asc");

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };
  const SortIcon = ({ col }) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : " ⇅";

  const token = () => localStorage.getItem("adminToken");

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4500);
  };

  const apiFetch = async (url, opts = {}) => {
    const { headers: extraHeaders, ...restOpts } = opts;
    const res = await fetch(API_URL + url, {
      ...restOpts,
      headers: {
        Authorization: `Bearer ${token()}`,
        ...extraHeaders,
      },
    });
    const data = await res.json();
    return { ok: res.ok, data };
  };

  const fetchAll = async () => {
    try {
      const [s, t, v, c, l] = await Promise.all([
        apiFetch("/api/admin/election-status"),
        apiFetch("/api/tally"),
        apiFetch("/api/admin/voters"),
        apiFetch("/api/admin/candidates"),
        apiFetch("/api/admin/audit-logs"),
      ]);
      if (s.ok) {
        setStatus(s.data.status);
        if (s.data.election_start) setElectionStart(new Date(s.data.election_start).toISOString().slice(0,16));
        if (s.data.election_end) setElectionEnd(new Date(s.data.election_end).toISOString().slice(0,16));
      }
      if (t.ok) setTally(t.data);
      if (v.ok) setVoters(v.data);
      if (c.ok) setCandidatesList(c.data);
      if (l.ok) setLogs(l.data);
    } catch {}
  };

  useEffect(() => {
    if (!token()) return navigate("/login");
    fetchAll();
    const socket = io(API_URL);
    socket.on("TALLY_UPDATED", fetchAll);
    return () => socket.disconnect();
  }, [navigate]);

  const changeStatus = async (s) => {
    const { ok, data } = await apiFetch("/api/admin/election-status", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ status: s }),
    });
    if (ok) { setStatus(s); showToast("success", data.message); }
    else showToast("danger", data.message);
  };

  const saveSchedule = async () => {
    if (!electionStart || !electionEnd) return showToast("danger", "Please select both start and end times.");
    const { ok, data } = await apiFetch("/api/admin/election-status", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ election_start: new Date(electionStart).toISOString(), election_end: new Date(electionEnd).toISOString() }),
    });
    if (ok) { showToast("success", "Schedule saved!"); }
    else showToast("danger", data.message);
  };

  const exportResultsPDF = () => {
    const doc = new jsPDF();
    doc.text("MMUST Student Elections - Official Results", 14, 15);
    
    let y = 25;
    tally.forEach(pos => {
      if (pos.candidates && pos.candidates.length > 0) {
        doc.setFontSize(12);
        doc.text(pos.title, 14, y);
        autoTable(doc, {
          startY: y + 5,
          head: [['Candidate', 'Votes']],
          body: pos.candidates.map(c => [c.full_name, c.vote_count]),
        });
        y = doc.lastAutoTable.finalY + 15;
      }
    });
    doc.save("election_results.pdf");
  };

  const exportVotersPDF = () => {
    const doc = new jsPDF();
    doc.text("MMUST Registered Voters", 14, 15);
    autoTable(doc, {
      startY: 20,
      head: [['Reg No.', 'Name', 'School', 'Zone', 'Voted']],
      body: voters.map(v => [v.registration_number, v.full_name, v.school_id, v.residence_zone, v.has_voted ? "Yes" : "No"]),
    });
    doc.save("voters_list.pdf");
  };

  const handleDeleteVoter = async (id) => {
    if (!window.confirm("Are you sure you want to delete this voter?")) return;
    const { ok, data } = await apiFetch("/api/admin/voters/" + id, { method: "DELETE" });
    if (ok) { showToast("success", "Voter deleted"); fetchAll(); }
    else showToast("danger", data.message);
  };

  const handleApproveVoter = async (id) => {
    const { ok, data } = await apiFetch("/api/admin/voters/" + id + "/approve", { method: "PUT" });
    if (ok) { showToast("success", "Voter approved"); fetchAll(); }
    else showToast("danger", data.message);
  };

  const handleRejectVoter = async (id) => {
    if (!window.confirm("Are you sure you want to reject this registration?")) return;
    const { ok, data } = await apiFetch("/api/admin/voters/" + id + "/reject", { method: "PUT" });
    if (ok) { showToast("success", "Voter rejected"); fetchAll(); }
    else showToast("danger", data.message);
  };

  const handleUpdateVoter = async (e) => {
    e.preventDefault();
    const { ok, data } = await apiFetch("/api/admin/voters/" + editingVoter.id, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingVoter),
    });
    if (ok) { showToast("success", "Voter updated"); setEditingVoter(null); fetchAll(); }
    else showToast("danger", data.message);
  };

  const updatePreviewSchool = (index, newSchool) => {
    const newPreview = [...preview];
    newPreview[index].schoolId = newSchool;
    setPreview(newPreview);
  };

  const handlePreview = async (e) => {
    e.preventDefault();
    if (!file) return showToast("danger", "Please select a CSV file.");
    setLoading(true);
    const fd = new FormData(); fd.append("file", file);
    const { ok, data } = await apiFetch("/api/admin/preview-voters", { method:"POST", body:fd });
    if (ok) setPreview(data.preview); else showToast("danger", data.message);
    setLoading(false);
  };

  const handleConfirm = async () => {
    setLoading(true);
    const { ok, data } = await apiFetch("/api/admin/confirm-voters", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ validVoters: preview }),
    });
    if (ok) { showToast("success", `Inserted ${data.successfulInserts} voters.`); setPreview([]); setFile(null); }
    else showToast("danger", data.message);
    setLoading(false);
  };

  const totalVotes = tally.reduce((sum, pos) => sum + (pos.candidates || []).reduce((s, c) => s + (parseInt(c.vote_count) || 0), 0), 0);
  const totalCandidates = tally.reduce((sum, pos) => sum + (pos.candidates ? pos.candidates.length : 0), 0);
  const statusBadge = { Pending:"badge-warning", Active:"badge-success", Completed:"badge-info" };

  const [newPos, setNewPos] = useState({ title: "", target_group: "ALL", target_value: "" });
  const handleAddPosition = async (e) => {
    e.preventDefault();
    const { ok, data } = await apiFetch("/api/admin/positions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPos)
    });
    if (ok) { showToast("success", "Position added"); setNewPos({ title: "", target_group: "ALL", target_value: "" }); fetchAll(); }
    else showToast("danger", data.message);
  };
  const handleDeletePosition = async (id) => {
    if (!window.confirm("Are you sure? This will affect candidates linked to this position.")) return;
    const { ok, data } = await apiFetch("/api/admin/positions/" + id, { method: "DELETE" });
    if (ok) { showToast("success", "Position deleted"); fetchAll(); }
    else showToast("danger", data.message);
  };

  const handleDeleteCandidate = async (id) => {
    if (!window.confirm("Are you sure you want to delete this candidate?")) return;
    const { ok, data } = await apiFetch("/api/admin/candidates/" + id, { method: "DELETE" });
    if (ok) { showToast("success", "Candidate deleted"); fetchAll(); }
    else showToast("danger", data.message);
  };

  const handleApproveCandidate = async (id) => {
    const { ok, data } = await apiFetch("/api/admin/candidates/" + id + "/approve", { method: "PUT" });
    if (ok) { showToast("success", "Candidate approved"); fetchAll(); }
    else showToast("danger", data.message);
  };

  const handleRejectCandidate = async (id) => {
    if (!window.confirm("Are you sure you want to reject this application?")) return;
    const { ok, data } = await apiFetch("/api/admin/candidates/" + id + "/reject", { method: "PUT" });
    if (ok) { showToast("success", "Candidate rejected"); fetchAll(); }
    else showToast("danger", data.message);
  };

  return (
    <div className="app-shell" style={S.shell}>
      {/* Sidebar */}
      <aside className="app-sidebar" style={S.sidebar}>
        <div style={S.sideTop}>
          <div style={S.brandRow}>
            <span style={{ fontSize:24 }}>🎓</span>
            <div>
              <p style={S.brandName}>MMUST</p>
              <p style={S.brandSub}>Admin Console</p>
            </div>
          </div>
          <nav>
            {NAV.map(n => (
              <button key={n.id} onClick={() => setTab(n.id)}
                style={{ ...S.navBtn, ...(tab===n.id ? S.navActive : {}) }}>
                <span style={{ width:20, textAlign:"center", fontSize:18 }}>{n.icon}</span>
                {n.label}
                {tab===n.id && <div className="nav-bar-indicator" style={S.navBar} />}
              </button>
            ))}
          </nav>
        </div>
        <button onClick={() => { localStorage.removeItem("adminToken"); navigate("/login"); }}
          style={S.logoutBtn}>🚪 Logout</button>
      </aside>

      {/* Main */}
      <main className="app-main" style={S.main}>
        {/* Topbar */}
        <div className="app-topbar" style={S.topbar}>
          <div>
            <h1 style={{ fontSize:17, fontWeight:700, margin:0 }}>{NAV.find(n=>n.id===tab)?.label}</h1>
            <p style={{ fontSize:12, color:"#6b7280", margin:0 }}>Electoral Commission Dashboard</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:12, color:"#6b7280" }}>Election:</span>
            <span className={`badge ${statusBadge[status]||"badge-gray"}`}>{status}</span>
          </div>
        </div>

        {/* Content */}
        <div style={S.content}>
          {toast && (
            <div className={`alert alert-${toast.type}`} style={{ marginBottom:16 }}>
              {toast.type==="success" ? "✓" : "⚠"} {toast.msg}
            </div>
          )}

          {/* ── TALLY ── */}
          {tab==="tally" && (
            <div>
              <div style={{ display:"flex", justifyContent:"flex-end", marginBottom: 12 }}>
                <button onClick={exportResultsPDF} className="btn btn-primary btn-sm">📄 Export PDF</button>
              </div>
              <div className="responsive-grid-stats" style={S.statsRow}>
                {[
                  { label:"Total Votes",           val:totalVotes,               color:"#1a56a4" },
                  { label:"Total Positions",       val:tally.length,             color:"#7c3aed" },
                  { label:"Total Candidates",      val:totalCandidates,          color:"#059669" },
                  { label:"Status",                val:status,                   color:"#d97706" },
                ].map(s=>(
                  <div key={s.label} className="card" style={{ padding:"16px 18px" }}>
                    <p style={{ fontSize:11, textTransform:"uppercase", letterSpacing:".5px", color:"#6b7280", margin:"0 0 6px" }}>{s.label}</p>
                    <p style={{ fontSize:24, fontWeight:700, color:s.color, margin:0 }}>{s.val}</p>
                  </div>
                ))}
              </div>
              <div className="responsive-grid-2" style={{ gap:16 }}>
                {tally.map((pos, i) => (
                  <ChartCard key={pos.id} title={pos.title} data={pos.candidates || []} color={i % 2 === 0 ? "#6366f1" : "#10b981"} />
                ))}
              </div>
            </div>
          )}

          {/* ── CSV UPLOAD ── */}
          {tab==="upload" && (
            <div style={{ maxWidth:720 }}>
              {!preview.length ? (
                <div className="card" style={{ padding:28 }}>
                  <h3 style={{ marginBottom:6 }}>Upload Voter Registry CSV</h3>
                  <p style={{ fontSize:13, marginBottom:20 }}>
                    Expected columns: <code>STUDENT REG.</code>, <code>STUDENT NAME</code>, <code>SEX</code>, <code>RESIDENCE</code>, <code>EMAIL</code>
                  </p>
                  <form onSubmit={handlePreview}>
                    <label style={S.fileLabel}>
                      <span style={{ fontSize:30 }}>📂</span>
                      <span style={{ fontWeight:600 }}>{file ? file.name : "Click to choose a CSV file"}</span>
                      <span style={{ fontSize:12, color:"#9ca3af" }}>Only .csv accepted</span>
                      <input type="file" accept=".csv" style={{ display:"none" }} onChange={e=>setFile(e.target.files[0])} />
                    </label>
                    <button type="submit" disabled={loading||!file} className="btn btn-primary" style={{ marginTop:14 }}>
                      {loading ? <><span className="spinner"/> Parsing…</> : "Preview CSV"}
                    </button>
                  </form>
                </div>
              ) : (
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                    <h3>{preview.length} records found</h3>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={()=>{setPreview([]);setFile(null);}} className="btn btn-ghost btn-sm">Cancel</button>
                      <button onClick={handleConfirm} disabled={loading} className="btn btn-success btn-sm">
                        {loading ? <><span className="spinner"/> Saving…</> : "Confirm & Save Valid"}
                      </button>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Reg No.</th><th>Name</th><th>Email</th><th>School</th><th>Zone</th><th>Status</th></tr></thead>
                      <tbody>
                        {preview.map((r,i)=>(
                          <tr key={i}>
                            <td style={{ fontFamily:"monospace", fontSize:12 }}>{r.regNumber}</td>
                            <td>{r.fullName}</td>
                            <td style={{ fontSize:12, color:"#6b7280" }}>{r.email}</td>
                            <td>
                              <select value={r.schoolId} onChange={(e) => updatePreviewSchool(i, e.target.value)} style={{ padding: "2px 4px", fontSize: 11, borderRadius: 4, border: "1px solid #ccc" }}>
                                {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                            <td style={{ fontSize:12 }}>{r.residence}</td>
                            <td><span className={`badge ${r.status==="Valid"?"badge-success":"badge-danger"}`}>{r.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── APPROVALS ── */}
          {tab==="approvals" && (
            <div>
              <h3 style={{ marginBottom:16 }}>Pending Self-Registrations</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Reg No.</th><th>Name</th><th>Email</th><th>School</th><th>Zone</th><th>Actions</th></tr></thead>
                  <tbody>
                    {voters.filter(v => !v.is_approved).length === 0 ? (
                      <tr><td colSpan="6" style={{ textAlign: "center", color: "#6b7280" }}>No pending registrations.</td></tr>
                    ) : (
                      voters.filter(v => !v.is_approved).map(v => (
                        <tr key={v.id}>
                          <td style={{ fontFamily:"monospace", fontSize:12 }}>{v.registration_number}</td>
                          <td>{v.full_name}</td>
                          <td style={{ fontSize:12, color:"#6b7280" }}>{v.email_address}</td>
                          <td><span className="badge badge-info">{v.school_id}</span></td>
                          <td style={{ fontSize:12 }}>{v.residence_zone}</td>
                          <td>
                            <button onClick={() => handleApproveVoter(v.id)} className="btn btn-success btn-sm" style={{ padding: "4px 8px", marginRight: 8 }}>Approve</button>
                            <button onClick={() => handleRejectVoter(v.id)} className="btn btn-danger btn-sm" style={{ padding: "4px 8px" }}>Reject</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab==="voters" && (
            <div>
              {/* Toolbar */}
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16, alignItems:"center" }}>
                <input type="text" className="form-control" placeholder="Search name or reg no…" style={{ width:220 }} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                <select className="form-control" style={{ width:130 }} value={filterSchool} onChange={e => setFilterSchool(e.target.value)}>
                  <option value="">All Schools</option>
                  {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="form-control" style={{ width:150 }} value={filterZone} onChange={e => setFilterZone(e.target.value)}>
                  <option value="">All Zones</option>
                  {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
                <select className="form-control" style={{ width:110 }} value={filterGender} onChange={e => setFilterGender(e.target.value)}>
                  <option value="">All Genders</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <select className="form-control" style={{ width:130 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">Any Status</option>
                  <option value="voted">Has Voted</option>
                  <option value="not_voted">Not Voted</option>
                </select>
                <div style={{ flex:1 }} />
                <button onClick={exportVotersPDF} className="btn btn-primary btn-sm">📄 Export PDF</button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead><tr>
                    {[{k:"registration_number",l:"Reg No."},{k:"full_name",l:"Name"},{k:"school_id",l:"School"},{k:"residence_zone",l:"Zone"},{k:"gender",l:"Gender"},{k:"has_voted",l:"Voted"}].map(({k,l})=>(
                      <th key={k} style={{ cursor:"pointer", userSelect:"none", whiteSpace:"nowrap" }} onClick={() => toggleSort(k)}>{l}<SortIcon col={k} /></th>
                    ))}
                    <th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {voters
                      .filter(v => v.is_approved)
                      .filter(v => !searchQuery || v.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || v.registration_number.toLowerCase().includes(searchQuery.toLowerCase()))
                      .filter(v => !filterSchool || v.school_id === filterSchool)
                      .filter(v => !filterZone   || v.residence_zone === filterZone)
                      .filter(v => !filterGender || v.gender === filterGender)
                      .filter(v => !filterStatus || (filterStatus === "voted" ? v.has_voted : !v.has_voted))
                      .sort((a, b) => {
                        const av = (a[sortCol] ?? "").toString().toLowerCase();
                        const bv = (b[sortCol] ?? "").toString().toLowerCase();
                        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
                      })
                      .map(v => (
                        <tr key={v.id}>
                          <td style={{ fontFamily:"monospace", fontSize:12 }}>{v.registration_number}</td>
                          <td>{v.full_name}</td>
                          <td><span className="badge badge-info">{v.school_id}</span></td>
                          <td style={{ fontSize:12 }}>{v.residence_zone}</td>
                          <td style={{ fontSize:12 }}>{v.gender}</td>
                          <td><span className={"badge " + (v.has_voted ? "badge-success" : "badge-gray")}>{v.has_voted ? "Yes" : "No"}</span></td>
                          <td>
                            <button onClick={() => setEditingVoter(v)} className="btn btn-ghost btn-sm" style={{ padding:"4px 8px" }}>✏️</button>
                            <button onClick={() => handleDeleteVoter(v.id)} className="btn btn-danger btn-sm" style={{ padding:"4px 8px" }}>🗑️</button>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
              
              {editingVoter && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
                  <div className="card" style={{ padding: 24, width: 400 }}>
                    <h3 style={{ marginBottom: 16 }}>Edit Voter</h3>
                    <form onSubmit={handleUpdateVoter} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div className="form-group">
                        <label className="form-label">Reg Number</label>
                        <input className="form-control" value={editingVoter.registration_number} onChange={e => setEditingVoter({...editingVoter, registration_number: e.target.value})} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input className="form-control" value={editingVoter.full_name} onChange={e => setEditingVoter({...editingVoter, full_name: e.target.value})} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Email</label>
                        <input className="form-control" value={editingVoter.email_address} onChange={e => setEditingVoter({...editingVoter, email_address: e.target.value})} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">School</label>
                        <select className="form-control" value={editingVoter.school_id} onChange={e => setEditingVoter({...editingVoter, school_id: e.target.value})}>
                          {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Zone</label>
                        <select className="form-control" value={editingVoter.residence_zone} onChange={e => setEditingVoter({...editingVoter, residence_zone: e.target.value})}>
                          {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button type="button" onClick={() => setEditingVoter(null)} className="btn btn-ghost">Cancel</button>
                        <button type="submit" className="btn btn-primary">Save Changes</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── MANUAL VOTER ── */}
          {tab==="manual" && (
            <div style={{ maxWidth:520 }}>
              <div className="card" style={{ padding:28 }}>
                <h3 style={{ marginBottom:4 }}>Register Single Voter</h3>
                <p style={{ marginBottom:20, fontSize:13 }}>Manually add a student to the voter registry.</p>
                <ManualVoterForm
                  token={token()}
                  onSuccess={msg => showToast("success", msg)}
                  onError={msg => showToast("danger", msg)}
                />
              </div>
            </div>
          )}

          {/* ── CANDIDATES ── */}
          {tab==="candidates" && (
            <div className="responsive-grid-2" style={{ alignItems: "flex-start" }}>
              <div style={{ maxWidth:580 }}>
                <div className="card" style={{ padding:28 }}>
                  <h3 style={{ marginBottom:4 }}>Register Candidate</h3>
                  <p style={{ marginBottom:20, fontSize:13 }}>
                    The student must already be registered in the voter registry.
                  </p>
                  <CandidateForm
                    token={token()}
                    onSuccess={msg => { showToast("success", msg); fetchAll(); }}
                    onError={msg => showToast("danger", msg)}
                  />
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <h3 style={{ marginBottom: 16 }}>Registered Candidates</h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Position</th><th>Target</th><th>Actions</th></tr></thead>
                    <tbody>
                      {candidatesList.length === 0 ? (
                        <tr><td colSpan="4" style={{ textAlign: "center", color: "#6b7280" }}>No candidates registered.</td></tr>
                      ) : (
                        candidatesList.map(c => (
                          <tr key={c.id}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ fontWeight: 600 }}>{c.full_name}</div>
                                {!c.is_approved && <span className="badge badge-warning" style={{ fontSize: 10, padding: "2px 6px" }}>Pending</span>}
                              </div>
                            </td>
                            <td><span className="badge badge-info">{c.position_title}</span></td>
                            <td style={{ fontSize: 12 }}>{c.target_group}{c.target_value ? `: ${c.target_value}` : ""}</td>
                            <td>
                              {c.is_approved ? (
                                <button onClick={() => handleDeleteCandidate(c.id)} className="btn btn-danger btn-sm" style={{ padding: "4px 8px" }} title="Delete">🗑️</button>
                              ) : (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button onClick={() => handleApproveCandidate(c.id)} className="btn btn-success btn-sm" style={{ padding: "4px 8px" }} title="Approve">✓</button>
                                  <button onClick={() => handleRejectCandidate(c.id)} className="btn btn-danger btn-sm" style={{ padding: "4px 8px" }} title="Reject">✗</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── CONFIG ── */}
          {tab==="config" && (
            <div style={{ maxWidth: 1000 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, padding: "16px 24px", background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                <div>
                  <h2 style={{ margin: 0 }}>Election Configuration</h2>
                  <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Manage election lifecycle, scheduling, and voting positions.</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#6b7280" }}>Current Status:</span>
                  <span className={`badge ${status === 'Active' ? 'badge-success' : status === 'Completed' ? 'badge-danger' : 'badge-warning'}`} style={{ padding: "6px 12px", fontSize: 13 }}>
                    {status}
                  </span>
                </div>
              </div>

              <div className="responsive-grid-config">
                {/* Left Column: Lifecycle & Schedule */}
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ marginBottom: 16, fontSize: 16 }}>1. Lifecycle Control</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {[
                        { s: "Pending",   label: "Reset to Pending", cls: "btn-ghost",   desc: "Election not started." },
                        { s: "Active",    label: "Go Live Now",     cls: "btn-success", desc: "Open voting immediately." },
                        { s: "Completed", label: "Finalize & Close", cls: "btn-danger",  desc: "End voting permanently." },
                      ].map(({ s, label, cls, desc }) => (
                        <div key={s} style={{ padding: 12, borderRadius: 8, border: "1px solid #f3f4f6", background: status === s ? "#f9fafb" : "transparent" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{s}</span>
                            <button onClick={() => changeStatus(s)} disabled={status === s} className={`btn ${cls} btn-sm`} style={{ fontSize: 11 }}>{label}</button>
                          </div>
                          <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>{desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ marginBottom: 16, fontSize: 16 }}>2. Automation Schedule</h3>
                    <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>Set a window for the election to automatically transition to <strong>Active</strong>.</p>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                      <label className="form-label">Election Opens</label>
                      <input type="datetime-local" className="form-control" value={electionStart} onChange={e => setElectionStart(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 20 }}>
                      <label className="form-label">Election Closes</label>
                      <input type="datetime-local" className="form-control" value={electionEnd} onChange={e => setElectionEnd(e.target.value)} />
                    </div>
                    <button onClick={saveSchedule} className="btn btn-primary btn-full">Save Automation Schedule</button>
                  </div>
                </div>

                {/* Right Column: Positions */}
                <div className="card" style={{ padding: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>3. Voting Positions</h3>
                    <span className="badge badge-gray">{tally.length} Position(s)</span>
                  </div>
                  
                  <div className="table-wrap" style={{ marginBottom: 24 }}>
                    <table>
                      <thead><tr><th>Position Title</th><th>Group</th><th>Target</th><th style={{ width: 50 }}></th></tr></thead>
                      <tbody>
                        {tally.map(p => (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 600 }}>{p.title}</td>
                            <td><span className="badge badge-info" style={{ fontSize: 10 }}>{p.target_group}</span></td>
                            <td style={{ fontSize: 12 }}>{p.target_value || <em style={{ color: "#9ca3af" }}>Campus-wide</em>}</td>
                            <td>
                              <button onClick={() => handleDeletePosition(p.id)} className="btn btn-danger btn-sm" style={{ padding: "4px 8px" }}>🗑️</button>
                            </td>
                          </tr>
                        ))}
                        {tally.length === 0 && <tr><td colSpan="4" style={{ textAlign: "center", color: "#9ca3af", padding: 32 }}>No positions defined yet.</td></tr>}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ padding: 20, background: "#f9fafb", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                    <h4 style={{ marginBottom: 16, fontSize: 14 }}>Add New Position</h4>
                    <form onSubmit={handleAddPosition} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div className="form-group" style={{ gridColumn: "span 2" }}>
                        <label className="form-label">Position Title</label>
                        <input className="form-control" placeholder="e.g. Executive President" value={newPos.title} onChange={e => setNewPos({ ...newPos, title: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Voter Group</label>
                        <select className="form-control" value={newPos.target_group} onChange={e => setNewPos({ ...newPos, target_group: e.target.value })}>
                          <option value="ALL">ALL (Campus-Wide)</option>
                          <option value="SCHOOL">SCHOOL (Specific School)</option>
                          <option value="RESIDENTIAL">RESIDENTIAL (Specific Zone)</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Target Filter</label>
                        {newPos.target_group === "ALL" ? (
                          <input className="form-control" disabled value="No filter needed" />
                        ) : newPos.target_group === "SCHOOL" ? (
                          <select className="form-control" value={newPos.target_value} onChange={e => setNewPos({ ...newPos, target_value: e.target.value })} required>
                            <option value="">Select School</option>
                            {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <select className="form-control" value={newPos.target_value} onChange={e => setNewPos({ ...newPos, target_value: e.target.value })} required>
                            <option value="">Select Zone</option>
                            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                          </select>
                        )}
                      </div>
                      <button type="submit" className="btn btn-primary btn-full" style={{ gridColumn: "span 2", marginTop: 8 }}>Create Position</button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* ── AUDIT LOGS ── */}
          {tab==="logs" && (
            <div>
              <h3 style={{ marginBottom: 16 }}>System Audit Logs</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Timestamp</th><th>Action</th><th>Description</th><th>Admin Email</th></tr></thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr><td colSpan="4" style={{ textAlign: "center", color: "#6b7280" }}>No logs found.</td></tr>
                    ) : (
                      logs.map(l => (
                        <tr key={l.id}>
                          <td style={{ fontSize: 12, color: "#6b7280" }}>{new Date(l.created_at).toLocaleString()}</td>
                          <td><span className="badge badge-gray">{l.action_type}</span></td>
                          <td style={{ fontSize: 13 }}>{l.description}</td>
                          <td style={{ fontSize: 12, color: "#1a56a4" }}>{l.admin_email}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ChartCard({ title, data, color }) {
  return (
    <div className="card" style={{ padding:20 }}>
      <h3 style={{ marginBottom:16, textAlign:"center", fontSize:14 }}>{title}</h3>
      {data.length===0
        ? <p style={{ textAlign:"center", color:"#9ca3af", fontSize:13, padding:"40px 0" }}>No data yet</p>
        : <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top:0,right:8,left:-10,bottom:30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
              <XAxis dataKey="full_name" tick={{ fontSize:11 }} angle={-30} textAnchor="end" interval={0}/>
              <YAxis tick={{ fontSize:11 }} allowDecimals={false}/>
              <Tooltip contentStyle={{ fontSize:12, borderRadius:6 }}/>
              <Bar dataKey="vote_count" fill={color} radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
      }
    </div>
  );
}

const S = {
  shell:    { display:"flex", height:"100vh", overflow:"hidden", fontFamily:"'Inter',sans-serif" },
  sidebar:  { width:220, background:"#111827", display:"flex", flexDirection:"column", flexShrink:0 },
  sideTop:  { flex:1, padding:"20px 12px 12px", overflowY:"auto" },
  brandRow: { display:"flex", alignItems:"center", gap:10, padding:"0 8px 20px" },
  brandName:{ fontSize:14, fontWeight:700, color:"#fff", margin:0 },
  brandSub: { fontSize:11, color:"rgba(255,255,255,.4)", margin:0 },
  navBtn:   { display:"flex", alignItems:"center", gap:10, width:"100%", padding:"12px 14px",
    border:"none", borderRadius:7, cursor:"pointer", fontSize:16, fontWeight:500,
    color:"rgba(255,255,255,.55)", background:"transparent", position:"relative",
    textAlign:"left", marginBottom:2, transition:"all .15s" },
  navActive:{ background:"rgba(255,255,255,.1)", color:"#fff" },
  navBar:   { position:"absolute", left:0, top:"20%", bottom:"20%", width:3, background:"#6366f1", borderRadius:3 },
  logoutBtn:{ margin:12, padding:"9px 12px", border:"1px solid rgba(255,255,255,.1)",
    borderRadius:7, background:"transparent", color:"rgba(255,255,255,.45)", cursor:"pointer", fontSize:13, textAlign:"left" },
  main:     { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  topbar:   { padding:"15px 24px", background:"#fff", borderBottom:"1px solid #e5e7eb",
    display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 },
  content:  { flex:1, overflowY:"auto", padding:24 },
  statsRow: { marginBottom:16 },
  fileLabel:{ display:"flex", flexDirection:"column", alignItems:"center", gap:8,
    padding:"32px 24px", border:"2px dashed #d1d5db", borderRadius:10,
    cursor:"pointer", background:"#f9fafb" },
};
