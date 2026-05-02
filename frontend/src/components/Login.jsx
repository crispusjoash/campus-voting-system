import React, { useState } from "react";
import API_URL from "../config";
import { useNavigate } from "react-router-dom";

/* ── tiny SVG icons ─────────────────────────────────────────────── */
const IconMail = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/>
  </svg>
);
const IconLock = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const IconShield = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IconEye = ({ show }) => show ? (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp]           = useState("");
  const [step, setStep]         = useState("LOGIN"); // LOGIN | OTP
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [showPw, setShowPw]     = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");

    const isAdmin = email.includes("admin");
    const url = isAdmin
      ? `${API_URL}/api/admin/login`
      : `${API_URL}/api/auth/login`;

    try {
      const res  = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        if (isAdmin) { localStorage.setItem("adminToken", data.token); navigate("/admin/dashboard"); }
        else          { setStep("OTP"); }
      } else { setError(data.message); }
    } catch { setError("Unable to connect to server."); }
    setLoading(false);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res  = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (res.ok) { localStorage.setItem("voterToken", data.token); navigate("/voter/ballot"); }
      else         { setError(data.message); }
    } catch { setError("Unable to connect to server."); }
    setLoading(false);
  };

  return (
    <div style={styles.page}>
      {/* Left panel */}
      <div style={styles.leftPanel}>
        <div style={styles.brandWrap}>
          <div style={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="white" fillOpacity=".15"/>
              <path d="M16 6 L26 12 L26 20 L16 26 L6 20 L6 12 Z" stroke="white" strokeWidth="2" fill="none"/>
              <path d="M16 10 L22 14 L22 19 L16 23 L10 19 L10 14 Z" fill="white" fillOpacity=".3"/>
            </svg>
          </div>
          <div>
            <p style={styles.brandName}>MMUST</p>
            <p style={styles.brandSub}>Student Electoral Commission</p>
          </div>
        </div>

        <div style={styles.leftContent}>
          <h1 style={styles.leftTitle}>Secure Online Voting Platform</h1>
          <p style={styles.leftDesc}>
            Masinde Muliro University of Science & Technology's official digital election system.
          </p>
          <div style={styles.featureList}>
            {[
              ["🔒", "End-to-end encrypted ballots"],
              ["🗳️", "Anonymous vote counting"],
              ["📊", "Real-time live tally"],
              ["✉️", "OTP-verified identity"],
            ].map(([icon, text]) => (
              <div key={text} style={styles.featureItem}>
                <span style={styles.featureIcon}>{icon}</span>
                <span style={styles.featureText}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={styles.leftFooter}>© 2026 MMUST. All rights reserved.</p>
      </div>

      {/* Right panel */}
      <div style={styles.rightPanel}>
        <div style={styles.formCard}>
          {/* Header */}
          <div style={styles.formHeader}>
            <div style={styles.formIconWrap}>
              {step === "LOGIN" ? <IconShield /> : <IconMail />}
            </div>
            <div>
              <h2 style={styles.formTitle}>
                {step === "LOGIN" ? "Sign In" : "Verify Identity"}
              </h2>
              <p style={styles.formSubtitle}>
                {step === "LOGIN"
                  ? "Enter your credentials to access the ballot"
                  : `OTP sent to ${email}`}
              </p>
            </div>
          </div>

          {/* Progress steps */}
          <div style={styles.stepsRow}>
            {["Credentials", "OTP Verification", "Ballot"].map((s, i) => (
              <div key={s} style={{ display:"flex", alignItems:"center", flex: i < 2 ? 1 : "none" }}>
                <div style={{
                  ...styles.stepDot,
                  background: (step === "LOGIN" && i === 0) || (step === "OTP" && i <= 1) ? "var(--primary, #1a56a4)" : "#e5e7eb",
                  color:       (step === "LOGIN" && i === 0) || (step === "OTP" && i <= 1) ? "#fff" : "#9ca3af",
                }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 4, marginRight: 4 }}>{s}</span>
                {i < 2 && <div style={{ flex:1, height:1, background:"#e5e7eb" }} />}
              </div>
            ))}
          </div>

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}

          {/* ── Login form ── */}
          {step === "LOGIN" && (
            <form onSubmit={handleLogin} style={styles.form}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div style={styles.inputWrap}>
                  <span style={styles.inputIcon}><IconMail /></span>
                  <input
                    id="login-email"
                    type="email" required
                    className="form-control"
                    style={{ paddingLeft: 38 }}
                    placeholder="e.g. sitb01-000012023@student.mmust.ac.ke"
                    value={email} onChange={e => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 14 }}>
                <label className="form-label">Password</label>
                <div style={styles.inputWrap}>
                  <span style={styles.inputIcon}><IconLock /></span>
                  <input
                    id="login-password"
                    type={showPw ? "text" : "password"} required
                    className="form-control"
                    style={{ paddingLeft: 38, paddingRight: 40 }}
                    placeholder="Your registration number in lowercase"
                    value={password} onChange={e => setPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)} style={styles.eyeBtn}>
                    <IconEye show={showPw} />
                  </button>
                </div>
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                  Default password is your reg. number in lowercase — e.g.{" "}
                  <span style={{ fontFamily:"monospace" }}>sit/b/01-00001/2023</span>
                </p>
              </div>

              <button
                id="login-submit"
                type="submit" disabled={loading}
                className="btn btn-primary btn-full btn-lg"
                style={{ marginTop: 22 }}
              >
                {loading ? <><span className="spinner" /> Authenticating…</> : "Sign In"}
              </button>

              <div style={{ textAlign: "center", marginTop: 20 }}>
                <p style={{ fontSize: 13, color: "#6b7280" }}>
                  Not registered yet? <button type="button" onClick={() => navigate("/signup")} className="btn-ghost" style={{ padding: 0, border: "none", background: "none", color: "#1a56a4", textDecoration: "underline", cursor: "pointer" }}>Sign up here</button>
                </p>
              </div>
            </form>
          )}

          {/* ── OTP form ── */}
          {step === "OTP" && (
            <form onSubmit={handleVerifyOtp} style={styles.form}>
              <div style={styles.otpInfoBox}>
                <p style={{ fontSize: 13 }}>
                  A 6-digit verification code has been sent to your registered email.
                  Enter it below to proceed to your ballot.
                </p>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">6-Digit OTP Code</label>
                <input
                  id="otp-input"
                  type="text" required maxLength={6}
                  className="form-control"
                  style={{ textAlign: "center", fontSize: 24, letterSpacing: 10, fontWeight: 600 }}
                  placeholder="— — — — — —"
                  value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                />
              </div>

              <button
                id="otp-submit"
                type="submit" disabled={loading}
                className="btn btn-success btn-full btn-lg"
                style={{ marginTop: 22 }}
              >
                {loading ? <><span className="spinner" /> Verifying…</> : "Verify & Enter Ballot"}
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-full"
                style={{ marginTop: 10 }}
                onClick={() => { setStep("LOGIN"); setOtp(""); setError(""); }}
              >
                ← Back to Login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────────────────── */
const styles = {
  page: {
    display: "flex", minHeight: "100vh", fontFamily: "'Inter', sans-serif",
  },
  /* Left */
  leftPanel: {
    width: 400, flexShrink: 0,
    background: "linear-gradient(160deg, #1a56a4 0%, #0f3470 100%)",
    color: "#fff", padding: "40px 36px",
    display: "flex", flexDirection: "column",
  },
  brandWrap: { display: "flex", alignItems: "center", gap: 12, marginBottom: 48 },
  logo: { flexShrink: 0 },
  brandName: { fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 },
  brandSub:  { fontSize: 12, color: "rgba(255,255,255,.6)", margin: 0 },
  leftContent: { flex: 1 },
  leftTitle: { fontSize: 26, fontWeight: 700, lineHeight: 1.3, color: "#fff", marginBottom: 14 },
  leftDesc:  { fontSize: 14, color: "rgba(255,255,255,.7)", lineHeight: 1.6, marginBottom: 32 },
  featureList: { display: "flex", flexDirection: "column", gap: 14 },
  featureItem: { display: "flex", alignItems: "center", gap: 12 },
  featureIcon: {
    width: 36, height: 36, borderRadius: 8,
    background: "rgba(255,255,255,.12)", display: "flex",
    alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
  },
  featureText: { fontSize: 13, color: "rgba(255,255,255,.85)" },
  leftFooter: { fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 40, margin: 0 },

  /* Right */
  rightPanel: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    background: "#f0f2f5", padding: "40px 24px",
  },
  formCard: {
    width: "100%", maxWidth: 440,
    background: "#fff", border: "1px solid #dde1e9",
    borderRadius: 14, padding: "32px 32px 28px",
    boxShadow: "0 4px 24px rgba(0,0,0,.08)",
  },
  formHeader: { display: "flex", alignItems: "center", gap: 14, marginBottom: 24 },
  formIconWrap: {
    width: 44, height: 44, borderRadius: 10,
    background: "#e8f0fb", color: "#1a56a4",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  formTitle:    { fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 },
  formSubtitle: { fontSize: 12, color: "#6b7280", margin: "2px 0 0" },
  stepsRow: { display: "flex", alignItems: "center", marginBottom: 24 },
  stepDot: {
    width: 22, height: 22, borderRadius: "50%", fontSize: 11,
    fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "all .2s",
  },
  form: { display: "flex", flexDirection: "column" },
  inputWrap: { position: "relative" },
  inputIcon: {
    position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
    color: "#9ca3af", display: "flex", pointerEvents: "none",
  },
  eyeBtn: {
    position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)",
    background: "none", border: "none", cursor: "pointer", color: "#9ca3af",
    display: "flex", padding: 0,
  },
  otpInfoBox: {
    background: "#dbeafe", border: "1px solid #bfdbfe",
    borderRadius: 8, padding: "12px 14px", color: "#1e40af",
  },
};
