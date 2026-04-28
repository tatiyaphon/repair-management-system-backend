const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Employee = require("../models/Employee");
const verifyToken = require("../middleware/auth");
const crypto = require("crypto");
const requireRole = require("../middleware/requireRole");

const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);


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
// ===============================
// POST /api/auth/reset-password/:token
// ===============================
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { password } = req.body;
    const { token } = req.params;

    if (!password) {
      return res.status(400).json({ message: "กรุณากรอกรหัสผ่านใหม่" });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "รหัสผ่านต้องอย่างน้อย 6 ตัว"
      });
    }

    const user = await Employee.findOne({
      resetToken: token,
      resetTokenExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: "ลิงก์หมดอายุหรือไม่ถูกต้อง"
      });
    }

    const hash = await bcrypt.hash(password, 10);

    user.password = hash;
    user.resetToken = undefined;
    user.resetTokenExpire = undefined;
    user.mustChangePassword = false;

    await user.save();

    res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });

  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ message: "ไม่สามารถรีเซ็ตได้" });
  }
});
console.log("🔥 FORGOT PASSWORD HIT");
router.post("/forgot-password", async (req, res) => {
  try {
    console.log("🔥 API CALLED /forgot-password");

    let { email } = req.body;

    if (!email) {
      console.log("❌ ไม่มี email");
      return res.status(400).json({ message: "กรุณากรอกอีเมล" });
    }

    email = email.trim().toLowerCase();

    console.log("📥 INPUT EMAIL:", email);

    const user = await Employee.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") }
    });

    console.log("👤 USER FOUND:", user ? user.email : "NOT FOUND");

    if (!user) {
      return res.status(404).json({ message: "ไม่พบผู้ใช้นี้" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    user.resetToken = resetToken;
    user.resetTokenExpire = Date.now() + 1000 * 60 * 30;

    await user.save();

    const resetLink =
      `${process.env.BASE_URL}/employee/reset_password.html?token=${resetToken}`;

    console.log("🔗 RESET LINK:", resetLink);
    console.log("📤 FROM:", process.env.EMAIL_USER);
    console.log("📥 TO:", user.email);
    console.log("🔑 API KEY:", process.env.SENDGRID_API_KEY ? "OK" : "MISSING");

    try {
      console.log("📨 SENDING EMAIL...");

      await sgMail.send({
        to: user.email,
        from: process.env.EMAIL_USER,
        subject: "รีเซ็ตรหัสผ่านร้านตุ้ยไอที",

        text: `รีเซ็ตรหัสผ่าน: ${resetLink}`,

        html: `
          <div style="font-family:sans-serif">
            <h2>รีเซ็ตรหัสผ่าน</h2>
            <p>คลิกด้านล่างเพื่อตั้งรหัสผ่านใหม่</p>

            <a href="${resetLink}"
              style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">
              ตั้งรหัสผ่านใหม่
            </a>

            <p style="margin-top:15px;">หรือใช้ลิงก์นี้:</p>
            <p>${resetLink}</p>
          </div>
        `
      });

      console.log("✅ EMAIL SENT SUCCESS");

    } catch (mailErr) {
  console.error("❌ EMAIL ERROR:", mailErr.response?.body || mailErr);

  return res.status(500).json({
    message: "ส่งอีเมลไม่สำเร็จ",
    error: mailErr.response?.body || mailErr.message
  });
}

    res.json({ message: "ส่งลิงก์รีเซ็ตแล้ว" });

  } catch (err) {
    console.error("🔥 FORGOT PASSWORD ERROR:", err);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
});
router.get("/monthly-report", verifyToken, requireRole("admin"), async (req,res) => {
  const data = await Job.aggregate([
    {
      $group: {
        _id: { $month: "$createdAt" },
        totalJobs: { $sum: 1 },
        totalIncome: { $sum: "$priceQuoted" }
      }
    }
  ]);

  res.json(data);
});

module.exports = router;
