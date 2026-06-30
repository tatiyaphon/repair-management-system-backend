const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema({
  action: {
    type: String,
    required: true
  },

  // FIX: เดิม schema ใช้ field "user"/"job"/"description"
  // แต่ทุก route (activityRoutes.js, jobRoutes.js) และหน้า activity_log.html
  // ส่ง/อ่านเป็น userId, userName, jobId, detail กันหมด
  // mongoose จึงตัด field ที่ไม่รู้จักทิ้งแบบเงียบๆ บันทึกเป็นค่าว่างมาตลอด
  // แก้ให้ field ตรงกับของจริงที่ใช้งานทั้งระบบ
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee"
  },
  userName: {
    type: String,
    default: "Unknown"
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job"
  },
  detail: String,
  ipAddress: String,

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Activity", activitySchema);
