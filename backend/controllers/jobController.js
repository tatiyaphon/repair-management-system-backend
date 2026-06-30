const Job = require("../models/Job");

// ===============================
// สร้างงานซ่อมใหม่
// ===============================
exports.createJob = async (req, res) => {
  try {
    const {
      receiptNumber,
      customerName,
      customerPhone,
      deviceType,
      deviceModel,
      symptom,
      repairDetail,
      priceQuoted,
      receivedDate,
      startDate,
      finishDate
    } = req.body;

    const job = new Job({
      receiptNumber,
      customerName,
      customerPhone,
      deviceType,
      deviceModel,
      symptom,
      repairDetail,
      priceQuoted,
      receivedDate,
      startDate,
      finishDate,

      // ✅ แก้ตรงนี้ (สำคัญมาก)
      createdBy: req.user.id
    });

    await job.save();

    res.status(201).json({
      success: true,
      message: "บันทึกงานซ่อมสำเร็จ",
      data: job
    });

  } catch (err) {
    console.error("createJob error:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
