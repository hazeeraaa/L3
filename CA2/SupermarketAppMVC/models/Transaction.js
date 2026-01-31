const db = require('../db');

const Transaction = {
  create: function(data, callback) {
    const sql = `INSERT INTO transactions (local_order_id, provider_order_id, provider_capture_id, payerId, payerEmail, amount, currency, status, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [data.localOrderId || null, data.providerOrderId || null, data.providerCaptureId || null, data.payerId || null, data.payerEmail || null, data.amount || 0, data.currency || null, data.status || null, data.time || null];
    db.query(sql, params, function(err, result) {
      if (err) return callback(err);
      callback(null, { insertId: result.insertId });
    });
  },

  findByOrderId: function(orderId, callback) {
    const sql = 'SELECT * FROM transactions WHERE local_order_id = ? ORDER BY id DESC LIMIT 1';
    db.query(sql, [orderId], function(err, results) {
      if (err) return callback(err);
      callback(null, results && results.length ? results[0] : null);
    });
  }
};

module.exports = Transaction;
