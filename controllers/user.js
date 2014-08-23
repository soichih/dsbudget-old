//var _ = require('lodash');
var async = require('async');
var crypto = require('crypto');
var nodemailer = require('nodemailer');
var passport = require('passport');
var User = require('../models/user');
//var secrets = require('../config/secrets');

exports.getLogin = function(req, res) {
    if (req.user) return res.redirect('/');
    res.render('login.ejs', {menu: "login" });
};

/*
exports.postLogin = function(req, res) {
    passport.authenticate('local', { 
        successRedirect: '/', failureRedirect: '/login', failureFlash: true 
    }), function(req, res) {
        req.flash('success', {msg: "Welcome Back!"});
        return res.redirect('/');
    };
};
*/
exports.postLogin = function(req, res, next) {
    if (req.user) return res.redirect('/');
    req.assert('email', 'Email is not valid').isEmail();
    req.assert('password', 'Password cannot be blank').notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        req.flash('error', errors);
        return res.redirect('/login');
    }

    passport.authenticate('local', function(err, user, info) {
        if (err) return next(err);
        if (!user) {
            req.flash('error', { msg: info.message });
            return res.redirect('/login');
        }
        req.logIn(user, function(err) {
            if (err) return next(err);
            req.flash('success', { msg: 'Success! You are logged in.' });
            res.redirect('/page');
        });
    })(req, res, next);
};


exports.logout = function(req, res) {
    req.flash('success', {msg: 'Successfully signed out!'});
    req.logout();
    res.redirect('/');
};

exports.autherror = function(req, res) {
    res.render("auth-error.ejs", {menu: "login"});
};

exports.getSignup = function(req, res) {
    res.render("signup.ejs", {menu: "signup"});
};

exports.postSignup = function(req, res) {
    if (req.user) return res.redirect('/');
    req.assert('email', 'Email is not valid').isEmail();
    req.assert('password', 'Password must be at least 4 characters long').len(4);
    req.assert('password_confirm', 'Passwords do not match').equals(req.body.password);
    req.assert('name', 'Name cannot be blank').notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        req.flash('error', errors);
        return res.redirect('/signup');
    }

    var user = new User({
        email: req.body.email,
        password: req.body.password,
        profile: {
            name: req.body.name
        }
    });

    user.save(function(err) {
        if (err) { 
            req.flash('error', {msg: User.errorMessage(err)});
            return res.redirect('/signup');
        }
        req.logIn(user, function(err) {
            if(err) {
                req.flash('error', { msg: 'Failed to login!' });
            }
            req.flash('success', { msg: 'Successfully signup!' });
            res.redirect('/');
        });
    });
    /*
    User.findOne({ email: req.body.email }, function(err, existingUser) {
        if (existingUser) {
            req.flash('error', { msg: 'Account with that email address already exists.' });
            return res.redirect('/signup');
        }
        user.save(function(err) {
            if (err) return next(err);
            req.logIn(user, function(err) {
                if (err) return next(err);
                res.redirect('/');
            });
        });
    });
    */
};

exports.getSetpass = function(req, res) {
    if (!req.user) return res.redirect('/');
    res.render("setpass.ejs", {menu: "signup"});
};

exports.postSetpass = function(req, res) {
    if (!req.user) return res.redirect('/');
    req.assert('password', 'Password must be at least 4 characters long').len(4);
    req.assert('password_confirm', 'Passwords do not match').equals(req.body.password);
    var errors = req.validationErrors();
    if (errors) {
        req.flash('error', errors);
        return res.redirect('/setpass');
    }

    req.user.password = req.body.password;
    req.user.save(function(err) {
        if(err) {
            req.flash('error', {msg: User.errorMessage(err)});
            return res.redirect('/setpass');
        } else {
            req.flash('success', {msg: "Successfully reset your password!"});
            res.redirect('/');
        }
    });
};

exports.getSetting = function(req, res) {
    if (!req.user) return res.redirect('/');
    res.render("setting.ejs", {menu: "setting"});
};

exports.postSetting = function(req, res) {
    if (!req.user) return res.redirect('/');
    req.assert('name', 'Name cannot be blank').notEmpty();
    req.assert('email', 'Email is not valid').isEmail();
    var errors = req.validationErrors();
    if (errors) {
        req.flash('error', errors);
        return res.redirect('/setting');
    }

    req.user.email = req.body.email;
    req.user.profile.name = req.body.name;
    req.user.profile.favorite_color = req.body.color;
    req.user.save(function(err) {
        if(err) {
            req.flash('error', {msg: User.errorMessage(err)});
        } else {
            req.flash('success', { msg: 'Successfully updated your profile!' });
        }
        res.redirect('/setting');
    });
};
