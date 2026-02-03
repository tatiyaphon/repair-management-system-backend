const express = require("express");
const router = express.Router();
const Job = require("../models/Job");
const auth = require("../middleware/auth");
const puppeteer = require("puppeteer");


console.log("✅ jobRoutes loaded");

/* ==================================================
   GET /api/jobs/receipt/:receiptNumber
   ลูกค้าเช็คสถานะงานซ่อม (ไม่ต้อง login)
================================================== */
router.get("/receipt/:receiptNumber", async (req, res) => {
  try {
    const job = await Job.findOne({
      receiptNumber: req.params.receiptNumber
    });

    if (!job) {
      return res.status(404).json({ message: "ไม่พบงานซ่อม" });
    }

    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ==================================================
   GET /api/jobs (พนักงาน / แอดมิน)
================================================== */
router.get("/", auth, async (req, res) => {
  try {
    const query =
      req.user.role === "admin"
        ? {}
        : { createdBy: req.user.id };

    const jobs = await Job.find(query)
      .populate("createdBy", "firstName lastName role")
      .populate("assignedTo", "firstName lastName")
      .sort({ createdAt: -1 });

    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "โหลดข้อมูลงานซ่อมไม่สำเร็จ" });
  }
});

/* ==================================================
   GET /api/jobs/my
================================================== */
router.get("/my", auth, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === "tech") {
      query = {
        $or: [
          { assignedTo: req.user.id },
          { assignedTo: null }
        ]
      };
    } else {
      query = { createdBy: req.user.id };
    }

    const jobs = await Job.find(query)
      .populate("assignedTo", "firstName lastName")
      .sort({ createdAt: -1 });

    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "โหลดงานของฉันไม่สำเร็จ" });
  }
});

/* ==================================================
   POST /api/jobs
   รับเครื่องใหม่
================================================== */
router.post("/", auth, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      customerName,
      customerPhone,
      customerAddress,
      receiptNumber,
      deviceType,
      deviceModel,
      symptom,
      accessory,
      priceQuoted,
      assignedTo
    } = req.body;

    if (!customerName || !receiptNumber || !deviceType || !deviceModel || !symptom) {
      return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    const exists = await Job.findOne({ receiptNumber });
    if (exists) {
      return res.status(409).json({ message: "เลขใบรับนี้ถูกใช้แล้ว" });
    }

    const job = await Job.create({
      customerName,
      customerPhone,
      customerAddress,
      receiptNumber,
      deviceType,
      deviceModel,
      symptom,
      accessory,
      priceQuoted: Number(priceQuoted) || 0,
      status: "รับเครื่อง",
      receivedDate: new Date(),
      createdBy: req.user.id,
      assignedTo: assignedTo || null
    });

    res.status(201).json({ message: "รับเครื่องสำเร็จ", job });

  } catch (err) {
    console.error("POST /api/jobs ERROR =", err);
    res.status(500).json({ message: "บันทึกงานซ่อมไม่สำเร็จ" });
  }
});

/* ==================================================
   PUT /api/jobs/:id/complete
================================================== */
router.put("/:id/complete", auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "ไม่พบงานซ่อม" });

    job.status = "ซ่อมเสร็จ";
    job.finishDate = new Date();
    await job.save();

    res.json({ message: "ปิดงานเรียบร้อย", job });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ไม่สามารถปิดงานได้" });
  }
});

/* ==================================================
   GET /api/jobs/:id/receipt
   สร้าง PDF ใบรับเครื่อง (Render ใช้ได้)
================================================== */
router.get("/:id/receipt", async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).send("ไม่พบงานซ่อม");
    }

    res.send(`
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>ใบรับเครื่องซ่อม</title>
<style>
  body { font-family: Sarabun, sans-serif; padding:40px }
  h1 { color:#0f3c8a }
  .box { margin-bottom:12px }
</style>
</head>
<body onload="window.print()">

<h1>ใบรับเครื่องซ่อม</h1>

<div class="box"><b>เลขใบรับ:</b> ${job.receiptNumber}</div>
<div class="box"><b>ลูกค้า:</b> ${job.customerName}</div>
<div class="box"><b>เบอร์:</b> ${job.customerPhone}</div>
<div class="box"><b>ที่อยู่:</b> ${job.customerAddress || "-"}</div>

<hr>

<div class="box"><b>อุปกรณ์:</b> ${job.deviceType} ${job.deviceModel}</div>
<div class="box"><b>อาการ:</b> ${job.symptom}</div>
<div class="box"><b>สถานะ:</b> ${job.status}</div>

</body>
</html>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send("ไม่สามารถสร้างใบเสร็จได้");
  }
});


module.exports = router;
