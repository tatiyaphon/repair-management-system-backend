const express = require("express");
const router = express.Router();
const Activity = require("../models/Activity");
const verifyToken = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");

/* =========================
   GET ALL ACTIVITY (ADMIN ONLY)
========================= */
router.get("/", verifyToken, requireRole("admin"), async (req, res) => {
  try {

    const logs = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    res.json(logs);

  } catch (err) {
    console.error("ACTIVITY FETCH ERROR:", err);
    res.status(500).json({ message: "โหลดข้อมูลไม่สำเร็จ" });
  }
});

/* =========================
   CREATE ACTIVITY (INTERNAL USE)
========================= */
router.post("/", verifyToken, async (req, res) => {
  try {

    const { action, detail, jobId } = req.body;

    if (!action) {
      return res.status(400).json({ message: "action จำเป็นต้องระบุ" });
    }

    const activity = await Activity.create({
      userId: req.user.userId,
      userName: req.user.userName || "Unknown",
      action,
      detail,
      jobId
    });

    res.json(activity);

  } catch (err) {
    console.error("ACTIVITY CREATE ERROR:", err);
    res.status(500).json({ message: "บันทึกไม่สำเร็จ" });
  }
});

module.exports = router;
