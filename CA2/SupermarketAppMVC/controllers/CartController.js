const Cart = require('../models/Cart');
const Product = require('../models/Product');

/**
 * CartController: handles cart actions using DB for logged-in users
 */

const CartController = {
    // Add product to cart (DB for logged-in, session for guest)
    addToCart(req, res) {
        const productId = req.params.id;
        const qty = Number(req.body.quantity || 1);
        Product.getProductById(productId, function(err, product) {
            if (err || !product) {
                console.error('Error fetching product for cart add:', err);
                if (req.flash) req.flash('error', 'Product not found');
                return res.redirect('/inventory');
            }
            if (product.quantity < qty) {
                if (req.flash) req.flash('error', `Only ${product.quantity} unit(s) available`);
                return res.redirect(`/product/${productId}`);
            }

            if (req.session && req.session.user) {
                const userId = req.session.user.id;
                const item = { id: product.id, productName: product.productName, price: product.price, quantity: qty };
                Cart.addItem(userId, item, function(err2) {
                    if (err2) {
                        console.error('Failed to add item to DB cart:', err2);
                        if (req.flash) req.flash('error', 'Unable to add to cart');
                    } else {
                        if (req.flash) req.flash('success', 'Added to cart');
                    }
                    return res.redirect('/cart');
                });
            } else {
                // guest: keep session-based cart
                if (!req.session.cart) req.session.cart = [];
                const existing = req.session.cart.find(it => it.id == product.id);
                if (existing) existing.quantity = Math.min(product.quantity, existing.quantity + qty);
                else req.session.cart.push({ id: product.id, productName: product.productName, price: product.price, image: product.image, quantity: qty });
                if (req.flash) req.flash('success', 'Added to cart');
                return res.redirect('/cart');
            }
        });
    },

    // Show cart for user (DB) or session for guest
    showCart(req, res) {
        const user = req.session && req.session.user ? req.session.user : null;
        if (user) {
            Cart.getItemsByUser(user.id, function(err, items) {
                if (err) {
                    console.error('Failed to load DB cart:', err);
                    if (req.flash) req.flash('error', 'Unable to load cart');
                    return res.redirect('/inventory');
                }
                res.render('cart', { cart: items, user });
            });
        } else {
            const cart = req.session.cart || [];
            res.render('cart', { cart, user: null });
        }
    },

    updateCartItem(req, res) {
        const productId = req.params.id;
        const qty = Number(req.body.quantity || 1);
        if (qty <= 0) {
            if (req.flash) req.flash('error', 'Quantity must be at least 1');
            return res.redirect('/cart');
        }
        const user = req.session && req.session.user ? req.session.user : null;
        if (user) {
            Cart.updateItem(user.id, productId, qty, function(err) {
                if (err) {
                    console.error('Failed to update DB cart item:', err);
                    if (req.flash) req.flash('error', 'Unable to update cart');
                } else {
                    if (req.flash) req.flash('success', 'Cart updated');
                }
                res.redirect('/cart');
            });
        } else {
            if (!req.session.cart) req.session.cart = [];
            const existing = req.session.cart.find(it => it.id == productId);
            if (!existing) {
                if (req.flash) req.flash('error', 'Item not in cart');
                return res.redirect('/cart');
            }
            existing.quantity = qty;
            if (req.flash) req.flash('success', 'Cart updated');
            res.redirect('/cart');
        }
    },

    removeFromCart(req, res) {
        const productId = req.params.id;
        const user = req.session && req.session.user ? req.session.user : null;
        if (user) {
            Cart.removeItem(user.id, productId, function(err) {
                if (err) {
                    console.error('Failed to remove DB cart item:', err);
                    if (req.flash) req.flash('error', 'Unable to remove item');
                } else {
                    if (req.flash) req.flash('success', 'Item removed from cart');
                }
                res.redirect('/cart');
            });
        } else {
            if (!req.session.cart) req.session.cart = [];
            req.session.cart = req.session.cart.filter(it => it.id != productId);
            if (req.flash) req.flash('success', 'Item removed from cart');
            res.redirect('/cart');
        }
    },

    clearCart(req, res) {
        const user = req.session && req.session.user ? req.session.user : null;
        if (user) {
            Cart.clearCart(user.id, function(err) {
                if (err) {
                    console.error('Failed to clear DB cart:', err);
                    if (req.flash) req.flash('error', 'Unable to clear cart');
                } else {
                    if (req.flash) req.flash('success', 'Cart cleared');
                }
                res.redirect('/cart');
            });
        } else {
            req.session.cart = [];
            if (req.flash) req.flash('success', 'Cart cleared');
            res.redirect('/cart');
        }
    }
};

module.exports = CartController;
