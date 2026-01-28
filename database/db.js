// backend/database/db.js
const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://127.0.0.1:27017/repair_management_system'; // หรือชื่อ DB ของคุณ

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected successfully!');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
