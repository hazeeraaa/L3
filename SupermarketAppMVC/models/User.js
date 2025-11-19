const db = require('../db');

/**
 * User model for `users` table
 * Fields: id, username, email, password, address, contact, role
 */

const User = {
    // Create a new user
    createUser(user, callback) {
        const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, ?, ?, ?, ?)';
        const params = [user.username, user.email, user.password, user.address || '', user.contact || '', user.role || 'user'];
        db.query(sql, params, function (err, result) {
            if (err) return callback(err);
            callback(null, { insertId: result.insertId });
        });
    },

    // Find by email
    getUserByEmail(email, callback) {
        const sql = 'SELECT id, username, email, password, address, contact, role FROM users WHERE email = ? LIMIT 1';
        db.query(sql, [email], function (err, results) {
            if (err) return callback(err);
            callback(null, results[0] || null);
        });
    },

    // Find by id
    getUserById(id, callback) {
        const sql = 'SELECT id, username, email, address, contact, role FROM users WHERE id = ? LIMIT 1';
        db.query(sql, [id], function (err, results) {
            if (err) return callback(err);
            callback(null, results[0] || null);
        });
    }
};

module.exports = User;
