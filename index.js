require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { connectDB } = require("./db");
const { verifyToken } = require("./middleware/auth");

const app = express();
const port = process.env.PORT || 5000;
app.set("trust proxy", 1);

/* ---------- Middleware ---------- */
app.use(
  cors({
    origin: (process.env.CLIENT_URL || "http://localhost:3000").split(",").map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// make sure DB is connected before any route runs (works on Vercel too)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

/* ---------- Routes ---------- */
app.get("/", (req, res) => {
  res.json({ message: "StartupForge server is running" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", database: "connected" });
});

// Test route for JWT: returns the logged in user
app.get("/me", verifyToken, (req, res) => {
  res.json({ user: req.user });
});

app.use("/", require("./routes/auth"));
app.use("/startups", require("./routes/startups"));
app.use("/opportunities", require("./routes/opportunities"));
app.use("/applications", require("./routes/applications"));
app.use("/stats", require("./routes/stats"));
app.use("/payments", require("./routes/payments"));
app.use("/admin", require("./routes/admin"));

/* ---------- 404 and error handling ---------- */
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Internal server error" });
});

/* ---------- Start ---------- */
module.exports = app;

if (!process.env.VERCEL) {
  const server = app.listen(port, (err) => {
    if (err) {
      console.error("Server failed to start:", err.message);
      process.exit(1);
    }
    console.log(`Server running on port ${port}`);
  });

  // Express 5 may also report listen errors (e.g. port already in use) here
  server.on("error", (err) => {
    console.error("Server error:", err.message);
    process.exit(1);
  });
}