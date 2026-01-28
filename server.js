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
   Seed Admin (ครั้งแรกเท่านั้น)
========================= */
async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("ℹ️ Admin env not set, skip admin seed");
    return;
  }

  const exists = await Employee.findOne({ email });
  if (exists) return;

  const hash = await bcrypt.hash(password, 10);
  await Employee.create({
    firstName: process.env.ADMIN_FIRSTNAME || "Admin",
    lastName: process.env.ADMIN_LASTNAME || "User",
    email,
    password: hash,
    role: "admin",
    active: true,
  });

  console.log("👑 Admin created");
}

/* =========================
   API Routes (แยกชัดเจน)
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

app.get("/", (req, res) => {
  res.sendFile(path.join(customerFrontendPath, "home.html"));
});

app.get(/^\/(?!api|employee).*/, (req, res) => {
  res.sendFile(path.join(customerFrontendPath, "home.html"));
});


/* =========================
   Serve Customer Frontend (ROOT ⭐ สำคัญ)
========================= */
const customerFrontendPath = path.join(__dirname, "frontend-customer");

// serve static
app.use(express.static(customerFrontendPath));

// หน้าแรก /
app.get("/", (req, res) => {
  res.sendFile(path.join(customerFrontendPath, "index.html"));
});

// fallback (กัน refresh แล้ว 404)
app.get(/^\/(?!api|employee).*/, (req, res) => {
  res.sendFile(path.join(customerFrontendPath, "index.html"));
});

module.exports = app;
