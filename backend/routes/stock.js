const express = require("express");
const router = express.Router();
const Stock = require("../models/Stock");
const verifyToken = require("../middleware/auth");

/* ดึงทั้งหมด */
router.get("/", verifyToken, async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store"); // กัน cache
    const stocks = await Stock.find();
    res.json(stocks);
  } catch (err) {
    console.error("GET /api/stocks ERROR:", err);
    res.status(500).json({ message: "โหลดข้อมูลสต็อกไม่สำเร็จ" });
  }
});

/* เพิ่ม */
router.post("/", verifyToken, async (req, res) => {
  try {
    const item = await Stock.create(req.body);
    res.status(201).json(item);
  } catch (err) {
    console.error("POST /api/stocks ERROR:", err);

    // FIX: เดิมไม่มี try-catch เลย ถ้าข้อมูลผิด schema (เช่น ลืมกรอก stockCode
    // ที่เป็น required, หรือ stockCode ซ้ำเพราะตั้ง unique ไว้)
    // จะหลุดไปเป็น generic 500 error ไม่รู้สาเหตุจริง
    if (err.code === 11000) {
      return res.status(400).json({ message: "รหัสสินค้า (stockCode) นี้มีอยู่แล้ว" });
    }
    if (err.name === "ValidationError") {
      return res.status(400).json({
        message: "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
        error: err.message
      });
    }
    res.status(500).json({ message: "เพิ่มสินค้าเข้าสู่คลังไม่สำเร็จ" });
  }
});

/* แก้ไข */
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const item = await Stock.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({ message: "ไม่พบสินค้านี้" });
    }

    res.json(item);
  } catch (err) {
    console.error("PUT /api/stocks/:id ERROR:", err);
    if (err.code === 11000) {
      return res.status(400).json({ message: "รหัสสินค้า (stockCode) นี้มีอยู่แล้ว" });
    }
    if (err.name === "ValidationError") {
      return res.status(400).json({
        message: "ข้อมูลไม่ถูกต้อง",
        error: err.message
      });
    }
    res.status(500).json({ message: "แก้ไขสินค้าไม่สำเร็จ" });
  }
});

/* ลบ */
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const deleted = await Stock.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "ไม่พบสินค้านี้" });
    }

    res.json({ message: "ลบสินค้าออกจากคลังสำเร็จ" });
  } catch (err) {
    console.error("DELETE /api/stocks/:id ERROR:", err);
    res.status(500).json({ message: "ลบสินค้าไม่สำเร็จ" });
  }
});

/* เบิกอะไหล่ */
// FIX: เดิมมี route เบิกอะไหล่ซ้ำกันสองอัน (path /stocks/:id/withdraw ที่จะกลาย
// เป็น /api/stocks/stocks/:id/withdraw ผิดด้วย) โค้ดเหมือนกันเป๊ะ เหลือไว้ตัวเดียว
router.patch("/:id/withdraw", verifyToken, async (req, res) => {
  try {
    const { quantity, employeeName, jobRef, withdrawnAt } = req.body;

    const stock = await Stock.findById(req.params.id);
    if (!stock) {
      return res.status(404).json({ message: "ไม่พบอะไหล่" });
    }

    if (!quantity || quantity <= 0 || quantity > stock.quantity) {
      return res.status(400).json({ message: "จำนวนเบิกไม่ถูกต้อง" });
    }

    if (!employeeName) {
      return res.status(400).json({ message: "กรุณาระบุชื่อผู้เบิก" });
    }

    // ตัดสต็อก
    stock.quantity -= quantity;

    // บันทึกประวัติการเบิก
    stock.withdrawHistory.push({
      quantity,
      employeeName,
      jobRef: jobRef || "-",
      // FIX: รองรับ withdrawnAt ที่ frontend ส่งมา (เลือกวันที่ย้อนหลังได้)
      // เดิม hardcode new Date() เสมอ ทำให้ฟิลด์เลือกวันที่ใน UI ไม่มีผลอะไรเลย
      withdrawnAt: withdrawnAt ? new Date(withdrawnAt) : new Date()
    });

    await stock.save();

    res.json({
      message: "เบิกสำเร็จ",
      quantityLeft: stock.quantity
    });

  } catch (err) {
    console.error("PATCH /api/stocks/:id/withdraw ERROR:", err);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
});

module.exports = router;