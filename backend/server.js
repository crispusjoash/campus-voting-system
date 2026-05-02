require("dotenv").config();

const express    = require("express");
const cors       = require("cors");
const http       = require("http");
const path       = require("path");
const { Server } = require("socket.io");

const authRoutes  = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const voterRoutes = require("./routes/voter");
const tallyRoutes = require("./routes/tally");

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
// In production set FRONTEND_URL in .env, e.g. https://mmust-vote.onrender.com
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json());

// ─── Static: serve uploaded candidate photos ──────────────────────────────────
// e.g. GET /uploads/candidates/1234567890.jpg
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ─── Socket.io ───────────────────────────────────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

// Inject io into every request so route handlers can emit events
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use("/api/auth",  authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/voter", voterRoutes);
app.use("/api/tally", tallyRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date() }));

// ─── Socket.io events ────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("Live-tally client connected:", socket.id);
  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () =>
  console.log(`✅  Server running on http://localhost:${PORT}`)
);
