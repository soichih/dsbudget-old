#!/bin/env node
var http = require('http');
var path = require('path');
var assert = require('assert');
var crypto = require('crypto');

var express = require('express');
var mongo = require('mongodb');
var async = require('async');
var sass = require('node-sass');
var passport = require('passport'), 
    GoogleStrategy = require('passport-google').Strategy,
    LocalStrategy = require('passport-local').Strategy;
var flash = require('connect-flash');

/*
var MemoryStore = express.session.MemoryStore,
    sessionStore = new MemoryStore();
*/

console.log("dumping env");
console.dir(process.env);

var now = new Date().getTime();

//set config
var config = {};
if(process.env.OPENSHIFT_NODEJS_PORT !== undefined) {
    console.log("seems to be running on openshift");
    
    config.port = process.env.OPENSHIFT_NODEJS_PORT;
    config.host = process.env.OPENSHIFT_NODEJS_IP;
    config.socket_url = process.env.OPENSHIFT_APP_DNS+":8443";
    config.mongo_url = process.env.OPENSHIFT_MONGODB_DB_URL + process.env.OPENSHIFT_APP_NAME;
    config.app_url = "https://"+config.host+":"+config.port;
    config.cookie_secret = "hardcoded for now";
} else if(process.env.HEROKU) {
    console.log("seems to be running on heroku");
    config.mongo_url = process.env.MONGOLAB_URI;
    config.port = process.env.PORT;
    config.app_url = 'https://dsbudget.herokuapp.com'; 
    config.socket_url = 'dsbudget.herokuapp.com:443';
    config.cookie_secret = process.env.COOKIE_SECRET;
} else {
    //assume local instance
    config = require('./config.json');
}

var app = express();
var server = http.createServer(app);
app.configure(function() {
    app.set('view engine', 'ejs');
    app.set('views', __dirname + '/views');
    app.use(sass.middleware({
        src: __dirname, //look for /public/*.scss
        dest: __dirname, //and put compiled in /public/*.css
        debug: true // obvious
    }));
    app.use("/static", express.static(__dirname + '/static'));

    app.use(express.cookieParser());
    app.use(express.favicon());
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.session({ /*store: sessionStore,*/ secret: config.cookie_secret }));

    app.use(passport.initialize());
    app.use(passport.session());
    app.use(flash());

    app.use(app.router);
    app.use(express.errorHandler());
    app.use(express.logger());
});

var io = require('socket.io').listen(server);
/*
//share session with express (http://stackoverflow.com/questions/15093018/sessions-with-express-js-passport-js)
io.configure(function (){
    io.set("authorization", passport.authorize({
        key:    'express.sid',       //the cookie where express (or connect) stores its session id.
        secret: config.cookie_secret, //the session secret to parse the cookie
        store:   sessionStore,     //the session store that express uses
        fail: function(data, accept) {
            // console.log("failed");
            // console.log(data);// *optional* callbacks on success or fail
            accept(null, false);             // second param takes boolean on whether or not to allow handshake
        },
        success: function(data, accept) {
          //  console.log("success socket.io auth");
         //   console.log(data);
            accept(null, true);
        }
    }));
});
*/
io.sockets.on('connection', function (socket) {
    console.log('connected');
    setInterval(function() {
        socket.emit('news', { time: new Date().getTime() });
    }, 1000);
    socket.on('my other event', function (data) {
        console.log(data);
    });
});

function hashpassword(pass, salt, callback) {
    crypto.pbkdf2(pass, salt, 10000, 512, function(err, hash) {
        if(err) {
            callback(err);
        } else {
            callback(null, hash.toString());
        }
    });
}

