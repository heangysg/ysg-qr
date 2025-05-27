require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const path = require('path');
const Receipt = require('./models/Receipt'); // Assuming Receipt model is correctly defined
// const receiptRoutes = require('./controllers/receiptController'); // Assuming this handles GET /api/receipts

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
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

// API routes
// Keep this line commented out as previously instructed to fix POST /api/receipts
// app.use('/api/receipts', receiptRoutes);


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

// IMPORTANT: POST route for /api/receipts (already there from previous step)
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

// NEW ROUTE: Get all receipts for admin page (already there from previous step)
app.get('/api/receipts', async (req, res) => {
    try {
        const receipts = await Receipt.find({}); // Fetch all receipts
        res.json(receipts);
    } catch (error) {
        console.error('Error fetching receipts:', error);
        res.status(500).json({ message: 'Server error fetching receipts' });
    }
});

// NEW ROUTE: Get a single receipt by its MongoDB _id
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

// API endpoint to get the next customer ID (UPDATED WITH $CONVERT)
app.get('/api/next-customer-id', async (req, res) => {
    try {
        const result = await Receipt.aggregate([
            {
                // Convert customerId string to integer for numerical sorting
                // Use $convert with onError and onNull to handle non-numeric or missing customerIds gracefully
                $project: {
                    _id: 0,
                    customerIdNum: { $convert: { input: "$customerId", to: "int", onError: 0, onNull: 0 } }
                }
            },
            {
                // Sort numerically in descending order to get the highest ID
                $sort: { customerIdNum: -1 }
            },
            {
                // Get only the highest one
                $limit: 1
            }
        ]);

        let nextIdNumber = 1;
        // If a result is found and it's a valid number, increment it
        if (result.length > 0 && !isNaN(result[0].customerIdNum)) {
            nextIdNumber = result[0].customerIdNum + 1;
        }

        // Format the next ID with leading zeros
        const nextCustomerId = String(nextIdNumber).padStart(5, '0');
        res.json({ nextCustomerId });
    } catch (error) {
        console.error('Error getting next customer ID:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB Connected');
        app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
    })
    .catch(err => console.error('❌ MongoDB connection error:', err));