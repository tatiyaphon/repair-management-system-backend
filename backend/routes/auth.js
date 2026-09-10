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

    // -------------------------------------------------
    // ตรวจสอบข้อมูล
    // -------------------------------------------------

    if (!email || !password) {
      return res.status(400).json({
        error: "Email และ password จำเป็นต้องกรอก"
      });
    }

    email = email.trim().toLowerCase();

    // -------------------------------------------------
    // ค้นหาผู้ใช้
    // -------------------------------------------------

    const user = await Employee.findOne({ email });

    if (!user || user.active === false) {
      return res.status(401).json({
        error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
      });
    }

    // -------------------------------------------------
    // อนุญาตเฉพาะ Staff และ Tech
    // -------------------------------------------------

    if (!["staff", "tech"].includes(user.role)) {
      return res.status(403).json({
        error: "บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานระบบ"
      });
    }

    // -------------------------------------------------
    // ตรวจสอบ Password
    // -------------------------------------------------

    let isMatch = false;

    if (user.password.startsWith("$2")) {
      // Password เป็น bcrypt แล้ว
      isMatch = await bcrypt.compare(
        password,
        user.password
      );
    } else {
      // รองรับ password เก่าที่เป็น plaintext
      isMatch = password === user.password;
    }

    if (!isMatch) {
      return res.status(401).json({
        error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
      });
    }

    // -------------------------------------------------
    // ตรวจสอบการยืนยัน Email
    // -------------------------------------------------

    if (!user.isVerified) {
      return res.status(403).json({
        error: "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ"
      });
    }

    // -------------------------------------------------
    // ตั้งสถานะ Online
    // -------------------------------------------------

    user.online = true;

    // -------------------------------------------------
    // ถ้า Password เดิมยังไม่เป็น bcrypt
    // ให้แปลงเป็น bcrypt อัตโนมัติ
    //
    // สำคัญ:
    // ไม่บังคับให้ผู้ใช้เปลี่ยน Password
    // -------------------------------------------------

    if (!user.password.startsWith("$2")) {
      user.password = await bcrypt.hash(
        password,
        10
      );
    }

    // -------------------------------------------------
    // ไม่บังคับเปลี่ยน Password
    //
    // ช่างสามารถใช้รหัสที่ Staff ให้มา Login ได้เลย
    // และสามารถเปลี่ยนเองภายหลังจากเมนูเปลี่ยนรหัสผ่าน
    // -------------------------------------------------

    user.mustChangePassword = false;

    await user.save();

    // -------------------------------------------------
    // สร้าง JWT
    // -------------------------------------------------

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

    // -------------------------------------------------
    // ส่งข้อมูลกลับ
    // -------------------------------------------------

    return res.json({
      message: "เข้าสู่ระบบสำเร็จ",

      token,

      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatar: user.avatar,
        mustChangePassword: false
      }
    });

  } catch (err) {

    console.error("LOGIN ERROR:", err);

    return res.status(500).json({
      error: "Login failed"
    });
  }
});


// =====================================================
// GET /api/auth/verify/:token
// ยืนยัน Email
// =====================================================

router.get("/verify/:token", async (req, res) => {
  try {

    const decoded = jwt.verify(
      req.params.token,
      process.env.JWT_SECRET
    );

    // รองรับทั้ง userId และ id
    const userId = decoded.userId || decoded.id;

    const user = await Employee.findById(userId);

    if (!user) {
      return res.status(404).send(
        "ไม่พบผู้ใช้"
      );
    }

    // -------------------------------------------------
    // ถ้ายืนยันแล้ว
    // -------------------------------------------------

    if (user.isVerified) {
      return res.send(`
        <!DOCTYPE html>
        <html lang="th">
        <head>
          <meta charset="UTF-8">
          <title>ยืนยันอีเมล</title>
        </head>
        <body>
          <h2>✅ บัญชีนี้ยืนยันอีเมลแล้ว</h2>
          <p>สามารถกลับไปเข้าสู่ระบบได้</p>
        </body>
        </html>
      `);
    }

    // -------------------------------------------------
    // ยืนยัน Email
    // -------------------------------------------------

    user.isVerified = true;

    await user.save();

    return res.send(`
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="UTF-8">
        <title>ยืนยันอีเมลสำเร็จ</title>
      </head>
      <body>
        <h2>✅ ยืนยันอีเมลสำเร็จ</h2>
        <p>สามารถกลับไปเข้าสู่ระบบได้แล้ว</p>
      </body>
      </html>
    `);

  } catch (err) {

    console.error("VERIFY ERROR:", err);

    return res.status(400).send(
      "❌ ลิงก์ไม่ถูกต้องหรือหมดอายุ"
    );
  }
});


// =====================================================
// POST /api/auth/logout
// =====================================================

router.post(
  "/logout",
  verifyToken,
  async (req, res) => {

    try {

      await Employee.findByIdAndUpdate(
        req.user.userId,
        {
          online: false
        }
      );

      return res.json({
        message: "logout success"
      });

    } catch (err) {

      console.error(
        "LOGOUT ERROR:",
        err
      );

      return res.status(500).json({
        message: "Logout failed"
      });
    }
  }
);


