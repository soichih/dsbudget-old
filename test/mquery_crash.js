var mongoose = require('mongoose');

var parentSchema = new mongoose.Schema({
    children: [ new mongoose.Schema({
        name: String,
    })]
});

var Parent = mongoose.model('Parent', parentSchema);

describe('crash', function() {
    it('should crash', function(done) {
        var parent = new Parent();
        parent.children.push({name: 'child name'});
        parent.save(function(err, it) {
            parent.children.push({name: 'another child'});
            Parent.findByIdAndUpdate(it._id, {$set: {children: parent.children}}, function(err, affected) {
                console.dir(affected);
                done();
            });
        });

    });
});


