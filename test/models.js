var mongoose = require('mongoose');
var chai = require('chai');
var should = chai.should();
var ObjectID = mongoose.Types.ObjectId;

var User = require('../models/user');
var Doc = require('../models/doc');
var Page = require('../models/page');
var Income = require('../models/income');
var Category = require('../models/category');

//test objects
var testuser = new User({
    email: 'soichi@example.com',
    password: 'hogehoge',
    profile: {
        name: 'soichi foo', 
    }
});
var someone = new User();
var testdoc = new Doc({name: 'test doc', owners: [testuser._id]});
var testpage = new Page({name: 'test page', doc_id: testdoc._id, _total_expense: '123', _total_income: '456'});
var testincome = new Income({name: 'test income', page_id: testpage._id, amount: '123'});
var testcategory = new Category({name: 'test category', page_id: testpage._id, budget: '123', expenses: [
    { name: "test expense 1", amount: "123"},
    { name: "test expense 2", amount: "456"},
]});

describe('Before', function() {
    it('should create a new user ', function(done) {
        testuser.save(function(err) {
            if(err) return done(err);
            done();
        });
    });
    it('should create a new doc', function(done) {
        testdoc.save(function(err) {
            if(err) return done(err);
            done();
        });
    });
    it('should create a new page', function(done) {
        testpage.save(function(err) {
            if(err) return done(err);
            done();
        });
    });
    it('should create a new income', function(done) {
        testincome.save(function(err) {
            if(err) return done(err);
            done();
        });
    });
    it('should create a new category', function(done) {
        testcategory.save(function(err) {
            if(err) return done(err);
            done();
        });
    });
});

describe('User model', function() {
    it('should fail to create a new user with same email', function(done) {
        var user = new User({
            email: 'soichi@example.com',
            password: 'hogehoge2',
            profile: {
                name: 'soichi foo', 
            }
        });
        user.save(function(err) {
            if(err) done();
            else done('should have failed');
        });
    });
    it('should find user by email', function(done) {
        User.findOne({email: 'soichi@example.com'}, function(err, user) {
            if(err) return done(err);
            done();
        });
    });

    it('should match good password', function(done) {
        testuser.comparePassword("hogehoge", function(err, match) {
            if(err) return done(err);
            match.should.equal(true);
            done();
        });
    });

    it('should not match bad password', function(done) {
        testuser.comparePassword("hogehoge!", function(err, match) {
            if(err) return done(err);
            match.should.equal(false);
            done();
        });
    });

});

describe('Doc Model', function() {
    it('should find doc by owner id', function(done) {
        Doc.find({owners: testuser._id}, function(err, docs) {
            if(err) return done(err);
            docs.length.should.equal(1);
            docs[0].name.should.equal('test doc');
            done();
        });
    });

    //access tests
    it('should testuser has full access', function(done) {
        testdoc.getAuth(testuser, function(err, read, write) {
            if(err) return done(err);
            read.should.equal(true);
            write.should.equal(true);
            done();
        });
    });
    it('should someone else has no access', function(done) {
        testdoc.getAuth(someone, function(err, read, write) {
            if(err) return done(err);
            read.should.equal(false);
            write.should.equal(false);
            done();
        });
    });
    it('should guest else has no access', function(done) {
        testdoc.getAuth(null, function(err, read, write) {
            if(err) return done(err);
            read.should.equal(false);
            write.should.equal(false);
            done();
        });
    });
});