// =====================================================
// POST /api/auth/change-password
// เปลี่ยนรหัสผ่านด้วยตัวเอง
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

      // -------------------------------------------------
      // ตรวจสอบข้อมูล
      // -------------------------------------------------

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          message:
            "กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่"
        });
      }

      // -------------------------------------------------
      // Password ใหม่อย่างน้อย 6 ตัว
      // -------------------------------------------------

      if (newPassword.length < 6) {
        return res.status(400).json({
          message:
            "รหัสผ่านใหม่ต้องอย่างน้อย 6 ตัว"
        });
      }

      // -------------------------------------------------
      // ค้นหาผู้ใช้
      // -------------------------------------------------

      const user = await Employee.findById(
        req.user.userId
      );

      if (!user || user.active === false) {
        return res.status(404).json({
          message: "ไม่พบผู้ใช้"
        });
      }

      // -------------------------------------------------
      // ตรวจสอบ Password เดิม
      // -------------------------------------------------

      let isMatch = false;

      if (user.password.startsWith("$2")) {

        isMatch = await bcrypt.compare(
          oldPassword,
          user.password
        );

      } else {

        // รองรับ password เก่า
        isMatch =
          oldPassword === user.password;
      }

      if (!isMatch) {
        return res.status(400).json({
          message:
            "รหัสผ่านเดิมไม่ถูกต้อง"
        });
      }

      // -------------------------------------------------
      // Hash Password ใหม่
      // -------------------------------------------------

      user.password = await bcrypt.hash(
        newPassword,
        10
      );

      // ไม่บังคับเปลี่ยนอีก
      user.mustChangePassword = false;

      await user.save();

      return res.json({
        message:
          "เปลี่ยนรหัสผ่านสำเร็จ"
      });

    } catch (err) {

      console.error(
        "CHANGE PASSWORD ERROR:",
        err
      );

      return res.status(500).json({
        message:
          "ไม่สามารถเปลี่ยนรหัสผ่านได้"
      });
    }
  }
);


// =====================================================
// POST /api/auth/reset-password/:token
// รีเซ็ตรหัสผ่านจาก Email
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

      // -------------------------------------------------
      // ตรวจสอบ Password
      // -------------------------------------------------

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

      // -------------------------------------------------
      // ตรวจสอบ Reset Token
      // -------------------------------------------------

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

      // -------------------------------------------------
      // เปลี่ยน Password
      // -------------------------------------------------

      user.password = await bcrypt.hash(
        password,
        10
      );

      // -------------------------------------------------
      // ล้าง Reset Token
      // -------------------------------------------------

      user.resetToken = undefined;
      user.resetTokenExpire = undefined;

      // ไม่บังคับเปลี่ยนหลัง Reset
      user.mustChangePassword = false;

      await user.save();

      return res.json({
        message:
          "เปลี่ยนรหัสผ่านสำเร็จ"
      });

    } catch (err) {

      console.error(
        "RESET PASSWORD ERROR:",
        err
      );

      return res.status(500).json({
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

      // -------------------------------------------------
      // ตรวจสอบ Email
      // -------------------------------------------------

      if (!email) {
        return res.status(400).json({
          message:
            "กรุณากรอกอีเมล"
        });
      }

      email = email
        .trim()
        .toLowerCase();

      // -------------------------------------------------
      // ค้นหา User
      // -------------------------------------------------

      const user = await Employee.findOne({
        email
      });

      if (!user) {
        return res.status(404).json({
          message:
            "ไม่พบผู้ใช้นี้"
        });
      }

      // -------------------------------------------------
      // ตรวจสอบบัญชี
      // -------------------------------------------------

      if (user.active === false) {
        return res.status(403).json({
          message:
            "บัญชีนี้ถูกปิดการใช้งาน"
        });
      }

      // -------------------------------------------------
      // สร้าง Reset Token
      // -------------------------------------------------

      const resetToken =
        crypto
          .randomBytes(32)
          .toString("hex");

      user.resetToken = resetToken;

      // Token อายุ 30 นาที
      user.resetTokenExpire =
        Date.now() +
        1000 * 60 * 30;

      await user.save();

      // -------------------------------------------------
      // สร้าง Reset Link
      // -------------------------------------------------

      const resetLink =
        `${process.env.BASE_URL}/employee/reset_password.html?token=${resetToken}`;

      console.log(
        "RESET PASSWORD REQUEST:",
        user.email
      );

      // -------------------------------------------------
      // ส่ง Email
      // -------------------------------------------------

      try {

        const result =
          await resend.emails.send({

            from:
              `ร้านตุ้ยไอที <${process.env.EMAIL_FROM}>`,

            to:
              user.email,

            subject:
              "รีเซ็ตรหัสผ่านร้านตุ้ยไอที",

            html: `
              <div
                style="
                  font-family:sans-serif;
                  max-width:600px;
                  margin:auto;
                "
              >

                <h2>
                  รีเซ็ตรหัสผ่าน
                </h2>

                <p>
                  คลิกปุ่มด้านล่าง
                  เพื่อตั้งรหัสผ่านใหม่
                </p>

                <p>

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

                </p>

                <p>
                  หรือคัดลอกลิงก์นี้:
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

      // -------------------------------------------------
      // สำเร็จ
      // -------------------------------------------------

      return res.json({
        message:
          "ส่งลิงก์รีเซ็ตแล้ว"
      });

    } catch (err) {

      console.error(
        "FORGOT PASSWORD ERROR:",
        err
      );

      return res.status(500).json({
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

      return res.json(data);

    } catch (err) {

      console.error(
        "MONTHLY REPORT ERROR:",
        err
      );

      return res.status(500).json({
        message:
          "โหลดรายงานไม่สำเร็จ"
      });
    }
  }
);


// =====================================================
// EXPORT
// =====================================================

module.exports = router;