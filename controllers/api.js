var secrets = require('../config/secrets');
//var User = require('../models/User');
//var querystring = require('querystring');
//var validator = require('validator');
//var async = require('async');
//var cheerio = require('cheerio');
//var request = require('request');
//var graph = require('fbgraph');
//var LastFmNode = require('lastfm').LastFmNode;
//var tumblr = require('tumblr.js');
//var foursquare = require('node-foursquare')({ secrets: secrets.foursquare });
//var Github = require('github-api');
var Twit = require('twit');
//var stripe =  require('stripe')(secrets.stripe.apiKey);
//var twilio = require('twilio')(secrets.twilio.sid, secrets.twilio.token);
//var Linkedin = require('node-linkedin')(secrets.linkedin.clientID, secrets.linkedin.clientSecret, secrets.linkedin.callbackURL);
//var clockwork = require('clockwork')({key: secrets.clockwork.apiKey});
//var ig = require('instagram-node').instagram();
//var Y = require('yui/yql');
var _ = require('lodash');

exports.getApi = function(req, res) {
    res.render('api/index', {
        title: 'API Examples'
    });
};

exports.getTwitter = function(req, res, next) {
    var token = _.find(req.user.tokens, { kind: 'twitter' });
    var T = new Twit({
        consumer_key: secrets.twitter.consumerKey,
        consumer_secret: secrets.twitter.consumerSecret,
        access_token: token.accessToken,
        access_token_secret: token.tokenSecret
    });
    T.get('search/tweets', { q: 'nodejs since:2013-01-01', geocode: '40.71448,-74.00598,5mi', count: 10 }, function(err, reply) {
        if (err) return next(err);
        res.render('api/twitter', {
            title: 'Twitter API',
            tweets: reply.statuses
        });
    });
};


