const express = require('express');
const multer = require('multer');
const session = require('express-session');
const flash = require('connect-flash');
const axios = require('axios');
// load environment variables from .env if present
require('dotenv').config();
const bcrypt = require('bcryptjs');
const app = express();
const ProductController = require('./controllers/ProductController');
const CartController = require('./controllers/CartController');
const AuthController = require('./controllers/AuthController');
const User = require('./models/User');

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});

const upload = multer({ storage: storage });

// NOTE: database access is handled by the MVC model (`models/Product.js`).
// Removed direct database connection code from this file.

// Set up view engine
app.set('view engine', 'ejs');
//  enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({
    extended: false
}));
// parse JSON bodies (for PayPal API calls)
app.use(express.json());

// session + flash middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(flash());

// expose user and flash messages to views
app.use((req, res, next) => {
    res.locals.user = req.session ? req.session.user : null;
    res.locals.errors = req.flash ? req.flash('error') : [];
    res.locals.messages = req.flash ? req.flash('success') : [];
    // allow toggling custom stylesheet (default enabled)
    res.locals.useCustomCss = app.locals.useCustomCss !== undefined ? app.locals.useCustomCss : true;
    // expose PayPal client id to templates
    res.locals.PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
    next();
});

// default app-level flag for using custom CSS
app.locals.useCustomCss = app.locals.useCustomCss !== undefined ? app.locals.useCustomCss : true;

// Define routes
// Root landing page - render with res.locals so templates can access session user
app.get('/', (req, res) => res.render('index'));

// Dev helper: toggle inclusion of custom CSS across the app
app.get('/toggle-css', (req, res) => {
    app.locals.useCustomCss = !app.locals.useCustomCss;
    // update res.locals for immediate effect
    res.locals.useCustomCss = app.locals.useCustomCss;
    const referer = req.get('Referer') || '/';
    res.redirect(referer);
});

// PayPal endpoints used by the client-side PayPal SDK
// Inline PayPal routes like StudentFinesAppPaypal: create-order and capture-order live in app.js
app.post('/api/paypal/create-order', async (req, res) => {
    try {
        const userId = req.session && req.session.user ? req.session.user.id : null;
        let cartItems = [];
        if (userId) {
            const Cart = require('./models/Cart');
            cartItems = await new Promise((resolve, reject) => Cart.getItemsByUser(userId, (err, items) => err ? reject(err) : resolve(items)));
            cartItems = (cartItems || []).map(it => ({ id: it.product_id, productName: it.product_name, quantity: it.quantity, price: it.price }));
        } else {
            cartItems = req.session.cart || [];
        }
        if (!cartItems || cartItems.length === 0) return res.status(400).json({ error: 'Cart is empty' });

        const deliveryFee = parseFloat(req.body.deliveryFee || 0) || 0;
        const subtotal = cartItems.reduce((s, it) => s + it.price * it.quantity, 0);
        const finalTotal = (subtotal + deliveryFee).toFixed(2);

        const paypalSvc = require('./services/paypal');
        const order = await paypalSvc.createOrder(finalTotal);
        if (order && order.id) return res.json({ id: order.id });
        return res.status(500).json({ error: 'Failed to create PayPal order', details: order });
    } catch (err) {
        console.error('create-order error:', err);
        res.status(500).json({ error: 'Failed to create PayPal order', message: err.message });
    }
});

app.post('/api/paypal/capture-order', async (req, res) => {
    try {
        const { orderID } = req.body;
        if (!orderID) return res.status(400).json({ error: 'Missing orderID' });
        const paypalSvc = require('./services/paypal');
        const capture = await paypalSvc.captureOrder(orderID);
        console.log('PayPal capture response:', capture);
        const status = capture && (capture.status || (capture.purchase_units && capture.purchase_units[0] && capture.purchase_units[0].payments && capture.purchase_units[0].payments.captures && capture.purchase_units[0].payments.captures[0] && capture.purchase_units[0].payments.captures[0].status));
        if (status === 'COMPLETED' || status === 'COMPLETED') {
            // delegate to ProductController.pay to finalize order locally
            return require('./controllers/ProductController').pay(req, res, capture);
        }
        return res.status(400).json({ error: 'Payment not completed', details: capture });
    } catch (err) {
        console.error('capture-order error:', err);
        res.status(500).json({ error: 'Failed to capture PayPal order', message: err.message });
    }
});

// Simple auth guard for routes that require a logged-in user
function requireLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        if (req.flash) req.flash('error', 'Please login to continue');
        return res.redirect('/login');
    }
    next();
}

// Inventory (list products)
app.get('/inventory', (req, res) => ProductController.list(req, res));


// Show a single product
app.get('/product/:id', (req, res) => ProductController.getById(req, res));

// Render add product form
app.get('/addProduct', (req, res) => {
    res.render('addProduct');
});

// Auth routes
app.get('/register', (req, res) => AuthController.showRegister(req, res));
app.post('/register', (req, res) => AuthController.register(req, res));
app.get('/login', (req, res) => AuthController.showLogin(req, res));
app.post('/login', (req, res) => AuthController.login(req, res));
app.get('/logout', (req, res) => AuthController.logout(req, res));

// Add a new product (file upload handled by multer)
app.post('/addProduct', upload.single('image'), (req, res) => ProductController.add(req, res));

// Cart & checkout routes (require login for DB-backed operations)
app.post('/add-to-cart/:id', (req, res) => CartController.addToCart(req, res));
app.get('/cart', (req, res) => CartController.showCart(req, res));
app.post('/cart/update/:id', (req, res) => CartController.updateCartItem(req, res));
app.post('/cart/remove/:id', (req, res) => CartController.removeFromCart(req, res));
app.post('/cart/clear', (req, res) => CartController.clearCart(req, res));
// Checkout: render address form (GET) and process payment (POST)
app.get('/checkout', requireLogin, (req, res) => ProductController.showCheckoutForm(req, res));
app.post('/checkout', requireLogin, (req, res) => ProductController.checkout(req, res));

