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
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(cors({
  origin: [
    "https://tui-it.org",
    "https://www.tui-it.org"
  ]
}));

/* =========================
   STATIC PATHS
========================= */
const employeePath = path.join(__dirname, "frontend-employee");
const customerPath = path.join(__dirname, "public", "customer");
const uploadsPath  = path.join(__dirname, "public", "uploads");

/* =========================
   STATIC SERVE
========================= */
app.use(express.static(path.join(__dirname, "public")));

app.use("/employee", express.static(employeePath));
app.use("/customer", express.static(customerPath));
app.use("/uploads", express.static(uploadsPath));

// serve google verification file
app.get("/google709f6afb95cd178f.html", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "customer", "google709f6afb95cd178f.html")
  );
});
/* =========================
   ROOT
========================= */
app.get("/", (req, res) => {
  res.redirect("/customer/index.html");
});

/* =========================
   API ROUTES
========================= */
app.use("/api/auth", require("./routes/auth"));
app.use("/api/employees", require("./routes/employeeRoutes"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/stocks", require("./routes/stock"));
app.use("/api/jobs", require("./routes/jobRoutes"));

/* =========================
   MONGODB
========================= */
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("✅ Connected to DB:", mongoose.connection.name);
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
   SEED ADMIN
========================= */
async function ensureAdmin() {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) return;

  const exists = await Employee.findOne({ email: process.env.ADMIN_EMAIL });
  if (exists) return;

  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);

  await Employee.create({
    firstName: process.env.ADMIN_FIRSTNAME || "Admin",
    lastName:  process.env.ADMIN_LASTNAME  || "System",
    email:     process.env.ADMIN_EMAIL,
    password:  hash,
    role:      "admin",
    active:    true,
  });

  console.log("👑 Admin account created");
}
