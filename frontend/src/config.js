// src/config.js
// In production set VITE_API_URL in your hosting environment (e.g. Render, Netlify).
// Locally it falls back to http://localhost:5000
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
export default API_URL;
