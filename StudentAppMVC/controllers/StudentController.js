const Student = require('../models/Student');

/**
 * StudentController (function-based)
 * Exports handler methods that accept (req, res) and call the Student model.
 */

const StudentController = {
	// List all students and render the index view
	list(req, res) {
		Student.getAll(function (err, students) {
			if (err) {
				console.error('Error fetching students:', err);
				return res.status(500).send('Error retrieving students');
			}
			res.render('index', { students });
		});
	},

	// Get a student by ID and render the student view
	getById(req, res) {
		const studentId = req.params.id;
		Student.getById(studentId, function (err, student) {
			if (err) {
				console.error('Error fetching student by ID:', err);
				return res.status(500).send('Error retrieving student');
			}
			if (!student) return res.status(404).send('Student not found');
				res.render('student', { student });
		});
	},

		// Render edit form for a student
		editForm(req, res) {
			const studentId = req.params.id;
			Student.getById(studentId, function (err, student) {
				if (err) {
					console.error('Error fetching student for edit:', err);
					return res.status(500).send('Error retrieving student');
				}
				if (!student) return res.status(404).send('Student not found');
				res.render('editStudent', { student });
			});
		},

	// Add a new student (expects multipart/form-data with optional file upload middleware)
	add(req, res) {
		const { name, dob, contact } = req.body;
		const image = req.file ? req.file.filename : null;
		const student = { name, dob, contact, image };
		Student.add(student, function (err, info) {
			if (err) {
				console.error('Error adding student:', err);
				return res.status(500).send('Error adding student');
			}
			res.redirect('/');
		});
	},

	// Update an existing student by ID
	update(req, res) {
		const studentId = req.params.id;
		const { name, dob, contact } = req.body;
		// Keep existing image if no new file uploaded
		let image = req.body.currentImage || null;
		if (req.file) image = req.file.filename;

		const student = { name, dob, contact, image };
		Student.update(studentId, student, function (err, info) {
			if (err) {
				console.error('Error updating student:', err);
				return res.status(500).send('Error updating student');
			}
			res.redirect('/');
		});
	},

	// Delete a student by ID
	delete(req, res) {
		const studentId = req.params.id;
		Student.delete(studentId, function (err, info) {
			if (err) {
				console.error('Error deleting student:', err);
				return res.status(500).send('Error deleting student');
			}
			res.redirect('/');
		});
	}
};

module.exports = StudentController;

