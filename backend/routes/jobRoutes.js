const express = require("express");
const router = express.Router();
const Job = require("../models/Job");
const auth = require("../middleware/auth");
// FIX: เดิม import puppeteer ไว้แต่ route ด้านล่างไม่เคยเรียกใช้จริง
// (แค่ res.send HTML ไม่ได้ render เป็น PDF) จึงเอาออกเพื่อลด dependency ที่ไม่จำเป็น
const Stock = require("../models/Stock");
const Activity = require("../models/ActivityLog");
const QRCode = require("qrcode");

console.log("✅ jobRoutes loaded");

// ✅ DASHBOARD: ทุก role เห็นทุกงาน
// ✅ TECH: เห็นเฉพาะงานที่ตัวเองรับผิดชอบ
// ✅ STAFF: เห็นทุกงาน
// ต้นหา job ทั้งหมด
router.get("/", auth, async (req, res) => {
  try {
    const jobs = await Job.find({})
      .populate("createdBy", "firstName lastName role")
      .populate("assignedTo", "firstName lastName")
      .sort({ createdAt: -1 });

    res.json(jobs);
  } catch (err) {
    console.error("GET /api/jobs ERROR:", err);
    res.status(500).json({ message: "โหลดข้อมูลงานซ่อมไม่สำเร็จ" });
  }
});

// GET /api/jobs/my
// 🔹 ดึงข้อมูลงานซ่อมของตัวเอง (สำหรับ TECH)
// 🔹 STAFF เห็นทุกงาน
router.get("/my", auth, async (req, res) => {
  try {
    let query = {};
    // 🔹 TECH เห็นเฉพาะงานที่ตัวเองรับผิดชอบ
    if (req.user.role === "tech") {
    query = { assignedTo: req.user.userId };
} else if (req.user.role === "staff") {
    query = {};
}
// 🔹 ถ้าเป็น role อื่นๆ (เช่น customer) จะได้งานว่างเปล่า
    const jobs = await Job.find(query)
      .populate("assignedTo", "firstName lastName")
      .sort({ createdAt: -1 });
// 🔹 STAFF เห็นทุกงาน
    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "โหลดงานของฉันไม่สำเร็จ" });
  }
});

/* ==================================================
   GET /api/jobs/receipt/:receiptNumber
   ลูกค้าเช็คสถานะงานซ่อม (ไม่ต้อง login)
================================================== */
router.get("/receipt/:receiptNumber", async (req, res) => {
// 🔹 หา Job ตามเลขใบรับเครื่อง
  try {

    const job = await Job.findOne({
      receiptNumber: req.params.receiptNumber
// 🔹 ดึงเฉพาะ field ที่ลูกค้าควรเห็น
    }).select(
      "receiptNumber customerName customerPhone customerAddress " +
      "deviceType deviceModel symptom accessory jobType status " +
      "priceQuoted receivedDate startDate finishDate"
    );
// 🔹 ถ้าไม่พบงานซ่อมด้วยเลขใบรับเครื่องที่ระบุ
    if (!job) {
      return res.status(404).json({ message: "ไม่พบงานซ่อม" });
    }
// 🔹 ส่งข้อมูลงานซ่อมที่ลูกค้าควรเห็นกลับไป
    res.json(job);
  // 🔹 ถ้าเกิด error อื่นๆ
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ==================================================
// PUT /api/jobs/:id/complete
// ปิดงานซ่อม (เปลี่ยนสถานะเป็น "ซ่อมเสร็จ")
// Staff ปิดได้ทุกงาน
// Tech ปิดได้เฉพาะงานของตัวเอง
// ==================================================
router.put("/:id/complete", auth, async (req, res) => {
  try {
// 🔹 หา Job ตาม ID
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "ไม่พบงานซ่อม" });
    }
// 🔐 ตรวจสิทธิ์
    if (job.status === "ซ่อมเสร็จ" || job.status === "ยกเลิก") {
  return res.status(400).json({
    message: "งานนี้ถูกปิดแล้ว ไม่สามารถแก้ไขได้"
  });
}
    // 🔒 staff ปิดได้ทุกงาน
// tech ปิดได้เฉพาะงานของตัวเอง
if (
  req.user.role !== "staff" &&
  !(
    req.user.role === "tech" &&
    job.assignedTo?.toString() === req.user.userId
  )
) {
  return res.status(403).json({
    message: "ไม่มีสิทธิ์ปิดงานนี้"
  });
}

    // กันปิดซ้ำ
    if (job.status === "ซ่อมเสร็จ") {
      return res.status(400).json({ message: "งานนี้ถูกปิดแล้ว" });
    }

    const oldStatus = job.status;

    job.status = "ซ่อมเสร็จ";
    job.finishDate = new Date();
    await job.save();

    /* =========================
       🔥 ACTIVITY LOG
       FIX: เดิมใช้ action "CREATE_JOB" (label สลับกับ route POST /)
            และอ้างตัวแปร receiptNumber ที่ไม่เคยถูกประกาศ -> ReferenceError
            ทำให้ "ปิดงาน" พังทุกครั้ง ตอนนี้แก้เป็น action ที่ถูกต้อง
            และใช้ field ให้ตรงกับ schema (userId/userName/jobId/detail)
    ========================= */
    await Activity.create({
      userId: req.user.userId,
      userName: req.user.userName || "Unknown",
      action: "COMPLETE_JOB",
      detail: `ปิดงาน ${job.receiptNumber} (สถานะ: ${oldStatus} → ซ่อมเสร็จ)`,
      jobId: job._id,
      ipAddress: req.ip
    });

    res.json({
      message: "ปิดงานเรียบร้อย",
      job
    });

  } catch (err) {
    console.error("COMPLETE JOB ERROR:", err);
    res.status(500).json({
      message: "ไม่สามารถปิดงานได้"
    });
  }
});

