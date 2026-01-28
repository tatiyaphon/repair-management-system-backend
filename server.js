// server.js
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const morgan = require("morgan");
const bcrypt = require("bcryptjs");

const Employee = require("./models/Employee");

const app = express();
const PORT = process.env.PORT || 5000;

/* =========================
   STATIC FILES
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

    app.listen(PORT, "0.0.0.0", () => {
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
app.use("/api/auth", require("./routes/auth"));
app.use("/api/employees", require("./routes/employeeRoutes"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/stocks", require("./routes/stock"));
app.use("/api/jobs", require("./routes/jobRoutes"));

/* =========================
   Serve Employee Frontend
========================= */
const employeeFrontendPath = path.join(__dirname, "../frontend-employee");
app.use("/employee", express.static(employeeFrontendPath));

app.get("/employee", (req, res) => {
  res.sendFile(path.join(employeeFrontendPath, "login.html"));
});

app.get(/^\/employee\/.*$/, (req, res) => {
  res.sendFile(path.join(employeeFrontendPath, "login.html"));
});

/* =========================
   Serve Customer Frontend (ROOT ⭐)
========================= */
const customerFrontendPath = path.join(__dirname, "../frontend-customer");
app.use(express.static(customerFrontendPath));

// หน้าแรก / → หน้าเช็คสถานะ (Google ใช้อันนี้)
app.get("/", (req, res) => {
  res.sendFile(path.join(customerFrontendPath, "index.html"));
});

// fallback
app.get(/^\/(?!api|employee).*/, (req, res) => {
  res.sendFile(path.join(customerFrontendPath, "index.html"));
});

module.exports = app;