const netsSvc = require('./services/nets');

// NETS QR: generate QR for server-to-server NETS QR request
app.post('/nets-qr/request', requireLogin, async (req, res) => {
    console.log('Received /nets-qr/request from user:', req.session && req.session.user ? req.session.user.email || req.session.user.username || req.session.user.id : 'guest');
    console.log('Request body preview:', { deliveryFee: req.body.deliveryFee, finalTotal: req.body.finalTotal, paymentMethod: req.body.paymentMethod });
    try {
        // call service and await in case it returns a promise
        await netsSvc.generateQrCode(req, res);
    } catch (err) {
        console.error('nets-qr/request error (async):', err && err.stack ? err.stack : err);
        if (req.flash) req.flash('error', 'Failed to start NETS QR payment: ' + (err && err.message ? err.message : 'internal error'));
        return res.redirect('/checkout');
    }
});

// Endpoint for finalizing NETS QR orders after server-to-server confirmation
app.post('/nets-qr/complete', async (req, res) => {
    // delegate to ProductController.netsComplete to create order and clear cart
    return require('./controllers/ProductController').netsComplete(req, res);
});

// NETS QR fail page
app.get('/nets-qr/fail', (req, res) => {
    res.render('netsTxnFailStatus', {
        title: 'Payment Failed',
        message: 'Your payment could not be completed. Please try again or choose another payment method.',
        responseCode: '',
        instructions: ''
    });
});

// SSE polling for NETS QR payment status
app.get('/sse/payment-status/:txnRetrievalRef', async (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const txnRetrievalRef = req.params.txnRetrievalRef;
    let pollCount = 0;
    const maxPolls = 60; // 5 minutes if polling every 5s
    let frontendTimeoutStatus = 0;

    const interval = setInterval(async () => {
        pollCount++;

        try {
            // Call the NETS query API
            const response = await axios.post(
                'https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/query',
                { txn_retrieval_ref: txnRetrievalRef, frontend_timeout_status: frontendTimeoutStatus },
                {
                    headers: {
                        'api-key': process.env.API_KEY,
                        'project-id': process.env.PROJECT_ID,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log("Polling response:", response.data);
            // Send the full response to the frontend
            res.write(`data: ${JSON.stringify(response.data)}\n\n`);

            const resData = response.data && response.data.result ? response.data.result.data : null;

            // Decide when to end polling and close the connection
            //Check if payment is successful
            if (resData && resData.response_code == "00" && resData.txn_status === 1) {
                // Payment success: send a success message
                res.write(`data: ${JSON.stringify({ success: true })}\n\n`);
                clearInterval(interval);
                res.end();
            } else if (frontendTimeoutStatus == 1 && resData && (resData.response_code !== "00" || resData.txn_status === 2)) {
                // Payment failure: send a fail message
                res.write(`data: ${JSON.stringify({ fail: true, ...resData })}\n\n`);
                clearInterval(interval);
                res.end();
            }

        } catch (err) {
            clearInterval(interval);
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.end();
        }


        // Timeout
        if (pollCount >= maxPolls) {
            clearInterval(interval);
            frontendTimeoutStatus = 1;
            res.write(`data: ${JSON.stringify({ fail: true, error: "Timeout" })}\n\n`);
            res.end();
        }
    }, 5000);

    req.on('close', () => {
        clearInterval(interval);
    });
});

// User orders / invoices
app.get('/orders', requireLogin, (req, res) => ProductController.userOrders(req, res));
app.get('/invoice/:orderId', requireLogin, (req, res) => ProductController.viewInvoice(req, res));
app.get('/invoice/:orderId/pdf', requireLogin, (req, res) => ProductController.generateInvoicePdf(req, res));

// Admin routes - require admin role
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
        if (req.flash) req.flash('error', 'Admin access required');
        return res.redirect('/login');
    }
    next();
}

app.get('/admin/orders', requireAdmin, (req, res) => ProductController.adminOrders(req, res));
app.post('/admin/orders/:id/status', requireAdmin, (req, res) => ProductController.updateOrderStatus(req, res));
app.post('/admin/orders/:id/delete', requireAdmin, (req, res) => ProductController.deleteOrder(req, res));
app.post('/admin/orders/:id/pickup', requireAdmin, (req, res) => ProductController.markPickupCollected(req, res));

// Render update product form
app.get('/updateProduct/:id', (req, res) => ProductController.editForm(req, res));

// Update product (file upload handled by multer)
app.post('/updateProduct/:id', upload.single('image'), (req, res) => ProductController.update(req, res));

// Delete product
app.get('/deleteProduct/:id', (req, res) => ProductController.delete(req, res));

// Ensure there's at least one admin user on startup (use env vars to configure)
(async function ensureAdmin() {
    try {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'change_me_now';

        User.getUserByEmail(adminEmail, async function (err, existing) {
            if (err) {
                return console.error('Error checking admin existence:', err);
            }
            if (!existing) {
                const hashed = await bcrypt.hash(adminPassword, 10);
                const admin = {
                    username: 'admin',
                    email: adminEmail,
                    password: hashed,
                    address: '',
                    contact: '',
                    role: 'admin'
                };
                User.createUser(admin, function (err2, info) {
                    if (err2) console.error('Failed to create admin user:', err2);
                    else console.log('Default admin created with email:', adminEmail);
                });
            } else {
                console.log('Admin user already exists:', adminEmail);
            }
        });
    } catch (e) {
        console.error('ensureAdmin error:', e);
    }
})();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));