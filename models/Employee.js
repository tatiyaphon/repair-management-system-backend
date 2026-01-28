const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName:  { type: String, required: true },
  email:     { type: String, required: true, unique: true },
  password:  { type: String, required: true },

  role: {
    type: String,
    enum: ["admin", "tech", "staff"],
    default: "staff"
  },

  avatar: {
    type: String,
    default: "/uploads/profile/default.jpg"
  },

  mustChangePassword: { type: Boolean, default: true },
  active: { type: Boolean, default: true }

}, { timestamps: true });

module.exports = mongoose.model("Employee", employeeSchema);
