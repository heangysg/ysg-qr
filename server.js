const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

const { createReceipt, getReceiptByCustomerId } = require('./controllers/receiptController');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Optional if frontend files inside /public

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch((err) => console.error('MongoDB connection error:', err));

// API routes
app.post('/api/receipts', createReceipt);
app.get('/api/receipts/:customerId', getReceiptByCustomerId);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
