const db = require('../db');

/**
 * Cart model for DB-backed cart storage
 * Table: cart_items (id, user_id, product_id, product_name, quantity, price)
 */

const Cart = {
    // Get cart items for a user
    getItemsByUser(userId, callback) {
        const sql = `SELECT ci.id, ci.product_id, ci.quantity, ci.price, ci.product_name, p.image, p.productName
                     FROM cart_items ci
                     LEFT JOIN products p ON ci.product_id = p.id
                     WHERE ci.user_id = ?`;
        db.query(sql, [userId], function (err, results) {
            if (err) return callback(err);
            callback(null, results || []);
        });
    },

    // Add or update an item in the user's cart (upsert behavior)
    addItem(userId, item, callback) {
        // item: { id: productId, productName, price, quantity }
        const checkSql = 'SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ? LIMIT 1';
        db.query(checkSql, [userId, item.id], function (err, results) {
            if (err) return callback(err);
            if (results && results[0]) {
                const existing = results[0];
                const newQty = Number(existing.quantity) + Number(item.quantity || 0);
                const upd = 'UPDATE cart_items SET quantity = ?, price = ?, product_name = ?, updated_at = NOW() WHERE id = ?';
                db.query(upd, [newQty, item.price || 0, item.productName || '', existing.id], function (err2, info) {
                    if (err2) return callback(err2);
                    callback(null, { affectedRows: info.affectedRows });
                });
            } else {
                const ins = 'INSERT INTO cart_items (user_id, product_id, product_name, quantity, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())';
                db.query(ins, [userId, item.id, item.productName || '', item.quantity || 0, item.price || 0], function (err3, info) {
                    if (err3) return callback(err3);
                    callback(null, { insertId: info.insertId });
                });
            }
        });
    },

    // Update a cart item quantity
    updateItem(userId, productId, quantity, callback) {
        const sql = 'UPDATE cart_items SET quantity = ?, updated_at = NOW() WHERE user_id = ? AND product_id = ?';
        db.query(sql, [quantity, userId, productId], function (err, info) {
            if (err) return callback(err);
            callback(null, { affectedRows: info.affectedRows });
        });
    },

    // Remove an item from the cart
    removeItem(userId, productId, callback) {
        const sql = 'DELETE FROM cart_items WHERE user_id = ? AND product_id = ?';
        db.query(sql, [userId, productId], function (err, info) {
            if (err) return callback(err);
            callback(null, { affectedRows: info.affectedRows });
        });
    },

    // Clear the entire cart for a user
    clearCart(userId, callback) {
        const sql = 'DELETE FROM cart_items WHERE user_id = ?';
        db.query(sql, [userId], function (err, info) {
            if (err) return callback(err);
            callback(null, { affectedRows: info.affectedRows });
        });
    },

    // Merge a session-based cart into the user's DB cart (used on login)
    mergeSessionCart(userId, sessionCart, callback) {
        if (!sessionCart || !Array.isArray(sessionCart) || sessionCart.length === 0) return callback(null);
        // Process sequentially to avoid too many parallel DB ops
        let i = 0;
        const next = () => {
            if (i >= sessionCart.length) return callback(null);
            const it = sessionCart[i];
            // map session item to model expected shape
            const item = { id: it.id, productName: it.productName || it.product_name || '', price: it.price || 0, quantity: it.quantity || 0 };
            Cart.addItem(userId, item, function (err) {
                if (err) return callback(err);
                i++;
                next();
            });
        };
        next();
    }
};

module.exports = Cart;
