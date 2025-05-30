require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs'); // Import the file system module
const Receipt = require('./models/Receipt'); // Assuming Receipt model is correctly defined

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Serve static files from the 'public' directory
app.use(session({
    secret: process.env.SESSION_SECRET || 'secretkey',
    resave: false,
    saveUninitialized: false,
    cookie: {
        sameSite: 'lax',
        secure: false,
        httpOnly: true // Recommended for security
    }
}));

// NEW: Search receipt by either MongoDB _id OR customerId (like "00001")
app.get('/api/receipts/by-id/:id', async (req, res) => {
    const { id } = req.params;

    try {
        let receipt;

        // First, try as MongoDB _id
        if (/^[a-f\d]{24}$/i.test(id)) {
            receipt = await Receipt.findById(id);
        }

        // If not found or not a valid ObjectId, try customerId
        if (!receipt) {
            receipt = await Receipt.findOne({ customerId: id });
        }

        if (!receipt) {
            return res.status(404).json({ message: 'Receipt not found' });
        }

        res.json(receipt);
    } catch (error) {
        console.error('Error in /by-id/:id route:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Ensure the uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Secure login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (
        username === process.env.ADMIN_USERNAME &&
        password === process.env.ADMIN_PASSWORD
    ) {
        req.session.authenticated = true;
        return res.redirect('/admin.html');
    } else {
        return res.send('<script>alert("Invalid credentials"); window.location.href="/admin.html";</script>');
    }
});

// Logout route to clear session
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.sendStatus(500);
        }
        res.clearCookie('connect.sid');
        res.sendStatus(200);
    });
});

// Protect admin.html route
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// POST route for /api/receipts
app.post('/api/receipts', async (req, res) => {
    try {
        const { customerName, phoneNumber, location, machineName, purchaseDate } = req.body;

        const latestReceipt = await Receipt.findOne().sort({ customerId: -1 });
        let nextIdNumber = 1;

        if (latestReceipt && latestReceipt.customerId) {
            const lastNumber = parseInt(latestReceipt.customerId, 10);
            if (!isNaN(lastNumber)) {
                nextIdNumber = lastNumber + 1;
            }
        }
        const newCustomerId = String(nextIdNumber).padStart(5, '0');

        const newReceipt = new Receipt({
            customerId: newCustomerId, // Assign the auto-generated ID
            customerName,
            phoneNumber,
            location,
            machineName,
            purchaseDate,
        });

        await newReceipt.save();
        res.status(201).json({ message: 'Receipt saved successfully', receipt: newReceipt, nextCustomerId: String(nextIdNumber + 1).padStart(5, '0') });
    } catch (error) {
        console.error('Error saving receipt:', error);
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Duplicate ID generated. Please try again or refresh.' });
        }
        res.status(500).json({ error: 'Error saving receipt data' });
    }
});

// GET all receipts for admin page
app.get('/api/receipts', async (req, res) => {
    try {
        const receipts = await Receipt.find({}); // Fetch all receipts
        res.json(receipts);
    } catch (error) {
        console.error('Error fetching receipts:', error);
        res.status(500).json({ message: 'Server error fetching receipts' });
    }
});

// GET a single receipt by its MongoDB _id
app.get('/api/receipts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const receipt = await Receipt.findById(id); // Find by MongoDB's _id

        if (!receipt) {
            return res.status(404).json({ message: 'Receipt not found' });
        }
        res.json(receipt);
    } catch (error) {
        console.error('Error fetching single receipt:', error);
        // It's good practice to check for CastError if ID format is invalid
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid Receipt ID format' });
        }
        res.status(500).json({ message: 'Server error fetching receipt' });
    }
});

// Delete receipt
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

// Update receipt
app.put('/api/receipts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedReceipt = req.body;
        const result = await Receipt.findByIdAndUpdate(id, updatedReceipt, { new: true });

        if (!result) {
            return res.status(404).json({ message: 'Receipt not found' });
        }

        res.json({ message: 'Receipt updated successfully', receipt: result });
    } catch (error) {
        console.error('Error updating receipt:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// API to check authentication status
app.get('/check-auth', (req, res) => {
    res.json({ authenticated: !!req.session.authenticated });
});

// API endpoint to get the next customer ID
app.get('/api/next-customer-id', async (req, res) => {
    try {
        const result = await Receipt.aggregate([
            {
                $project: {
                    _id: 0,
                    customerIdNum: { $convert: { input: "$customerId", to: "int", onError: 0, onNull: 0 } }
                }
            },
            {
                $sort: { customerIdNum: -1 }
            },
            {
                $limit: 1
            }
        ]);

        let nextIdNumber = 1;
        if (result.length > 0 && !isNaN(result[0].customerIdNum)) {
            nextIdNumber = result[0].customerIdNum + 1;
        }

        const nextCustomerId = String(nextIdNumber).padStart(5, '0');
        res.json({ nextCustomerId });
    } catch (error) {
        console.error('Error getting next customer ID:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// NEW ROUTE: Save QR code image to uploads folder
app.post('/api/save-qr-code', (req, res) => {
    const { imageData, fileName } = req.body;

    if (!imageData || !imageData.startsWith('data:image/png;base64,')) {
        return res.status(400).json({ message: 'Invalid image data' });
    }

    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const filePath = path.join(uploadsDir, fileName);

    fs.writeFile(filePath, imageBuffer, (err) => {
        if (err) {
            console.error('Error saving QR code image:', err);
            return res.status(500).json({ message: 'Failed to save QR code image.' });
        }
        console.log(`QR code image saved: ${filePath}`);
        res.status(200).json({ message: 'QR code image saved successfully!', imageUrl: `/uploads/${fileName}` });
    });
});

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB Connected');
        app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
    })
    .catch(err => console.error('❌ MongoDB connection error:', err));
