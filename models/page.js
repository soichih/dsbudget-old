var mongoose = require('mongoose');
var async = require('async');
var decimal = require('decimal');

var Income = require('./income');
var Category = require('./category');

var pageSchema = new mongoose.Schema({
    name: String,
    doc_id: mongoose.Schema.ObjectId,
    start_date: Date,
    end_date: Date,

    //these are get/set by getBalance method.. don't access them unless you know what you are doing
    _total_income: { type: String, default: null },
    _total_expense: { type: String, default: null }
});

/* //use find({owners: id}) instead
docSchema.statics.findByOwnerID = function(id, cb) {
    this.find({owners: id}, cb);
};
*/

pageSchema.methods.getAuth = function(user, cb) {
    mongoose.model('Doc').findById(this.doc_id, function(err, doc) {
        if(err) return cb(err); //can't load doc
        doc.getAuth(user, cb);
    });
};

//income / expense models should call this whenever user updates them
pageSchema.methods.invalidateIncome = function(cb) {
    this.update({$set: {_total_income: null}}, {w:1}, cb);
};
pageSchema.methods.invalidateExpense = function(cb) {
    this.update({$set: {_total_expense: null}}, {w:1}, cb);
};

pageSchema.methods.getBalance = function(cb) {
    var page = this;
    async.parallel({
        total_income: function(next) {
            if(this._total_income) {
                next(null, decimal(this._total_income));
            } else {
                //compute total income and cache
                var total = decimal('0');
                Income.find({page_id: page.id}, function(err, incomes) {
                    async.forEach(incomes, function(income, next_income) {
                        if(income.balance_from) {
                            //recurse if it's balance income
                            page.findById(income.balance_from, function(err, balance_page) {
                                balance_page.getBalance(function(err, amount) {
                                    total = total.add(amount);
                                    next_income();
                                });
                            });
                        } else {
                            total = total.add(income.amount);
                            next_income();
                        }
                    }, function() {
                        //cache total
                        page._total_income = total.toString();
                        page.save(function(err) {
                            next(err, total);
                        });
                    });
                });
            }
        },
        total_expense: function(next) {
            if(page._total_expense) {
                next(null, decimal(page._total_expense));
            } else {
                var total = decimal('0');
                Category.find({page_id: page.id}, function(err, categories) {
                    categories.forEach(function(category) {
                        category.expenses.forEach(function(expense) {
                            if(!expense.tentative) {
                                total = total.add(expense.amount);
                            }
                        });
                    });
                    //cache total
                    page._total_expense = total.toString();
                    page.save(function(err) {
                        next(err, total);
                    });
                });
            }
        }
    }, function(err, ret){
        var balance = ret.total_income.sub(ret.total_expense);
        cb(err, balance.toString());
    });
};

module.exports = mongoose.model('Page', pageSchema, 'page');

