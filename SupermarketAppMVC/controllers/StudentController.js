const Product = require('../models/Student');

/**
 * ProductController for SupermarketAppMVC
 * Methods accept (req, res), call the Product model, and handle rendering
 * or redirects. Views expected: inventory, product, addProduct, updateProduct
 */

const ProductController = {
	// List all products and render the inventory view
	list(req, res) {
		Product.getAllProducts(function (err, products) {
			if (err) {
				console.error('Error fetching products:', err);
				return res.status(500).send('Error retrieving products');
			}
			// render with session user (res.locals.user also available in views)
			const user = req.session && req.session.user ? req.session.user : null;
			res.render('inventory', { products, user });
		});
	},

	// Get a product by ID and render the product view
	getById(req, res) {
		const id = req.params.id;
		Product.getProductById(id, function (err, product) {
			if (err) {
				console.error('Error fetching product by ID:', err);
				return res.status(500).send('Error retrieving product');
			}
			if (!product) return res.status(404).send('Product not found');
			const user = req.session && req.session.user ? req.session.user : null;
			res.render('product', { product, user });
		});
	},

	// Render update form for a product
	editForm(req, res) {
		const id = req.params.id;
		Product.getProductById(id, function (err, product) {
			if (err) {
				console.error('Error fetching product for edit:', err);
				return res.status(500).send('Error retrieving product');
			}
			if (!product) return res.status(404).send('Product not found');
			const user = req.session && req.session.user ? req.session.user : null;
			res.render('updateProduct', { product, user });
		});
	},

	// Add a new product (expects multipart/form-data with optional file upload middleware)
	add(req, res) {
		const { name, quantity, price } = req.body;
		const image = req.file ? req.file.filename : null;
		const product = { name, quantity: Number(quantity || 0), price: Number(price || 0), image };
		Product.addProduct(product, function (err, info) {
			if (err) {
				console.error('Error adding product:', err);
				return res.status(500).send('Error adding product');
			}
			res.redirect('/inventory');
		});
	},

	// Update an existing product by ID
	update(req, res) {
		const id = req.params.id;
		const { name, quantity, price } = req.body;
		let image = req.body.currentImage || null;
		if (req.file) image = req.file.filename;
		const product = { name, quantity: Number(quantity || 0), price: Number(price || 0), image };
		Product.updateProduct(id, product, function (err, info) {
			if (err) {
				console.error('Error updating product:', err);
				return res.status(500).send('Error updating product');
			}
			res.redirect('/inventory');
		});
	},

	// Delete a product by ID
	delete(req, res) {
		const id = req.params.id;
		Product.deleteProduct(id, function (err, info) {
			if (err) {
				console.error('Error deleting product:', err);
				return res.status(500).send('Error deleting product');
			}
			res.redirect('/inventory');
		});
	}
};

module.exports = ProductController;
