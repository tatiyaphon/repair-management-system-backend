const express = require("express");
const bcrypt = require("bcryptjs");
const path = require("path");
const Employee = require("../models/Employee");
const multer = require("multer");
const verifyToken = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* =====================================
   GET /api/employees (admin)
===================================== */
router.get("/", verifyToken, requireRole("admin"), async (req, res) => {
  const employees = await Employee.find()
    .select("_id firstName lastName email role phone active avatar online");

  res.json(employees);
});

/* =====================================
   GET /api/employees/tech
===================================== */
router.get("/tech", verifyToken, async (req, res) => {
  try {
    const techs = await Employee.find({
      role: "tech",
      active: true
    }).select("_id firstName lastName");

    res.json(techs);
  } catch (err) {
    res.status(500).json({ message: "โหลดรายชื่อช่างไม่สำเร็จ" });
  }
});

/* =====================================
   POST /api/employees (admin)
===================================== */
router.post("/", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    let { firstName, lastName, email, password, role, phone } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
    }

    email = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "รูปแบบอีเมลไม่ถูกต้อง"
      });
    }

    const exists = await Employee.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") }
    });

    if (exists) {
      return res.status(409).json({
        message: "อีเมลนี้ถูกใช้แล้ว"
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await Employee.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email,
      phone,
      password: hash,
      role,
      active: true,
      mustChangePassword: true,
      isVerified: false   // ✅ สำคัญ
    });

    // ==============================
    // 📧 ส่งอีเมลยืนยัน
    // ==============================
    const verifyToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const verifyLink = `${process.env.BASE_URL}/api/auth/verify/${verifyToken}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "ยืนยันอีเมลระบบร้านตุ้ยไอที",
      html: `
        <h2>ยืนยันบัญชีของคุณ</h2>
        <p>กรุณาคลิกปุ่มด้านล่างเพื่อยืนยันอีเมล</p>
        <a href="${verifyLink}" 
           style="padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
           ยืนยันอีเมล
        </a>
        <p>ลิงก์นี้จะหมดอายุใน 24 ชั่วโมง</p>
      `
    });

    res.status(201).json({
      message: "เพิ่มผู้ใช้สำเร็จ และส่งอีเมลยืนยันแล้ว",
      user
    });

  } catch (err) {
    console.error("CREATE EMPLOYEE ERROR:", err);
    res.status(500).json({ message: "เพิ่มผู้ใช้ไม่สำเร็จ" });
  }
});



/* =====================================
   PUT /api/employees/:id (admin)
   แก้ไขสมาชิก
===================================== */
router.put(
  "/:id",
  verifyToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { firstName, lastName, phone, role, active } = req.body;

      const user = await Employee.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "ไม่พบผู้ใช้นี้" });
      }

      // ❌ ป้องกัน admin แก้ role ตัวเอง
      if (req.user.userId === req.params.id && role && role !== "admin") {
        return res.status(400).json({
          message: "ไม่สามารถเปลี่ยนสิทธิ์ของตัวเองได้"
        });
      }

      await Employee.findByIdAndUpdate(req.params.id, {
        firstName,
        lastName,
        phone,
        role,
        active
      });

      res.json({ message: "แก้ไขข้อมูลผู้ใช้เรียบร้อย" });
    } catch (err) {
      console.error("UPDATE EMPLOYEE ERROR:", err);
      res.status(500).json({ message: "แก้ไขผู้ใช้ไม่สำเร็จ" });
    }
  }
);

/* =====================================
   UPLOAD AVATAR
===================================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/profile");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `user_${req.user.userId}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("ไฟล์ต้องเป็นรูปภาพ"));
    }
    cb(null, true);
  }
});

router.post(
  "/profile/avatar",
  verifyToken,
  upload.single("avatar"),
  async (req, res) => {
    try {
      const avatarPath = `/uploads/profile/${req.file.filename}`;

      await Employee.findByIdAndUpdate(req.user.userId, {
        avatar: avatarPath
      });

      res.json({
        message: "อัปโหลดรูปโปรไฟล์สำเร็จ",
        avatar: avatarPath
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "อัปโหลดรูปไม่สำเร็จ" });
    }
  }
);

/* =====================================
   GET PROFILE
===================================== */
// =========================
// GET /api/employees/:id/profile
// =========================
router.get("/:id/profile", verifyToken, async (req, res) => {
  try {
    // ✅ อนุญาต: ดูของตัวเอง หรือ admin เท่านั้น
    if (
      req.user.role !== "admin" &&
      req.user.userId !== req.params.id
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await Employee.findById(req.params.id)
      .select("firstName lastName email role phone avatar active");

    if (!user) {
      return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    }

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});



/* =====================================
   DELETE EMPLOYEE
===================================== */
router.delete(
  "/:id",
  verifyToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      if (req.user.userId === req.params.id) {
        return res.status(400).json({ message: "ไม่สามารถลบตัวเองได้" });
      }

      await Employee.findByIdAndDelete(req.params.id);
      res.json({ message: "ลบผู้ใช้เรียบร้อยแล้ว" });
    } catch (err) {
      res.status(500).json({ message: "ลบผู้ใช้ไม่สำเร็จ" });
    }
  }
);
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await Employee.findById(req.user.userId)
      .select("firstName lastName email role phone avatar active");

    if (!user) {
      return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});
module.exports = router;
