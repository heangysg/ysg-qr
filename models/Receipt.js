
const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  customerId: { type: String, required: true, unique: true },
  customerName: String,
  phoneNumber: String,
  location: String, // ✅ Add this
  machineName: String,
  purchaseDate: String
});

module.exports = mongoose.model('Receipt', receiptSchema);

