const express = require('express');
const multer = require('multer');
const session = require('express-session');
const flash = require('connect-flash');
const app = express();
const ProductController = require('./controllers/StudentController');
const AuthController = require('./controllers/AuthController');

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

// NOTE: database access is handled by the MVC model (`models/Student.js`).
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
    next();
});

// Define routes
// Root landing page - render with res.locals so templates can access session user
app.get('/', (req, res) => res.render('index'));

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

// Cart & checkout routes (require login)
app.post('/add-to-cart/:id', requireLogin, (req, res) => ProductController.addToCart(req, res));
app.get('/cart', requireLogin, (req, res) => ProductController.showCart(req, res));
app.post('/cart/update/:id', requireLogin, (req, res) => ProductController.updateCartItem(req, res));
app.post('/cart/remove/:id', requireLogin, (req, res) => ProductController.removeFromCart(req, res));
app.post('/cart/clear', requireLogin, (req, res) => ProductController.clearCart(req, res));
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));