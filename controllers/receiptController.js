const Receipt = require('../models/Receipt');

// Create a new receipt
exports.createReceipt = async (req, res) => {
  try {
    const newReceipt = new Receipt(req.body);
    await newReceipt.save();
    res.status(201).json(newReceipt);
  } catch (error) {
    console.error('Error saving receipt:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get receipt by customerId
exports.getReceiptByCustomerId = async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const receipt = await Receipt.findOne({ customerId: customerId });

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    res.status(200).json(receipt);
  } catch (error) {
    console.error('Error fetching receipt:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
