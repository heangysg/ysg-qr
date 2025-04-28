
const express = require('express');
const router = express.Router();
const Receipt = require('../models/Receipt');

router.post('/', async (req, res) => {
  try {
    const receipt = new Receipt(req.body);
    await receipt.save();
    res.status(201).json(receipt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:customerId', async (req, res) => {
  try {
    const receipt = await Receipt.findOne({ customerId: req.params.customerId });
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }
    res.json(receipt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const receipts = await Receipt.find();
    res.json(receipts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
