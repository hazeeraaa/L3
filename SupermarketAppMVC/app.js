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

// Render update product form
app.get('/updateProduct/:id', (req, res) => ProductController.editForm(req, res));

// Update product (file upload handled by multer)
app.post('/updateProduct/:id', upload.single('image'), (req, res) => ProductController.update(req, res));

// Delete product
app.get('/deleteProduct/:id', (req, res) => ProductController.delete(req, res));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));