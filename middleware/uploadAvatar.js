const multer = require("multer");
const path = require("path");
const fs = require("fs");

// FIX: เดิม path ปลายทางคือ "../uploads/profile" (จาก middleware/)
// = <project root>/uploads/profile ซึ่งไม่ตรงกับที่ server.js เสิร์ฟ static จริง
// (server.js เสิร์ฟจาก "public/uploads" เท่านั้น) ทำให้รูปที่อัปโหลดเปิดไม่ขึ้นเลย
// แก้ให้ชี้ไปที่ public/uploads/profile ให้ตรงกับที่ employeeRoutes.js ใช้งานจริง
const UPLOAD_DIR = path.join(__dirname, "../public/uploads/profile");

// กันโฟลเดอร์ไม่มีอยู่จริงตอน deploy ครั้งแรก
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);

    // FIX: เดิมตั้งชื่อไฟล์ตายตัวเป็น user_<id>.<ext> เฉยๆ
    // ถ้า user เปลี่ยนรูปแล้วนามสกุลไฟล์ใหม่ไม่ตรงกับของเดิม (เช่นจาก .png เป็น .jpg)
    // ไฟล์เก่าจะค้างอยู่ในโฟลเดอร์ไม่มีวันถูกลบ (ขยะสะสมเรื่อยๆ)
    // ก่อนเซฟไฟล์ใหม่ ให้ลบรูปเก่าของ user คนนี้ทุกนามสกุลทิ้งก่อน
    const userId = req.user.userId;

    try {
      const existing = fs.readdirSync(UPLOAD_DIR)
        .filter(f => f.startsWith(`user_${userId}.`));

      existing.forEach(f => {
        fs.unlinkSync(path.join(UPLOAD_DIR, f));
      });
    } catch (err) {
      console.error("ลบรูปโปรไฟล์เก่าไม่สำเร็จ (ไม่ใช่ error ร้ายแรง):", err.message);
    }

    cb(null, `user_${userId}${ext}`);
  }
});

module.exports = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("ต้องเป็นไฟล์รูปภาพเท่านั้น"));
    } else {
      cb(null, true);
    }
  }
});
