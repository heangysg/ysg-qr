const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static files (HTML, CSS, JS) from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Schema
const Receipt = require('./models/Receipt');


// API to store data
app.post('/api/receipts', async (req, res) => {
  try {
    const receipt = new Receipt(req.body);
    await receipt.save();
    res.status(200).json({ message: 'Receipt saved successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save receipt' });
  }
});

// API to get data by Customer ID
app.get('/api/receipts/:customerId', async (req, res) => {
  try {
    const receipt = await Receipt.findOne({ customerId: req.params.customerId });
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }
    res.status(200).json(receipt);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve receipt' });
  }
});

// Default route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
