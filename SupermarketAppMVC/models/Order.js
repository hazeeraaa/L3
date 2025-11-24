const db = require('../db');

/**
 * Order model
 * Tables expected: orders (id, user_id, address, status, total, created_at)
 * and order_items (id, order_id, product_id, product_name, quantity, price)
 */

const Order = {
    createOrder(userId, address, items, total, callback) {
        // Use the shared connection for a transaction
        db.beginTransaction(function(err) {
            if (err) return callback(err);
            const insertOrder = 'INSERT INTO orders (user_id, address, status, total, created_at) VALUES (?, ?, ?, ?, NOW())';
            db.query(insertOrder, [userId, address, 'pending', total], function(err, result) {
                if (err) return db.rollback(function(){ callback(err); });
                const orderId = result.insertId;
                // Insert items one-by-one to avoid driver-specific bulk-insert issues
                const insertItemSingle = 'INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)';
                const insertNext = (idx) => {
                    if (idx >= items.length) {
                        // all items inserted, commit
                        return db.commit(function(err) {
                            if (err) return db.rollback(function(){ callback(err); });
                            callback(null, { orderId });
                        });
                    }
                    const it = items[idx];
                    db.query(insertItemSingle, [orderId, it.id, it.productName || it.product_name || '', it.quantity, it.price], function(err) {
                        if (err) {
                            console.error('Failed to insert order item:', err);
                            return db.rollback(function(){ callback(err); });
                        }
                        insertNext(idx + 1);
                    });
                };
                insertNext(0);
            });
        });
    },

    // List all orders with items
    getAllOrders(callback) {
        // Join users to include the customer's email for admin views
        const sql = `SELECT o.id as orderId, o.user_id, u.email as user_email, o.address, o.status, o.total, o.created_at,
            oi.id as itemId, oi.product_id, oi.product_name, oi.quantity, oi.price
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            ORDER BY o.created_at DESC`;
        db.query(sql, function(err, results) {
            if (err) {
                console.error('Order.getAllOrders SQL error:', err);
                // Return empty list instead of error so admin page can render
                return callback(null, []);
            }
            // group by order
            const orders = {};
            results.forEach(row => {
                if (!orders[row.orderId]) orders[row.orderId] = { id: row.orderId, user_id: row.user_id, user_email: row.user_email, address: row.address, status: row.status, total: row.total, created_at: row.created_at, items: [] };
                if (row.itemId) orders[row.orderId].items.push({ id: row.itemId, product_id: row.product_id, product_name: row.product_name, quantity: row.quantity, price: row.price });
            });
            callback(null, Object.values(orders));
        });
    },

    // Update delivery status for an order
    updateStatus(orderId, status, callback) {
        const sql = 'UPDATE orders SET status = ? WHERE id = ?';
        db.query(sql, [status, orderId], function(err, result) {
            if (err) return callback(err);
            callback(null, { affectedRows: result.affectedRows });
        });
    }

    // Delete an order and its items within a transaction
    ,deleteOrder(orderId, callback) {
        db.beginTransaction(function(err) {
            if (err) return callback(err);
            const delItems = 'DELETE FROM order_items WHERE order_id = ?';
            db.query(delItems, [orderId], function(err) {
                if (err) return db.rollback(function(){ callback(err); });
                const delOrder = 'DELETE FROM orders WHERE id = ?';
                db.query(delOrder, [orderId], function(err, result) {
                    if (err) return db.rollback(function(){ callback(err); });
                    db.commit(function(err) {
                        if (err) return db.rollback(function(){ callback(err); });
                        callback(null, { affectedRows: result.affectedRows });
                    });
                });
            });
        });
    }
};

module.exports = Order;
