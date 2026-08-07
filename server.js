require('dotenv').config();

const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Receipt = require('./models/Receipt');
const cloudinary = require('cloudinary').v2;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;

// Security: Disable Express server fingerprinting
app.disable('x-powered-by');

// Constant-time string comparison helper to prevent timing attacks
function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

// Ensure environment variables are set
if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.PRODUCT_PASSWORD || !process.env.SESSION_SECRET || !process.env.MONGODB_URI || !process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error("❌ ERROR: Required environment variables are missing in .env file.");
    process.exit(1);
}

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ========================
// SECURITY & DDOS MIDDLEWARE
// ========================
app.set('trust proxy', 1);

// 1. Helmet HTTP Security Headers & Strict CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            scriptSrcElem: ["'self'", "'unsafe-inline'", "blob:", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            workerSrc: ["'self'", "blob:"],
            connectSrc: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// 2. Custom Security Headers
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// 3. DDoS Defense: Global Rate Limiting (1000 requests per 15 min, excluding static assets)
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    skip: (req) => {
        return /\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i.test(req.path);
    },
    message: { success: false, message: 'Too many requests from this IP. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use(globalLimiter);

// 4. DDoS Defense: Strict Authentication Rate Limiter (10 attempts per 15 min)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many login attempts. Your IP has been temporarily locked for 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

// 5. Anti-Slowloris Request Timeout (30 seconds limit)
app.use((req, res, next) => {
    res.setTimeout(30000, () => {
        res.status(408).json({ success: false, message: 'Request Timeout' });
    });
    next();
});

// 6. Strict Request Body Size Limits (Prevents buffer overflow / payload attacks)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// 7. NoSQL Injection Prevention Middleware
function sanitizeInput(obj) {
    if (obj && typeof obj === 'object') {
        for (const key in obj) {
            if (key.startsWith('$') || key.includes('.')) {
                delete obj[key];
            } else if (typeof obj[key] === 'object') {
                sanitizeInput(obj[key]);
            }
        }
    }
    return obj;
}

app.use((req, res, next) => {
    if (req.body) sanitizeInput(req.body);
    if (req.query) sanitizeInput(req.query);
    if (req.params) sanitizeInput(req.params);
    next();
});

// 8. Sensitive Files & System Files Blocker (Prevents .env, .git, package.json, server.js leaks)
app.use((req, res, next) => {
    const sensitiveFilePattern = /^\/(\.env|\.git|\.htaccess|package.*\.json|server\.js|models|controllers|README\.md)/i;
    if (sensitiveFilePattern.test(req.path)) {
        return res.status(403).send('Access Denied');
    }
    next();
});

// ========================
// SESSION CONFIGURATION
// ========================
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true, // Prevents XSS cookie theft
        maxAge: 8 * 60 * 60 * 1000 // 8 hours session expiration
    },
    name: 'ysgSession',
    rolling: true
}));

// ========================
// NO-CACHE MIDDLEWARE (Prevents Browser bfcache back-button leaks)
// ========================
const noCache = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
};

app.use(noCache);

// ========================
// AUTH MIDDLEWARE
// ========================
const requireAdminAuth = (req, res, next) => {
    if (req.session && req.session.authenticated) {
        next();
    } else {
        res.redirect(`/login.html?redirect=${encodeURIComponent(req.originalUrl)}`);
    }
};

const requireProductAuth = (req, res, next) => {
    if (req.session && req.session.productAuthenticated) {
        next();
    } else {
        const customerId = req.params.id || req.query.customerId;
        const cleanCustomerId = typeof customerId === 'string' ? customerId.replace(/[^a-zA-Z0-9_-]/g, '') : '';
        const redirectUrl = cleanCustomerId ? `/product-login.html?customerId=${encodeURIComponent(cleanCustomerId)}` : '/product-login.html';
        res.redirect(redirectUrl);
    }
};

// ========================
// HTML ROUTE PROTECTIONS
// ========================
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/product-login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'product-login.html'));
});

app.get('/index.html', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin.html', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/product.html', requireProductAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'product.html'));
});

app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// Serve static assets (CSS, JS, Images) from 'public' directory
app.use(express.static('public', { index: false }));

// ========================
// AUTH API ENDPOINTS
// ========================

