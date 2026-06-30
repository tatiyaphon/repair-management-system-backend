const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName:  { type: String, required: true },

  isVerified: {
    type: Boolean,
    default: false
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },

  password: { type: String, required: true },

  role: {
    type: String,
    enum: ["admin", "tech", "staff"],
    default: "staff"
  },

  phone: { type: String, default: "-" },

  avatar: {
    type: String,
    default: "/uploads/profile/default.jpg"
  },

  mustChangePassword: { type: Boolean, default: true },
  active: { type: Boolean, default: true },

  online: {
    type: Boolean,
    default: false
  },

  lastSeen: {
    type: Date,
    // FIX: เดิม default: Date.now ทำให้พนักงานที่เพิ่งถูกสร้างขึ้นใหม่
    // (ยังไม่เคย login เลยสักครั้ง) ขึ้นสถานะ "ออนไลน์" ใน dashboard แอดมินทันที
    // เป็นเวลา 2 นาทีหลังสร้าง เปลี่ยนเป็น null แล้วให้ middleware/auth.js
    // เป็นคนตั้งค่าจริงตอน login/request ครั้งแรกแทน
    default: null
  },

  /* ===============================
     🔐 RESET PASSWORD SYSTEM
  =============================== */

  resetToken: {
    type: String,
    default: null
  },

  resetTokenExpire: {
    type: Date,
    default: null
  }

}, { timestamps: true });

module.exports = mongoose.model("Employee", employeeSchema);
