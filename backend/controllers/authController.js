const Employee = require('../models/Employee');
const bcrypt = require('bcryptjs');

// แอดมินเพิ่มสมาชิก
exports.adminCreateUser = async (req, res) => {
  try {
    // ต้องเป็นแอดมินเท่านั้น
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'เฉพาะแอดมินเท่านั้น' });
    }

    const { name, email, password, role } = req.body;

    // เช็กอีเมลซ้ำ
    const exists = await Employee.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: 'อีเมลนี้ถูกใช้แล้ว' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new Employee({
      name,
      email,
      password: hashedPassword,
      role // admin | staff | tech
    });

    await newUser.save();

    res.json({
      message: 'เพิ่มผู้ใช้งานเรียบร้อย',
      user: {
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
