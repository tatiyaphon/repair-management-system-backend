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
  const { quantity } = req.body;
  const item = await Stock.findById(req.params.id);

  if (!item || item.quantity < quantity) {
    return res.status(400).json({ message: "จำนวนไม่พอ" });
  }

  item.quantity -= quantity;
  await item.save();
  res.json(item);
});

module.exports = router;
