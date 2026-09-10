const express = require("express");
const router = express.Router();

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const Employee = require("../models/Employee");
const Job = require("../models/Job");

const verifyToken = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");

const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);


// =====================================================
// POST /api/auth/login
// =====================================================

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

    // =================================================
    // อนุญาตเฉพาะ staff และ tech
    // =================================================

    if (!["staff", "tech"].includes(user.role)) {
      return res.status(403).json({
        error: "บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานระบบ"
      });
    }

    // =================================================
    // ตรวจสอบ Password
    // =================================================

    const isMatch = user.password.startsWith("$2")
      ? await bcrypt.compare(password, user.password)
      : password === user.password;

    if (!isMatch) {
      return res.status(401).json({
        error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
      });
    }

    // =================================================
    // ต้องยืนยัน Email ก่อน
    // =================================================

    if (!user.isVerified) {
      return res.status(403).json({
        error: "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ"
      });
    }

    // =================================================
    // Online
    // =================================================

    user.online = true;

    // =================================================
    // Upgrade password เก่าเป็น bcrypt
    // =================================================

    if (!user.password.startsWith("$2")) {
      user.password = await bcrypt.hash(password, 10);
      user.mustChangePassword = true;
    }

    await user.save();

    // =================================================
    // JWT
    // =================================================

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d"
      }
    );

    // =================================================
    // Response
    // =================================================

    res.json({
      message: "เข้าสู่ระบบสำเร็จ",

      token,

      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatar: user.avatar,
        mustChangePassword: user.mustChangePassword
      }
    });

  } catch (err) {

    console.error("LOGIN ERROR:", err);

    res.status(500).json({
      error: "Login failed"
    });
  }
});


// =====================================================
// GET /api/auth/verify/:token
// =====================================================

router.get("/verify/:token", async (req, res) => {
  try {

    const decoded = jwt.verify(
      req.params.token,
      process.env.JWT_SECRET
    );

    // สำคัญ:
    // ตอนสร้าง JWT ใช้ userId ไม่ใช่ id
    const user = await Employee.findById(decoded.userId);

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

    res.status(400).send(
      "❌ ลิงก์ไม่ถูกต้องหรือหมดอายุ"
    );
  }
});


// =====================================================
// POST /api/auth/logout
// =====================================================

router.post("/logout", verifyToken, async (req, res) => {
  try {

    await Employee.findByIdAndUpdate(
      req.user.userId,
      {
        online: false
      }
    );

    res.json({
      message: "logout success"
    });

  } catch (err) {

    console.error("LOGOUT ERROR:", err);

    res.status(500).json({
      message: "Logout failed"
    });
  }
});


// =====================================================
// POST /api/auth/change-password
// =====================================================

router.post(
  "/change-password",
  verifyToken,
  async (req, res) => {

    try {

      const {
        oldPassword,
        newPassword
      } = req.body;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          message:
            "กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่"
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          message:
            "รหัสผ่านใหม่ต้องอย่างน้อย 6 ตัว"
        });
      }

      const user = await Employee.findById(
        req.user.userId
      );

      if (!user || user.active === false) {
        return res.status(404).json({
          message: "ไม่พบผู้ใช้"
        });
      }

      // =================================================
      // ตรวจสอบรหัสผ่านเดิม
      // =================================================

      let isMatch = false;

      if (user.password.startsWith("$2")) {

        isMatch = await bcrypt.compare(
          oldPassword,
          user.password
        );

      } else {

        // รองรับ password เก่า
        isMatch = oldPassword === user.password;
      }

      if (!isMatch) {
        return res.status(400).json({
          message: "รหัสผ่านเดิมไม่ถูกต้อง"
        });
      }

      // =================================================
      // บันทึก password ใหม่เป็น bcrypt
      // =================================================

      user.password = await bcrypt.hash(
        newPassword,
        10
      );

      user.mustChangePassword = false;

      await user.save();

      res.json({
        message: "เปลี่ยนรหัสผ่านสำเร็จ"
      });

    } catch (err) {

      console.error(
        "CHANGE PASSWORD ERROR:",
        err
      );

      res.status(500).json({
        message:
          "ไม่สามารถเปลี่ยนรหัสผ่านได้"
      });
    }
  }
);


// =====================================================
// POST /api/auth/reset-password/:token
// =====================================================

