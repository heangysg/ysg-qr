const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  customerId: { type: String, required: true, unique: true, index: true },
  customerName: { type: String, index: true },
  phoneNumber: { type: String, index: true },
  location: String,
  machineName: String,
  purchaseDate: { type: String, index: true }
}, { 
  timestamps: true 
});

// High-performance compound indexes for instant sorting & search lookups
receiptSchema.index({ customerId: 1, createdAt: -1 });
receiptSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Receipt', receiptSchema);
