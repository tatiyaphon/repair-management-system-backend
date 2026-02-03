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
    if (!job) return res.status(404).send("ไม่พบงานซ่อม");

    res.send(`
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>ใบรับเครื่องซ่อม</title>

<style>
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');

@page { size: A4; margin: 18mm; }

body{
  font-family:'Sarabun',sans-serif;
  background:#eef2f7;
  margin:0;
  padding:30px 0;
}

.container{
  width:210mm;
  min-height:297mm;
  margin:auto;
  background:#fff;
  padding:42px 48px;
  border-radius:10px;
  box-shadow:0 15px 35px rgba(0,0,0,.12);
  position:relative;
}

.container::before{
  content:"";
  position:absolute;
  top:0;left:0;
  width:12px;height:100%;
  background:linear-gradient(180deg,#0f3c8a,#f6c200);
  border-radius:10px 0 0 10px;
}

header{
  display:flex;
  justify-content:space-between;
  border-bottom:3px solid #f6c200;
  padding-bottom:18px;
  margin-bottom:28px;
}

.logo{
  display:flex;
  gap:16px;
}

.logo img{
  width:90px;height:90px;
  border-radius:50%;
  border:3px solid #0f3c8a;
}

.logo h1{margin:0;color:#0f3c8a}
.logo p{margin:4px 0;font-size:14px}

.doc{text-align:right}
.doc h2{margin:0;color:#0f3c8a}
.doc .no{color:#b91c1c;font-weight:700}

.info{
  display:grid;
  grid-template-columns:2fr 1fr;
  gap:24px;
}

.box{
  background:#f8fafc;
  border:1px solid #d1d5db;
  border-radius:8px;
  padding:16px;
}

.box h3{
  margin:0 0 10px;
  color:#0f3c8a;
  border-bottom:1px solid #d1d5db;
}

.row{display:flex;margin-bottom:6px}
.label{width:90px;font-weight:600}

.badge{
  background:#ecfdf5;
  color:#047857;
  padding:5px 14px;
  border-radius:999px;
  border:1px solid #10b981;
  font-size:13px;
}

table{
  width:100%;
  border-collapse:collapse;
  margin-top:20px;
}

thead th{
  background:#0f3c8a;
  color:#fff;
  padding:12px;
  text-align:left;
}

tbody td{
  padding:12px;
  border-bottom:1px solid #d1d5db;
}

.terms{
  margin-top:24px;
  background:#fff7ed;
  border-left:6px solid #f6c200;
  padding:16px;
  font-size:13px;
}

.sign{
  margin-top:60px;
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:80px;
  text-align:center;
}

.line{
  border-top:1px solid #000;
  margin-top:50px;
  padding-top:6px;
}

.print{
  margin:30px auto 0;
  display:block;
  width:200px;
  padding:12px;
  background:#0f3c8a;
  color:#fff;
  text-align:center;
  border-radius:999px;
  cursor:pointer;
}

@media print{
  .print{display:none}
  body{background:#fff}
  .container{box-shadow:none}
}
</style>
</head>

<body>
<div class="container">

<header>
  <div class="logo">
    <img src="/logo1.png">
    <div>
      <h1>ร้านตุ้ยไอที โคราช</h1>
      <p>ศูนย์ซ่อมและจำหน่ายอุปกรณ์ไอทีครบวงจร</p>
      <p>โทร 080-4641677</p>
    </div>
  </div>

  <div class="doc">
    <h2>ใบรับเครื่องซ่อม</h2>
    <div class="no">No. ${job.receiptNumber}</div>
    <p>วันที่ ${new Date(job.receivedDate).toLocaleDateString("th-TH")}</p>
  </div>
</header>

<div class="info">
  <div class="box">
    <h3>ข้อมูลลูกค้า</h3>
    <div class="row"><div class="label">ชื่อ</div>${job.customerName}</div>
    <div class="row"><div class="label">โทร</div>${job.customerPhone}</div>
    <div class="row"><div class="label">ที่อยู่</div>${job.customerAddress || "-"}</div>
  </div>

  <div class="box">
    <h3>สถานะงาน</h3>
    <span class="badge">${job.status}</span>
  </div>
</div>

<table>
<thead>
<tr>
  <th width="10%">ลำดับ</th>
  <th width="60%">อุปกรณ์</th>
  <th width="30%">อาการเสีย</th>
</tr>
</thead>
<tbody>
<tr>
  <td>1</td>
  <td>${job.deviceType} ${job.deviceModel}</td>
  <td>${job.symptom}</td>
</tr>
</tbody>
</table>

<div class="terms">
<b>เงื่อนไข</b><br>
1. กรุณานำใบรับเครื่องมาแสดงเมื่อรับเครื่องคืน<br>
2. รับประกันงานซ่อม 30 วัน<br>
3. ไม่รับเครื่องภายใน 90 วัน ร้านขอสงวนสิทธิ์
</div>

<div class="sign">
  <div class="line">ผู้ส่งเครื่อง<br>(${job.customerName})</div>
  <div class="line">ผู้รับเครื่อง<br>(ร้านตุ้ยไอที)</div>
</div>

</div>

<div class="print" onclick="window.print()">พิมพ์เอกสาร</div>
</body>
</html>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send("ไม่สามารถสร้างใบเสร็จได้");
  }
});


module.exports = router;
