#!/bin/env node

var sass = require('node-sass');

var express = require('express');
var cookieParser = require('cookie-parser');
var compress = require('compression');
var session = require('express-session');
var bodyParser = require('body-parser');
var logger = require('morgan');
var errorHandler = require('errorhandler');
var csrf = require('lusca').csrf();
var methodOverride = require('method-override');
var multipart = require('connect-multiparty');

var _ = require('lodash');
var MongoStore = require('connect-mongo')({ session: session });
var flash = require('express-flash');
var path = require('path');
var mongoose = require('mongoose');
var passport = require('passport');
var expressValidator = require('express-validator');
var connectAssets = require('connect-assets');

var homeController = require('./controllers/home');
var pageController = require('./controllers/page');
var userController = require('./controllers/user');
var importController = require('./controllers/import');
//var apiController = require('./controllers/api');
//var contactController = require('./controllers/contact');

/*
//default
var config = {
port: 8080, //port to listen to
host: os.hostname(), //host to listen to
};

//ports
if(process.env.OPENSHIFT_NODEJS_PORT) config.port = process.env.OPENSHIFT_NODEJS_PORT;
if(process.env.PORT) config.port = process.env.PORT;

//host
if(process.env.OPENSHIFT_NODEJS_IP) config.host = process.env.OPENSHIFT_NODEJS_IP;

if(process.env.OPENSHIFT_APP_DNS) config.socket_url = process.env.OPENSHIFT_APP_DNS+":8443";
    config.mongo_url = process.env.OPENSHIFT_MONGODB_DB_URL + process.env.OPENSHIFT_APP_NAME;
    config.app_url = "https://"+config.host+":"+config.port;
    config.cookie_secret = "hardcoded for now";
} else if(process.env.HEROKU) {
    console.log("seems to be running on heroku");

    config.port = process.env.PORT;
    config.mongo_url = process.env.MONGOLAB_URI;
    config.app_url = 'https://dsbudget.herokuapp.com'; 
    config.socket_url = 'dsbudget.herokuapp.com:443';
    config.cookie_secret = process.env.COOKIE_SECRET;
} else {
    //assume local instance
    config = require('./config.json');
}

//override config with env parameters
config.port = process.env.PORT;
*/

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
app.set('view engine', 'ejs');

app.use(compress());
app.use(connectAssets({
  paths: [path.join(__dirname, 'public/css'), path.join(__dirname, 'public/js')],
  helperContext: app.locals
}));
app.use(sass.middleware({
    src: __dirname+'/public', //look for /public/*.scss
    dest: __dirname+'/public', //and put compiled in /public/*.css
    debug: true 
}));
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
    next();
});
/*
app.use(function(req, res, next) {
  // Remember original destination before login.
  var path = req.path.split('/')[1];
  if (/auth|login|logout|signup|fonts|favicon/i.test(path)) {
    return next();
  }
  req.session.returnTo = req.path;
  next();
});
*/
app.use(express.static(__dirname+'/public', { maxAge: week }));

//app.use(express.favicon());

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
function hashpassword(pass, salt, callback) {
    crypto.pbkdf2(pass, salt, 10000, 512, function(err, hash) {
        if(err) {
            callback(err);
        } else {
            callback(null, hash.toString());
        }
    });
}
*/

//most of initialization happens after we connect to db.
//mongo.MongoClient.connect(config.mongo_url, function(err, db) {
//    if(err) throw err;
//});

app.get('/', homeController.index);
app.get('/about', homeController.about);

app.get('/docs', pageController.docs);
app.get('/list', pageController.getList);

app.get('/page/:id', pageController.getPage);
app.post('/page', pageController.postPage);
app.get('/page/balance/:id', pageController.pageBalance);
app.get('/page/detail', pageController.pageDetail);
app.post('/expense', pageController.postExpense); 
app.delete('/expense/:cid/:eid', pageController.deleteExpense);
app.post('/income', pageController.postIncome);
app.post('/category', pageController.postCategory);
app.delete('/category/:id', pageController.deleteCategory);
app.delete('/income/:id', pageController.deleteIncome);
app.delete('/page/:id', pageController.deletePage);

app.get('/signup', userController.getSignup);
app.post('/signup', userController.postSignup);

app.get('/login', userController.getLogin);
app.post('/login', userController.postLogin);
app.get('/logout', userController.logout);

app.get('/setpass', userController.getSetpass);
app.post('/setpass', userController.postSetpass);
app.get('/setting', userController.getSetting);
app.post('/setting', userController.postSetting);

app.get('/auth/error', userController.autherror);
app.get('/auth/google', passport.authenticate('google', {scope: 'profile email'}));
app.get('/auth/google/return', passport.authenticate('google', { successRedirect: '/', failureRedirect: '/auth/error' }));

var multipartMiddleware = multipart();
app.post('/import/dsbudget', multipartMiddleware, importController.dsbudget);

/**
 * 500 Error Handler.
 */
app.use(express.errorHandler());

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



