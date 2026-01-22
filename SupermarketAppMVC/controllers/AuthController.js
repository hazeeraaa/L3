const bcrypt = require('bcryptjs');
const User = require('../models/User');

/**
 * AuthController: register, login, logout
 */

const AuthController = {
    showRegister(req, res) {
        const messages = req.flash ? req.flash('error') : [];
        res.render('register', { messages, formData: {} });
    },

    async register(req, res) {
        try {
            const { username, email, password, address, contact } = req.body;

            // basic validation
            const errors = [];
            if (!username) errors.push('Username is required');
            if (!email) errors.push('Email is required');
            if (!password || password.length < 6) errors.push('Password must be at least 6 characters');
            if (errors.length) {
                if (req.flash) req.flash('error', errors);
                return res.render('register', { messages: errors, formData: req.body });
            }

            // check existing
            User.getUserByEmail(email, async function (err, existing) {
                if (err) {
                    console.error('DB error checking user:', err);
                    return res.status(500).send('Server error');
                }
                if (existing) {
                    const msg = ['Email already registered'];
                    if (req.flash) req.flash('error', msg);
                    return res.render('register', { messages: msg, formData: req.body });
                }

                // hash password and create (force role = 'user' for public registration)
                const hashed = await bcrypt.hash(password, 10);
                const user = { username, email, password: hashed, address, contact, role: 'user' };
                User.createUser(user, function (err, info) {
                    if (err) {
                        console.error('Error creating user:', err);
                        return res.status(500).send('Server error');
                    }
                    if (req.flash) req.flash('success', 'Registration successful. Please login.');
                    res.redirect('/login');
                });
            });
        } catch (e) {
            console.error('Register error:', e);
            res.status(500).send('Server error');
        }
    },

    showLogin(req, res) {
        const errors = req.flash ? req.flash('error') : [];
        const messages = req.flash ? req.flash('success') : [];
        res.render('login', { errors, messages });
    },

    login(req, res) {
        const { email, password } = req.body;
        const errors = [];
        if (!email || !password) {
            errors.push('Email and password are required');
            if (req.flash) req.flash('error', errors);
            return res.render('login', { errors, messages: [] });
        }

        User.getUserByEmail(email, async function (err, user) {
            if (err) {
                console.error('DB error logging in:', err);
                return res.status(500).send('Server error');
            }
            if (!user) {
                const e = ['Invalid email or password'];
                if (req.flash) req.flash('error', e);
                return res.render('login', { errors: e, messages: [] });
            }

            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                const e = ['Invalid email or password'];
                if (req.flash) req.flash('error', e);
                return res.render('login', { errors: e, messages: [] });
            }

            // successful login: store minimal user in session
            req.session.user = { id: user.id, username: user.username, email: user.email, role: user.role };
            // merge any session cart into DB-backed cart
            try {
                const Cart = require('../models/Cart');
                await new Promise((resolve, reject) => {
                    Cart.mergeSessionCart(user.id, req.session.cart || [], function(err) {
                        if (err) return reject(err);
                        // clear session cart after merge
                        req.session.cart = [];
                        resolve();
                    });
                });
            } catch (e) {
                console.error('Failed to merge session cart on login:', e);
            }
            res.redirect('/inventory');
        });
    },

    logout(req, res) {
        req.session.destroy(function (err) {
            // ignore errors
            res.redirect('/');
        });
    }
};

module.exports = AuthController;
