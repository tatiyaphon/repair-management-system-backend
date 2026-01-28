const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  email: { type: String, lowercase: true, trim: true },
  address: String,
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
