const express = require("express");
const router = express.Router();
const Job = require("../models/Job");
const auth = require("../middleware/auth");
const puppeteer = require("puppeteer"); // ✅ สำคัญมาก
const fs = require("fs");
const path = require("path");
const verifyToken = require("../middleware/auth");

console.log("✅ jobRoutes loaded");
// ============================
// 🔥 ต้องอยู่บนสุด
// ============================
router.post("/:id/withdraw", auth, async (req, res) => {

  try {
    const { stockId, quantity } = req.body;

    if (!stockId || !quantity) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
    }

    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "ไม่พบงานซ่อม" });

    const Stock = require("../models/Stock");
    const stock = await Stock.findById(stockId);
    if (!stock) return res.status(404).json({ message: "ไม่พบอะไหล่" });

    if (stock.quantity < quantity) {
      return res.status(400).json({ message: "อะไหล่ไม่พอ" });
    }

    stock.quantity -= quantity;
    await stock.save();

    job.usedParts = job.usedParts || [];
    job.usedParts.push({
      stock: stock._id,
      name: stock.name,
      model: stock.model,
      quantity,
      usedAt: new Date()
    });

    await job.save();

    res.json({ message: "เบิกอะไหล่สำเร็จ" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "error" });
  }
});

// ============================
// ❗ route ที่เป็น :id ไว้ล่างสุด
// ============================
/* ==================================================
   GET /api/jobs
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
      // 👉 ช่างเห็นงานที่รับแล้ว + งานที่ยังไม่มีคนรับ
      query = {
        $or: [
          { assignedTo: req.user.id },
          { assignedTo: null }
        ]
      };
    } else {
      // 👉 พนักงานเห็นงานที่ตัวเองสร้าง
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
   GET /api/jobs/receipt/:receiptNumber
   ลูกค้าเช็คสถานะ
================================================== */
router.get("/receipt/:receiptNumber", async (req, res) => {
  try {
    const receiptNumber = req.params.receiptNumber.trim();
    const job = await Job.findOne({ receiptNumber });

    if (!job) {
      return res.status(404).json({ message: "ไม่พบข้อมูลงานซ่อม" });
    }

    res.json(job);
  } catch (err) {
    res.status(500).json({ message: "ไม่สามารถดึงข้อมูลงานซ่อมได้" });
  }
});
/* ==================================================
   PUT /api/jobs/:id/complete
   กดเสร็จสิ้นงาน
================================================== */
router.put("/:id/complete", auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "ไม่พบงานซ่อม" });
    }

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
   ✅ IMPORTANT
   GET /api/jobs/:id/receipt
   (ต้องอยู่ก่อน /:id)
