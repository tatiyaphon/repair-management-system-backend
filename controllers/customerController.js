const Customer = require('../models/Customer');

exports.getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.find();
    res.json(customers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addCustomer = async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    res.json({ message: "เพิ่มลูกค้าใหม่สำเร็จ" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