// ==================================================
// POST /api/jobs
// สร้างงานซ่อมใหม่
// Staff และ Tech สร้างได้
// ==================================================

router.post("/", auth, async (req, res) => {
  try {

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      customerName,
      customerPhone,
      customerAddress,
      deviceType,
      deviceModel,
      symptom,
      accessory,
      priceQuoted,
      assignedTo
    } = req.body;

    if (!customerName || !deviceType || !deviceModel || !symptom) {
      return res.status(400).json({
        message: "กรุณากรอกข้อมูลให้ครบถ้วน"
      });
    }

    /* =========================
       GENERATE RECEIPT NUMBER (กันชน)
       สร้างเลขใบรับเครื่องใหม่ทุกวัน โดยนับจำนวนงานที่สร้างในวันนั้น
       รูปแบบ: INYYYYMMDD-XXX (XXX = 001, 002, ...)
    ========================= */
  // 🔹 สร้างวันที่ปัจจุบันในรูปแบบ YYYYMMDD
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
// 🔹 นับจำนวนงานที่สร้างในวันนั้น
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const countToday = await Job.countDocuments({
      createdAt: { $gte: start, $lte: end }
    });
// 🔹 สร้างเลขใบรับเครื่องใหม่ โดยเพิ่ม 1 จากจำนวนงานที่นับได้
    const receiptNumber =
      `IN${dateStr}-${String(countToday + 1).padStart(3, "0")}`;

    /* =========================
       CREATE JOB
    สร้างงานซ่อมใหม่ในฐานข้อมูล
    ========================= */
    const job = await Job.create({
      customerName: customerName.trim(),
      customerPhone: customerPhone || "-",
      customerAddress: customerAddress || "-",
      receiptNumber,
      deviceType,
      deviceModel,
      symptom,
      accessory,
      priceQuoted: Number(priceQuoted) || 0,
      status: "รับเครื่อง",
      receivedDate: new Date(),
      createdBy: req.user.userId,
      assignedTo: assignedTo || null
    });

    /* =========================
        🔥 ACTIVITY LOG
        FIX: เดิมใช้ action "CREATE_JOB" (label สลับกับ route PUT /:id/complete)
              และอ้างตัวแปร receiptNumber ที่ไม่เคยถูกประกาศ -> ReferenceError
              ทำให้ "สร้างงาน" พังทุกครั้ง ตอนนี้แก้เป็น action ที่ถูกต้อง
              และใช้ field ให้ตรงกับ schema (userId/userName/jobId/detail)
    ========================= */
    await Activity.create({
      userId: req.user.userId,
      userName: req.user.userName || "Unknown",
      action: "CREATE_JOB",
      detail: `รับเครื่องใหม่ ${job.receiptNumber}`,
      jobId: job._id,
      ipAddress: req.ip
    });

    res.status(201).json({
      message: "รับเครื่องสำเร็จ",
      job
    });

  } catch (err) {
    console.error("POST /api/jobs ERROR =", err);
    res.status(500).json({
      message: "บันทึกงานซ่อมไม่สำเร็จ"
    });
  }
});

