const mongoose = require("mongoose");

/* =========================
   Withdraw History Schema
========================= */
const withdrawHistorySchema = new mongoose.Schema({
  quantity: {
    type: Number,
    required: true
  },
  employeeName: {
    type: String,
    required: true
  },
  jobRef: {
    type: String // เลขใบงาน / ใบรับเครื่อง
  },
  withdrawnAt: {
    type: Date,
    default: Date.now
  }
});

/* =========================
   Stock Schema
========================= */
const stockSchema = new mongoose.Schema({
  stockCode: {
    type: String,
    required: true,
    unique: true   // เช่น CPU-001
  },
  name: {
    type: String,
    required: true, // เช่น cpu, battery
    trim: true
  },
  type: {
    type: String,
    required: true, // เช่น cpu, battery
    trim: true
  },
  model: {
    type: String,
    required: true  // เช่น Intel i5 Gen10
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  price: {
    type: Number,
    default: 0
  },

  // ✅ ประวัติการเบิกอะไหล่
   withdrawHistory: [
    {
      quantity: Number,
      employeeName: String,
      jobRef: String,
      withdrawnAt: {
        type: Date,
        default: Date.now
      }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model("Stock", stockSchema);
