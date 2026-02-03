const express = require("express");
const bcrypt = require("bcryptjs");
const path = require("path");
const Employee = require("../models/Employee");
const multer = require("multer");
const verifyToken = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const uploadAvatar = require("../middleware/uploadAvatar");

const router = express.Router();

/* =====================================
   GET /api/employees (admin)
===================================== */
router.get("/", verifyToken, requireRole("admin"), async (req, res) => {
  const employees = await Employee.find()
    .select("_id firstName lastName email role active avatar");
  res.json(employees);
});
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
  const { firstName, lastName, email, phone, role, password } = req.body;

  if (!firstName || !lastName || !email || !role || !password) {
    return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
  }

  const exists = await Employee.findOne({ email });
  if (exists) {
    return res.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const employee = await Employee.create({
    firstName,
    lastName,
    email,
    phone,
    role,
    password: hashedPassword,
    avatar: "/uploads/profile/default.jpg", // ✅ แก้ตรงนี้
    mustChangePassword: false,
    active: true
  });

  res.status(201).json({ message: "เพิ่มผู้ใช้สำเร็จ", employee });
});

/* =====================================
   POST /api/employees/profile/avatar
===================================== */
/* =========================
   MULTER CONFIG
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/profile"); // ✅ ตรงกับ static
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `user_${req.user.id}${ext}`); // ✅ ไม่มี undefined
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("ไฟล์ต้องเป็นรูปภาพ"));
    }
    cb(null, true);
  }
});
/* =========================
   UPLOAD AVATAR
========================= */
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
// =========================
// GET /api/employees/:id/profile
// =========================
router.get("/:id/profile", async (req, res) => {
  try {
    const user = await Employee.findById(req.params.id).select(
      "firstName lastName role avatar"
    );

    if (!user) {
      return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    }

    res.json(user);
  } catch (err) {
    console.error("GET PROFILE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});
// ===============================
// DELETE EMPLOYEE (admin only)
// ===============================
router.delete(
  "/:id",
  verifyToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      const user = await Employee.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "ไม่พบผู้ใช้นี้" });
      }

      // ❌ ป้องกันลบ admin ตัวเอง
      if (req.user.userId === req.params.id) {
        return res.status(400).json({ message: "ไม่สามารถลบตัวเองได้" });
      }

      await Employee.findByIdAndDelete(req.params.id);

      res.json({ message: "ลบผู้ใช้เรียบร้อยแล้ว" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "ลบผู้ใช้ไม่สำเร็จ" });
    }
  }
);

module.exports = router;
