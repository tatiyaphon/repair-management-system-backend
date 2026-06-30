const jwt = require("jsonwebtoken");
const Employee = require("../models/Employee");

module.exports = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "No token provided"
      });
    }

    const token = header.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = {
      userId: decoded.userId || decoded.id,
      role: decoded.role
    };

    // FIX: อัปเดต lastSeen + ดึงชื่อผู้ใช้มาแนบใน req.user
    // (แยก try-catch ออกมาเอง ป้องกัน DB ช้า/ล่ม แล้วทำให้ request ทั้งหมดพังตามไปด้วย)
    try {
      const emp = await Employee.findByIdAndUpdate(
        req.user.userId,
        { lastSeen: new Date() },
        { new: true, select: "firstName lastName" }
      );

      // FIX: เดิม activity log ทุกที่อ้าง req.user.userName แต่ไม่เคยถูกเซ็ตค่า
      // ทำให้ log บันทึกเป็น "Unknown" เสมอ ตอนนี้เซ็ตให้ใช้งานได้จริง
      if (emp) {
        req.user.userName = `${emp.firstName || ""} ${emp.lastName || ""}`.trim();
      }
    } catch (lastSeenErr) {
      console.error("LASTSEEN UPDATE FAILED (ไม่กระทบ request หลัก):", lastSeenErr.message);
    }

    next();

  } catch (err) {
    console.error("Auth error:", err.message);

    return res.status(401).json({
      message: "Invalid token"
    });
  }
};