describe('Page Model', function() {
    it('should find page by doc_id', function(done) {
        Page.find({doc_id: testdoc._id}, function(err, pages) {
            if(err) return done(err);
            pages.length.should.equal(1);
            pages[0].name.should.equal('test page');
            done();
        });
    });

    it('should set balance', function(done) {
        testpage.getBalance(function(err, balance) {
            //TODO - test balance..
            done();
        });
    });

    it('invalidate _total_income', function(done) {
        testpage.invalidateIncome(function(err) {
            if(err) return done(err);
            Page.findById(testpage._id, function(err, page) {
                should.not.exist(page._total_income);
                done();
            });
        });
    });
    it('invalidate _total_expense', function(done) {
        testpage.invalidateExpense(function(err) {
            if(err) return done(err);
            Page.findById(testpage._id, function(err, page) {
                should.not.exist(page._total_expense);
                done();
            });
        });
    });

    //access tests
    it('should testuser has full access', function(done) {
        testpage.getAuth(testuser, function(err, read, write) {
            if(err) return done(err);
            read.should.equal(true);
            write.should.equal(true);
            done();
        });
    });
    it('should someone else has no access', function(done) {
        testpage.getAuth(someone, function(err, read, write) {
            if(err) return done(err);
            read.should.equal(false);
            write.should.equal(false);
            done();
        });
    });
    it('should guest else has no access', function(done) {
        testpage.getAuth(null, function(err, read, write) {
            if(err) return done(err);
            read.should.equal(false);
            write.should.equal(false);
            done();
        });
    });
});

describe('Income Model', function() {
    it('should find income by page_id', function(done) {
        Income.find({page_id: testpage._id}, function(err, incomes) {
            if(err) return done(err);
            incomes.length.should.equal(1);
            incomes[0].name.should.equal('test income');
            done();
        });
    });

    it('should invalidate page income when ncome is updated', function(done) {
        testincome.amount = "444";
        testincome.save(function(err) {
            if(err) return done(err);
            Page.findById(testpage._id, function(err, page) {
                should.not.exist(page._total_income);
                done();
            });
        });
    });

    //access tests
    it('should testuser has full access', function(done) {
        testincome.getAuth(testuser, function(err, read, write) {
            if(err) return done(err);
            read.should.equal(true);
            write.should.equal(true);
            done();
        });
    });
    it('should someone else has no access', function(done) {
        testincome.getAuth(someone, function(err, read, write) {
            if(err) return done(err);
            read.should.equal(false);
            write.should.equal(false);
            done();
        });
    });
    it('should guest else has no access', function(done) {
        testincome.getAuth(null, function(err, read, write) {
            if(err) return done(err);
            read.should.equal(false);
            write.should.equal(false);
            done();
        });
    });
});

describe('Category Model', function() {
    it('should find category by page_id', function(done) {
        Category.find({page_id: testpage._id}, function(err, categories) {
            if(err) return done(err);
            categories.length.should.equal(1);
            categories[0].name.should.equal('test category');
            done();
        });
    });

    it('should invalidate page expense when category is updated', function(done) {
        testcategory.budget= "444";
        testcategory.save(function(err) {
            if(err) return done(err);
            Page.findById(testpage._id, function(err, page) {
                should.not.exist(page._total_expense);
                done();
            });
        });
    });

    //access tests
    it('should testuser has full access', function(done) {
        testcategory.getAuth(testuser, function(err, read, write) {
            if(err) return done(err);
            read.should.equal(true);
            write.should.equal(true);
            done();
        });
    });
    it('should someone else has no access', function(done) {
        testcategory.getAuth(someone, function(err, read, write) {
            if(err) return done(err);
            read.should.equal(false);
            write.should.equal(false);
            done();
        });
    });
    it('should guest else has no access', function(done) {
        testcategory.getAuth(null, function(err, read, write) {
            if(err) return done(err);
            read.should.equal(false);
            write.should.equal(false);
            done();
        });
    });
});

describe('After', function() {
    it('should remove test category', function(done) {
        testcategory.remove(function(err) {
            if(err) return done(err);
            done();
        });
    });
    it('should remove test income', function(done) {
        testincome.remove(function(err) {
            if(err) return done(err);
            done();
        });
    });
    it('should remove a page', function(done) {
        testpage.remove(function(err) {
            if(err) return done(err);
            done();
        });
    });
    it('should delete doc by id', function(done) {
        Doc.remove({_id: testdoc.id}, function(err, num) {
            if(err) return done(err);
            num.should.equal(1);
            done();
        });
    });
    it('should delete user by id', function(done) {
        User.remove({_id: testuser.id}, function(err, num) {
            if(err) return done(err);
            num.should.equal(1);
            done();
        });
    });
});



