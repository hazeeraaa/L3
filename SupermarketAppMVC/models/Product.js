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

	// Search products by name (case-insensitive substring match)
	searchProducts(query, callback) {
		const sql = 'SELECT id, productName, quantity, price, image FROM products WHERE productName LIKE ?';
		const param = `%${query || ''}%`;
		db.query(sql, [param], function (err, results) {
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
		// Prevent deletion if product has been purchased (referenced in order_items)
		const checkSql = 'SELECT COUNT(*) AS cnt FROM order_items WHERE product_id = ?';
		db.query(checkSql, [id], function (err, results) {
			if (err) return callback(err);
			const cnt = results && results[0] ? results[0].cnt : 0;
			if (cnt > 0) {
				return callback(new Error('Product cannot be deleted because it has been purchased'));
			}
			const sql = 'DELETE FROM products WHERE id = ?';
			db.query(sql, [id], function (err2, result) {
				if (err2) return callback(err2);
				callback(null, { affectedRows: result.affectedRows });
			});
		});
	},

	// Reduce quantity of a product atomically (ensures quantity doesn't go negative)
	reduceQuantity(id, amount, callback) {
		const sql = 'UPDATE products SET quantity = quantity - ? WHERE id = ? AND quantity >= ?';
		db.query(sql, [amount, id, amount], function (err, result) {
			if (err) return callback(err);
			if (result.affectedRows === 0) return callback(new Error('Insufficient stock'));
			callback(null, { affectedRows: result.affectedRows });
		});
	}
};

module.exports = Product;
