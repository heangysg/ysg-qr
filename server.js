require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const Receipt = require('./models/Receipt'); // ADD THIS if not yet
const receiptRoutes = require('./controllers/receiptController');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static('public'));

app.use('/api/receipts', receiptRoutes);

// ⭐ ADD THIS new route for deleting
app.delete('/api/receipts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Receipt.findByIdAndDelete(id);

    if (!result) {
      return res.status(404).json({ message: 'Receipt not found' });
    }

    res.json({ message: 'Receipt deleted successfully' });
  } catch (error) {
    console.error('Error deleting receipt:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB Connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error('MongoDB connection error:', err));
