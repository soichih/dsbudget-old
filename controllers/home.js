var _ = require('lodash');
var async = require('async');
var crypto = require('crypto');
var nodemailer = require('nodemailer');
var passport = require('passport');
var Doc = require('../models/doc');
var secrets = require('../config/secrets');

exports.index = function(req, res) {
    //check to see if user has user/pass reset (if this is the first time user logsin)
    if(req.user) {
        if(req.user.password) {
            Doc.find({owners: req.user._id}, function(err, docs) {
                if(err) {
                    console.error(err);
                } else {
                    if(docs.length > 0) {
                        //all good
                        res.redirect('/page'); 
                    } else {
                        //create doc for user  
                        Doc.create({
                            "name" : "My Budget",
                            "owners" : [ req.user._id ]
                        }, function(err, docid) {
                            console.log("created first doc for user "+req.user._id);
                            res.redirect('/'); 
                        });
                    }
                }
            });
        } else {
            req.flash('info', "Looks like this is your first time using dsBudget! Please specify a password so you can login with your email and password.");
            res.redirect('/setpass'); 
        }
    } else {
        res.redirect('/about');  //jumpt to where we want to go
    }
};

exports.about = function(req, res) {
    res.render('about.ejs', {req: req, menu: "about"});
};


