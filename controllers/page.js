var _ = require('lodash');
var async = require('async');
var crypto = require('crypto');
var nodemailer = require('nodemailer');
var passport = require('passport');
var Doc = require('../models/doc');
var Page = require('../models/page');
var Income = require('../models/income');
var Category = require('../models/category');
var secrets = require('../config/secrets');

function respond(res, err, data) {
    if(err) {
        res.statusCode = 500;
        res.write(err.toString());
        res.end();
    } else {
        res.statusCode = 200;
        //res.write(item._id.toString());
        if(data) {
            res.write(data);
        }
        res.end();
    }
}

exports.getList = function(req, res) {
    if(!req.user) return res.redirect('/');
    res.render("list.ejs", {menu: "page"});
};

exports.getPage = function(req, res) {
    var page_id = req.params.id;
    if(!req.user) return res.redirect('/');
    Page.findById(page_id, function(err, page) {
        if(err) {
            req.flash('error', {msg: 'sorry could not find such page'});
            return res.redirect('/');
        }
        page.getAuth(req.user, function(err, canread, canwrite) {     
            if(canread) {
                Income.find({page_id: page.id}, function(err, incomes) {
                    //for all balance incomes, lookup page name
                    async.eachSeries(incomes, function(income, next) {
                        if(income.balance_from) {    
                            Page.findById(income.balance_from, function(err, in_page) {
                                income.name = in_page.name;
                                next();
                            });
                        } else {
                            next();
                        }
                    }, function(err) {
                        //lastly.. find all categories
                        Category.find({page_id: page.id}, function(err, categories) {
                            res.render("page.ejs", {menu: "page", page: page, incomes: incomes, categories: categories});
                        });
                    });
                });
            }
        });
    });
};

function createpage(user, page, parent, cb) {
    Page.create(page, function(err, newpage) {
        if(err) return cb(err);
        var page_id = newpage.id;

        //if parent page is specified, copy income and recurring expenses..
        if(parent != null) {
            //make sure user really has read access to this parent
            Page.findById(parent.id, function(err, parent) {
                if(!err) {
                    parent.getAuth(user, function(err, canread, canwrite) {
                        if(canread) {
                            copyincomes(parent.id, page_id);
                            copycategories(parent.id, page_id, page.start_date);
                        }
                    });
                }
            });
        }
        cb(null, page_id);
    });
}

/*
function updatepage(id, page) {
    Page.update(id, {$set: page}, function(err, id) {
        if(err) {
            res.write('update failed');
        } else {
            res.statusCode = 200;
        }
        res.end();
    });
}
*/

function copyincomes(from_pageid, to_pageid) {
    Income.findByPageID(from_pageid, function(err, incomes) {
        incomes.forEach(function(income) {
            //don't copy balance income
            if(!income.balance_from) {
                income.page_id = to_pageid;
                delete income._id; //necessary?
                Income.create(income);
            }
        });
    });
}

function copycategories(from_pageid, to_pageid, start_time) {
    Category.findOne({page_id: from_pageid}, function(err, categories) {
        categories.forEach(function(category) {
            category.page_id = to_pageid;
            delete category._id; //necessary?
            if(category.recurring) {
                //reset expense date to the same month as start_time by keeping the date itself
                var start_date = new Date(start_time);
                category.expenses.forEach(function(expense) {
                    var d = new Date(expense.time);
                    d.setFullYear(start_date.getFullYear());
                    d.setMonth(start_date.getMonth()); 
                    expense.time = d.getTime();
                });
            } else {
                //reset all expenses
                category.expenses = [];
                category._remaining = category.budget; 
            }
            Category.create(category);
        });
    });
}

