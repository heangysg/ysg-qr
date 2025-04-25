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

// Serve static files (index.html, etc.)
app.use(express.static(path.join(__dirname)));

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Atlas connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Schema
const receiptSchema = new mongoose.Schema({
  customerId: String,
  customerName: String,
  phoneNumber: String,
  machineName: String,
  purchaseDate: String,
});

const Receipt = mongoose.model('Receipt', receiptSchema);

// API to save receipt
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

// API to get receipt by customerId
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

// Route to serve index.html on root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT} or on Railway`);
});
