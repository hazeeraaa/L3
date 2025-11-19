const db = require('../db');

/**
 * Product model adapted to use the `products` table from c372_supermarketdb.sql
 * Fields: id, productName, quantity, price, image
 */

const Product = {
	// Get all products
	getAllProducts(callback) {
		const sql = 'SELECT id, productName, quantity, price, image FROM products';
		db.query(sql, function (err, results) {
			callback(err, results);
		});
	},

	// Get a single product by ID
	getProductById(id, callback) {
		const sql = 'SELECT id, productName, quantity, price, image FROM products WHERE id = ? LIMIT 1';
		db.query(sql, [id], function (err, results) {
			if (err) return callback(err);
			callback(null, results[0] || null);
		});
	},

	// Add a new product
	// product: { name, quantity, price, image }
	addProduct(product, callback) {
		const sql = 'INSERT INTO products (productName, quantity, price, image) VALUES (?, ?, ?, ?)';
		const params = [product.name || null, product.quantity || 0, product.price || 0.0, product.image || null];
		db.query(sql, params, function (err, result) {
			if (err) return callback(err);
			callback(null, { insertId: result.insertId });
		});
	},

	// Update an existing product by ID
	// product: { name, quantity, price, image }
	updateProduct(id, product, callback) {
		const sql = 'UPDATE products SET productName = ?, quantity = ?, price = ?, image = ? WHERE id = ?';
		const params = [product.name || null, product.quantity || 0, product.price || 0.0, product.image || null, id];
		db.query(sql, params, function (err, result) {
			if (err) return callback(err);
			callback(null, { affectedRows: result.affectedRows });
		});
	},

	// Delete a product by ID
	deleteProduct(id, callback) {
		const sql = 'DELETE FROM products WHERE id = ?';
		db.query(sql, [id], function (err, result) {
			if (err) return callback(err);
			callback(null, { affectedRows: result.affectedRows });
		});
	}
};

module.exports = Product;
