const jwt = require("jsonwebtoken");

module.exports = (roles = []) => {
  // รองรับทั้ง string และ array
  if (typeof roles === "string") {
    roles = [roles];
  }

  return (req, res, next) => {
    // ต้องผ่าน auth middleware มาก่อน
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    // ตรวจสอบสิทธิ์
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "ไม่มีสิทธิ์เข้าถึง"
      });
    }

    next();
  };
};
