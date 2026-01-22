const db = require('../db');

const Transaction = {
  create: function(data, callback) {
    const sql = `INSERT INTO transactions (orderId, payerId, payerEmail, amount, currency, status, time) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = [data.orderId, data.payerId, data.payerEmail, data.amount, data.currency, data.status, data.time];
    db.query(sql, params, function(err, result) {
      if (err) return callback(err);
      callback(null, { insertId: result.insertId });
    });
  }
};

module.exports = Transaction;
