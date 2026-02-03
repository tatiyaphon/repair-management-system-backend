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
    .select("_id firstName lastName email role active avatar");
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
  const { firstName, lastName, email, password, role } = req.body;

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
    password: hash,
    role,
    mustChangePassword: true
  });

  res.status(201).json({ message: "เพิ่มผู้ใช้สำเร็จ", user });
});



module.exports = router;
