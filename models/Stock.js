const mongoose = require("mongoose");

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
  }
}, { timestamps: true });

module.exports = mongoose.model("Stock", stockSchema);
