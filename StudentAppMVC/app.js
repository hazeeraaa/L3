const express = require('express');
const multer = require('multer');
const app = express();
const StudentController = require('./controllers/StudentController');

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

// Define routes
// List all students (handled by controller)
app.get('/', (req, res) => StudentController.list(req, res));

// Show a single student (handled by controller)
app.get('/student/:id', (req, res) => StudentController.getById(req, res));

app.get('/addStudent', (req, res) => {
    res.render('addStudent'); 
});

// Add a new student (file upload handled by multer)
app.post('/addStudent', upload.single('image'), (req, res) => StudentController.add(req, res));

// Render edit form for a student (controller will fetch the student and render)
app.get('/editStudent/:id', (req, res) => StudentController.editForm(req, res));

// Update student (file upload handled by multer)
app.post('/editStudent/:id', upload.single('image'), (req, res) => StudentController.update(req, res));

// Delete student (handled by controller)
app.get('/deleteStudent/:id', (req, res) => StudentController.delete(req, res));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));