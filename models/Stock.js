const mongoose = require("mongoose");

const stockSchema = new mongoose.Schema({
  stockCode: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    trim: true
  },
  model: {
    type: String,
    required: true
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

  // ✅ เพิ่มตรงนี้
  withdrawHistory: [
    {
      quantity: {
        type: Number,
        required: true
      },
      employeeName: {
        type: String,
        required: true
      },
      jobRef: {
        type: String,
        default: "-"
      },
      withdrawnAt: {
        type: Date,
        default: Date.now
      }
    }
  ]

}, { timestamps: true });

module.exports = mongoose.model("Stock", stockSchema);
