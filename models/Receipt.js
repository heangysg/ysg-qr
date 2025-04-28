
const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  customerId: String,
  customerName: String,
  phoneNumber: String,
  machineName: String,
  purchaseDate: String
});

module.exports = mongoose.model('Receipt', receiptSchema);
