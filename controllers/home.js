var _ = require('lodash');
var async = require('async');
var crypto = require('crypto');
var nodemailer = require('nodemailer');
var passport = require('passport');
var secrets = require('../config/secrets');
var Doc = require('../models/doc');

//this page does more than just displaying the home page.
//it make sure everything is setup correctly, and if not, it fixes it, or redirect user to right place to fixe them.
//if everything is good, then display the home page
exports.index = function(req, res) {
    if(req.user) {
        //make sure user has at least 1 doc
        Doc.find({owners: req.user._id}, function(err, docs) {
            if(docs.length == 0) {
                Doc.create({
                    "name" : "My Budget",
                    "owners" : [ req.user._id ]
                }, function(err, docid) {
                    console.log("created first doc for user "+req.user._id);
                });
            }
        });
         
        //make sure user set the password
        if(!req.user.password) {
            req.flash('info', {msg:"Looks like this is your first time using dsBudget! Please specify a password so you can login with your email and password."});
            return res.redirect('/setpass'); 
        }
        res.redirect('/list');
    } else {
        res.redirect('/about');  //jumpt to where we want to go
    }
};

exports.about = function(req, res) {
    res.render('about.ejs', {menu: "about"});
};