//most of initialization happens after we connect to db.
mongo.MongoClient.connect(config.mongo_url, function(err, db) {
    if(err) throw err;

    var model = require('./model').init(db);

    app.get('/', function(req,res) {
        //check to see if user has user/pass reset (if this is the first time user logsin)
        //console.log("checking user object");
        if(req.user) {
            //console.dir(req.user);
            if(req.user.password) {
                model.Doc.findByOwnerID(req.user._id, function(err, docs) {
                    if(err) {
                        console.error(err);
                    } else {
                        if(docs.length > 0) {
                            //all good
                            res.redirect('/page'); 
                        } else {
                            //create doc for user  
                            model.Doc.create({
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
                res.redirect('/setpass'); 
            }
        } else {
            res.redirect('/about');  //jumpt to where we want to go
        }
    });
    app.get('/about', function(req,res) {
        res.render('about.ejs', {req: req, menu: "about"});
    });
    app.get('/auth', function(req, res){
        res.render("auth.ejs", {req: req, menu: "login"});
    });
    app.get('/auth/logout', function(req, res){
        req.logout();
        res.redirect('/'); 
    });
    app.get('/auth/error', function(req, res){
        res.render("auth-error.ejs", {req: req, menu: "login"});
    });
    app.get('/signup', function(req, res){
        res.render("signup.ejs", {req: req, menu: "signup"});
    });
    app.get('/setpass', function(req, res){
        if(req.user) {
            res.render("setpass.ejs", {req: req, menu: "signup"});
        }
    });
    app.post('/setpass', function(req, res) {
        if(req.user) {
            if(req.body.password != req.body.password_confirm) {
                req.flash('error', "Password doesn't match. Please enter again.");
                res.redirect('/setpass');
            } else {
                model.User.findByEmail(req.body.email, function(err, rec) {
                    if(rec && rec._id.toString() != req.user._id.toString()) {
                        req.flash('error', "Sorry, the email address is already registered. Please a choose different one.");
                        res.redirect('/setpass');
                    } else {
                        var salt = crypto.randomBytes(128).toString('base64');
                        hashpassword(req.body.password, salt, function(err, hash) {
                            model.User.update(req.user._id, {$set: {
                                password_salt: salt,
                                password: hash,
                                email: req.body.email, 
                                name: req.body.name
                            }}, function(err) {
                                if(err) {
                                    req.flash('error', "Sorry, failed to update your record. Please contact dsBudget support.");
                                    res.statusCode = 500;
                                    res.redirect('/setpass');
                                } else {
                                    res.statusCode = 200;
                                    res.redirect('/');
                                }
                            });
                        });
                    }
                });
            }
        }
    });

    passport.use(new GoogleStrategy({
        returnURL: config.app_url+'/auth/google/return',
            realm: config.app_url+'/'
        },
        function(openid, profile, done) {
            model.User.findByGoogleID(openid, function(err, user) {
                if(err) {       
                    console.log(err);
                    done(err);
                } else {
                    if(user) {
                        //welcome back
                        //console.dir(user); 
                        done(err, user);
                    } else {
                        //new user - create account (let user reset user/pass later)
                        console.log("creating new user account for "+profile.displayName);
                        model.User.create({
                            admin: false,
                            googleid: openid, 
                            name: profile.displayName, 
                            email: profile.emails[0].value
                        }, function(err, id) {
                            //lookup newly created account
                            model.User.findByID(id, function(err, user) {
                                if(err) throw err; //really?
                                done(null, user);
                            });
                        });
                    }
                }
            });
        }
    ));

    passport.use(new LocalStrategy({
            usernameField: 'email',
            passwordField: 'password'
        },
        function(email, password, done) {
            //console.log("passport-local called");
            model.User.findByEmail(email, function(err, user) {
                if(err) throw err; //really?
                if(user) {
                    hashpassword(password, user.password_salt, function(err, hash) {
                        //console.log("salt:"+user.password_salt);
                        //console.log("hash:"+hash);
                        if(user.password != hash) {
                            return done(null, false, { message: 'Incorrect password.' });
                        } else {
                            return done(null, user);
                        }
                    });
                } else {
                    return done(null, false, { message: 'Incorrect email.' });
                }
            });
        }
    ));
    app.post('/auth/login', passport.authenticate('local', { 
        successRedirect: '/', failureRedirect: '/auth',
        failureFlash: true 
    }), function(req, res) {
        console.log("local authentication successful");
    });

    passport.serializeUser(function(user, done) {
        //what am I supposed to do here?
        done(null, user._id);
    });

    passport.deserializeUser(function(id, done) {
        model.User.findByID(new mongo.ObjectID(id), function(err, user) {
            //console.log("deserialize user with id: "+id);
            //console.dir(user);
            done(err, user);
        });
    });
    app.get('/auth/google', passport.authenticate('google'));
    app.get('/auth/google/return', passport.authenticate('google', 
        { successRedirect: '/', failureRedirect: '/auth/error' }
    ));

    //forward to /check when user first login 
    app.get('/', function(req, res){
    });

    app.get('/page', function(req, res){
        if(req.user) {
            res.render("page.ejs", {req: req, menu: "page"});
        } else {
            res.redirect('/'); 
        }
    });
    app.get('/page/list', function(req, res){
        if(req.user) {
            //load all docs
            model.Doc.findByOwnerID(req.user._id, function(err, docs) {
                //load pages for each doc
                async.forEach(docs, function(doc, next) {
                    model.Page.findByDocID(doc._id, function(err, pages) {
                        //add some optional parameters to each page
                        async.forEach(pages, function(page, next_page) {
                            page._pct = page.total_expense/page.total_income*100;
                            if(page.start_date < now && page.end_date > now) {
                                page._active = true; 
                            }
                            next_page();
                        }, function() {
                            doc.pages = pages;
                            next();
                        });
                    });
                }, function() {
                    res.json(docs);
                });
            });
        }
    });
    app.get('/page/detail', function(req, res){
        if(req.user) {
            //load page requested
            model.Page.findByID(new mongo.ObjectID(req.query.id), function(err, page) {
                if(err) {
                    console.error(err);
                    res.statusCode = 404;
                    res.end();
                    return;
                } 
                model.Doc.getAuth(req.user, page.doc_id, function(err, auth) {
                    if(auth.canread) {
                        model.Income.findByPageID(page._id, function(err, incomes) {
                            //for balance income, lookup the real page name & balance
                            async.forEach(incomes, function(income, next_income) {
                                if(income.balance_from) {
                                    //lookup page name
                                    model.Page.findByID(income.balance_from, function(err, ipage) {
                                        income.page_name = ipage.name;
                                        //get the actual balance for the page
                                        model.Page.getBalance(income.balance_from, function(amount) {
                                            income.amount = amount;
                                            next_income();
                                        });
                                    });
                                } else {
                                    next_income();
                                }
                            }, function() {
                                //finally load the categories and emit
                                model.Category.findByPageID(page._id, function(err, categories) {
                                    page.incomes = incomes;
                                    page.categories = categories;
                                    res.json(page);
                                });
                            });
                        });
                    }
                });
            });
        }
    });
    app.get('/setting', function(req, res) {
        if(req.user) {
            res.render("setting.ejs", {req: req, menu: "setting"});
        } else {
            res.redirect('/'); 
        }
    });
    app.post('/setting', function(req, res) {
        if(req.user) {
            model.User.update(req.user._id, {$set: {name: req.body.name, email: req.body.email}}, function(err) {
                if(err) {
                    res.statusCode = 500;
                } else {
                    res.statusCode = 200;
                }
                res.end();
            });
        }
    });
    app.post('/import/dsbudget', function(req, res) {
        if(req.user) {
            var docid = new mongo.ObjectID(req.body.docid);
            var importtype = req.body.importtype;
            var import_opts = {fd: req.body.fd};
            model.Doc.getAuth(req.user, docid, function(err, auth) {
                if(auth.canwrite) {
                    //parse the xml
                    var path = req.files.file.path;
                    var importer = require('./import');
                    switch(importtype) {
                    case "dsbudget":
                        importer.dsbudget(model, docid, path, import_opts, function(err) {
                            if(err) {
                                res.statusCode = 500;
                                res.write(err);
                            } else {
                                //all good
                                res.statusCode = 200;
                            }
                            res.end();
                        }); 
                        break;
                    }
                } else {
                    res.statuCode = 403; //forbidden
                    res.end();
                }
            });
        }
    });
    app.post('/expense', function(req, res) {
        if(req.user) {
            var catid = new mongo.ObjectID(req.body.catid);
            model.Category.findByID(catid, function(err, cat) {
                var page_id = cat.page_id;
                model.Page.findByID(page_id, function(err, page) {
                    var docid = page.doc_id;
                    model.Doc.getAuth(req.user, docid, function(err, auth) {
                        if(auth.canwrite) {
                            var expense = req.body.expense;
                            var clean_expense = {
                                time: parseInt(expense.time),
                                amount: parseFloat(expense.amount),
                                where: expense.where, //make sure it's string?
                                name: expense.name, //make sure it's string?
                                tentative: expense.tentative //make sure it's bool?
                            }
                            if(req.body.eid) {
                                cat.expenses[req.body.eid] = clean_expense;
                            } else {
                                cat.expenses.push(clean_expense);
                            }
                            model.Category.update(cat._id, {$set: {expenses: cat.expenses}}, function(err, id) {
                                if(err) {
                                    console.error(err);
                                    res.statusCode = 500;
                                    res.write('update failed');
                                } else {
                                    res.statusCode = 200;
                                    res.write(id.toString());
                                }
                                res.end();
                            });
                        }
                    });
                });
            });
        }
    });
    app.post('/income', function(req, res) {
        if(req.user) {
            var income = req.body.income;
            var page_id = new mongo.ObjectID(income.page_id);
            model.Page.findByID(page_id, function(err, page) {
                var docid = page.doc_id;
                model.Doc.getAuth(req.user, docid, function(err, auth) {
                    if(auth.canwrite) {
                        var clean_income = {
                            page_id: new mongo.ObjectID(income.page_id),
                            name: income.name //TODO..make sure it's string?
                        }
                        if(income.balance_from) {
                            //convert to mongo id
                            clean_income.balance_from = new mongo.ObjectID(income.balance_from);
                        } else {
                            clean_income.amount = parseFloat(income.amount);
                        }
                        if(income._id) {
                            var iid = new mongo.ObjectID(income._id);
                            model.Income.update(iid, {$set: clean_income}, function(err) {
                                if(err) {
                                    console.error(err);
                                    res.statusCode = 500;
                                    res.write('update failed');
                                } else {
                                    res.statusCode = 200;
                                    res.write('ok');
                                }
                                res.end();
                            });
                        } else {
                            model.Income.create(clean_income, function(err, id) {
                                if(err) {
                                    console.error(err);
                                    res.statusCode = 500;
                                    res.write('insert failed');
                                } else {
                                    res.statusCode = 200;
                                    res.write(id.toString());
                                }
                                res.end();
                            });
                        }
                    }
                }); 
            });
        }
    });
    app.delete('/income/:id', function(req, res) {
        if(req.user) {
            var income_id = req.params.id;
            model.Income.findByID(new mongo.ObjectID(income_id), function(err, income) {
                //make sure user has write access
                var page_id = income.page_id;
                model.Page.findByID(page_id, function(err, page) {
                    var docid = page.doc_id;
                    model.Doc.getAuth(req.user, docid, function(err, auth) {
                        if(auth.canwrite) {
                            //go ahead with removal
                            model.Income.remove(income._id, function(err) {
                                if(err) {
                                    console.error(err);
                                    res.statusCode = 500;
                                    res.write('removal failed');
                                } else {
                                    res.statusCode = 200;
                                    res.write('ok');
                                }
                                res.end();
                            });
                        }
                    }); 
                });
            });
        }
    });
    app.post('/page', function(req, res) {
        if(req.user) {
            var user_page = req.body.page;
            var page_id = new mongo.ObjectID(user_page._id);
            model.Page.findByID(page_id, function(err, page) {
                var docid = page.doc_id;
                model.Doc.getAuth(req.user, docid, function(err, auth) {
                    if(auth.canwrite) {
                        var clean_page = {
                            name: user_page.name,
                            desc: user_page.desc,
                            start_date: user_page.start_date,
                            end_date: user_page.end_date
                        }
                        model.Page.update(page_id, {$set: clean_page}, function(err, id) {
                            if(err) {
                                console.error(err);
                                res.statusCode = 500;
                                res.write('update failed');
                            } else {
                                res.statusCode = 200;
                                res.write(id.toString());
                            }
                            res.end();
                        });
                    }
                });
            });
        }
    });

    /*
    app.get('/page/:id', function(req, res) {
        if(req.user) {
            //load the page
            var pageid = req.params.id;
            model.Page.findByID(new mongo.ObjectID(pageid), function(err, page) {
                //load docs user has access to 
                model.Doc.findByOwnerID(req.user._id, function(err, docs) {
                    //make sure page.doc_id is one of user's doc
                    docs.forEach(function(doc) {
                        if(doc._id == page.doc_id) {
                            res.json(doc);
                        }
                    });
                    res.end();
                });
            });
        } else {
            //user only
            res.redirect('/'); 
        }
    });
    */

    server.listen(config.port, config.host, function(){
        console.log('Express server listening on host ' + config.host+":"+config.port);
    });

    process.on('uncaughtException', function(err) {
        console.error('Caught exception: ' + err);
    });
});

