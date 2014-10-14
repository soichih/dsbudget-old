
var mongoose = require('mongoose');

var incomeSchema = new mongoose.Schema({
    name: String,
    page_id: mongoose.Schema.ObjectId, //page that this income belongs to

    balance_from: mongoose.Schema.ObjectId, //if set, this is balance income - so the amount should be undefined
    amount: String
});

incomeSchema.methods.getAuth = function(user, cb) {
    mongoose.model('Page').findById(this.page_id, function(err, page) {
        if(err) return cb(err);
        page.getAuth(user, cb);
    });
};

//need to invalidate _total_income when user makes changes
function invalidateIncome(next) {
    mongoose.model('Page').findById(this.page_id, function(err, page) {
        if(err) return next(err);
        page.invalidateIncome(next);
    });
}
incomeSchema.pre('save', invalidateIncome);
incomeSchema.pre('remove', invalidateIncome);

module.exports = mongoose.model('Income', incomeSchema, 'income');
