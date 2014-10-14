var mongoose = require('mongoose');
//var decimal = require('decimal');
//var extend = require('extend');

var docSchema = new mongoose.Schema({
    name: String,
    owners: [mongoose.Schema.ObjectId]
});

/* //use find({owners: id}) instead
docSchema.statics.findByOwnerID = function(id, cb) {
    this.find({owners: id}, cb);
};
*/

docSchema.methods.getAuth = function(user, cb) {
    //guest can't access any doc (TODO - should I create guest only doc for demo purpose?)
    if(user === null) return cb(null, false, false);

    //for now, if user can write, then can read too
    var read = (this.owners.indexOf(user.id) !== -1)
    var write = read;
    cb(null, read, write);
};

module.exports = mongoose.model('Doc', docSchema, 'doc');

