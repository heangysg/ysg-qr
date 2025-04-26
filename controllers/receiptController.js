const Receipt = require('../models/Receipt');
 

 // Create a new receipt
 exports.createReceipt = async (req, res) => {
  try {
  const { customerId, customerName, phoneNumber, machineName, purchaseDate } = req.body;
  const newReceipt = new Receipt({
  customerId,
  customerName,
  phoneNumber,
  machineName,
  purchaseDate
  });
  await newReceipt.save();
  res.status(201).json({ message: 'Receipt created successfully', receipt: newReceipt });
  } catch (error) {
  console.error('Error creating receipt:', error);
  res.status(500).json({ message: 'Error creating receipt' });
  }
 };
 

 // Get a receipt by CustomerID
 exports.getReceiptByCustomerId = async (req, res) => {
  try {
  const customerId = req.params.customerId;
  const receipt = await Receipt.findOne({ customerId: customerId });
  if (receipt) {
  res.status(200).json(receipt);
  } else {
  res.status(404).json({ message: 'Receipt not found' });
  }
  } catch (error) {
  console.error('Error getting receipt by CustomerID:', error);
  res.status(500).json({ message: 'Error getting receipt' });
  }
 };