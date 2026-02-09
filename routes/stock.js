const express = require("express");
const router = express.Router();
const Stock = require("../models/Stock");
const verifyToken = require("../middleware/auth");

/* ดึงทั้งหมด */
router.get("/", verifyToken, async (_req, res) => {
  res.set("Cache-Control", "no-store"); // 🔥 กัน cache
  res.json(await Stock.find());
});

/* เพิ่ม */
router.post("/", verifyToken, async (req, res) => {
  const item = await Stock.create(req.body);
  res.status(201).json(item);
});

/* แก้ไข */
router.put("/:id", verifyToken, async (req, res) => {
  const item = await Stock.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(item);
});

/* ลบ */
router.delete("/:id", verifyToken, async (req, res) => {
  await Stock.findByIdAndDelete(req.params.id);
  res.json({ message: "deleted" });
});

/* ✅ เบิกอะไหล่ (ตัวเดียว ใช้งานจริง) */
router.patch("/:id/withdraw", verifyToken, async (req, res) => {
  try {
    console.log("🔥 withdraw route hit", req.params.id);

    const { quantity, employeeName, jobRef } = req.body;

    const stock = await Stock.findById(req.params.id);
    if (!stock) {
      return res.status(404).json({ message: "ไม่พบอะไหล่" });
    }

    if (quantity <= 0 || quantity > stock.quantity) {
      return res.status(400).json({ message: "จำนวนเบิกไม่ถูกต้อง" });
    }

    // 🔻 ตัดสต็อก
    stock.quantity -= quantity;

    // 📝 บันทึกประวัติการเบิก
    stock.withdrawHistory.push({
      quantity,
      employeeName,
      jobRef: jobRef || "-",
      withdrawnAt: new Date()
    });

    await stock.save();

    res.json({
      message: "เบิกสำเร็จ",
      quantityLeft: stock.quantity
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "เกิดข้อผิดพลาด" });
  }
});

module.exports = router;
