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

	// Shopping page for customers (renders `shopping` view)
	shopping(req, res) {
		Product.getAllProducts(function (err, products) {
			if (err) {
				console.error('Error fetching products for shopping:', err);
				return res.status(500).send('Error retrieving products');
			}
			const user = req.session && req.session.user ? req.session.user : null;
			res.render('shopping', { products, user });
		});
	},

	// Add an item to session cart
	addToCart(req, res) {
		const id = req.params.id;
		const qty = Number(req.body.quantity || 1);
		Product.getProductById(id, function (err, product) {
			if (err || !product) {
				console.error('Error adding to cart:', err);
				return res.status(400).send('Product not found');
			}
			if (!req.session.cart) req.session.cart = [];
			// check if already in cart
			const existing = req.session.cart.find(it => it.id == product.id);
			if (existing) {
				existing.quantity += qty;
			} else {
				req.session.cart.push({ id: product.id, productName: product.productName, price: product.price, image: product.image, quantity: qty });
			}
			res.redirect('/cart');
		});
	},

	// Show cart contents
	showCart(req, res) {
		const cart = req.session.cart || [];
		const user = req.session && req.session.user ? req.session.user : null;
		res.render('cart', { cart, user });
	},

	// Checkout: reduce quantity in DB, clear cart on success
	checkout(req, res) {
		const cart = req.session.cart || [];
		if (cart.length === 0) {
			if (req.flash) req.flash('error', 'Cart is empty');
			return res.redirect('/cart');
		}

		// Process each item sequentially to ensure stock availability
		const processNext = (index) => {
			if (index >= cart.length) {
				// all processed
				req.session.cart = [];
				if (req.flash) req.flash('success', 'Checkout successful. Thank you for your purchase!');
				return res.redirect('/shopping');
			}
			const item = cart[index];
			Product.reduceQuantity(item.id, item.quantity, function (err, info) {
				if (err) {
					console.error('Checkout error on item:', item.id, err);
					if (req.flash) req.flash('error', `Insufficient stock for ${item.productName}`);
					return res.redirect('/cart');
				}
				// continue to next
				processNext(index + 1);
			});
		};

		processNext(0);
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

