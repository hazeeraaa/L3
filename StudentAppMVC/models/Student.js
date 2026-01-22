
const db = require('../db');

/**
 * Student model (function-based, MVC style)
 * Exports an object with methods for common DB operations.
 * Each method accepts parameters and a callback: callback(err, result)
 *
 * This file also provides aliases matching the names requested in the
 * assignment: getAllStudents, getStudentById, addStudent, updateStudent, deleteStudent.
 *
 * Example usage:
 * const Student = require('./models/Student');
 * Student.getAllStudents((err, rows) => { ... });
 * Student.getStudentById(1, (err, student) => { ... });
 * Student.addStudent({ name, dob, contact, image }, (err, info) => { ... });
 * Student.updateStudent(1, { name, dob, contact, image }, (err, info) => { ... });
 * Student.deleteStudent(1, (err, info) => { ... });
 */

const Student = {
	/**
	 * Get all students
	 * callback(err, results)
	 */
	getAll(callback) {
		const sql = 'SELECT studentId, name, dob, contact, image FROM students';
		db.query(sql, function (err, results) {
			callback(err, results);
		});
	},

	/**
	 * Get a single student by ID
	 * callback(err, student)
	 */
	getById(studentId, callback) {
		const sql = 'SELECT studentId, name, dob, contact, image FROM students WHERE studentId = ? LIMIT 1';
		db.query(sql, [studentId], function (err, results) {
			if (err) return callback(err);
			callback(null, results[0] || null);
		});
	},

	/**
	 * Add a new student
	 * student: { name, dob, contact, image }
	 * callback(err, insertInfo)
	 */
	add(student, callback) {
		const sql = 'INSERT INTO students (name, dob, contact, image) VALUES (?, ?, ?, ?)';
		const params = [student.name, student.dob, student.contact, student.image];
		db.query(sql, params, function (err, result) {
			if (err) return callback(err);
			callback(null, { insertId: result.insertId });
		});
	},

	/**
	 * Update an existing student by ID
	 * student: { name, dob, contact, image }
	 * callback(err, updateInfo)
	 */
	update(studentId, student, callback) {
		const sql = 'UPDATE students SET name = ?, dob = ?, contact = ?, image = ? WHERE studentId = ?';
		const params = [student.name, student.dob, student.contact, student.image, studentId];
		db.query(sql, params, function (err, result) {
			if (err) return callback(err);
			callback(null, { affectedRows: result.affectedRows });
		});
	},

	/**
	 * Delete a student by ID
	 * callback(err, deleteInfo)
	 */
	delete(studentId, callback) {
		const sql = 'DELETE FROM students WHERE studentId = ?';
		db.query(sql, [studentId], function (err, result) {
			if (err) return callback(err);
			callback(null, { affectedRows: result.affectedRows });
		});
	},

	/*
	 * Aliases with the exact names requested in the task description.
	 * These simply call the canonical implementations above.
	 */
	getAllStudents(callback) {
		return Student.getAll(callback);
	},

	getStudentById(studentId, callback) {
		return Student.getById(studentId, callback);
	},

	addStudent(student, callback) {
		return Student.add(student, callback);
	},

	updateStudent(studentId, student, callback) {
		return Student.update(studentId, student, callback);
	},

	deleteStudent(studentId, callback) {
		return Student.delete(studentId, callback);
	}
};

module.exports = Student;