const db = require('../db');

const Refund = {
  create: function(data, callback) {
    const sql = `INSERT INTO refunds (order_id, transaction_id, user_id, amount, currency, method, provider_ref, status, provider_response) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [data.orderId, data.transactionId || null, data.userId || null, data.amount || 0, data.currency || 'SGD', data.method || null, data.providerRef || null, data.status || 'requested', data.providerResponse || null];
    db.query(sql, params, function(err, result) {
      if (err) return callback(err);
      callback(null, { insertId: result.insertId });
    });
  },

  getPending: function(callback) {
    const sql = `SELECT r.*, o.user_id as order_user_id, o.total as order_total FROM refunds r LEFT JOIN orders o ON o.id = r.order_id WHERE r.status = 'requested' ORDER BY r.id DESC`;
    db.query(sql, [], function(err, results) {
      if (err) return callback(err);
      callback(null, results || []);
    });
  },

  getById: function(id, callback) {
    const sql = `SELECT * FROM refunds WHERE id = ?`;
    db.query(sql, [id], function(err, results) {
      if (err) return callback(err);
      callback(null, results && results.length ? results[0] : null);
    });
  },

  findRequestedByOrderId: function(orderId, callback) {
    const sql = `SELECT * FROM refunds WHERE order_id = ? AND status = 'requested' ORDER BY id DESC LIMIT 1`;
    db.query(sql, [orderId], function(err, results) {
      if (err) return callback(err);
      callback(null, results && results.length ? results[0] : null);
    });
  },

  getLatestByOrderId: function(orderId, callback) {
    const sql = `SELECT * FROM refunds WHERE order_id = ? ORDER BY id DESC LIMIT 1`;
    db.query(sql, [orderId], function(err, results) {
      if (err) return callback(err);
      callback(null, results && results.length ? results[0] : null);
    });
  },

  sumCompletedByOrder: function(orderId, callback) {
    const sql = `SELECT COALESCE(SUM(amount),0) as refunded FROM refunds WHERE order_id = ? AND status = 'completed'`;
    db.query(sql, [orderId], function(err, results) {
      if (err) return callback(err);
      const refunded = results && results[0] ? results[0].refunded : 0;
      callback(null, Number(refunded) || 0);
    });
  },

  updateStatus: function(id, status, providerRef, providerResponse, callback) {
    const sql = `UPDATE refunds SET status = ?, provider_ref = ?, provider_response = ? WHERE id = ?`;
    const params = [status || 'requested', providerRef || null, providerResponse || null, id];
    db.query(sql, params, function(err, result) {
      if (err) return callback(err);
      callback(null, { affectedRows: result.affectedRows });
    });
  }

  ,
  // Update any requested refunds for an order to a terminal status (e.g., completed/rejected)
  completeRequestedByOrderId: function(orderId, status, providerRef, providerResponse, callback) {
    const sql = `UPDATE refunds SET status = ?, provider_ref = ?, provider_response = ? WHERE order_id = ? AND status = 'requested'`;
    const params = [status || 'completed', providerRef || null, providerResponse || null, orderId];
    db.query(sql, params, function(err, result) {
      if (err) return callback(err);
      callback(null, { affectedRows: result.affectedRows });
    });
  }
};

module.exports = Refund;
