var supertest = require('supertest');
var app = require('../app.js');

var request = supertest(app);

describe('GET /about', function() {
    it('should return 200 OK', function(done) {
        request.get('/about').expect(200, done);
    });
});

