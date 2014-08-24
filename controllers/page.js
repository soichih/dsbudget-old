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

exports.getList = function(req, res) {
    if(!req.user) return res.redirect('/');
    res.render("list.ejs", {menu: "page"});
};

exports.getPage = function(req, res) {
    if(!req.user) return res.redirect('/');
    Page.findById(req.params.id, function(err, page) {
        if(err) {
            req.flash('error', {msg: 'sorry could not find such page'});
            return res.redirect('/');
        }
        page.getAuth(req.user, function(err, canread, canwrite) {     
            if(canread) {
                res.render("page.ejs", {menu: "page", page: page});
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
                    parent.getAuth(user, function(err, canreadp, canwritep) {
                        if(canreadp) {
                            copyincomes(parent.id, page_id);
                            copycategories(parent.id, page_id, page.start_date);
                            //TODO - add balance income using parent?
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
            //console.error(err);
            res.statusCode = 500;
            res.write('update failed');
        } else {
            res.statusCode = 200;
            res.write(id.toString());
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
    if(req.user && req.body.page) {
        var page = req.body.page;
        if(page.id != undefined) {
            //updating existing page
            Page.findById(page.id, function(err, page) {
                var docid = page.doc_id;
                page.getAuth(req.user, function(err, canread, canwrite) {
                    if(canwrite) {
                        updatepage(page_id, page);
                    }
                });
            });
        } else {
            //adding new page.. first make sure user has access to the doc
            Doc.findById(page.doc_id, function(err, doc) {
                doc.getAuth(req.user, function(err, canread, canwrite) {
                    if(canwrite) {
                        createpage(req.user, page, req.body.parent, function(err, page_id) {
                            if(err) {
                                res.statusCode = 500;
                            } else {
                                res.statusCode = 200;
                                res.write(page_id.toString());
                            }
                            res.end();
                        });
                    }
                });
            });
        }
    }
};

exports.pageBalance = function(req, res) {
    if(req.user) {
        Page.getBalance(new mongo.ObjectID(req.params.id), function(err, balance) {
            if(err) {
                res.statusCode = 500;
                res.write(err);
            } else {
                //all good
                res.statusCode = 200;
                res.write(balance);
            }
            res.end();
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

exports.pageDetail = function(req, res) {
    if(req.user) {
        //load page requested
        Page.findById(req.query.id, function(err, page) {
            if(err) {
                console.error(err);
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

exports.postExpense = function(req, res) {
    if(req.user) {
        Category.findById(req.body.catid, function(err, cat) {
            Page.findById(cat.page_id, function(err, page) {
                var docid = page.doc_id;
                Doc.getAuth(req.user, docid, function(err, auth) {
                    if(auth.canwrite) {
                        var expense = req.body.expense;
                        var clean_expense = {
                            time: parseInt(expense.time),
                            amount: parseFloat(expense.amount),
                            where: expense.where, //make sure it's string?
                            name: expense.name, //make sure it's string?
                            tentative: expense.tentative //make sure it's bool?
                        }
                        if(req.body.eid != undefined) {
                            cat.expenses[req.body.eid] = clean_expense;
                        } else {
                            cat.expenses.push(clean_expense);
                        }
                        Category.update(cat.page_id, cat._id, {$set: {expenses: cat.expenses}}, function(err, id) {
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
};

exports.deleteExpense = function(req, res) {
    if(req.user) {
        var category_id = req.params.cid;
        var eid = req.params.eid;
        Category.findById(category_id, function(err, cat) {
            //make sure user has write access
            Page.findById(cat.page_id, function(err, page) {
                var docid = page.doc_id;
                Doc.getAuth(req.user, docid, function(err, auth) {
                    if(auth.canwrite) {
                        cat.expenses.splice(eid, 1);
                        Category.update(cat.page_id, cat._id, {$set: {expenses: cat.expenses}}, function(err, id) {
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
};

function upsertIncome(id, income) {
    if(id) {
        var iid = new mongo.ObjectID(id);
        Income.update(iid, {$set: income}, function(err) {
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
        Income.create(income, function(err, newid) {
            if(err) {
                console.error(err);
                res.statusCode = 500;
                res.write('insert failed');
            } else {
                res.statusCode = 200;
                res.write(newid.toString());
            }
            res.end();
        });
    }
}

exports.postIncome = function(req, res) {
    if(req.user) {
        var income = req.body.income;
        Page.findById(income.page_id, function(err, page) {
            Doc.getAuth(req.user, page.doc_id, function(err, auth) {
                if(auth.canwrite) {
                    var clean_income = {
                        page_id: income.page_id,
                        name: income.name //TODO..make sure it's string?
                    }
                    if(income.balance_from) {
                        //convert to mongo id
                        clean_income.balance_from = new mongo.ObjectID(income.balance_from);
                        //make sure the page belongs to the same doc
                        Page.findById(clean_income.balance_from, function(err, balance_page) {
                            if(balance_page.doc_id.equals(page.doc_id)) {
                                upsertIncome(income._id, clean_income);
                            } else {
                                console.dir("can't use page from other doc.. for security reason");
                                console.dir(page);
                                console.dir(balance_page);
                            }
                        });
                    } else {
                        clean_income.amount = parseFloat(income.amount);
                        upsertIncome(income._id, clean_income);
                    }
                 }
            });
        });
    }
};

exports.postCategory = function(req, res) {
    if(req.user) {
        var dirty_category = req.body.category;
        var category = dirty_category; //TODO - not sure how to validate data structure
        if(category.id) {
            //update
            Category.findById(category.id, function(err, cat) {
                //make sure user can edit this category
                Page.findById(cat.page_id, function(err, page) {
                    var docid = page.doc_id;
                    Doc.getAuth(req.user, docid, function(err, auth) {
                        if(auth.canwrite) {
                            //ok proceed...
                            delete category._id; //can't update _id
                            category.page_id = cat.page_id; //replace string to ObjectID
                            Category.update(cat.page_id, cat._id, {$set: category}, 
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
            });
        } else {
            //insert
            Page.findById(category.page_id, function(err, page) {
                var docid = page.doc_id;
                Doc.getAuth(req.user, docid, function(err, auth) {
                    if(auth.canwrite) {
                        //ok proceed...
                        category.page_id = category.page_id; //replace string to ObjectID (necessary?)
                        console.dir(category);
                        Category.create(category, function(err, id) {
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
    }
};

exports.deleteCategory = function(req, res) {
    if(req.user) {
        Category.findById(req.params.id, function(err, category) {
            //make sure user has write access
            var page_id = category.page_id;
            Page.findById(page_id, function(err, page) {
                var docid = page.doc_id;
                Doc.getAuth(req.user, docid, function(err, auth) {
                    if(auth.canwrite) {
                        //go ahead with removal
                        Category.remove(page_id, category._id, function(err) {
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
};

exports.deleteIncome = function(req, res) {
    if(req.user) {
        var income_id = req.params.id;
        //console.dir(income_id);
        Income.findById(income_id, function(err, income) {
            //make sure user has write access
            var page_id = income.page_id;
            Page.findById(page_id, function(err, page) {
                var docid = page.doc_id;
                Doc.getAuth(req.user, docid, function(err, auth) {
                    if(auth.canwrite) {
                        //go ahead with removal
                        Income.remove(page_id, income._id, function(err) {
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
};

exports.deletePage = function(req, res) {
    if(req.user) {
        Page.findById(req.params.id, function(err, page) {
            var docid = page.doc_id;
            Doc.getAuth(req.user, docid, function(err, auth) {
                if(auth.canwrite) {
                    Page.remove(page.id, function(err) {
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
    }
};