// ==================================================
// PUT /api/jobs/:id/return-repair
// ส่งงานที่ซ่อมเสร็จแล้วกลับมาซ่อมอีกครั้ง
// Staff เท่านั้น
// ==================================================
router.put("/:id/return-repair", auth, async (req, res) => {
  try {

    // Staff เท่านั้น
    if (req.user.role !== "staff") {
      return res.status(403).json({
        message: "เฉพาะ Staff เท่านั้นที่สามารถส่งกลับซ่อมได้"
      });
    }
// 🔹 หา Job ตาม ID
    const job = await Job.findById(req.params.id);
// 🔹 ถ้าไม่พบงานซ่อมด้วย ID ที่ระบุ
    if (!job) {
      return res.status(404).json({
        message: "ไม่พบงานซ่อม"
      });
    }
    // ต้องเป็นงานที่ซ่อมเสร็จแล้วเท่านั้น
    if (job.status !== "ซ่อมเสร็จ") {
      return res.status(400).json({
        message: "สามารถส่งกลับซ่อมได้เฉพาะงานที่ซ่อมเสร็จแล้วเท่านั้น"
      });
    }
// 🔹 รับเหตุผลจากการส่งกลับซ่อม
   const reason =
  String(req.body.reason || "ไม่ได้ระบุเหตุผล").trim();

// 📝 เก็บหมายเหตุการส่งกลับซ่อมไว้ในงาน
job.returnRepairNote = reason;

// เปลี่ยนกลับเป็นกำลังซ่อม
job.status = "กำลังซ่อม";
    // ล้างวันที่ซ่อมเสร็จ
    job.finishDate = null;

    await job.save();

    // Activity Log
    try {
      await Activity.create({
        userId: req.user.userId,
        userName: req.user.userName || "Unknown",
        action: "RETURN_REPAIR",
        detail:
          `ส่งงาน ${job.receiptNumber || "-"} กลับซ่อม ` +
          `(สถานะ: ซ่อมเสร็จ → กำลังซ่อม) ` +
          `เหตุผล: ${reason}`,
        jobId: job._id,
        ipAddress: req.ip
      });
    } catch (logErr) {
      console.error("ACTIVITY LOG ERROR:", logErr);
    }

    res.json({
      message: "ส่งงานกลับซ่อมเรียบร้อย",
      job
    });

  } catch (err) {

    console.error("RETURN REPAIR ERROR:", err);

    res.status(500).json({
      message: "ไม่สามารถส่งงานกลับซ่อมได้"
    });
  }
});
/* ==================================================
   PUT /api/jobs/:id
   อัปเดตข้อมูลงานซ่อม (สถานะ / วันที่ / ราคา)
================================================== */
// 🔹 ดึงข้อมูลงานซ่อมตาม ID
router.put("/:id", auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
// 🔹 ถ้าไม่พบงานซ่อมด้วย ID ที่ระบุ
    if (!job) {
      return res.status(404).json({ message: "ไม่พบงานซ่อม" });
    }
// 🔹 ถ้างานถูกยกเลิกหรือซ่อมเสร็จแล้ว ไม่สามารถแก้ไขได้
    if (job.status === "ยกเลิก") {
  return res.status(400).json({
    message: "งานนี้ถูกยกเลิกแล้ว ไม่สามารถแก้ไขได้"
  });
}

if (job.status === "ซ่อมเสร็จ") {
  return res.status(400).json({
    message: "งานนี้ซ่อมเสร็จแล้ว กรุณาใช้เมนูส่งกลับซ่อม"
  });
}
    // 🔒 ตรวจสิทธิ์
    if (
  req.user.role !== "staff" &&
  !(
    req.user.role === "tech" &&
    job.assignedTo?.toString() === req.user.userId
  )
) {
  return res.status(403).json({
    message: "ไม่มีสิทธิ์แก้ไขงานนี้"
  });
}
// 🔹 บันทึกสถานะเดิม
    const oldStatus = job.status;

    const cleanDate = (v) => (v === "" || v === null ? null : v);

    const cleanNumber = (v) => {
      const n = Number(v);
      return isNaN(n) ? 0 : n;
    };

    const validStatus = [
      "รับเครื่อง",
      "กำลังซ่อม",
      "รออะไหล่",
      "ซ่อมเสร็จ",
      "ยกเลิก"
   ];

    /* =========================
       🔥 DEBUG (ดูค่าจริง)
    ========================= */
    console.log("BODY:", req.body);

    /* =========================
       UPDATE DATA
    ========================= */

    // 📅 วันที่
    if (req.body.receivedDate !== undefined) {
      job.receivedDate = cleanDate(req.body.receivedDate);
    }
// อัปเดตสถานะงานซ่อม (สำคัญสุด)
    if (req.body.startDate !== undefined) {
      job.startDate = cleanDate(req.body.startDate);
    }

    if (req.body.finishDate !== undefined) {
      job.finishDate = cleanDate(req.body.finishDate);
    }

    // 📊 สถานะ (สำคัญสุด)
    // 🔹 ตรวจสอบว่าค่าที่ส่งมาถูกต้องหรือไม่
    if (req.body.status !== undefined) {
      const status = String(req.body.status)
        .trim()
        .replace(/\s+/g, " ");
// 🔹 ถ้าไม่อยู่ใน validStatus ให้ส่ง error กลับไป
      if (!validStatus.includes(status)) {
        console.log("❌ INVALID STATUS:", status);
        return res.status(400).json({
          message: "สถานะไม่ถูกต้อง"
        });
      }
// 🔹 อัปเดตสถานะงานซ่อม
      job.status = status;
    }

// อัปเดตราคาประเมิน (priceQuoted) ให้เป็นตัวเลข
    if (req.body.priceQuoted !== undefined) {
      job.priceQuoted = cleanNumber(req.body.priceQuoted);
    }

    // 🛠 ประเภทงาน
    // 🔹 ถ้า req.body.jobType เป็น undefined ให้ไม่แก้ไข
    if (req.body.jobType !== undefined) {
      job.jobType = req.body.jobType || null;
    }

    await job.save();

   /* =========================
   ACTIVITY LOG
========================= */

try {

  // =========================
  // เปลี่ยนสถานะ
  // =========================
  if (
    req.body.status !== undefined &&
    oldStatus !== job.status
  ) {

    await Activity.create({
      userId: req.user.userId,
      userName: req.user.userName || "Unknown",
      action: "UPDATE_STATUS",
      detail:
        `เปลี่ยนสถานะงาน ${job.receiptNumber || "-"} ` +
        `(${oldStatus} → ${job.status})`,
      jobId: job._id,
      ipAddress: req.ip
    });

  }


  // =========================
  // เปลี่ยนราคา
  // =========================
  if (
    req.body.priceQuoted !== undefined &&
    oldPrice !== job.priceQuoted
  ) {

    await Activity.create({
      userId: req.user.userId,
      userName: req.user.userName || "Unknown",
      action: "UPDATE_PRICE",
      detail:
        `แก้ไขราคางาน ${job.receiptNumber || "-"} ` +
        `(${oldPrice} → ${job.priceQuoted} บาท)`,
      jobId: job._id,
      ipAddress: req.ip
    });

  }


  // =========================
  // เปลี่ยนประเภทงาน
  // =========================
  if (
    req.body.jobType !== undefined &&
    oldJobType !== job.jobType
  ) {

    await Activity.create({
      userId: req.user.userId,
      userName: req.user.userName || "Unknown",
      action: "UPDATE_JOB_TYPE",
      detail:
        `เปลี่ยนประเภทงาน ${job.receiptNumber || "-"} ` +
        `(${oldJobType || "-"} → ${job.jobType || "-"})`,
      jobId: job._id,
      ipAddress: req.ip
    });

  }

} catch (logErr) {

  console.error(
    "ACTIVITY LOG ERROR:",
    logErr
  );

}

    /* =========================
       RESPONSE
    ========================= */
    res.json({
      message: "อัปเดตงานซ่อมสำเร็จ",
      job
    });

  } catch (err) {
    console.error("UPDATE JOB ERROR:", err);

    // 🔥 แยก error enum ให้ดูง่าย
    if (err.name === "ValidationError") {
      return res.status(400).json({
        message: "ข้อมูลไม่ถูกต้อง (Validation Error)",
        error: err.message
      });
    }

    res.status(500).json({
      message: "อัปเดตงานซ่อมไม่สำเร็จ"
    });
  }
});
// ==================================================
// POST /api/jobs/:id/use-part
// เบิกอะไหล่จาก Stock สำหรับงานซ่อม
// Staff และ Tech สามารถเบิกได้
// ==================================================
router.post("/:id/use-part", auth, async (req, res) => {
  try {
    const { stockId, quantity } = req.body;

    if (!stockId || !quantity || quantity <= 0) {
      return res.status(400).json({
        message: "ข้อมูลไม่ครบหรือจำนวนไม่ถูกต้อง"
      });
    }

 // 🔹 หา Job ตาม ID
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "ไม่พบงานซ่อม" });
    }

    /* =========================
       🔐 เช็คสิทธิ์
    ========================= */
    if (
      req.user.role !== "staff" &&
      job.assignedTo?.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        message: "ไม่มีสิทธิ์เบิกอะไหล่ในงานนี้"
      });
    }

   // 🔹 หา Stock ตาม stockId
    const stock = await Stock.findById(stockId);
    if (!stock) {
      return res.status(404).json({ message: "ไม่พบอะไหล่" });
    }
