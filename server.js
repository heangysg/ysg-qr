const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;


// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static files from the root folder (where your HTML files are)
app.use(express.static(path.join(__dirname)));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schema
const receiptSchema = new mongoose.Schema({
  customerId: String,
  customerName: String,
  phoneNumber: String,
  machineName: String,
  purchaseDate: String
});

const Receipt = mongoose.model('Receipt', receiptSchema);

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

// API to get data by ID
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

// Redirect root to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
