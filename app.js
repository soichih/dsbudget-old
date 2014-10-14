#!/bin/env node

var express = require('express');
var cookieParser = require('cookie-parser');
var compress = require('compression');
var session = require('express-session');
var bodyParser = require('body-parser');
var logger = require('morgan');
var errorHandler = require('errorhandler');
var csrf = require('lusca').csrf();
var methodOverride = require('method-override');

var _ = require('lodash');
var MongoStore = require('connect-mongo')({ session: session });
var flash = require('express-flash');
var path = require('path');
var mongoose = require('mongoose');
var passport = require('passport');
var expressValidator = require('express-validator');
var connectAssets = require('connect-assets');

var multipart = require('connect-multiparty');
//var lessMiddleware = require('less-middleware');

var homeController = require('./controllers/home');
var pageController = require('./controllers/page');
var userController = require('./controllers/user');
var importController = require('./controllers/import');
var apiController = require('./controllers/api');

var secrets = require('./config/secrets');
var passportConf = require('./config/passport');

var app = express();

/**
 * Connect to MongoDB.
 */

mongoose.connect(secrets.db);
mongoose.connection.on('error', function() {
  console.error('MongoDB Connection Error. Make sure MongoDB is running.');
});
mongoose.set('debug', true);

var hour = 3600000;
var day = hour * 24;
var week = day * 7;

app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
//app.set('view engine', 'ejs');
app.set('view engine', 'jade');
app.use(compress());
app.use(connectAssets({
  paths: [path.join(__dirname, 'public/css'), path.join(__dirname, 'public/js')],
  helperContext: app.locals
}));
/*
app.use(sass.middleware({
    src: __dirname+'/public', //look for /public/*.scss
    dest: __dirname+'/public', //and put compiled in /public/*.css
    debug: true 
}));
*/

/*
app.use(lessMiddleware('/less', {
    dest: '/css',
    pathRoot: __dirname+'/public'
}));
*/

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());
app.use(methodOverride());
app.use(cookieParser());
app.use(session({
    resave: true,
    saveUninitialized: true,
    secret: secrets.sessionSecret,
    store: new MongoStore({
        url: secrets.db,
        auto_reconnect: true
    })
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use(function(req, res, next) {
    //for /import/dsbudget -- https://github.com/krakenjs/lusca/issues/39
    var csrfExclude = ['/import/dsbudget'];
    if (_.contains(csrfExclude, req.path)) return next();
    csrf(req, res, next);
});


// make some common object available in views
app.use(function(req, res, next) {
    res.locals.user = req.user;
    res.locals.inspect = require('util').inspect;
    next();
});
app.use(function(req, res, next) {
    // Remember original destination before login.
    var path = req.path.split('/')[1];
    if (/auth|login|logout|signup|fonts|favicon/i.test(path)) {
        return next();
    }
    req.session.returnTo = req.path;
    next();
});
app.use(express.static(__dirname+'/public', { maxAge: week }));

app.get('/', homeController.index);
app.get('/about', homeController.about);

app.get('/docs', pageController.docs);
app.get('/list', pageController.getList);

app.get('/page/:id', pageController.getPage);
app.post('/page', pageController.postPage);
app.put('/page/:id', pageController.putPage);
app.delete('/page/:id', pageController.deletePage);

app.get('/page/balance/:id', pageController.getPageBalance);
app.get('/page/detail/:id', pageController.getPageDetail);

app.post('/expense/:cid', pageController.postExpense); 
app.put('/expense/:cid/:eid', pageController.putExpense); 
app.delete('/expense/:cid/:eid', pageController.deleteExpense);

app.post('/category', pageController.postCategory);
app.delete('/category/:id', pageController.deleteCategory);

app.post('/income', pageController.postIncome);
app.delete('/income/:id', pageController.deleteIncome);

app.get('/login', userController.getLogin);
app.post('/login', userController.postLogin);
app.get('/logout', userController.logout);
app.get('/forgot', userController.getForgot);
app.post('/forgot', userController.postForgot);
app.get('/reset/:token', userController.getReset);
app.post('/reset/:token', userController.postReset);
app.get('/signup', userController.getSignup);
app.post('/signup', userController.postSignup);

app.get('/account', passportConf.isAuthenticated, userController.getAccount);
app.post('/account/profile', passportConf.isAuthenticated, userController.postUpdateProfile);
app.post('/account/password', passportConf.isAuthenticated, userController.postUpdatePassword);
app.post('/account/delete', passportConf.isAuthenticated, userController.postDeleteAccount);
app.get('/account/unlink/:provider', passportConf.isAuthenticated, userController.getOauthUnlink);

//oauth
app.get('/auth/google', passport.authenticate('google', {scope: 'profile email'}));
app.get('/auth/google/return', passport.authenticate('google', { 
    successRedirect: '/', failureRedirect: '/auth/error' }));
app.get('/auth/twitter', passport.authenticate('twitter'));
app.get('/auth/twitter/callback', passport.authenticate('twitter', { 
    failureRedirect: '/auth/error' }), function(req, res) {
    res.redirect(req.session.returnTo || '/');
});

//APIs
app.get('/api/twitter', passportConf.isAuthenticated, passportConf.isAuthorized, apiController.getTwitter);
//app.post('/api/twitter', passportConf.isAuthenticated, passportConf.isAuthorized, apiController.postTwitter);

var multipartMiddleware = multipart();
app.post('/import/dsbudget', multipartMiddleware, importController.dsbudget);

/**
 * 500 Error Handler.
 */
app.use(errorHandler());

app.listen(app.get('port'), function() {
    console.log('Express server listening on port %d in %s mode', app.get('port'), app.get('env'));
});

module.exports = app;

/*
var io = require('socket.io').listen(server);
io.sockets.on('connection', function (socket) {
    console.log('connected');
    setInterval(function() {
        socket.emit('news', { time: new Date().getTime() });
    }, 1000);
    socket.on('my other event', function (data) {
        console.log(data);
    });
});
*/



