const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    // ===============================
    // ข้อมูลลูกค้า
    // ===============================
    customerName: {
      type: String,
      required: true,
      trim: true
    },

    customerPhone: {
      type: String,
      trim: true
    },

    customerAddress: {
      type: String,
      trim: true
    },

    // ===============================
    // ข้อมูลงานซ่อม
    // ===============================
    receiptNumber: {
      type: String,
      required: true,
      unique: true
    },

    deviceType: {
      type: String,
      required: true,
      trim: true
    },

    deviceModel: {
      type: String,
      required: true,
      trim: true
    },

    symptom: {
      type: String,
      required: true,
      trim: true
    },

    accessory: {
      type: String,
      trim: true
    },

    priceQuoted: {
      type: Number,
      default: 0,
      min: 0
    },

    jobType: {
      type: String,
      enum: ["ซ่อมใหม่", "เคลม"],
      default: "ซ่อมใหม่"
    },

    jobCode: {
      type: String,
      unique: true,
      sparse: true // ✅ ป้องกัน error ถ้าไม่ได้ใช้
    },

    // ===============================
    // สถานะงาน
    // ===============================
    status: {
      type: String,
      enum: ["รับเครื่อง", "กำลังซ่อม", "รออะไหล่", "ซ่อมเสร็จ", "ยกเลิก"],
      default: "รับเครื่อง"
    },

    // ===============================
    // วันที่
    // ===============================
    receivedDate: {
      type: Date,
      default: Date.now
    },

    startDate: Date,
    finishDate: Date,

    // ===============================
    // พนักงาน
    // ===============================
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null
    },

    // ===============================
    // อะไหล่ที่ใช้
    // ===============================
    usedParts: [
      {
        stock: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Stock"
        },
        name: String,
        model: String,
        quantity: Number,
        usedAt: Date
      }
    ]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Job", jobSchema);
