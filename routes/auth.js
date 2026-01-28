const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Employee = require("../models/Employee");
const verifyToken = require("../middleware/auth");

/* =========================
   POST /api/auth/login
========================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email และ password จำเป็นต้องกรอก"
      });
    }

    const user = await Employee.findOne({ email });
    if (!user || user.active === false) {
      return res.status(401).json({
        error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
      });
    }

    let isMatch = false;

    // รองรับ bcrypt และ plain text (legacy)
    if (typeof user.password === "string" && user.password.startsWith("$2")) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = password === user.password;
    }

    if (!isMatch) {
      return res.status(401).json({
        error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
      });
    }

    // upgrade password เป็น bcrypt ถ้ายังไม่ใช่
    if (!user.password.startsWith("$2")) {
      user.password = await bcrypt.hash(password, 10);
      user.mustChangePassword = true;
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
  token,
  user: {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    avatar: user.avatar,        // ✅ เพิ่มบรรทัดนี้
    mustChangePassword: user.mustChangePassword || false
  }
});

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

/* =========================
   POST /api/auth/change-password
   ผู้ใช้เปลี่ยนรหัสผ่านเอง
========================= */
router.post("/change-password", verifyToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        message: "กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่"
      });
    }

    const user = await Employee.findById(req.user.id);
    if (!user || user.active === false) {
      return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    }

    let isMatch = false;

    if (user.password.startsWith("$2")) {
      isMatch = await bcrypt.compare(oldPassword, user.password);
    } else {
      isMatch = oldPassword === user.password;
    }

    if (!isMatch) {
      return res.status(400).json({
        message: "รหัสผ่านเดิมไม่ถูกต้อง"
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    await user.save();

    res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });

  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    res.status(500).json({
      message: "ไม่สามารถเปลี่ยนรหัสผ่านได้"
    });
  }
});

/* =========================
   POST /api/auth/reset-admin
   ใช้เฉพาะกรณีลืมรหัส
========================= */
router.post("/reset-admin", async (req, res) => {
  try {
    const { email, newPassword, secret } = req.body;

    if (secret !== process.env.ADMIN_RESET_SECRET) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await Employee.findOne({ email, role: "admin" });
    if (!user) {
      return res.status(404).json({ message: "Admin not found" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    user.active = true;
    await user.save();

    res.json({ message: "Reset admin password success" });

  } catch (err) {
    console.error("RESET ADMIN ERROR:", err);
    res.status(500).json({ message: "Reset failed" });
  }
});

module.exports = router;
