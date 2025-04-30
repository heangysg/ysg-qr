const express = require('express');
const router = express.Router();
const Receipt = require('../models/Receipt');

// CREATE a new receipt
router.post('/', async (req, res) => {
  try {
    const {
      customerId,
      customerName,
      phoneNumber,
      machineName,
      purchaseDate
    } = req.body;

    const receipt = new Receipt({
      customerId,
      customerName,
      phoneNumber,
      machineName,
      purchaseDate
    });

    await receipt.save();
    res.status(201).json(receipt);
  } catch (err) {
    console.error('Error saving receipt:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET a receipt by customer ID
router.get('/:customerId', async (req, res) => {
  try {
    const receipt = await Receipt.findOne({ customerId: req.params.customerId });
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }
    res.json(receipt);
  } catch (err) {
    console.error('Error fetching receipt:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET all receipts (for admin page)
router.get('/', async (req, res) => {
  try {
    const receipts = await Receipt.find().sort({ createdAt: -1 });
    res.json(receipts);
  } catch (err) {
    console.error('Error fetching receipts:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a receipt
router.delete('/:id', async (req, res) => {
  try {
    const result = await Receipt.findByIdAndDelete(req.params.id);
    if (!result) {
      return res.status(404).json({ message: 'Receipt not found' });
    }
    res.json({ message: 'Receipt deleted successfully' });
  } catch (error) {
    console.error('Error deleting receipt:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