exports.postPage = function(req, res) {
    var page = req.body.page;
    var parent = req.body.parent;
    if(req.user && page) {
        //adding new page.. first make sure user has access to the doc
        Doc.findById(page.doc_id, function(err, doc) {
            doc.getAuth(req.user, function(err, canread, canwrite) {
                if(canwrite) {
                    createpage(req.user, page, parent, function(err, page_id) {
                        respond(res, err, page_id.toString());
                    });
                }
            });
        });
    }
};
exports.putPage = function(req, res) {
    var page_id = req.params.id;
    var new_page = req.body.page;
    if(req.user) {
        //updating existing page
        Page.findById(page_id, function(err, page) {
            page.getAuth(req.user, function(err, canread, canwrite) {
                if(canwrite) {
                    new_page.doc_id = page.doc_id; //don't allow user to change doc_id
                    Page.findByIdAndUpdate(page._id, {$set: new_page}, function(err) {
                        respond(res, err);
                    });
                }
            });
        });
    }
};

exports.getPageBalance = function(req, res) {
    var page_id = req.params.id;
    if(req.user) {
        Page.findById(page_id, function(err, page) {
            page.getAuth(req.user, function(err, canread, canwrite) {
                if(canread) {
                    page.getBalance(function(err, balance) {
                        respond(res, err, balance);
                    });
                }
            });
        });
    }
};

exports.docs = function(req, res) {
    var now = new Date().getTime();
    if(req.user) {
        Doc.find({owners: req.user._id}, function(err, docs) {
            var _docs = [];
            //load pages for each doc
            async.forEach(docs, function(doc, next) {
                Page.find({doc_id: doc.id}, function(err, pages) {
                    if(err) { return console.debug("failed to load pages for doc_id:"+doc.id); }
                    var _doc = doc.toObject();
                    _doc.pages = pages;
                    _docs.push(_doc);
                    next();
                });
            }, function() {
                res.json(_docs);
                res.end();
            });
        });
    }
};

exports.getPageDetail = function(req, res) {
    if(req.user) {
        //load page requested
        Page.findById(req.query.id, function(err, page) {
            if(err) {
                res.statusCode = 404;
                res.end();
                return;
            }
            Doc.getAuth(req.user, page.doc_id, function(err, auth) {
                if(auth.canread) {
                    Income.findByPageID(page._id, function(err, incomes) {
                        Category.findByPageID(page._id, function(err, categories) {
                            page.incomes = incomes;
                            page.categories = categories;
                            res.json(page);
                        });
                    });
                }
            });
        });
    }
};

//add new expense
exports.postExpense = function(req, res) {
    var catid = req.params.cid;
    var new_expense = req.body.expense;
    if(req.user) {
        Category.findById(catid, function(err, cat) {
            cat.getAuth(req.user, function(err, canread, canwrite) {
                if(canwrite) {
                    cat.expenses.push(new_expense);
                    Category.findByIdAndUpdate(catid, {$set: {expenses: cat.expenses}}, function(err, affected) {
                        var new_e = cat.expenses[cat.expenses.length-1];
                        respond(res, err, new_e._id.toString()); //TODO - won't this throw if err is set?
                    });
                }
            });
        });
    }
};

//update expense
exports.putExpense = function(req, res) {
    var catid = req.params.cid;
    var eid = req.params.eid;
    var new_expense = req.body.expense;
    if(req.user) {
        Category.findById(catid, function(err, cat) {
            cat.getAuth(req.user, function(err, canread, canwrite) {
                if(canwrite) {
                    cat.expenses[eid] = new_expense;
                    Category.findByIdAndUpdate(catid, {$set: {expenses: cat.expenses}}, function(err, affected) {
                        respond(res, err);
                    });
                }
            });
        });
    }
};

exports.deleteExpense = function(req, res) {
    var category_id = req.params.cid;
    var eid = req.params.eid;
    if(req.user) {
        //find category for this expense
        Category.findById(category_id, function(err, cat) {
            //make sure user has write access
            cat.getAuth(req.user, function(err, canread, canwrite) {
                if(canwrite) {
                    cat.expenses.splice(eid, 1);
                    cat.save(function(err, id) {
                        respond(res, err);
                    });
                }
            });
        });
    }
};

