const express = require("express");
const router = express.Router();
const Stock = require("../models/Stock");
const verifyToken = require("../middleware/auth");
const Employee = require("../models/Employee");
const Job = require("../models/Job");
/* ดึงทั้งหมด */
// FIX: เพิ่ม verifyToken เพื่อให้ต้อง login ก่อนถึงจะดึงข้อมูลสต็อกได้
router.get("/", verifyToken, async (_req, res) => {
  try {
  
    res.set("Cache-Control", "no-store"); // กัน cache
    const stocks = await Stock.find();
    res.json(stocks);
  } catch (err) {
    console.error("GET /api/stocks ERROR:", err);
    res.status(500).json({ message: "โหลดข้อมูลสต็อกไม่สำเร็จ" });
  }
});

/* เพิ่ม */
// FIX: เพิ่ม verifyToken เพื่อให้ต้อง login ก่อนถึงจะเพิ่มสต็อกได้
router.post("/", verifyToken, async (req, res) => {
  try {
    const item = await Stock.create(req.body);
    res.status(201).json(item);
  } catch (err) {
    console.error("POST /api/stocks ERROR:", err);

    // FIX: เดิมไม่มี try-catch เลย ถ้าข้อมูลผิด schema (เช่น ลืมกรอก stockCode
    // ที่เป็น required, หรือ stockCode ซ้ำเพราะตั้ง unique ไว้)
    // จะหลุดไปเป็น generic 500 error ไม่รู้สาเหตุจริง
    if (err.code === 11000) {
      return res.status(400).json({ message: "รหัสสินค้า (stockCode) นี้มีอยู่แล้ว" });
    }
    if (err.name === "ValidationError") {
      return res.status(400).json({
        message: "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
        error: err.message
      });
    }
    res.status(500).json({ message: "เพิ่มสินค้าเข้าสู่คลังไม่สำเร็จ" });
  }
});

/* แก้ไข */
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const item = await Stock.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({ message: "ไม่พบสินค้านี้" });
    }

    res.json(item);
  } catch (err) {
    console.error("PUT /api/stocks/:id ERROR:", err);
    if (err.code === 11000) {
      return res.status(400).json({ message: "รหัสสินค้า (stockCode) นี้มีอยู่แล้ว" });
    }
    if (err.name === "ValidationError") {
      return res.status(400).json({
        message: "ข้อมูลไม่ถูกต้อง",
        error: err.message
      });
    }
    res.status(500).json({ message: "แก้ไขสินค้าไม่สำเร็จ" });
  }
});

/* ลบ */
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const deleted = await Stock.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "ไม่พบสินค้านี้" });
    }

    res.json({ message: "ลบสินค้าออกจากคลังสำเร็จ" });
  } catch (err) {
    console.error("DELETE /api/stocks/:id ERROR:", err);
    res.status(500).json({ message: "ลบสินค้าไม่สำเร็จ" });
  }
});

router.patch("/:id/withdraw", verifyToken, async (req, res) => {

  try {

    const {
      quantity,
      employeeId,
      jobId,
      withdrawnAt
    } = req.body;


    // =========================
    // ตรวจจำนวน
    // =========================

    const qty =
      Number(quantity);

    if (!qty || qty <= 0) {

      return res.status(400).json({
        message: "จำนวนเบิกไม่ถูกต้อง"
      });

    }


    // =========================
    // หา Stock
    // =========================

    const stock =
      await Stock.findById(
        req.params.id
      );

    if (!stock) {

      return res.status(404).json({
        message: "ไม่พบอะไหล่"
      });

    }


    if (qty > stock.quantity) {

      return res.status(400).json({
        message:
          `จำนวนที่เบิกเกินจำนวนคงเหลือ (${stock.quantity})`
      });

    }


    // =========================
    // ตรวจ Job
    // =========================

    if (!jobId) {

      return res.status(400).json({
        message: "กรุณาเลือกงานซ่อม"
      });

    }

    const job =
      await Job.findById(jobId);

    if (!job) {

      return res.status(404).json({
        message: "ไม่พบงานซ่อม"
      });

    }


    // =========================
    // หา Employee
    // =========================

    let targetEmployee;


    // =========================
    // TECH
    // =========================

    if (req.user.role === "tech") {

      // บังคับเป็นบัญชีตัวเอง
      targetEmployee =
        await Employee.findById(
          req.user.userId
        );

    }


    // =========================
    // STAFF
    // =========================

    else if (req.user.role === "staff") {

      if (!employeeId) {

        return res.status(400).json({
          message: "กรุณาเลือกช่าง"
        });

      }

      targetEmployee =
        await Employee.findById(
          employeeId
        );

      if (!targetEmployee) {

        return res.status(404).json({
          message: "ไม่พบช่าง"
        });

      }

      if (targetEmployee.role !== "tech") {

        return res.status(400).json({
          message:
            "สามารถเบิกให้ช่างเท่านั้น"
        });

      }

    }

    else {

      return res.status(403).json({
        message:
          "ไม่มีสิทธิ์เบิกอะไหล่"
      });

    }


    if (!targetEmployee) {

      return res.status(404).json({
        message:
          "ไม่พบข้อมูลผู้เบิก"
      });

    }


    // =========================
    // ลด Stock
    // =========================

    stock.quantity -= qty;


    // =========================
    // บันทึกประวัติ
    // =========================

    stock.withdrawHistory.push({

      quantity: qty,

      employeeId:
        targetEmployee._id,

      employeeName:
        `${targetEmployee.firstName} ${targetEmployee.lastName}`,

      jobId:
        job._id,

      jobRef:
        job.receiptNumber,

      withdrawnAt:
        withdrawnAt
          ? new Date(withdrawnAt)
          : new Date()

    });


    await stock.save();


    res.json({

      message:
        "เบิกอะไหล่สำเร็จ",

      quantityLeft:
        stock.quantity

    });


  } catch (err) {

    console.error(
      "PATCH /api/stocks/:id/withdraw ERROR:",
      err
    );

    res.status(500).json({
      message:
        "เกิดข้อผิดพลาดในการเบิกอะไหล่"
    });

  }

});

module.exports = router;