// 🔹 ตรวจสอบจำนวนอะไหล่ใน Stock
    if (stock.quantity < quantity) {
      return res.status(400).json({
        message: "จำนวนอะไหล่ไม่เพียงพอ"
      });
    }
// 🔹 เบิกอะไหล่จาก Stock
    stock.quantity -= quantity;
// 🔹 บันทึกประวัติการเบิกอะไหล่ใน Stock
    stock.withdrawHistory.push({
      quantity,
      employeeName: req.user.userName || "Unknown",
      jobRef: job.receiptNumber,
      withdrawnAt: new Date()
    });

    await stock.save();

 // 🔹 บันทึกอะไหล่ที่ใช้ในงานซ่อม
    job.usedParts = job.usedParts || [];

// 🔹 เพิ่มอะไหล่ที่ใช้ในงานซ่อม
    job.usedParts.push({
      stock: stock._id,
      name: stock.name,
      model: stock.model,
      quantity,
      usedAt: new Date()
    });

    await job.save();

    /* =========================
       5️⃣ Activity Log
    ========================= */
    await Activity.create({
      userId: req.user.userId,
      userName: req.user.userName || "Unknown",
      action: "USE_PART",
      detail: `เบิก ${stock.name} x${quantity} สำหรับงาน ${job.receiptNumber}`,
      jobId: job._id,
      ipAddress: req.ip
    });

    res.json({ message: "เบิกอะไหล่สำเร็จ" });

  } catch (err) {
    console.error("❌ use-part error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ==================================================
// GET /api/jobs/:id/receipt
// สร้างใบรับเครื่องซ่อม (HTML)
// Staff และ Tech สามารถสร้างได้
// ==================================================
router.get("/:id/receipt", auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
// 🔹 ถ้าไม่พบงานซ่อมด้วย ID ที่ระบุ
    if (!job) {
      return res.status(404).send("ไม่พบงานซ่อม");
    }

    // ==================================================
    // QR CODE เว็บไซต์ร้าน
    // QR เดียวกันทุกใบ
    // ==================================================

   const qrCode = await QRCode.toString(
  "https://www.tui-it.org/",
  {
    type: "svg",
    width: 120,
    margin: 0,
    errorCorrectionLevel: "M"
  }
);
// ==================================================
// ส่ง HTML ใบรับเครื่องซ่อมกลับไป
// ==================================================
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

body {
  font-family: 'Sarabun', sans-serif;
  margin: 0;
  padding: 0;
  background: #fff;
}

.container {
  width: 100%;
  min-height: calc(297mm - 30mm);
  box-sizing: border-box;
  margin: 0 auto;
  padding: 20mm;
  background: #fff;
  border-left: 8px solid #facc15;
}

/* =========================================
   HEADER
========================================= */

.header {
  display: flex;
  justify-content: space-between;
  border-bottom: 3px solid #f6c200;
  padding-bottom: 18px;
}

.shop {
  display: flex;
  gap: 16px;
  align-items: center;
}

.logo {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid #0f3c8a;
  object-fit: contain;
  background: #fff;
}

.shop h1 {
  margin: 0;
  font-size: 22px;
  color: #0f3c8a;
}

.shop p {
  margin: 2px 0;
  font-size: 13px;
}

.doc {
  text-align: right;
}

.doc h2 {
  margin: 0;
  color: #0f3c8a;
}

.doc .no {
  color: #b91c1c;
  font-weight: 700;
  margin-top: 4px;
}

/* =========================================
   INFO
========================================= */

.info {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
  margin-top: 22px;
}

.box {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 14px 16px;
  background: #f9fafb;
}

.box h3 {
  margin: 0 0 10px;
  font-size: 15px;
  color: #0f3c8a;
  border-bottom: 1px solid #d1d5db;
  padding-bottom: 6px;
}

.row {
  display: flex;
  font-size: 14px;
  margin-bottom: 6px;
}

.label {
  width: 90px;
  font-weight: 600;
}

.badge {
  background: #dcfce7;
  color: #047857;
  padding: 4px 14px;
  border-radius: 999px;
  font-size: 13px;
  border: 1px solid #10b981;
}

/* =========================================
   TABLE
========================================= */

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 22px;
}

thead th {
  background: #0f3c8a;
  color: #fff;
  padding: 12px;
  font-size: 14px;
}

tbody td {
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
  font-size: 14px;
}

/* =========================================
   PRICE
========================================= */

.price-box {
  margin-top: 18px;
  text-align: right;
  font-size: 16px;
}

.price-box span {
  font-size: 18px;
  color: #b91c1c;
  font-weight: 700;
}

/* =========================================
   TERMS
========================================= */

.terms {
  margin-top: 22px;
  background: #fff7ed;
  border-left: 5px solid #f6c200;
  padding: 14px 16px;
  font-size: 13px;
}

/* =========================================
   SIGNATURE
========================================= */

.sign {
  margin-top: 45px;
  display: flex;
  justify-content: space-between;
  text-align: center;
}

.line {
  width: 40%;
  border-top: 1px solid #000;
  padding-top: 6px;
  font-size: 14px;
}

/* =========================================
   QR CODE
   ไม่มีกรอบ
   มุมล่างขวา
========================================= */

.qr-website {
  width: 150px;
  margin-left: auto;
  margin-top: 15px;
  text-align: center;
  page-break-inside: avoid;
  break-inside: avoid;
}

.qr-image {
  width: 110px;
  height: 110px;
  margin: 0 auto 4px;
}

.qr-image svg {
  display: block;
  width: 110px;
  height: 110px;
}

.qr-title {
  font-size: 11px;
  font-weight: 700;
  color: #0f3c8a;
}

.qr-url {
  font-size: 10px;
  font-weight: 700;
  color: #0f3c8a;
}
/* =========================================
   PRINT
========================================= */

.print-btn {
  display: block;
  width: 200px;
  margin: 30px auto 0;
  padding: 12px;
  background: #0f3c8a;
  color: #fff;
  text-align: center;
  border-radius: 999px;
  cursor: pointer;
}

@media print {

  body {
    background: #fff;
  }

  .container {
    box-shadow: none;
    border-radius: 0;
  }

  .print-btn {
    display: none;
  }

}

</style>

</head>

<body>

<div class="container">

<!-- =========================================
     HEADER
========================================== -->

<div class="header">

  <div class="shop">

    <img
      src="https://www.tui-it.org/customer/logo1.png"
      class="logo"
    >

    <div>

      <h1>ร้านตุ้ยไอที โคราช</h1>

      <p>
        ศูนย์ซ่อมและจำหน่ายอุปกรณ์ไอทีครบวงจร
      </p>

      <p>
        โทร 080-4641677
      </p>

    </div>

  </div>


  <div class="doc">

    <h2>
      ใบรับเครื่องซ่อม
    </h2>

    <div class="no">
      No. ${job.receiptNumber}
    </div>

    <div>
      วันที่ ${new Date(job.receivedDate).toLocaleDateString("th-TH")}
    </div>

  </div>

</div>


<!-- =========================================
     INFO
========================================== -->

<div class="info">

  <div class="box">

    <h3>
      ข้อมูลลูกค้า
    </h3>

    <div class="row">

      <div class="label">
        ชื่อลูกค้า :
      </div>

      ${job.customerName}

    </div>

    <div class="row">

      <div class="label">
        เบอร์โทร :
      </div>

      ${job.customerPhone || "-"}

    </div>

    <div class="row">

      <div class="label">
        ที่อยู่ :
      </div>

      ${job.customerAddress || "-"}

    </div>

    <div class="row">

      <div class="label">
        อุปกรณ์ที่มาด้วย :
      </div>

      ${job.accessory || "-"}

    </div>

    <div class="row">

      <div class="label">
        ประเภทงาน :
      </div>

      ${job.jobType || "-"}

    </div>

  </div>


  <div class="box">

    <h3>
      สถานะงาน
    </h3>

    <div class="row">

      <div class="label">
        สถานะ
      </div>

      <span class="badge">
        ${job.status}
      </span>

    </div>

  </div>

</div>


<!-- =========================================
     TABLE
========================================== -->

<table>

  <thead>

    <tr>

      <th width="10%">
        ลำดับ
      </th>

      <th width="50%">
        รายละเอียดอุปกรณ์
      </th>

      <th width="40%">
        อาการเสีย
      </th>

    </tr>

  </thead>


  <tbody>

    <tr>

      <td>
        1
      </td>

      <td>

        <strong>
          ${job.deviceType} ${job.deviceModel}
        </strong>

      </td>

      <td>
        ${job.symptom}
      </td>

    </tr>

  </tbody>

</table>


<!-- =========================================
     PRICE
========================================== -->

<div class="price-box">

  ราคาประเมินรวม :

  <span>
    ${(job.priceQuoted ?? 0).toLocaleString()} บาท
  </span>

</div>


<!-- =========================================
     TERMS
========================================== -->

<div class="terms">

  <strong>
    เงื่อนไขการรับบริการ
  </strong>

  <br>

  1. กรุณานำใบรับเครื่องมาแสดงเมื่อรับเครื่องคืน

  <br>

  2. ร้านไม่รับผิดชอบข้อมูลภายในเครื่อง

  <br>

  3. ไม่มารับเครื่องภายใน 90 วัน ร้านขอสงวนสิทธิ์

</div>


<!-- =========================================
     SIGNATURE
========================================== -->

<div class="sign">

  <div class="line">

    ผู้ส่งเครื่องซ่อม

    <br>

    (${job.customerName})

  </div>


  <div class="line">

    ผู้รับเครื่อง

    <br>

    (ร้านตุ้ยไอที)

  </div>

</div>


<!-- =========================================
     QR CODE WEBSITE
     มุมล่างขวา ไม่มีกรอบ
========================================== -->

<div class="qr-website">

  <div class="qr-image">
  ${qrCode}
</div>

  <div class="qr-title">
    สแกนเพื่อเข้าเว็บไซต์
  </div>

  <div class="qr-url">
    www.tui-it.org
  </div>

  <div class="qr-help">
    สำหรับเข้าเว็บไซต์<br>
    และตรวจสอบสถานะงานซ่อม
  </div>

</div>


</div>


<div
  class="print-btn"
  onclick="window.print()"
>
  พิมพ์เอกสาร
</div>


</body>

</html>`);

  } catch (err) {

    console.error("RECEIPT ERROR:", err);

    res
      .status(500)
      .send("สร้างใบรับเครื่องไม่สำเร็จ");

  }
});
// 🔹 ดึงข้อมูลงานซ่อมตาม ID

router.get("/:id", auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
       .populate("assignedTo", "firstName lastName")
      .populate("createdBy", "firstName lastName");
// 🔹 ถ้าไม่พบงานซ่อมด้วย ID ที่ระบุ
    if (!job) {
      return res.status(404).json({ message: "ไม่พบงานซ่อม" });
    }
// 🔹 ส่งข้อมูลงานซ่อมกลับไป
    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ดึงข้อมูลงานไม่สำเร็จ" });
  }
});


module.exports = router;