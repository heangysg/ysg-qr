const mongoose = require('mongoose');
 

 const ReceiptSchema = new mongoose.Schema({
  customerId: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  machineName: { type: String, required: true },
  purchaseDate: { type: Date, required: true }
 });
 

 module.exports = mongoose.model('Receipt', ReceiptSchema);