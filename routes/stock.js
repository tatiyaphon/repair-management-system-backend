const express = require("express");
const router = express.Router();
const Stock = require("../models/Stock");
const verifyToken = require("../middleware/auth");

/* ดึงทั้งหมด */
router.get("/", verifyToken, async (_req, res) => {
  res.json(await Stock.find());
});

/* เพิ่ม */
router.post("/", verifyToken, async (req, res) => {
  const item = await Stock.create(req.body);
  res.status(201).json(item);
});

/* แก้ไข */
router.put("/:id", verifyToken, async (req, res) => {
  const item = await Stock.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(item);
});

/* ลบ */
router.delete("/:id", verifyToken, async (req, res) => {
  await Stock.findByIdAndDelete(req.params.id);
  res.json({ message: "deleted" });
});

/* เบิก */
router.patch("/:id/withdraw", verifyToken, async (req, res) => {
  const { quantity, employeeName, jobRef } = req.body;

  const stock = await Stock.findById(req.params.id);
  if (!stock) return res.status(404).json({ message: "ไม่พบอะไหล่" });

  if (stock.quantity < quantity) {
    return res.status(400).json({ message: "จำนวนไม่พอ" });
  }

  stock.quantity -= quantity;

  stock.withdrawHistory.push({
    quantity,
    employeeName,
    jobRef
  });

  await stock.save();
  res.json({ message: "เบิกสำเร็จ", stock });
});


module.exports = router;