exports.postIncome = function(req, res) {
    var new_income = req.body.income;
    if(req.user) {
        //make sure user has access to specified page
        Page.findById(new_income.page_id, function(err, page) {
            page.getAuth(req.user, function(err, canread, canwrite) {
                if(canwrite) {
                    //validate balance_from
                    if(new_income.balance_from) {
                        new_income.name = null; //we don't care about name if it's balance income
                        //make sure the balance page belongs to the same doc that this income belongs
                        //TODO - in the future, I might allow cross-document linking..
                        Page.findById(new_income.balance_from, function(err, balance_page) {
                            if(balance_page.doc_id.equals(page.doc_id)) {
                                upsert();
                            } else {
                                res.statusCode = 400;
                                res.write("can't use page from other doc.. for security reason");
                                res.end();
                            }
                        });
                    } else {
                        upsert();
                    }
                }
            });
        });

        function upsert() {
            if(new_income._id) {
                Income.findByIdAndUpdate(new_income._id, {$set: new_income}, function(err, affected) {
                    respond(res, err);
                });
            } else {
                Income.create(new_income, function(err, item) {
                    respond(res, err, item._id.toString()); //TODO - won't this throw if err is set?
                });
            }
        }
    }
};

exports.postCategory = function(req, res) {
    if(req.user) {
        var new_category = req.body.category;
        Page.findById(new_category.page_id, function(err, page) {
            page.getAuth(req.user, function(err, canread, canwrite) {
                if(canwrite) {
                    if(new_category._id) {
                        Category.findByIdAndUpdate(new_category._id, {$set: new_category}, function(err, affected) {
                            respond(res, err);
                        });
                    } else {
                        Category.create(new_category, function(err, item){
                            respond(res, err, item._id.toString());
                        });
                    }
                }
            });
        });

        /*
        if(new_category.id) {
            //updating.. 
            Category.findById(new_category.id, function(err, cat) {
                cat.getAuth(req.user, function(err, canread, canwrite) {
                    if(canwrite) {
                        //ok proceed...
                        Category.update({id: cat.page_id}, cat._id, {$set: new_category}, 
                        function(err, id) {
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
        } else {
            //insert
            Page.findById(new_category.page_id, function(err, page) {
                page.getAuth(req.user, function(err, canread, canwrite) {
                    if(canwrite) {
                        //ok proceed...
                        Category.create(new_category, function(err, id) {
                            if(err) {
                                console.error(err);
                                res.statusCode = 500;
                                res.write('insert failed');
                            } else {
                                res.statusCode = 200;
                                console.log("created category with id:"+id);
                                res.write(id.toString());
                            }
                            res.end();
                        });
                    }
                });
            });
        }
        */
    }
};

exports.deleteCategory = function(req, res) {
    if(req.user) {
        Category.findById(req.params.id, function(err, category) {
            //make sure user has write access
            category.getAuth(req.user, function(err, canread, canwrite) {
                if(canwrite) {
                    //go ahead with removal
                    category.remove(function(err) {
                        respond(res, err);
                    });
                }
            });
        });
    }
};

exports.deleteIncome = function(req, res) {
    var income_id = req.params.id;
    if(req.user) {
        Income.findById(income_id, function(err, income) {
            income.getAuth(req.user, function(err, canread, canwrite) {
                if(canwrite) {
                    income.remove(function(err) {
                        respond(res, err);
                    });
                }
            });
        });
    }
};

exports.deletePage = function(req, res) {
    if(req.user) {
        Page.findById(req.params.id, function(err, page) {
            page.getAuth(req.user, function(err, canread, canwrite) {
                if(canwrite) {
                    page.remove(function(err) {
                        //TODO - should remove income / categories for this page also
                        respond(res, err);
                    });
                }
            });
        });
    }
};

