const express = require('express');
const multer = require('multer');
const session = require('express-session');
const flash = require('connect-flash');
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