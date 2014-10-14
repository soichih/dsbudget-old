var mongoose = require('mongoose');

//category contains all expenses under it..  but incomes aren't contained in a page.. so that page can be as ligth as possible

var expenseSchema = new mongoose.Schema({
    name: String,
    amount: String,
    where: String,
    time: { type: Date, default: Date.now },
    tentative: { type: Boolean, default: false }
});

var categorySchema = new mongoose.Schema({
    name: String,
    desc: String,
    color: String,
    page_id: mongoose.Schema.ObjectId, //page that this category belongs to

    expenses: [ expenseSchema ],

    recurring: { type: Boolean, default: false },

    budget: String,
    is_budget_per: { type: Boolean,default: false },

    sort_by: { type: String, default: "DATE" },
    sort_asc: { type: Boolean, default: true }
});

categorySchema.methods.getAuth = function(user, cb) {
    mongoose.model('Page').findById(this.page_id, function(err, page) {
        if(err) return cb(err);
        page.getAuth(user, cb);
    });
};

function invalidateExpense(next) {
    mongoose.model('Page').findById(this.page_id, function(err, page) {
        if(err) return next(err);
        page.invalidateExpense(next);
    });
}
categorySchema.pre('save', invalidateExpense);
categorySchema.pre('remove', invalidateExpense);

module.exports = mongoose.model('Category', categorySchema, 'category');
