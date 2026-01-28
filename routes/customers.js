const express = require("express");
const router = express.Router();
const Customer = require("../models/Customer");

const verifyToken = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");

/* ดูลูกค้าทั้งหมด (admin เท่านั้น) */
router.get("/", verifyToken, requireRole("admin"), async (_req, res) => {
  const customers = await Customer.find().sort({ createdAt: -1 });
  res.json(customers);
});

/* เพิ่มลูกค้า */
router.post("/", verifyToken, async (req, res) => {
  const customer = await Customer.create(req.body);
  res.status(201).json(customer);
});

module.exports = router;
