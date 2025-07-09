require('dotenv').config(); // This must be the very first line

// Add a console log here to debug if MONGODB_URI is loaded
console.log('MONGODB_URI from .env:', process.env.MONGODB_URI);


const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs'); // Import the file system module
const Receipt = require('./models/Receipt'); // Assuming Receipt model is correctly defined
const cloudinary = require('cloudinary').v2; // Import Cloudinary

const app = express();
const PORT = process.env.PORT || 4000;

// Ensure environment variables are set
if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.PRODUCT_PASSWORD || !process.env.SESSION_SECRET || !process.env.MONGODB_URI || !process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error("❌ ERROR: Please define ADMIN_USERNAME, ADMIN_PASSWORD, PRODUCT_PASSWORD, SESSION_SECRET, MONGODB_URI, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file.");
    process.exit(1); // Exit if essential environment variables are missing
}

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware setup
app.use(session({
    secret: process.env.SESSION_SECRET, // Use a strong secret from .env
    resave: false,
    saveUninitialized: false,
    cookie: {
        sameSite: 'lax',
        secure: false, // Set to true if using HTTPS in production
        httpOnly: true, // Recommended for security
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Serve static files from the 'public' directory, but protect them
// We will handle serving specific HTML files after authentication
app.use(express.static('public', { index: false })); // Disable default index serving

// Ensure the uploads directory exists (still useful for local development/fallback)
const uploadsDir = path.join(__dirname, 'public', 'uploads'); // Use path.join for cross-platform compatibility
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// --- Authentication Middleware ---

// Middleware to protect admin and index pages
const requireAdminAuth = (req, res, next) => {
    if (req.session.authenticated) {
        next(); // User is authenticated, proceed
    } else {
        // User is not authenticated, redirect to login page
        // Store the original URL to redirect back after successful login
        res.redirect(`/login.html?redirect=${encodeURIComponent(req.originalUrl)}`);
    }
};

// Middleware to protect product detail page
const requireProductAuth = (req, res, next) => {
    // Check if the product session is authenticated
    if (req.session.productAuthenticated) {
        next(); // User is authenticated, proceed
    } else {
        // If not authenticated, redirect to product login page
        // Ensure customerId is passed if available in the original request URL
        const customerId = req.params.id || req.query.customerId; // Get ID from params or query
        const redirectUrl = customerId ? `/product-login.html?customerId=${encodeURIComponent(customerId)}` : '/product-login.html';
        res.redirect(redirectUrl);
    }
};

// --- Routes for serving protected HTML files ---

// Serve login.html for main login
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve product-login.html for product detail login
app.get('/product-login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'product-login.html'));
});

// Protect index.html and admin.html
app.get('/index.html', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin.html', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Protect product.html
app.get('/product.html', requireProductAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'product.html'));
});


// Redirect root to index.html (which is protected)
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// --- Login API Endpoints ---

// Main login for admin and index pages
app.post('/login', (req, res) => {
    const { username, password, redirect } = req.body;
    if (
        username === process.env.ADMIN_USERNAME &&
        password === process.env.ADMIN_PASSWORD
    ) {
        req.session.authenticated = true;
        // Redirect to the original URL or a default page
        return res.json({ success: true, redirectUrl: redirect || '/index.html' });
    } else {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Product detail login
app.post('/product-login', (req, res) => {
    const { password, customerId } = req.body;
    if (password === process.env.PRODUCT_PASSWORD) {
        req.session.productAuthenticated = true;
        return res.json({ success: true, redirectUrl: `/product.html?customerId=${customerId}` });
    } else {
        return res.status(401).json({ success: false, message: 'Invalid password' });
    }
});

// Logout route to clear session for admin/index
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).json({ success: false, message: 'Failed to logout' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Logout route to clear session for product details
app.post('/product-logout', (req, res) => {
    req.session.productAuthenticated = false; // Clear only product authentication
    res.json({ success: true, message: 'Product session cleared' });
});

// API to check authentication status for admin/index
app.get('/check-admin-auth', (req, res) => {
    res.json({ authenticated: !!req.session.authenticated });
});

// API to check authentication status for product detail
app.get('/check-product-auth', (req, res) => {
    res.json({ authenticated: !!req.session.productAuthenticated });
});

// --- Existing API Endpoints (with potential protection) ---

// NEW: Search receipt by either MongoDB _id OR customerId (like "00001")
// This route now requires product authentication
app.get('/api/receipts/by-id/:id', requireProductAuth, async (req, res) => {
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

// POST route for /api/receipts (Protected by admin auth implicitly by index.html protection)
app.post('/api/receipts', requireAdminAuth, async (req, res) => {
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

// GET all receipts for admin page (Protected by admin auth)
app.get('/api/receipts', requireAdminAuth, async (req, res) => {
    try {
        const receipts = await Receipt.find({}); // Fetch all receipts
        res.json(receipts);
    } catch (error) {
        console.error('Error fetching receipts:', error);
        res.status(500).json({ message: 'Server error fetching receipts' });
    }
});

// GET a single receipt by its MongoDB _id (Protected by admin auth, not product auth)
app.get('/api/receipts/:id', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const receipt = await Receipt.findById(id); // Find by MongoDB's _id

        if (!receipt) {
            return res.status(404).json({ message: 'Receipt not found' });
        }
        res.json(receipt);
    } catch (error) {
        console.error('Error fetching single receipt:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid Receipt ID format' });
        }
        res.status(500).json({ message: 'Server error fetching receipt' });
    }
});

// Delete receipt (Protected by admin auth)
app.delete('/api/receipts/:id', requireAdminAuth, async (req, res) => {
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

// Update receipt (Protected by admin auth)
app.put('/api/receipts/:id', requireAdminAuth, async (req, res) => {
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

// API endpoint to get the next customer ID (Protected by admin auth implicitly by index.html protection)
app.get('/api/next-customer-id', requireAdminAuth, async (req, res) => {
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

// NEW ROUTE: Save QR code image to Cloudinary
app.post('/api/save-qr-code', requireAdminAuth, async (req, res) => {
    const { imageData, fileName } = req.body;

    if (!imageData || !imageData.startsWith('data:image/png;base64,')) {
        return res.status(400).json({ message: 'Invalid image data' });
    }

    try {
        // Upload image to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(imageData, {
            folder: 'qr_codes', // Optional: specify a folder in Cloudinary
            public_id: fileName.replace('.png', ''), // Use filename (without .png) as public_id
            overwrite: true // Overwrite if an image with the same public_id exists
        });

        console.log(`QR code image uploaded to Cloudinary: ${uploadResult.secure_url}`);
        res.status(200).json({ message: 'QR code image saved successfully!', imageUrl: uploadResult.secure_url });
    } catch (err) {
        console.error('Error uploading QR code image to Cloudinary:', err);
        res.status(500).json({ message: 'Failed to save QR code image to Cloudinary.', error: err.message });
    }
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI) // Ensure this uses process.env.MONGODB_URI
    .then(() => {
        console.log('✅ MongoDB Connected');
        app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
    })
    .catch(err => console.error('❌ MongoDB connection error:', err));
