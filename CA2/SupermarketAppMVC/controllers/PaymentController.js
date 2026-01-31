const Order = require('../models/Order');
const Refund = require('../models/Refund');

const PaymentController = {
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

      const address = req.body.address || '';
      const deliveryType = req.body.deliveryType || 'doorstep';
      const deliveryFee = parseFloat(req.body.deliveryFee || 0) || 0;
      const subtotal = cartItems.reduce((s, it) => s + it.price * it.quantity, 0);
      const finalTotal = subtotal + deliveryFee;

      const reduceNext = (idx) => new Promise((resolve, reject) => {
        if (idx >= cartItems.length) return resolve();
        const it = cartItems[idx];
        require('../models/Product').reduceQuantity(it.id, it.quantity, function(err) {
          if (err) return reject(err);
          resolve(reduceNext(idx+1));
        });
      });

      await reduceNext(0);

      require('../models/Order').createOrder(userId, address, cartItems, finalTotal, deliveryType, deliveryFee, 'PayPal', function(err, info) {
        if (err) {
          console.error('Failed to create Order after PayPal capture:', err);
          return res.status(500).json({ error: 'Failed to create local order' });
        }
        // persist PayPal capture as a transaction (for audit) linked to local order
        try {
          const isoString = (capture.purchase_units && capture.purchase_units[0] && capture.purchase_units[0].payments && capture.purchase_units[0].payments.captures && capture.purchase_units[0].payments.captures[0] && capture.purchase_units[0].payments.captures[0].create_time) || null;
          const mysqlDatetime = isoString ? isoString.replace('T', ' ').replace('Z', '') : null;
          const Transaction = require('../models/Transaction');
          const providerCaptureId = (capture.purchase_units && capture.purchase_units[0] && capture.purchase_units[0].payments && capture.purchase_units[0].payments.captures && capture.purchase_units[0].payments.captures[0] && capture.purchase_units[0].payments.captures[0].id) || null;
          const trans = {
            localOrderId: info.orderId,
            providerOrderId: capture.id,
            providerCaptureId: providerCaptureId,
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

        if (userId) {
          const Cart = require('../models/Cart');
          Cart.clearCart(userId, function(){});
        } else {
          req.session.cart = [];
        }
        return res.json({ success: true, invoiceUrl: `/invoice/${info.orderId}`, capture });
      });
    } catch (err) {
      console.error('PaymentController.pay error:', err);
      return res.status(500).json({ error: 'Failed to complete PayPal payment', message: err.message });
    }
  },

  // Finalize NETS QR order after server-to-server confirmation
  async netsComplete(req, res) {
    try {
      const userId = req.session && req.session.user ? req.session.user.id : null;
      let cartItems = [];
      if (userId) {
        const Cart = require('../models/Cart');
        cartItems = await new Promise((resolve, reject) => Cart.getItemsByUser(userId, (err, items) => err ? reject(err) : resolve(items)));
        cartItems = (cartItems || []).map(it => ({ id: it.product_id, productName: it.product_name, quantity: it.quantity, price: it.price }));
      } else {
        cartItems = req.session.cart || [];
      }
      if (!cartItems || cartItems.length === 0) return res.status(400).json({ error: 'Cart is empty' });

      const address = req.body.address || '';
      const deliveryType = req.body.deliveryType || 'doorstep';
      const deliveryFee = parseFloat(req.body.deliveryFee || 0) || 0;
      const subtotal = cartItems.reduce((s, it) => s + it.price * it.quantity, 0);
      const finalTotal = subtotal + deliveryFee;

      const reduceNext = (idx) => new Promise((resolve, reject) => {
        if (idx >= cartItems.length) return resolve();
        const it = cartItems[idx];
        require('../models/Product').reduceQuantity(it.id, it.quantity, function(err) {
          if (err) return reject(err);
          resolve(reduceNext(idx+1));
        });
      });

      await reduceNext(0);

      require('../models/Order').createOrder(userId, address, cartItems, finalTotal, deliveryType, deliveryFee, 'NETS', function(err, info) {
        if (err) {
          console.error('Failed to create Order after NETS success:', err);
          return res.status(500).json({ error: 'Failed to create local order' });
        }
        if (userId) {
          const Cart = require('../models/Cart');
          Cart.clearCart(userId, function(){});
        } else {
          req.session.cart = [];
        }
        // Provide both invoice URL and a convenience success page URL that can show a friendly success screen
        const invoiceUrl = `/invoice/${info.orderId}`;
        const successPageUrl = `/nets-qr/success?invoice=${encodeURIComponent(invoiceUrl)}`;
        return res.json({ success: true, invoiceUrl, successPageUrl });
      });
    } catch (err) {
      console.error('PaymentController.netsComplete error:', err);
      return res.status(500).json({ error: 'Failed to finalize NETS order', message: err.message });
    }
  },

  // User: request a refund for an order (creates a refund row with status 'requested')
  requestRefund(req, res) {
    const orderId = req.params.orderId || req.params.id;
    const user = req.session && req.session.user ? req.session.user : null;
    if (!user) {
      if (req.flash) req.flash('error', 'Please login to request a refund');
      return res.redirect('/login');
    }
    Order.getOrderById(orderId, function(err, order) {
      if (err || !order) {
        if (req.flash) req.flash('error', 'Order not found');
        return res.redirect('/orders');
      }
      if (order.user_id != user.id) {
        if (req.flash) req.flash('error', 'Access denied');
        return res.redirect('/orders');
      }
      if (!order.payment_method || order.payment_method.toLowerCase().indexOf('paypal') === -1) {
        if (req.flash) req.flash('error', 'Refund not supported for this payment method');
        return res.redirect(`/invoice/${order.id}`);
      }
      Refund.sumCompletedByOrder(order.id, function(err2, alreadyRefunded) {
        if (err2) alreadyRefunded = 0;
        const remaining = Number(order.total) - Number(alreadyRefunded || 0);
        if (remaining <= 0) {
          if (req.flash) req.flash('error', 'Order already fully refunded');
          return res.redirect(`/invoice/${order.id}`);
        }
        const Transaction = require('../models/Transaction');
        Transaction.findByOrderId(order.id, function(err3, tx) {
          const txId = tx ? tx.id : null;
          Refund.create({ orderId: order.id, transactionId: txId, userId: user.id, amount: remaining, currency: order.currency || 'SGD', method: 'PayPal', status: 'requested' }, function(rErr) {
            if (rErr) {
              console.error('Failed to create refund request:', rErr);
              const msg = 'Failed to create refund request' + (rErr && rErr.message ? (': ' + rErr.message) : '');
              if (req.flash) req.flash('error', msg);
              return res.redirect(`/invoice/${order.id}`);
            }
            if (req.flash) req.flash('success', 'Refund request submitted. Admin will review it shortly.');
            return res.redirect(`/invoice/${order.id}`);
          });
        });
      });
    });
  },

  // Admin: refund via PayPal for a given order
  async refundPayPal(req, res) {
    try {
      const orderId = req.params.id;
      const refundAmount = parseFloat(req.body.amount || 0) || null;
      Order.getOrderById(orderId, async function(err, order) {
        if (err || !order) {
          if (req.flash) req.flash('error', 'Order not found');
          return res.redirect('/admin/orders');
        }
        const Transaction = require('../models/Transaction');
        Transaction.findByOrderId(orderId, async function(err2, tx) {
          if (err2 || !tx) {
            if (req.flash) req.flash('error', 'Transaction for order not found');
            return res.redirect('/admin/orders');
          }
          if (!tx.provider_capture_id) {
            if (req.flash) req.flash('error', 'No provider capture id available for refund');
            return res.redirect('/admin/orders');
          }
          const captureId = tx.provider_capture_id;
          const amountToRefund = refundAmount || Number(order.total) || Number(tx.amount) || 0;
          const paypalSvc = require('../services/paypal');
          try {
            const refundResp = await paypalSvc.refundCapture(captureId, amountToRefund);
            const RefundModel = require('../models/Refund');
            const providerRef = refundResp && (refundResp.id || refundResp.refund_id) ? (refundResp.id || refundResp.refund_id) : null;
            const providerResponse = JSON.stringify(refundResp);
            const statusToSet = (refundResp && (refundResp.status || refundResp.state)) || 'completed';
            RefundModel.completeRequestedByOrderId(order.id, statusToSet, providerRef, providerResponse, function(compErr, compRes) {
              if (compErr) console.error('Failed to complete requested refunds by order id:', compErr);
              const updated = compRes && compRes.affectedRows ? compRes.affectedRows : 0;
              if (updated > 0) {
                if (req.flash) req.flash('success', 'Refund successful');
                return res.redirect('/admin/orders');
              }
              RefundModel.create({ orderId: order.id, transactionId: tx.id, userId: order.user_id, amount: amountToRefund, currency: refundResp && refundResp.currency_code ? refundResp.currency_code : (order.currency || 'SGD'), method: 'PayPal', providerRef: providerRef, status: statusToSet, providerResponse: providerResponse }, function(rErr) {
                if (rErr) console.error('Failed to record refund:', rErr);
                if (req.flash) req.flash('success', 'Refund successful');
                return res.redirect('/admin/orders');
              });
            });
          } catch (pErr) {
            console.error('PayPal refund error:', pErr);
            if (req.flash) req.flash('error', 'PayPal refund failed: ' + (pErr && pErr.message ? pErr.message : ''));
            return res.redirect('/admin/orders');
          }
        });
      });
    } catch (err) {
      console.error('PaymentController.refundPayPal error:', err);
      if (req.flash) req.flash('error', 'Refund failed');
      return res.redirect('/admin/orders');
    }
  },

  // Admin: approve a refund request (perform PayPal refund and mark refund completed)
  async approveRefund(req, res) {
    try {
      const refundId = req.params.id;
      const admin = req.session && req.session.user ? req.session.user : null;
      if (!admin || admin.role !== 'admin') {
        if (req.flash) req.flash('error', 'Admin access required');
        return res.redirect('/login');
      }
      Refund.getById(refundId, async function(err, refund) {
        if (err || !refund) {
          if (req.flash) req.flash('error', 'Refund request not found');
          return res.redirect('/admin/refunds');
        }
        if (refund.status !== 'requested') {
          if (req.flash) req.flash('error', 'Refund request is not pending');
          return res.redirect('/admin/refunds');
        }
        Order.getOrderById(refund.order_id, function(err2, order) {
          if (err2 || !order) {
            if (req.flash) req.flash('error', 'Order not found');
            return res.redirect('/admin/refunds');
          }
          const Transaction = require('../models/Transaction');
          Transaction.findByOrderId(order.id, async function(err3, tx) {
            if (err3 || !tx || !tx.provider_capture_id) {
              if (req.flash) req.flash('error', 'Transaction/capture id not found for this order');
              return res.redirect('/admin/refunds');
            }
            const RefundModel = require('../models/Refund');
            RefundModel.sumCompletedByOrder(order.id, async function(err4, alreadyRefunded) {
              if (err4) alreadyRefunded = 0;
              const remaining = Number(order.total) - Number(alreadyRefunded || 0);
              const amountToRefund = Math.min(Number(refund.amount || remaining), remaining);
              if (amountToRefund <= 0) {
                if (req.flash) req.flash('error', 'Nothing left to refund');
                return res.redirect('/admin/refunds');
              }
              const paypalSvc = require('../services/paypal');
              try {
                const refundResp = await paypalSvc.refundCapture(tx.provider_capture_id, amountToRefund);
                const providerResponse = JSON.stringify({ adminId: admin.id, resp: refundResp });
                RefundModel.updateStatus(refund.id, 'completed', (refundResp && refundResp.id) || null, providerResponse, function(uErr) {
                  if (uErr) console.error('Failed to update refund status:', uErr);
                  Order.updateStatus(order.id, 'refunded', function(){});
                  if (req.flash) req.flash('success', 'Refund processed');
                  return res.redirect('/admin/refunds');
                });
              } catch (pErr) {
                console.error('PayPal refund error (approveRefund):', pErr);
                if (req.flash) req.flash('error', 'PayPal refund failed: ' + (pErr && pErr.message ? pErr.message : ''));
                return res.redirect('/admin/refunds');
              }
            });
          });
        });
      });
    } catch (err) {
      console.error('PaymentController.approveRefund error:', err);
      if (req.flash) req.flash('error', 'Failed to process refund');
      return res.redirect('/admin/refunds');
    }
  },

  // Admin: reject a refund request
  rejectRefund(req, res) {
    const refundId = req.params.id;
    const admin = req.session && req.session.user ? req.session.user : null;
    if (!admin || admin.role !== 'admin') {
      if (req.flash) req.flash('error', 'Admin access required');
      return res.redirect('/login');
    }
    const reason = req.body.reason || 'Rejected by admin';
    Refund.getById(refundId, function(err, refund) {
      if (err || !refund) {
        if (req.flash) req.flash('error', 'Refund request not found');
        return res.redirect('/admin/refunds');
      }
      if (refund.status !== 'requested') {
        if (req.flash) req.flash('error', 'Refund request is not pending');
        return res.redirect('/admin/refunds');
      }
      const providerResponse = JSON.stringify({ adminId: admin.id, reason: reason });
      Refund.updateStatus(refund.id, 'rejected', null, providerResponse, function(uErr) {
        if (uErr) console.error('Failed to update refund status:', uErr);
        if (req.flash) req.flash('success', 'Refund request rejected');
        return res.redirect('/admin/refunds');
      });
    });
  }
};

module.exports = PaymentController;
