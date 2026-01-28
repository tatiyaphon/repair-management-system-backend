// server.js
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const morgan = require("morgan");
const bcrypt = require("bcryptjs");
const fs = require("fs");

const Employee = require("./models/Employee");

const app = express();
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
/* =========================
   🔥 STATIC UPLOADS (ต้องอยู่บนสุด)
========================= */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =========================
   Middleware
========================= */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

console.log(
  "FILE EXISTS?",
  fs.existsSync(path.join(__dirname, "uploads/profile/default.jpg"))
);

/* =========================
   MongoDB Connect
========================= */
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("❌ MONGODB_URI not found");
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(async () => {
    console.log("✅ Connected to MongoDB");
    await ensureAdmin();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB error:", err.message);
    process.exit(1);
  });

/* =========================
   Seed Admin
========================= */
async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "Admin@123";

  const exists = await Employee.findOne({ email });
  if (exists) return;

  const hash = await bcrypt.hash(password, 10);
  await Employee.create({
    firstName: "Admin",
    lastName: "User",
    email,
    password: hash,
    role: "admin",
    active: true,
  });

  console.log("👑 Admin created");
}

/* =========================
   API Routes
========================= */
app.get("/", (_req, res) => {
  res.json({ message: "API running 🚀" });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/employees", require("./routes/employeeRoutes"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/stocks", require("./routes/stock"));
app.use("/api/jobs", require("./routes/jobRoutes"));

/* =========================
   Serve Employee Frontend
========================= */
const employeeFrontendPath = path.join(__dirname, "../frontend-employee");
console.log("📁 Employee frontend path:", employeeFrontendPath);

app.use("/employee", express.static(employeeFrontendPath));

app.get("/employee", (req, res) => {
  res.sendFile(path.join(employeeFrontendPath, "login.html"));
});

app.get(/^\/employee\/.*$/, (req, res) => {
  res.sendFile(path.join(employeeFrontendPath, "login.html"));
});

/* =========================
   Serve Customer Frontend
========================= */
const customerFrontendPath = path.join(__dirname, "../frontend-customer");
console.log("📁 Customer frontend path:", customerFrontendPath);

app.use("/customer", express.static(customerFrontendPath));

app.get("/customer", (req, res) => {
  res.sendFile(path.join(customerFrontendPath, "index.html"));
});

app.get(/^\/customer\/.*$/, (req, res) => {
  res.sendFile(path.join(customerFrontendPath, "index.html"));
});

/* =========================
   404 Handler (ล่างสุดเท่านั้น)
========================= */
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

module.exports = app;
