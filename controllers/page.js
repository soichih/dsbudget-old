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

exports.getPage = function(req, res) {
    if(req.user) {
        res.render("page.ejs", {req: req, menu: "page"});
    } else {
        res.redirect('/'); 
    }
};

function createpage(newpage, next) {
    Page.create(newpage, function(err, id) {
        if(err) {
            res.statusCode = 500;
            res.write("Failed to create page");
        } else {
            next(id); 
            res.statusCode = 200;
            res.write(id.toString());
        }
        res.end();
    });
}
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
    Category.findByPageID(from_pageid, function(err, categories) {
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
        var dirty_page = req.body.page;
        var clean_page = {
            //TODO - I am not sure who is really responsible for validating field types.. model?
            doc_id: new mongo.ObjectID(dirty_page.doc_id),
            name: dirty_page.name.toString(),
            desc: (dirty_page.desc ? dirty_page.desc.toString() : ""),
            start_date: parseInt(dirty_page.start_date),
            end_date: parseInt(dirty_page.end_date)
        };

        if(dirty_page._id) {
            //updating existing page
            var page_id = new mongo.ObjectID(dirty_page._id);
            Page.findByID(page_id, function(err, page) {
                var docid = page.doc_id;
                Doc.getAuth(req.user, docid, function(err, auth) {
                    if(auth.canwrite) {
                        updatepage(page_id, clean_page);
                    }
                });
            });
        } else {
            //adding new page
            Doc.getAuth(req.user, dirty_page.doc_id, function(err, auth) {
                if(auth.canwrite) {
                    createpage(clean_page, function(page_id) {
                        //TODO - if parent page is specified, copy income and recurring expenses..
                        if(req.body.parent != null) {
                            var parentid = new mongo.ObjectID(req.body.parent._id);
                            //make sure user really has read access to this parent
                            Page.findByID(parentid, function(err, parent) {
                                if(!err) {
                                    Doc.getAuth(req.user, parent.doc_id, function(err, auth) {
                                        if(auth.canread) {
                                            copyincomes(parentid, page_id);
                                            copycategories(parentid, page_id, clean_page.start_date);
                                            //TODO - add balance income using parent?
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
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
        //load all docs
        Doc.find({owners: req.user._id}, function(err, docs) {
            //load pages for each doc
            async.forEach(docs, function(doc, next) {
                Page.find({doc_id: doc._id}, function(err, pages) {
                    //add some optional parameters to each page
                    async.forEach(pages, function(page, next_page) {
                        next_page();
                    }, function() {
                        doc.pages = pages;
                        next();
                    });
                });
            }, function() {
                res.json(docs);
            });
        });
    }
};

exports.pageDetail = function(req, res) {
    if(req.user) {
        //load page requested
        Page.findByID(new mongo.ObjectID(req.query.id), function(err, page) {
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
        var catid = new mongo.ObjectID(req.body.catid);
        Category.findByID(catid, function(err, cat) {
            var page_id = cat.page_id;
            Page.findByID(page_id, function(err, page) {
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
                        Category.update(page_id, cat._id, {$set: {expenses: cat.expenses}}, function(err, id) {
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
        Category.findByID(new mongo.ObjectID(category_id), function(err, cat) {
            //make sure user has write access
            var page_id = cat.page_id;
            Page.findByID(page_id, function(err, page) {
                var docid = page.doc_id;
                Doc.getAuth(req.user, docid, function(err, auth) {
                    if(auth.canwrite) {
                        cat.expenses.splice(eid, 1);
                        Category.update(page_id, cat._id, {$set: {expenses: cat.expenses}}, function(err, id) {
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
        var page_id = new mongo.ObjectID(income.page_id);
        Page.findByID(page_id, function(err, page) {
            Doc.getAuth(req.user, page.doc_id, function(err, auth) {
                if(auth.canwrite) {
                    var clean_income = {
                        page_id: page_id,
                        name: income.name //TODO..make sure it's string?
                    }
                    if(income.balance_from) {
                        //convert to mongo id
                        clean_income.balance_from = new mongo.ObjectID(income.balance_from);
                        //make sure the page belongs to the same doc
                        Page.findByID(clean_income.balance_from, function(err, balance_page) {
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

        if(category._id) {
            //update
            var category_id = new mongo.ObjectID(category._id);
            Category.findByID(category_id, function(err, cat) {
                //make sure user can edit this category
                Page.findByID(cat.page_id, function(err, page) {
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
            var page_id = new mongo.ObjectID(category.page_id);
            Page.findByID(page_id, function(err, page) {
                var docid = page.doc_id;
                Doc.getAuth(req.user, docid, function(err, auth) {
                    if(auth.canwrite) {
                        //ok proceed...
                        category.page_id = page_id; //replace string to ObjectID (necessary?)
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
        var category_id = new mongo.ObjectID(req.params.id);
        console.log("removing category :"+category_id);
        Category.findByID(category_id, function(err, category) {
            //make sure user has write access
            var page_id = category.page_id;
            Page.findByID(page_id, function(err, page) {
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
        Income.findByID(new mongo.ObjectID(income_id), function(err, income) {
            //make sure user has write access
            var page_id = income.page_id;
            Page.findByID(page_id, function(err, page) {
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
        var page_id = new mongo.ObjectID(req.params.id);
        Page.findByID(page_id, function(err, page) {
            var docid = page.doc_id;
            Doc.getAuth(req.user, docid, function(err, auth) {
                if(auth.canwrite) {
                    Page.remove(page_id, function(err) {
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




