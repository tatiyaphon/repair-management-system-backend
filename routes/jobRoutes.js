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

    res.send(`<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>ใบรับเครื่องซ่อม</title>

<style>
@page {
  size: A4;
  margin: 15mm;
}

@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');

body{
 font-family:'Sarabun',sans-serif;
  margin: 0;
  padding: 0;
  background: #fff;
}

.container{
  width: 100%;
  min-height: calc(297mm - 30mm); /* A4 - margin บนล่าง */
  box-sizing: border-box;
  margin: 0 auto;
  padding: 20mm;
  background:#fff;
  /* แถบสีซ้าย */
  border-left: 8px solid #facc15;
}


/* ===== HEADER ===== */
.header{
  display:flex;
  justify-content:space-between;
  border-bottom:3px solid #f6c200;
  padding-bottom:18px;
}

.shop{
  display:flex;
  gap:16px;
  align-items:center;
}

.logo{
  width:80px;
  height:80px;
  border-radius:50%;
  border:3px solid #0f3c8a;
  object-fit:contain;
  background:#fff;
}

.shop h1{
  margin:0;
  font-size:22px;
  color:#0f3c8a;
}
.shop p{
  margin:2px 0;
  font-size:13px;
}

.doc{
  text-align:right;
}
.doc h2{
  margin:0;
  color:#0f3c8a;
}
.doc .no{
  color:#b91c1c;
  font-weight:700;
  margin-top:4px;
}

/* ===== INFO ===== */
.info{
  display:grid;
  grid-template-columns:2fr 1fr;
  gap:20px;
  margin-top:22px;
}

.box{
  border:1px solid #d1d5db;
  border-radius:8px;
  padding:14px 16px;
  background:#f9fafb;
}

.box h3{
  margin:0 0 10px;
  font-size:15px;
  color:#0f3c8a;
  border-bottom:1px solid #d1d5db;
  padding-bottom:6px;
}

.row{
  display:flex;
  font-size:14px;
  margin-bottom:6px;
}
.label{
  width:90px;
  font-weight:600;
}

.badge{
  background:#dcfce7;
  color:#047857;
  padding:4px 14px;
  border-radius:999px;
  font-size:13px;
  border:1px solid #10b981;
}

/* ===== TABLE ===== */
table{
  width:100%;
  border-collapse:collapse;
  margin-top:22px;
}
thead th{
  background:#0f3c8a;
  color:#fff;
  padding:12px;
  font-size:14px;
}
tbody td{
  padding:12px;
  border-bottom:1px solid #e5e7eb;
  font-size:14px;
}

/* ===== PRICE ===== */
.price-box{
  margin-top:18px;
  text-align:right;
  font-size:16px;
}
.price-box span{
  font-size:18px;
  color:#b91c1c;
  font-weight:700;
}

/* ===== TERMS ===== */
.terms{
  margin-top:22px;
  background:#fff7ed;
  border-left:5px solid #f6c200;
  padding:14px 16px;
  font-size:13px;
}

/* ===== SIGN ===== */
.sign{
  margin-top:60px;
  display:flex;
  justify-content:space-between;
  text-align:center;
}
.line{
  width:40%;
  border-top:1px solid #000;
  padding-top:6px;
  font-size:14px;
}

/* PRINT */
.print-btn{
  display:block;
  width:200px;
  margin:30px auto 0;
  padding:12px;
  background:#0f3c8a;
  color:#fff;
  text-align:center;
  border-radius:999px;
  cursor:pointer;
}
@media print {
  body{
    background:#fff;
  }

  .container{
    box-shadow: none;
    border-radius: 0;
  }

  .btn-print{
    display:none;
  }
}
</style>
</head>

<body>
<div class="container">

  <!-- HEADER -->
  <div class="header">
    <div class="shop">
      <img src="https://www.tui-it.org/customer/logo1.png" class="logo">
      <div>
        <h1>ร้านตุ้ยไอที โคราช</h1>
        <p>ศูนย์ซ่อมและจำหน่ายอุปกรณ์ไอทีครบวงจร</p>
        <p>โทร 080-4641677</p>
      </div>
    </div>

    <div class="doc">
      <h2>ใบรับเครื่องซ่อม</h2>
      <div class="no">No. ${job.receiptNumber}</div>
      <div>วันที่ ${new Date(job.receivedDate).toLocaleDateString("th-TH")}</div>
    </div>
  </div>

  <!-- INFO -->
  <div class="info">
    <div class="box">
      <h3>ข้อมูลลูกค้า</h3>
      <div class="row"><div class="label">ชื่อลูกค้า</div>${job.customerName}</div>
      <div class="row"><div class="label">เบอร์โทร</div>${job.customerPhone || "-"}</div>
      <div class="row"><div class="label">ที่อยู่</div>${job.customerAddress || "-"}</div>
    </div>

    <div class="box">
      <h3>สถานะงาน</h3>
      <div class="row">
        <div class="label">สถานะ</div>
        <span class="badge">${job.status}</span>
      </div>
    </div>
  </div>

  <!-- TABLE -->
  <table>
    <thead>
      <tr>
        <th width="10%">ลำดับ</th>
        <th width="50%">รายละเอียดอุปกรณ์</th>
        <th width="40%">อาการเสีย</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td><strong>${job.deviceType} ${job.deviceModel}</strong></td>
        <td>${job.symptom}</td>
      </tr>
    </tbody>
  </table>

  <!-- PRICE -->
  <div class="price-box">
    ราคาประเมินรวม :
    <span>${(job.priceQuoted ?? 0).toLocaleString()} บาท</span>
  </div>

  <!-- TERMS -->
  <div class="terms">
    <strong>เงื่อนไขการรับบริการ</strong><br>
    1. กรุณานำใบรับเครื่องมาแสดงเมื่อรับเครื่องคืน<br>
    2. ร้านไม่รับผิดชอบข้อมูลภายในเครื่อง<br>
    3. ไม่มารับเครื่องภายใน 90 วัน ร้านขอสงวนสิทธิ์
  </div>

  <!-- SIGN -->
  <div class="sign">
    <div class="line">ผู้ส่งเครื่องซ่อม<br>(${job.customerName})</div>
    <div class="line">ผู้รับเครื่อง<br>(ร้านตุ้ยไอที)</div>
  </div>

</div>

<div class="print-btn" onclick="window.print()">พิมพ์เอกสาร</div>
</body>
</html>`);
  } catch (err) {
    console.error(err);
    res.status(500).send("สร้างใบรับเครื่องไม่สำเร็จ");
  }
});

// 🔹 ดึงข้อมูลงานซ่อมตาม ID
router.get("/:id", async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate("assignedTo", "firstName lastName");

    if (!job) {
      return res.status(404).json({ message: "ไม่พบงานซ่อม" });
    }

    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ดึงข้อมูลงานไม่สำเร็จ" });
  }
});

module.exports = router;
