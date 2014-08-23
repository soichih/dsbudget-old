var mongoose = require('mongoose');

var pageSchema = new mongoose.Schema({
    name: String,
    doc_id: mongoose.Schema.ObjectId,
    start_date: Date,
    end_data: Date,

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
    cb(null, "123");
    /*
    this.findByID(id, function(err, page) {
        async.parallel({
            total_income: function(next) {
                if(page._total_income) {
                    next(null, decimal(page._total_income));
                } else {
                    //compute total income and cache
                    var total = decimal('0');
                    exports.Income.findByPageID(id, function(err, incomes) {
                        async.forEach(incomes, function(income, next_income) {
                            if(income.balance_from) {
                                //recurse if it's balance income
                                exports.Page.getBalance(income.balance_from, function(err, amount) {
                                    total = total.add(amount);
                                    next_income();
                                });
                            } else {
                                total = total.add(income.amount);
                                next_income();
                            }
                        }, function() {
                            //cache total
                            exports.Page.update(id, {$set: {_total_income: total.toString()}}, function() {
                                next(null, total);
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
                    exports.Category.findByPageID(id, function(err, categories) {
                        categories.forEach(function(category) {
                            category.expenses.forEach(function(expense) {
                                if(!expense.tentative) {
                                    total = total.add(expense.amount);
                                    //console.log("adding " + expense.amount);
                                    //console.log("total " + total);
                                }
                            });
                        });
                        //cache total
                        exports.Page.update(id, {$set: {_total_expense: total.toString()}}, function() {
                            next(null, total);
                        });
                    });
                }
            }
        }, function(err, ret){
            var balance = ret.total_income.sub(ret.total_expense);
            cb(err, balance.toString());
        });
    });
    */
};

module.exports = mongoose.model('Page', pageSchema, 'page');

