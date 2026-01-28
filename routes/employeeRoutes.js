const express = require("express");
const bcrypt = require("bcryptjs");
const path = require("path");
const Employee = require("../models/Employee");

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
router.post(
  "/profile/avatar",
  verifyToken,
  uploadAvatar.single("avatar"),
  async (req, res) => {
    const avatarPath = `/uploads/profile/${req.file.filename}`;

    await Employee.findByIdAndUpdate(req.user.userId, {
      avatar: avatarPath
    });

    res.json({
      message: "อัปโหลดรูปโปรไฟล์สำเร็จ",
      avatar: avatarPath
    });
  }
);

/* =====================================
   GET /api/employees/:id/profile
===================================== */
router.get("/:id/profile", verifyToken, async (req, res) => {
  const user = await Employee.findById(req.params.id)
    .select("firstName lastName role avatar");
  res.json(user);
});

module.exports = router;