================================================== */
router.get("/:id/receipt", async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "ไม่พบงานซ่อม" });

    const html = `
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>ใบรับเครื่องซ่อม</title>

<style>
@page { size: A4; margin: 18mm; }

body{
  font-family: "Tahoma","Arial",sans-serif;
  margin:0;
  background:#eef3f8;
}

.paper{
  background:#fff;
  border-left:10px solid #facc15;
  padding:32px 36px;
}

/* ===== HEADER ===== */
.header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  border-bottom:3px solid #facc15;
  padding-bottom:16px;
}

.shop{
  display:flex;
  gap:14px;
  align-items:center;
}

.logo{
  width:70px;
  height:70px;
  border-radius:50%;
  border:2px solid #1e3a8a;
}

.shop h1{
  margin:0;
  font-size:20px;
  color:#1e3a8a;
}

.shop p{
  margin:2px 0;
  font-size:12px;
}

.doc{
  text-align:right;
}

.doc h2{
  margin:0;
  color:#1e3a8a;
}

.doc .no{
  color:#dc2626;
  font-weight:bold;
}

/* ===== INFO BOX ===== */
.info{
  display:grid;
  grid-template-columns:2fr 1fr;
  gap:20px;
  margin-top:24px;
}

.box{
  border:1px solid #cbd5e1;
  border-radius:8px;
  padding:14px 16px;
}

.box h3{
  margin:0 0 10px;
  font-size:14px;
  color:#1e3a8a;
  border-bottom:1px solid #cbd5e1;
  padding-bottom:6px;
}

.row{
  display:flex;
  font-size:14px;
  margin-bottom:6px;
}

.label{
  width:90px;
  font-weight:bold;
}

.badge{
  background:#dcfce7;
  color:#166534;
  border:1px solid #22c55e;
  padding:4px 12px;
  border-radius:999px;
  font-size:12px;
}

/* ===== TABLE ===== */
table{
  width:100%;
  border-collapse:collapse;
  margin-top:24px;
}

thead th{
  background:#1e3a8a;
  color:#fff;
  padding:10px;
  font-size:14px;
}

tbody td{
  border-bottom:1px solid #cbd5e1;
  padding:10px;
  font-size:14px;
}

/* ===== TOTAL ===== */
.total{
  margin-top:20px;
  text-align:right;
  font-size:16px;
}
.total span{
  font-size:18px;
  color:#dc2626;
  font-weight:bold;
}

/* ===== TERMS ===== */
.terms{
  margin-top:24px;
  background:#fff7ed;
  border-left:5px solid #facc15;
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
}
</style>
</head>

<body>
<div class="paper">

<div class="header">
  <div class="shop">
    <img src="http://localhost:5000/customer/logo1.png" class="logo" />
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
    <div style="margin-top:10px;font-size:14px;">
      <strong>ค่าบริการ :</strong>
      ${job.priceQuoted ? job.priceQuoted.toLocaleString() : "-"} บาท
    </div>
  </div>
</div>

<table>
<thead>
<tr>
  <th width="10%">ลำดับ</th>
  <th width="45%">รายละเอียดอุปกรณ์</th>
  <th width="25%">อาการเสีย</th>
  <th width="20%">ราคา (บาท)</th>
</tr>
</thead>
<tbody>
<tr>
  <td>1</td>
  <td><strong>${job.deviceType}</strong><br>${job.deviceModel}</td>
  <td>${job.symptom}</td>
  <td style="text-align:right;font-weight:bold;">
    ${job.priceQuoted ? job.priceQuoted.toLocaleString() : "-"}
  </td>
</tr>
</tbody>
</table>

<div class="total">
  รวมเป็นเงินทั้งสิ้น :
  <span>${job.priceQuoted ? job.priceQuoted.toLocaleString() : "-"} บาท</span>
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

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox","--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=receipt-${job.receiptNumber}.pdf`);
    res.send(pdf);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "สร้าง PDF ไม่สำเร็จ" });
  }
});


/* ==================================================
   GET /api/jobs/:id
================================================== */
router.get("/:id", auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "ไม่พบงานซ่อม" });
    }
    res.json(job);
  } catch (err) {
    res.status(500).json({ message: "โหลดข้อมูลงานซ่อมไม่สำเร็จ" });
  }
});

/* ==================================================
   POST /api/jobs
================================================== */
router.post("/", auth, async (req, res) => {
  try {
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

    if (!customerName || !customerPhone || !receiptNumber || !deviceType || !deviceModel || !symptom) {
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
  assignedTo: assignedTo ? assignedTo : null
});


    res.status(201).json({ message: "รับเครื่องสำเร็จ", job });
  } catch (err) {
    res.status(500).json({ message: "บันทึกงานซ่อมไม่สำเร็จ" });
  }
});

/* ==================================================
   PUT /api/jobs/:id
================================================== */
router.put("/:id", auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "ไม่พบงานซ่อม" });
    }

    Object.assign(job, req.body);
    await job.save();

    res.json(job);
  } catch (err) {
    res.status(500).json({ message: "อัปเดตงานซ่อมไม่สำเร็จ" });
  }
});

module.exports = router;
