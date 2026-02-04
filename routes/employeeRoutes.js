const express = require("express");
const bcrypt = require("bcryptjs");
const path = require("path");
const Employee = require("../models/Employee");
const multer = require("multer");
const verifyToken = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

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
  const { firstName, lastName, email, password, role, phone } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
  }

  const exists = await Employee.findOne({ email });
  if (exists) {
    return res.status(409).json({ message: "อีเมลนี้ถูกใช้แล้ว" });
  }

  const hash = await bcrypt.hash(password, 10);

  const user = await Employee.create({
    firstName,
    lastName,
    email,
    phone,
    password: hash,
    role,
    active: true,
    mustChangePassword: true
  });

  res.status(201).json({ message: "เพิ่มผู้ใช้สำเร็จ", user });
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

module.exports = router;