router.post(
  "/reset-password/:token",
  async (req, res) => {

    try {

      const {
        password
      } = req.body;

      const {
        token
      } = req.params;

      if (!password) {
        return res.status(400).json({
          message:
            "กรุณากรอกรหัสผ่านใหม่"
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          message:
            "รหัสผ่านต้องอย่างน้อย 6 ตัว"
        });
      }

      const user = await Employee.findOne({
        resetToken: token,
        resetTokenExpire: {
          $gt: Date.now()
        }
      });

      if (!user) {
        return res.status(400).json({
          message:
            "ลิงก์หมดอายุหรือไม่ถูกต้อง"
        });
      }

      user.password = await bcrypt.hash(
        password,
        10
      );

      user.resetToken = undefined;
      user.resetTokenExpire = undefined;
      user.mustChangePassword = false;

      await user.save();

      res.json({
        message:
          "เปลี่ยนรหัสผ่านสำเร็จ"
      });

    } catch (err) {

      console.error(
        "RESET PASSWORD ERROR:",
        err
      );

      res.status(500).json({
        message:
          "ไม่สามารถรีเซ็ตได้"
      });
    }
  }
);


// =====================================================
// POST /api/auth/forgot-password
// =====================================================

router.post(
  "/forgot-password",
  async (req, res) => {

    try {

      let { email } = req.body;

      if (!email) {
        return res.status(400).json({
          message: "กรุณากรอกอีเมล"
        });
      }

      email = email
        .trim()
        .toLowerCase();

      const user = await Employee.findOne({
        email
      });

      if (!user) {
        return res.status(404).json({
          message: "ไม่พบผู้ใช้นี้"
        });
      }

      if (user.active === false) {
        return res.status(403).json({
          message:
            "บัญชีนี้ถูกปิดการใช้งาน"
        });
      }

      // =================================================
      // สร้าง Reset Token
      // =================================================

      const resetToken =
        crypto.randomBytes(32).toString("hex");

      user.resetToken = resetToken;

      user.resetTokenExpire =
        Date.now() + 1000 * 60 * 30;

      await user.save();

      // =================================================
      // Reset Link
      // =================================================

      const resetLink =
        `${process.env.BASE_URL}/employee/reset_password.html?token=${resetToken}`;

      console.log(
        "RESET PASSWORD REQUEST:",
        user.email
      );

      // =================================================
      // ส่ง Email
      // =================================================

      try {

        const result =
          await resend.emails.send({

            from:
              `ร้านตุ้ยไอที <${process.env.EMAIL_FROM}>`,

            to: user.email,

            subject:
              "รีเซ็ตรหัสผ่านร้านตุ้ยไอที",

            html: `
              <div style="font-family:sans-serif">

                <h2>รีเซ็ตรหัสผ่าน</h2>

                <p>
                  คลิกปุ่มด้านล่าง
                  เพื่อตั้งรหัสผ่านใหม่
                </p>

                <a
                  href="${resetLink}"
                  style="
                    display:inline-block;
                    padding:10px 20px;
                    background:#2563eb;
                    color:#fff;
                    text-decoration:none;
                    border-radius:6px;
                  "
                >
                  ตั้งรหัสผ่านใหม่
                </a>

                <p>
                  หรือคัดลอกลิงก์นี้
                </p>

                <p>
                  ${resetLink}
                </p>

                <p>
                  ลิงก์นี้มีอายุ 30 นาที
                </p>

              </div>
            `
          });

        console.log(
          "RESET EMAIL SENT:",
          result
        );

      } catch (err) {

        console.error(
          "RESEND ERROR:",
          err
        );

        return res.status(500).json({
          message:
            "ส่งอีเมลไม่สำเร็จ"
        });
      }

      res.json({
        message:
          "ส่งลิงก์รีเซ็ตแล้ว"
      });

    } catch (err) {

      console.error(
        "FORGOT PASSWORD ERROR:",
        err
      );

      res.status(500).json({
        message:
          "เกิดข้อผิดพลาด"
      });
    }
  }
);


// =====================================================
// GET /api/auth/monthly-report
// Staff เท่านั้น
// =====================================================

router.get(
  "/monthly-report",
  verifyToken,
  requireRole("staff"),
  async (req, res) => {

    try {

      const data =
        await Job.aggregate([

          {
            $group: {

              _id: {
                $month: "$createdAt"
              },

              totalJobs: {
                $sum: 1
              },

              totalIncome: {
                $sum: "$priceQuoted"
              }

            }
          }

        ]);

      res.json(data);

    } catch (err) {

      console.error(
        "MONTHLY REPORT ERROR:",
        err
      );

      res.status(500).json({
        message:
          "โหลดรายงานไม่สำเร็จ"
      });
    }
  }
);


module.exports = router;