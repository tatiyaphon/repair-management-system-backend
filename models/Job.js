const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, trim: true },
    customerAddress: { type: String, trim: true },

    receiptNumber: { type: String, required: true, unique: true },

    deviceType: { type: String, required: true, trim: true },
    deviceModel: { type: String, required: true, trim: true },
    symptom: { type: String, required: true, trim: true },
    accessory: { type: String, trim: true },

    priceQuoted: { type: Number, default: 0, min: 0 },

    jobType: {
      type: String,
      enum: ["ซ่อมใหม่", "เคลม"],
      default: "ซ่อมใหม่"
    },

    
    status: {
      type: String,
      enum: ["รับเครื่อง", "กำลังซ่อม", "รออะไหล่", "ซ่อมเสร็จ", "ยกเลิก"],
      default: "รับเครื่อง"
    },

    receivedDate: { type: Date, default: Date.now },
    startDate: Date,
    finishDate: Date,


    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true // ✔ ใช้คู่กับ JWT
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null
    },


    usedParts: [
      {
        stock: { type: mongoose.Schema.Types.ObjectId, ref: "Stock" },
        name: String,
        model: String,
        quantity: Number,
        usedAt: Date
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Job", jobSchema);
