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

/* ==================================================
   PATH SETUP
================================================== */
const publicPath   = path.join(__dirname, "public");              // ลูกค้า
const employeePath = path.join(__dirname, "../frontend-employee"); // ร้าน

/* ==================================================
   MIDDLEWARE
================================================== */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

/* ==================================================
   STATIC FILES
================================================== */
// ลูกค้า (SEO / Google)
app.use(express.static(publicPath));

// ร้าน
app.use("/employee", express.static(employeePath));

/* ==================================================
   MONGODB
================================================== */
mongoose.connect(process.env.MONGODB_URI)
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

async function ensureAdmin() {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.log("ℹ️ Admin env not set, skip admin seed");
    return;
  }

  const exists = await Employee.findOne({ email: process.env.ADMIN_EMAIL });
  if (exists) return;

  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  await Employee.create({
    firstName: process.env.ADMIN_FIRSTNAME || "Admin",
    lastName: process.env.ADMIN_LASTNAME || "User",
    email: process.env.ADMIN_EMAIL,
    password: hash,
    role: "admin",
    active: true,
  });

  console.log("👑 Admin created");
}

/* ==================================================
   API ROUTES
================================================== */
app.use("/api/auth", require("./routes/auth"));
app.use("/api/employees", require("./routes/employeeRoutes"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/stocks", require("./routes/stock"));
app.use("/api/jobs", require("./routes/jobRoutes"));

/* ==================================================
   ROUTING : CUSTOMER (PUBLIC)
================================================== */
// หน้าแรก → ตรวจสอบสถานะ
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// /customer → ใช้หน้าเดียวกัน
app.get("/customer", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

/* ==================================================
   ROUTING : EMPLOYEE (SHOP ONLY)
================================================== */
// /employee → login
app.get("/employee", (req, res) => {
  res.sendFile(path.join(employeePath, "login.html"));
});

// ทุก path ใต้ /employee (สำคัญ: ห้ามใช้ *)
app.get(/^\/employee\/.*$/, (req, res) => {
  res.sendFile(path.join(employeePath, "login.html"));
});

/* ==================================================
   FALLBACK (ลูกค้าเท่านั้น)
================================================== */
app.use((req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

module.exports = app;
