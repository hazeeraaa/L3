const Product = require('../models/Product');
const Order = require('../models/Order');
const PDFDocument = require('pdfkit');

/**
 * ProductController for SupermarketAppMVC
 * Methods accept (req, res), call the Product model, and handle rendering
 * or redirects. Views expected: inventory, product, addProduct, updateProduct
 */

const ProductController = {
	// List all products and render the inventory view
	list(req, res) {
		const q = req.query.q || '';
		const cb = function (err, products) {
			if (err) {
				console.error('Error fetching products:', err);
				return res.status(500).send('Error retrieving products');
			}
			const user = req.session && req.session.user ? req.session.user : null;
			res.render('inventory', { products, user });
		};
		if (q && q.trim() !== '') {
			Product.searchProducts(q, cb);
		} else {
			Product.getAllProducts(cb);
		}
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

	// Clear the entire cart
	clearCart(req, res) {
		req.session.cart = [];
		if (req.flash) req.flash('success', 'Cart cleared');
		res.redirect('/cart');
	},

	// Show cart contents
	showCart(req, res) {
		const cart = req.session.cart || [];
		const user = req.session && req.session.user ? req.session.user : null;
		res.render('cart', { cart, user });
	},

	// Show checkout form to collect delivery address
	showCheckoutForm(req, res) {
		const user = req.session && req.session.user ? req.session.user : null;
		if (user) {
			const Cart = require('../models/Cart');
			Cart.getItemsByUser(user.id, function(err, items) {
				if (err) {
					console.error('Failed to load DB cart for checkout form:', err);
					if (req.flash) req.flash('error', 'Unable to load cart');
					return res.redirect('/cart');
				}
				const cart = (items || []).map(it => ({ id: it.product_id, productName: it.product_name, quantity: it.quantity, price: it.price }));
				if (cart.length === 0) {
					if (req.flash) req.flash('error', 'Cart is empty');
					return res.redirect('/cart');
				}
				res.render('checkout', { cart, user });
			});
		} else {
			const cart = req.session.cart || [];
			if (cart.length === 0) {
				if (req.flash) req.flash('error', 'Cart is empty');
				return res.redirect('/cart');
			}
			res.render('checkout', { cart, user });
		}
	},

	// Show purchase history for logged-in user
	userOrders(req, res) {
		const userId = req.session.user ? req.session.user.id : null;
		if (!userId) {
			if (req.flash) req.flash('error', 'Please login to view orders');
			return res.redirect('/login');
		}
		Order.getOrdersByUser(userId, function(err, orders) {
			if (err) {
				console.error('Failed to fetch user orders:', err);
				orders = [];
			}
			res.render('orders', { orders, user: req.session.user });
		});
	},

	// View invoice for an order
	viewInvoice(req, res) {
		const orderId = req.params.orderId || req.params.id;
		Order.getOrderById(orderId, function(err, order) {
			if (err) {
				console.error('Failed to fetch order for invoice:', err);
				if (req.flash) req.flash('error', 'Unable to load invoice');
				return res.redirect('/inventory');
			}
			if (!order) {
				if (req.flash) req.flash('error', 'Order not found');
				return res.redirect('/inventory');
			}
			// Only allow owner or admin
			const user = req.session.user || null;
			if (!user || (user.role !== 'admin' && user.id != order.user_id)) {
				if (req.flash) req.flash('error', 'Access denied');
				return res.redirect('/inventory');
			}
			res.render('invoice', { order, user });
		});
	},

	// Generate PDF for invoice and send as download
	generateInvoicePdf(req, res) {
		const orderId = req.params.orderId || req.params.id;
		Order.getOrderById(orderId, function(err, order) {
			if (err) {
				console.error('Failed to fetch order for PDF:', err);
				if (req.flash) req.flash('error', 'Unable to generate invoice PDF');
				return res.redirect('/inventory');
			}
			if (!order) {
				if (req.flash) req.flash('error', 'Order not found');
				return res.redirect('/inventory');
			}
			// Only allow owner or admin
			const user = req.session.user || null;
			if (!user || (user.role !== 'admin' && user.id != order.user_id)) {
				if (req.flash) req.flash('error', 'Access denied');
				return res.redirect('/inventory');
			}

			// Create PDF
			const doc = new PDFDocument({ size: 'A4', margin: 50 });
			res.setHeader('Content-Type', 'application/pdf');
			res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.id}.pdf`);
			doc.pipe(res);

			// Header
			doc.fontSize(20).text('Supermarket App', { align: 'left' });
			doc.moveDown(0.5);
			doc.fontSize(14).text(`Invoice - Order #${order.id}`);
			doc.moveDown(0.5);
			doc.fontSize(10).text(`Customer: ${order.user_email || ''}`);
			doc.text(`Address: ${order.address || ''}`);
			doc.text(`Placed on: ${order.created_at}`);
			doc.text(`Status: ${order.status}`);
			doc.moveDown(0.5);

			// Table header
			doc.fontSize(12).text('Items:', { underline: true });
			doc.moveDown(0.2);
			let subtotal = 0;
			order.items.forEach(it => {
				const lineTotal = Number(it.price) * Number(it.quantity);
				subtotal += lineTotal;
				doc.fontSize(10).text(`${it.product_name || it.productName || ''} — ${it.quantity} x $${Number(it.price).toFixed(2)} = $${lineTotal.toFixed(2)}`);
			});
			doc.moveDown(0.5);
			doc.fontSize(12).text(`Subtotal: $${subtotal.toFixed(2)}`, { align: 'right' });
			doc.fontSize(12).text(`Delivery Fee: $${Number(order.delivery_fee || 0).toFixed(2)}`, { align: 'right' });
			doc.fontSize(14).text(`Total: $${Number(order.total).toFixed(2)}`, { align: 'right' });

			doc.moveDown(1);
			doc.fontSize(9).text('Thank you for shopping with Supermarket App.', { align: 'center' });

			doc.end();
		});
	},

	// Checkout: create order with address, reduce stock, clear cart
	checkout(req, res) {
		const userId = req.session.user ? req.session.user.id : null;

		const processCart = (cart) => {
			if (!cart || cart.length === 0) {
				if (req.flash) req.flash('error', 'Cart is empty');
				return res.redirect('/cart');
			}

			const address = req.body.address || '';
			const deliveryOption = req.body.deliveryOption || 'doorstep';
			const deliveryFee = parseFloat(req.body.deliveryFee || 0) || 0;
			const paymentMethod = req.body.paymentMethod || null;
			const total = cart.reduce((s, it) => s + it.price * it.quantity, 0);
			const finalTotal = total + (isNaN(deliveryFee) ? 0 : deliveryFee);

			// First, attempt to reduce stock for each item sequentially
			const processNext = (index) => {
				if (index >= cart.length) {
					// All stock reduced, create order
					Order.createOrder(userId, address, cart, finalTotal, deliveryOption, deliveryFee, paymentMethod, function(err, info) {
						if (err) {
							console.error('Order creation failed:', err);
							const msg = 'Failed to create order. ' + (err && err.message ? err.message : 'Please contact support.');
							if (req.flash) req.flash('error', msg);
							return res.redirect('/cart');
						}
						// success: clear cart and redirect to invoice page
						if (userId) {
							const Cart = require('../models/Cart');
							Cart.clearCart(userId, function(){});
						} else {
							req.session.cart = [];
						}
						if (req.flash) req.flash('success', 'Checkout successful. Thank you for your purchase!');
						return res.redirect(`/invoice/${info.orderId}`);
					});
					return;
				}
				const item = cart[index];
				Product.reduceQuantity(item.id, item.quantity, function (err, info) {
					if (err) {
						console.error('Checkout error on item:', item.id, err);
						if (req.flash) req.flash('error', `Insufficient stock for ${item.productName}`);
						return res.redirect('/cart');
					}
					processNext(index + 1);
				});
			};
			processNext(0);
		};

		// load cart from DB for logged-in users, or from session for guests
		if (userId) {
			const Cart = require('../models/Cart');
			Cart.getItemsByUser(userId, function(err, items) {
				if (err) {
					console.error('Failed to load DB cart for checkout:', err);
					if (req.flash) req.flash('error', 'Unable to load cart');
					return res.redirect('/cart');
				}
				const cart = (items || []).map(it => ({ id: it.product_id, productName: it.product_name, quantity: it.quantity, price: it.price }));
				processCart(cart);
			});
		} else {
			const cart = req.session.cart || [];
			processCart(cart);
		}
	},

	// Process PayPal capture: create local order, reduce stock, clear cart
	async pay(req, res, capture) {
		try {
			// ensure capture object indicates completion
			const status = capture && (capture.status || (capture.purchase_units && capture.purchase_units[0] && capture.purchase_units[0].payments && capture.purchase_units[0].payments.captures && capture.purchase_units[0].payments.captures[0] && capture.purchase_units[0].payments.captures[0].status));
			if (status !== 'COMPLETED') return res.status(400).json({ error: 'Payment not completed', details: capture });

			const userId = req.session && req.session.user ? req.session.user.id : null;
			// load cart
			let cartItems = [];
			if (userId) {
				const Cart = require('../models/Cart');
				cartItems = await new Promise((resolve, reject) => Cart.getItemsByUser(userId, (err, items) => err ? reject(err) : resolve(items)));
				cartItems = (cartItems || []).map(it => ({ id: it.product_id, productName: it.product_name, quantity: it.quantity, price: it.price }));
			} else {
				cartItems = req.session.cart || [];
			}
			if (!cartItems || cartItems.length === 0) return res.status(400).json({ error: 'Cart is empty' });



			// derive delivery info from request body (sent by client)
			const address = req.body.address || '';
			const deliveryType = req.body.deliveryType || 'doorstep';
			const deliveryFee = parseFloat(req.body.deliveryFee || 0) || 0;
			const subtotal = cartItems.reduce((s, it) => s + it.price * it.quantity, 0);
			const finalTotal = subtotal + deliveryFee;

			// persist PayPal capture as a transaction (for audit)
			try {
				const isoString = (capture.purchase_units && capture.purchase_units[0] && capture.purchase_units[0].payments && capture.purchase_units[0].payments.captures && capture.purchase_units[0].payments.captures[0] && capture.purchase_units[0].payments.captures[0].create_time) || null;
				const mysqlDatetime = isoString ? isoString.replace('T', ' ').replace('Z', '') : null;
				const Transaction = require('../models/Transaction');
				const trans = {
					orderId: capture.id,
					payerId: (capture.payer && capture.payer.payer_id) || null,
					payerEmail: (capture.payer && capture.payer.email_address) || null,
					amount: (capture.purchase_units && capture.purchase_units[0] && capture.purchase_units[0].payments && capture.purchase_units[0].payments.captures && capture.purchase_units[0].payments.captures[0] && capture.purchase_units[0].payments.captures[0].amount && capture.purchase_units[0].payments.captures[0].amount.value) || finalTotal || 0,
					currency: (capture.purchase_units && capture.purchase_units[0] && capture.purchase_units[0].payments && capture.purchase_units[0].payments.captures && capture.purchase_units[0].payments.captures[0] && capture.purchase_units[0].payments.captures[0].amount && capture.purchase_units[0].payments.captures[0].amount.currency_code) || 'SGD',
					status: capture.status || null,
					time: mysqlDatetime
				};
				Transaction.create(trans, function(err2) {
					if (err2) console.error('Failed to save transaction:', err2);
				});
			} catch (tErr) {
				console.error('Transaction persistence error:', tErr);
			}

			// reduce stock sequentially
			const reduceNext = (idx) => new Promise((resolve, reject) => {
				if (idx >= cartItems.length) return resolve();
				const it = cartItems[idx];
				require('../models/Product').reduceQuantity(it.id, it.quantity, function(err) {
					if (err) return reject(err);
					resolve(reduceNext(idx+1));
				});
			});

			await reduceNext(0);

			// create order in DB
			require('../models/Order').createOrder(userId, address, cartItems, finalTotal, deliveryType, deliveryFee, 'PayPal', function(err, info) {
				if (err) {
					console.error('Failed to create Order after PayPal capture:', err);
					return res.status(500).json({ error: 'Failed to create local order' });
				}
				// clear cart
				if (userId) {
					const Cart = require('../models/Cart');
					Cart.clearCart(userId, function(){});
				} else {
					req.session.cart = [];
				}
				return res.json({ success: true, invoiceUrl: `/invoice/${info.orderId}`, capture });
			});
		} catch (err) {
			console.error('ProductController.pay error:', err);
			return res.status(500).json({ error: 'Failed to complete PayPal payment', message: err.message });
		}
	},

	// Admin: list all orders and show delivery status
	adminOrders(req, res) {
		Order.getAllOrders(function(err, orders) {
			if (err) {
				console.error('Failed to fetch orders (getAllOrders):', err);
				// fall through and render page with empty orders rather than redirecting
				orders = [];
			}
			res.render('adminOrders', { orders, user: req.session.user });
		});
	},

	// Admin: update order delivery status
	updateOrderStatus(req, res) {
		const orderId = req.params.id;
		const status = req.body.status || 'pending';
		Order.updateStatus(orderId, status, function(err, info) {
			if (err) {
				console.error('Failed to update order status:', err);
				if (req.flash) req.flash('error', 'Failed to update status');
				return res.redirect('/admin/orders');
			}
			if (req.flash) req.flash('success', 'Order status updated');
			res.redirect('/admin/orders');
		});
	},

	// Admin: delete an order (and its items)
	deleteOrder(req, res) {
		const orderId = req.params.id;
		Order.deleteOrder(orderId, function(err, info) {
			if (err) {
				console.error('Failed to delete order:', err);
				if (req.flash) req.flash('error', 'Failed to delete order');
				return res.redirect('/admin/orders');
			}
			if (req.flash) req.flash('success', 'Order deleted');
			res.redirect('/admin/orders');
		});
	},

	// Admin: mark pickup collected for self-pickup orders
	markPickupCollected(req, res) {
		const orderId = req.params.id;
		Order.updatePickupCollected(orderId, 1, function(err, info) {
			if (err) {
				console.error('Failed to mark pickup collected:', err);
				if (req.flash) req.flash('error', 'Failed to update pickup status');
				return res.redirect('/admin/orders');
			}
			if (req.flash) req.flash('success', 'Pickup marked as collected');
			res.redirect('/admin/orders');
		});
	},

	// Delete a product by ID
	delete(req, res) {
		const id = req.params.id;
		Product.deleteProduct(id, function (err, info) {
			if (err) {
				console.error('Error deleting product:', err);
				if (req.flash) req.flash('error', err.message || 'Error deleting product');
				return res.redirect('/inventory');
			}
			if (req.flash) req.flash('success', 'Product deleted');
			res.redirect('/inventory');
		});
	}
};

module.exports = ProductController;
