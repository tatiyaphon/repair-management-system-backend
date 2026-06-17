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

    // อัปเดตสถานะการใช้งานล่าสุด
    await Employee.findByIdAndUpdate(
      req.user.userId,
      {
        lastSeen: new Date(),
        online: true
      }
    );

    next();

  } catch (err) {
    console.error("Auth error:", err.message);

    return res.status(401).json({
      message: "Invalid token"
    });
  }
};