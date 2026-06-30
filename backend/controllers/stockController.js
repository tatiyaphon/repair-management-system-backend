const Stock = require('../models/Stock');

exports.getAllStock = async (req, res) => {
  try {
    const stocks = await Stock.find();
    res.json(stocks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addStock = async (req, res) => {
  try {
    const newStock = new Stock(req.body);
    await newStock.save();
    res.json({ message: "เพิ่มสินค้าเข้าสู่คลังสำเร็จ" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateStock = async (req, res) => {
  try {
    const updated = await Stock.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteStock = async (req, res) => {
  try {
    await Stock.findByIdAndDelete(req.params.id);
    res.json({ message: "ลบสินค้าออกจากคลังสำเร็จ" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
