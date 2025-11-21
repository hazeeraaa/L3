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



	// Add an item to session cart
	addToCart(req, res) {
		const id = req.params.id;
		const qty = Number(req.body.quantity || 1);
		Product.getProductById(id, function (err, product) {
			if (err || !product) {
				console.error('Error adding to cart:', err);
				return res.status(400).send('Product not found');
			}
			// basic availability check
			if (product.quantity < qty) {
				if (req.flash) req.flash('error', `Only ${product.quantity} unit(s) available for ${product.productName}`);
				return res.redirect(`/product/${id}`);
			}
			if (!req.session.cart) req.session.cart = [];
			// check if already in cart
			const existing = req.session.cart.find(it => it.id == product.id);
			if (existing) {
				// ensure not exceeding stock
				const newQty = existing.quantity + qty;
				if (newQty > product.quantity) {
					if (req.flash) req.flash('error', `Cannot add ${qty} more. Only ${product.quantity - existing.quantity} left`);
					return res.redirect(`/product/${id}`);
				}
				existing.quantity = newQty;
			} else {
				req.session.cart.push({ id: product.id, productName: product.productName, price: product.price, image: product.image, quantity: qty });
			}
			res.redirect('/cart');
		});
	},

	// Update an item quantity in the cart
	updateCartItem(req, res) {
		const id = req.params.id;
		const qty = Number(req.body.quantity || 1);
		if (qty <= 0) {
			if (req.flash) req.flash('error', 'Quantity must be at least 1');
			return res.redirect('/cart');
		}
		Product.getProductById(id, function (err, product) {
			if (err || !product) {
				if (req.flash) req.flash('error', 'Product not found');
				return res.redirect('/cart');
			}
			if (qty > product.quantity) {
				if (req.flash) req.flash('error', `Only ${product.quantity} unit(s) available`);
				return res.redirect('/cart');
			}
			if (!req.session.cart) req.session.cart = [];
			const existing = req.session.cart.find(it => it.id == id);
			if (!existing) {
				if (req.flash) req.flash('error', 'Item not in cart');
				return res.redirect('/cart');
			}
			existing.quantity = qty;
			if (req.flash) req.flash('success', 'Cart updated');
			res.redirect('/cart');
		});
	},

	// Remove an item from the cart
	removeFromCart(req, res) {
		const id = req.params.id;
		if (!req.session.cart) req.session.cart = [];
		req.session.cart = req.session.cart.filter(it => it.id != id);
		if (req.flash) req.flash('success', 'Item removed from cart');
		res.redirect('/cart');
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
				return res.redirect('/inventory');
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

