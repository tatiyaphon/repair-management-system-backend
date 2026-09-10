require("dotenv").config();

const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

console.log("Node:", process.version);
console.log("DNS:", dns.getDefaultResultOrder?.());

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const morgan = require("morgan");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const Employee = require("./models/Employee");
const stockRoutes = require("./routes/stock");

const app = express();
const PORT = process.env.PORT || 5000;

app.set("trust proxy", 1);


// =====================================================
// MIDDLEWARE
// =====================================================

// Security Headers
app.use(
  helmet({
    // เว็บมี inline script อยู่
    // จึงปิด CSP ไว้ก่อน
    contentSecurityPolicy: false
  })
);


// =====================================================
// RATE LIMIT
// =====================================================

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);


// จำกัดการ Login ป้องกัน Brute Force
app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "พยายามเข้าสู่ระบบมากเกินไป กรุณาลองใหม่ภายหลัง"
    }
  })
);


// =====================================================
// CORS
// =====================================================

app.use(
  cors({
    origin: true,
    credentials: true
  })
);


// =====================================================
// BODY PARSER
// =====================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// =====================================================
// LOG
// =====================================================

app.use(morgan("dev"));


// =====================================================
// STATIC FILES
// =====================================================

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

app.use(
  "/employee",
  express.static(
    path.join(__dirname, "frontend-employee")
  )
);

app.use(
  "/customer",
  express.static(
    path.join(__dirname, "public/customer")
  )
);

app.use(
  "/uploads",
  express.static(
    path.join(__dirname, "public/uploads")
  )
);


// =====================================================
// ROOT
// =====================================================

app.get("/", (req, res) => {
  res.redirect("/customer/index.html");
});


// =====================================================
// API ROUTES
// =====================================================

app.use(
  "/api/auth",
  require("./routes/auth")
);

app.use(
  "/api/employees",
  require("./routes/employeeRoutes")
);

app.use(
  "/api/customers",
  require("./routes/customers")
);

app.use(
  "/api/stocks",
  stockRoutes
);

app.use(
  "/api/jobs",
  require("./routes/jobRoutes")
);

app.use(
  "/api/activity",
  require("./routes/activityRoutes")
);


// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
  require("./middleware/errorHandler")
);


// =====================================================
// STATUS PAGE REDIRECT
// =====================================================

// กันกรณีพิมพ์ URL ผิด
app.get("/status_page.html", (req, res) => {

  const query =
    req._parsedUrl?.search || "";

  res.redirect(
    "/customer/status_page.html" + query
  );
});


// =====================================================
// MONGODB
// =====================================================

mongoose
  .connect(process.env.MONGODB_URI)

  .then(async () => {

    console.log(
      "✅ Connected to DB:",
      mongoose.connection.name
    );

    // เปลี่ยน Admin เก่าเป็น Staff
    await migrateLegacyAdmins();

    // สร้าง Staff หลัก หากยังไม่มี
    await ensureStaff();

    app.listen(PORT, () => {

      console.log(
        `🚀 Server running on port ${PORT}`
      );

    });

  })

  .catch(err => {

    console.error(
      "❌ MongoDB error:",
      err.message
    );

    process.exit(1);

  });


// =====================================================
// MIGRATE LEGACY ADMIN → STAFF
// =====================================================

async function migrateLegacyAdmins() {

  try {

    const result =
      await Employee.updateMany(

        {
          role: "admin"
        },

        {
          $set: {
            role: "staff",
            isVerified: true
          }
        }

      );

    if (result.modifiedCount > 0) {

      console.log(
        `🔄 เปลี่ยนบัญชี Admin เก่าเป็น Staff จำนวน ${result.modifiedCount} บัญชี`
      );

    }

  } catch (error) {

    console.error(
      "❌ Admin migration error:",
      error.message
    );

    throw error;

  }

}


// =====================================================
// SEED STAFF
// =====================================================

async function ensureStaff() {

  if (
    !process.env.STAFF_EMAIL ||
    !process.env.STAFF_PASSWORD
  ) {

    console.log(
      "⚠️ ไม่ได้กำหนด STAFF_EMAIL หรือ STAFF_PASSWORD"
    );

    return;

  }


  const email =
    process.env.STAFF_EMAIL
      .trim()
      .toLowerCase();


  let staff =
    await Employee.findOne({
      email
    });


  // ===================================================
  // ถ้ามีบัญชีอยู่แล้ว
  // ===================================================

  if (staff) {

    // ถ้าเป็น Admin เก่า
    // เปลี่ยนเป็น Staff
    if (staff.role === "admin") {

      staff.role = "staff";
      staff.isVerified = true;

      await staff.save();

      console.log(
        "🔄 Existing account changed to Staff"
      );

    }

    return;

  }


  // ===================================================
  // สร้าง Staff ใหม่
  // ===================================================

  const hash =
    await bcrypt.hash(
      process.env.STAFF_PASSWORD,
      10
    );


  await Employee.create({

    firstName:
      process.env.STAFF_FIRSTNAME ||
      "Staff",

    lastName:
      process.env.STAFF_LASTNAME ||
      "System",

    email,

    password: hash,

    role: "staff",

    active: true,

    isVerified: true,

    mustChangePassword: false

  });


  console.log(
    "👤 Staff account created"
  );

}