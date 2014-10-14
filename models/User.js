var mongoose = require('mongoose');
var bcrypt = require('bcrypt-nodejs');
var crypto = require('crypto');

//var decimal = require('decimal');
//var extend = require('extend');

var userSchema = new mongoose.Schema({
    email: { type: String, unique: true, lowercase: true },
    password: String,
    roles: [ String ], 

    //oauth tokens
    google: String,
    tokens: Array, //used to store oauth access tokens

    profile: {
        name: String,
        gender: { type: String, default: '' },
        location: { type: String, default: '' },
        website: { type: String, default: '' },
        picture: { type: String, default: '' },
        favorite_color: {type: String, default: '#0f0'}
    },

    //used to reset password
    resetPasswordToken: String,
    resetPasswordExpires: Date
});

/* //use find({owners: id}) instead
   docSchema.statics.findByOwnerID = function(id, cb) {
   this.find({owners: id}, cb);
   };
   */

userSchema.statics.errorMessage = function(err) {
    switch(err.code) {
    case 11000:
        return "The email address is already used by another user. Please choose a different one.";
    }
    console.error("unknown error code for userSchema.. dumping to user..");
    console.error(err);
    return err.toString();
}

//Why am I not storing the salt to DB? bcrypt creates hash that contains salt, so by storing the hash, I am already storing salt
userSchema.pre('save', function(next) {
    var user = this;
    if (!user.isModified('password')) return next();

    bcrypt.genSalt(5, function(err, salt) {
        if (err) return next(err);
        bcrypt.hash(user.password, salt, null, function(err, hash) {
            if (err) return next(err);
            user.password = hash;
            next();
        });
    });
});

userSchema.methods.comparePassword = function(candidatePassword, cb) {
    bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
        if (err) return cb(err);
        cb(null, isMatch);
    });
};

/**
 * Get URL to a user's gravatar.
 * Used in Navbar and Account Management page.
 */

userSchema.methods.gravatar = function(size) {
  if (!size) size = 200;

  if (!this.email) {
    return 'https://gravatar.com/avatar/?s=' + size + '&d=retro';
  }

  var md5 = crypto.createHash('md5').update(this.email).digest('hex');
  return 'https://gravatar.com/avatar/' + md5 + '?s=' + size + '&d=retro';
};

module.exports = mongoose.model('User', userSchema, 'user');

