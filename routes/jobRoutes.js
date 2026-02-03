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
      return res.status(404).json({ message: "ไม่พบงานซ่อม" });
    }

    const html = `
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>ใบรับเครื่องซ่อม</title>

<style>
@page { size: A4; margin: 18mm; }

body{
  font-family: "Sarabun","Tahoma",sans-serif;
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
  top:0; left:0;
  width:10px; height:100%;
  background:#f6c200;
}

header{
  display:flex;
  justify-content:space-between;
  border-bottom:3px solid #f6c200;
  padding-bottom:18px;
}

.shop h1{margin:0;color:#0f3c8a;}
.shop p{margin:4px 0;font-size:14px;}

.doc{text-align:right;}
.doc .no{color:#b91c1c;font-weight:700;font-size:18px;}

.info{
  display:grid;
  grid-template-columns:2fr 1fr;
  gap:30px;
  margin-top:28px;
}

.box{
  background:#f8fafc;
  padding:18px;
  border-radius:8px;
  border:1px solid #d1d5db;
}

.box h3{
  margin:0 0 10px;
  color:#0f3c8a;
  border-bottom:1px solid #d1d5db;
  padding-bottom:6px;
}

.row{
  display:flex;
  margin-bottom:8px;
  font-size:15px;
}

.label{
  width:110px;
  font-weight:600;
}

.badge{
  background:#ecfdf5;
  color:#047857;
  padding:4px 14px;
  border-radius:999px;
  border:1px solid #10b981;
  font-weight:600;
}

table{
  width:100%;
  border-collapse:collapse;
  margin-top:28px;
}

thead th{
  background:#0f3c8a;
  color:#fff;
  padding:12px;
}

tbody td{
  padding:12px;
  border-bottom:1px solid #d1d5db;
}

.total{
  margin-top:20px;
  text-align:right;
  font-size:18px;
  font-weight:700;
}

.total span{color:#b91c1c;}

.terms{
  margin-top:28px;
  background:#fff7ed;
  border-left:6px solid #f6c200;
  padding:16px;
  font-size:13px;
}

.sign{
  margin-top:60px;
  display:flex;
  justify-content:space-between;
  text-align:center;
}

.line{
  width:40%;
  border-top:1px solid #000;
  padding-top:8px;
}
</style>
</head>

<body>
<div class="container">

<header>
  <div class="shop">
    <h1>ร้านตุ้ยไอที โคราช</h1>
    <p>ศูนย์ซ่อมและจำหน่ายอุปกรณ์ไอทีครบวงจร</p>
    <p>โทร 080-4641677</p>
  </div>
  <div class="doc">
    <div class="no">No. ${job.receiptNumber}</div>
    <div>วันที่ ${new Date(job.receivedDate).toLocaleDateString("th-TH")}</div>
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
    <div class="row">
      <div class="label">สถานะ</div>
      <span class="badge">${job.status}</span>
    </div>
    <div class="row">
      <div class="label">ราคา</div>
      <div style="font-weight:700;color:#b91c1c">
        ${job.priceQuoted?.toLocaleString() || "0"} บาท
      </div>
    </div>
  </div>
</div>

<table>
<thead>
<tr>
  <th width="10%">ลำดับ</th>
  <th width="45%">อุปกรณ์</th>
  <th width="25%">อาการเสีย</th>
  <th width="20%">ราคา (บาท)</th>
</tr>
</thead>
<tbody>
<tr>
  <td>1</td>
  <td>${job.deviceType} ${job.deviceModel}</td>
  <td>${job.symptom}</td>
  <td style="text-align:right;font-weight:700">
    ${job.priceQuoted?.toLocaleString() || "0"}
  </td>
</tr>
</tbody>
</table>

<div class="total">
  รวมเป็นเงินทั้งสิ้น :
  <span>${job.priceQuoted?.toLocaleString() || "0"} บาท</span>
</div>

<div class="terms">
<strong>เงื่อนไขการรับบริการ</strong><br>
1. กรุณานำใบรับเครื่องมาแสดงเมื่อรับเครื่องคืน<br>
2. ร้านไม่รับผิดชอบข้อมูลภายในเครื่อง<br>
3. ไม่มารับเครื่องภายใน 90 วัน ร้านขอสงวนสิทธิ์
</div>

<div class="sign">
  <div class="line">ผู้ส่งเครื่อง<br>(${job.customerName})</div>
  <div class="line">ผู้รับเครื่อง<br>(ร้านตุ้ยไอที)</div>
</div>

</div>
</body>
</html>
`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "สร้างใบรับเครื่องไม่สำเร็จ" });
  }
});


module.exports = router;
