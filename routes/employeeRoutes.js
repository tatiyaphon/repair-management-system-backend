const express = require("express");
const bcrypt = require("bcryptjs");
const path = require("path");
const Employee = require("../models/Employee");
const multer = require("multer");
const verifyToken = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const router = express.Router();

/* ==============================
   SMTP (แก้ให้ใช้ port 587)
============================== */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // 🔥 สำคัญ
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
      isVerified: false
    });

    /* ==========================
       ส่งเมลแบบไม่ทำให้ระบบล้ม
    ========================== */
    try {
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

      console.log("✅ Email sent successfully");

    } catch (mailErr) {
      console.error("❌ Email send failed:", mailErr.message);
      // 🔥 ไม่ throw error ให้ระบบล้ม
    }

    res.status(201).json({
      message: "เพิ่มผู้ใช้สำเร็จ",
      user
    });

  } catch (err) {
    console.error("CREATE EMPLOYEE ERROR:", err);
    res.status(500).json({ message: "เพิ่มผู้ใช้ไม่สำเร็จ" });
  }
});

/* =====================================
   DELETE EMPLOYEE
===================================== */
router.delete("/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    if (req.user.userId === req.params.id) {
      return res.status(400).json({ message: "ไม่สามารถลบตัวเองได้" });
    }

    await Employee.findByIdAndDelete(req.params.id);
    res.json({ message: "ลบผู้ใช้เรียบร้อยแล้ว" });

  } catch (err) {
    res.status(500).json({ message: "ลบผู้ใช้ไม่สำเร็จ" });
  }
});

module.exports = router;
