require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const path = require('path');
const Receipt = require('./models/Receipt');
const receiptRoutes = require('./controllers/receiptController');

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
app.use('/api/receipts', receiptRoutes);

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



// API to check authentication status
app.get('/check-auth', (req, res) => {
    res.json({ authenticated: !!req.session.authenticated });
});


// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB Connected');
        app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
    })
    .catch(err => console.error('❌ MongoDB connection error:', err));