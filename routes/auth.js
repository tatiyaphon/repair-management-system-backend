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
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email และ password จำเป็นต้องกรอก"
      });
    }

    email = email.trim().toLowerCase();

    const user = await Employee.findOne({ email });
    if (!user || user.active === false) {
      return res.status(401).json({
        error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
      });
    }

    const isMatch = user.password.startsWith("$2")
      ? await bcrypt.compare(password, user.password)
      : password === user.password;

    if (!isMatch) {
      return res.status(401).json({
        error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
      });
    }

    // 🔐 บล็อกถ้ายังไม่ยืนยันอีเมล
    if (!user.isVerified) {
      return res.status(403).json({
        error: "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ"
      });
    }

    // ✅ อัปเดตสถานะออนไลน์
    user.online = true;

    // upgrade password ถ้ายังไม่ bcrypt
    if (!user.password.startsWith("$2")) {
      user.password = await bcrypt.hash(password, 10);
      user.mustChangePassword = true;
    }

    await user.save();

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Login failed" });
  }
});


/* =========================
   GET /api/auth/verify/:token
========================= */
router.get("/verify/:token", async (req, res) => {
  try {
    const decoded = jwt.verify(
      req.params.token,
      process.env.JWT_SECRET
    );

    const user = await Employee.findById(decoded.id);
    if (!user) {
      return res.status(404).send("ไม่พบผู้ใช้");
    }

    if (user.isVerified) {
      return res.send("บัญชีนี้ยืนยันแล้ว");
    }

    user.isVerified = true;
    await user.save();

    res.send(`
      <h2>✅ ยืนยันอีเมลสำเร็จ</h2>
      <p>สามารถกลับไปเข้าสู่ระบบได้แล้ว</p>
    `);

  } catch (err) {
    console.error("VERIFY ERROR:", err);
    res.status(400).send("❌ ลิงก์ไม่ถูกต้องหรือหมดอายุ");
  }
});


/* =========================
   POST /api/auth/logout
========================= */
router.post("/logout", verifyToken, async (req, res) => {
  await Employee.findByIdAndUpdate(req.user.userId, {
    online: false
  });
  res.json({ message: "logout success" });
});


/* =========================
   POST /api/auth/change-password
========================= */
router.post("/change-password", verifyToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        message: "กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่"
      });
    }

    const user = await Employee.findById(req.user.userId);
    if (!user || user.active === false) {
      return res.status(404).json({
        message: "ไม่พบผู้ใช้"
      });
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
========================= */
router.post("/reset-admin", async (req, res) => {
  try {
    const { email, newPassword, secret } = req.body;

    if (secret !== process.env.ADMIN_RESET_SECRET) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await Employee.findOne({
      email,
      role: "admin"
    });

    if (!user) {
      return res.status(404).json({
        message: "Admin not found"
      });
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
router.post("/reset-password", async (req, res) => {
  try {

    const { token, newPassword } = req.body;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await Employee.findById(decoded.id);

    if (!user || user.resetToken !== token || user.resetTokenExpire < Date.now()) {
      return res.status(400).json({ message: "ลิงก์หมดอายุแล้ว" });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    user.password = hash;
    user.resetToken = null;
    user.resetTokenExpire = null;
    user.mustChangePassword = false;

    await user.save();

    res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });

  } catch (err) {
    res.status(400).json({ message: "Token ไม่ถูกต้องหรือหมดอายุ" });
  }
});

module.exports = router;