// Main Admin Login Endpoint (Hardened against Bruteforce, Timing Attacks, Session Fixation)
app.post('/login', authLimiter, (req, res) => {
    const { username, password, redirect } = req.body;

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    if (safeCompare(username, process.env.ADMIN_USERNAME) && safeCompare(password, process.env.ADMIN_PASSWORD)) {
        req.session.regenerate((err) => {
            if (err) console.error('Session regen error:', err);
            req.session.authenticated = true;
            const targetRedirect = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/index.html';
            return res.json({ success: true, redirectUrl: targetRedirect });
        });
    } else {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Product Login Endpoint
app.post('/product-login', authLimiter, (req, res) => {
    const { password, customerId } = req.body;

    if (!password || typeof password !== 'string') {
        return res.status(400).json({ success: false, message: 'Password is required' });
    }

    if (safeCompare(password, process.env.PRODUCT_PASSWORD)) {
        const cleanCustomerId = typeof customerId === 'string' ? customerId.replace(/[^a-zA-Z0-9_-]/g, '') : '';
        req.session.productAuthenticated = true;
        return res.json({ success: true, redirectUrl: `/product.html?customerId=${encodeURIComponent(cleanCustomerId)}` });
    } else {
        return res.status(401).json({ success: false, message: 'Invalid password' });
    }
});

// Logout Admin Session
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Failed to logout' });
        }
        res.clearCookie('ysgSession');
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Logout Product Session
app.post('/product-logout', (req, res) => {
    if (req.session) {
        req.session.productAuthenticated = false;
    }
    res.json({ success: true, message: 'Product session cleared' });
});

// Auth Status Check Endpoints
app.get('/check-admin-auth', (req, res) => {
    res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

app.get('/check-product-auth', (req, res) => {
    res.json({ authenticated: !!(req.session && req.session.productAuthenticated) });
});

// ========================
// RECEIPT BUSINESS LOGIC & API
// ========================

// GET receipt by customer ID or Mongo _id
app.get('/api/receipts/by-id/:id', requireProductAuth, async (req, res) => {
    const cleanId = String(req.params.id || '').trim();
    if (!cleanId) return res.status(400).json({ message: 'Invalid ID format' });

    try {
        let receipt = null;
        if (/^[a-f\d]{24}$/i.test(cleanId)) {
            receipt = await Receipt.findById(cleanId).lean();
        }
        if (!receipt) {
            receipt = await Receipt.findOne({ customerId: cleanId }).lean();
        }

        if (!receipt) {
            return res.status(404).json({ message: 'Receipt not found' });
        }
        res.json(receipt);
    } catch (error) {
        console.error('Error fetching receipt:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST new receipt
app.post('/api/receipts', requireAdminAuth, async (req, res) => {
    try {
        const customerName = String(req.body.customerName || '').trim();
        const phoneNumber = String(req.body.phoneNumber || '').trim();
        const location = String(req.body.location || '').trim();
        const machineName = String(req.body.machineName || '').trim();
        const purchaseDate = String(req.body.purchaseDate || '').trim();

        if (!customerName || !phoneNumber || !machineName || !purchaseDate) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const result = await Receipt.aggregate([
            {
                $project: {
                    _id: 0,
                    customerIdNum: { $convert: { input: "$customerId", to: "int", onError: 0, onNull: 0 } }
                }
            },
            { $sort: { customerIdNum: -1 } },
            { $limit: 1 }
        ]);

        let nextIdNumber = 1;
        if (result.length > 0 && !isNaN(result[0].customerIdNum)) {
            nextIdNumber = result[0].customerIdNum + 1;
        }
        const newCustomerId = String(nextIdNumber).padStart(6, '0');

        const newReceipt = new Receipt({
            customerId: newCustomerId,
            customerName,
            phoneNumber,
            location,
            machineName,
            purchaseDate,
        });

        await newReceipt.save();
        res.status(201).json({
            message: 'Receipt saved successfully',
            receipt: newReceipt,
            nextCustomerId: String(nextIdNumber + 1).padStart(6, '0')
        });
    } catch (error) {
        console.error('Error saving receipt:', error.message);
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Duplicate ID generated. Please try again.' });
        }
        res.status(500).json({ error: 'Error saving receipt data' });
    }
});

// GET all receipts (High-Performance Lean Query)
app.get('/api/receipts', requireAdminAuth, async (req, res) => {
    try {
        const receipts = await Receipt.find({}).sort({ createdAt: -1 }).lean();
        res.json(receipts);
    } catch (error) {
        console.error('Error fetching receipts:', error.message);
        res.status(500).json({ message: 'Server error fetching receipts' });
    }
});

// GET single receipt
app.get('/api/receipts/:id', requireAdminAuth, async (req, res) => {
    try {
        const cleanId = String(req.params.id || '').trim();
        const receipt = await Receipt.findById(cleanId);
        if (!receipt) return res.status(404).json({ message: 'Receipt not found' });
        res.json(receipt);
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching receipt' });
    }
});

// DELETE receipt
app.delete('/api/receipts/:id', requireAdminAuth, async (req, res) => {
    try {
        const cleanId = String(req.params.id || '').trim();
        const result = await Receipt.findByIdAndDelete(cleanId);
        if (!result) return res.status(404).json({ message: 'Receipt not found' });
        res.json({ message: 'Receipt deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error deleting receipt' });
    }
});

// UPDATE receipt
app.put('/api/receipts/:id', requireAdminAuth, async (req, res) => {
    try {
        const cleanId = String(req.params.id || '').trim();
        const updateData = {
            customerId: String(req.body.customerId || '').trim(),
            customerName: String(req.body.customerName || '').trim(),
            phoneNumber: String(req.body.phoneNumber || '').trim(),
            location: String(req.body.location || '').trim(),
            machineName: String(req.body.machineName || '').trim(),
            purchaseDate: String(req.body.purchaseDate || '').trim(),
        };

        const result = await Receipt.findByIdAndUpdate(cleanId, updateData, { new: true });
        if (!result) return res.status(404).json({ message: 'Receipt not found' });
        res.json({ message: 'Receipt updated successfully', receipt: result });
    } catch (error) {
        res.status(500).json({ message: 'Server error updating receipt' });
    }
});

// Next customer ID endpoint
app.get('/api/next-customer-id', requireAdminAuth, async (req, res) => {
    try {
        const result = await Receipt.aggregate([
            {
                $project: {
                    _id: 0,
                    customerIdNum: { $convert: { input: "$customerId", to: "int", onError: 0, onNull: 0 } }
                }
            },
            { $sort: { customerIdNum: -1 } },
            { $limit: 1 }
        ]);

        let nextIdNumber = 1;
        if (result.length > 0 && !isNaN(result[0].customerIdNum)) {
            nextIdNumber = result[0].customerIdNum + 1;
        }

        const nextCustomerId = String(nextIdNumber).padStart(6, '0');
        res.json({ nextCustomerId });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// BACKUP: Export all receipts
app.get('/api/backup', requireAdminAuth, async (req, res) => {
    try {
        const receipts = await Receipt.find({});
        const backupData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            data: receipts
        };
        res.setHeader('Content-disposition', 'attachment; filename=ysg_backup_' + new Date().toISOString().split('T')[0] + '.json');
        res.setHeader('Content-type', 'application/json');
        res.write(JSON.stringify(backupData, null, 2));
        res.end();
    } catch (error) {
        res.status(500).json({ message: 'Backup failed' });
    }
});

// RESTORE: Import data
app.post('/api/restore', requireAdminAuth, async (req, res) => {
    try {
        const { backupData } = req.body;
        if (!backupData || !Array.isArray(backupData.data)) {
            return res.status(400).json({ message: 'Invalid backup format' });
        }

        const dataToRestore = backupData.data;
        const ops = dataToRestore.map(item => ({
            updateOne: {
                filter: { customerId: String(item.customerId) },
                update: { $set: item },
                upsert: true
            }
        }));

        const result = await Receipt.bulkWrite(ops);
        res.json({
            success: true,
            message: `Restoration complete. Upserted: ${result.upsertedCount}, Modified: ${result.modifiedCount}`,
            count: dataToRestore.length
        });
    } catch (error) {
        res.status(500).json({ message: 'Restore failed: ' + error.message });
    }
});

// Save QR Code to Cloudinary
app.post('/api/save-qr-code', requireAdminAuth, async (req, res) => {
    const { imageData, fileName } = req.body;
    if (!imageData || typeof imageData !== 'string' || !imageData.startsWith('data:image/png;base64,')) {
        return res.status(400).json({ message: 'Invalid image data' });
    }

    try {
        const cleanFileName = String(fileName || 'qr_code').replace(/[^a-zA-Z0-9_-]/g, '');
        const uploadResult = await cloudinary.uploader.upload(imageData, {
            folder: 'qr_codes',
            public_id: cleanFileName,
            overwrite: true,
            format: 'png',
            transformation: [{ width: 200, height: 200, crop: "scale" }]
        });

        res.status(200).json({
            message: 'QR code saved successfully!',
            imageUrl: uploadResult.secure_url
        });
    } catch (err) {
        console.error('❌ Cloudinary upload error:', err.message);
        res.status(500).json({ message: 'Failed to save QR code' });
    }
});

// Global Error Sanitizer Middleware (Prevents leakage of internal traces/credentials)
app.use((err, req, res, next) => {
    console.error('❌ Internal Error:', err.message);
    res.status(500).json({ success: false, message: 'An internal server error occurred.' });
});

// Database connection & startup
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB Connected');
        app.listen(PORT, () => console.log(`🚀 Server running securely on port ${PORT}`));
    })
    .catch(err => console.error('❌ MongoDB connection error:', err.message));