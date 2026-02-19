const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  },

  userName: {
    type: String,
    required: true
  },

  action: {
    type: String,
    required: true
  },

  detail: {
    type: String,
    default: "-"
  },

  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
    default: null
  }

}, { timestamps: true });

module.exports = mongoose.model("Activity", activitySchema);
