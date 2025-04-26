const Receipt = require("../models/Receipt");

const createReceipt = async (req, res) => {
  try {
    const receipt = new Receipt(req.body);
    await receipt.save();
    res.status(201).json(receipt);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error creating receipt" });
  }
};

const getReceiptByCustomerId = async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const receipt = await Receipt.findOne({ customerId: customerId });

    if (!receipt) {
      return res.status(404).json({ error: "Receipt not found" });
    }

    res.json(receipt);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error fetching receipt" });
  }
};

module.exports = { createReceipt, getReceiptByCustomerId };
