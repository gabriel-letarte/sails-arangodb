/*jshint node: true, esversion:6 */
'use strict';

/*global describe, before, it, after */
const assert = require('assert');
const should = require('should');

const Waterline = require('waterline');
const orm = new Waterline();
const adapter = require('../');
const config = require("./test.json");
config.adapter = 'arangodb';

const Users_1 = require('./models/users_1');
const Pets_1 = require('./models/pets_1');

const waterline_config = {
  adapters: {
    'default': adapter,
    arangodb: adapter
  },
  connections: {
    arangodb: config
  },
  defaults: {
  }
};

let db,
    models,
    connections,
    savePetId,
    saveId;

describe('adapter', function () {

  before(function (done) {
    orm.loadCollection(Users_1);
    orm.loadCollection(Pets_1);
    orm.initialize(waterline_config, (err, o) => {
      if (err) {
        return done(err);
      }

      models = o.collections;
      connections = o.connections;

      connections.arangodb._adapter.getDB('arangodb', '', (n_db) => {
        db = n_db;
        db.collection('users_1').truncate()
        .then(() => {
          db.collection('pets_1').truncate()
          .then(() => {
            done();
          });
        });
      });
    });
  });

  after(function () {
    orm.teardown();
  });

  describe('connection', function () {
    it('should establish a connection', () => {
      connections.should.ownProperty('arangodb');
    });
  });

  describe('methods', function () {
    it('should create a new document in pets', (done) => {
      models.pets_1.create({name: 'Woof'})
      .then((pet) => {
        should.exist(pet);
        pet.should.have.property('id');
        pet.should.have.property('_id');
        pet.should.have.property('_rev');
        pet.should.have.property('name');
        pet.should.have.property('createdAt');
        pet.should.have.property('updatedAt');
        pet.name.should.equal('Woof');
        savePetId = pet.id;
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should find previously created pet by id', (done) => {
      models.pets_1.find({id: savePetId})
      .then((pets) => {
        should.exist(pets);
        pets.should.be.an.Array();
        pets.length.should.equal(1);
        const pet = pets[0];
        pet.should.have.property('id');
        pet.should.have.property('_id');
        pet.should.have.property('_rev');
        pet.should.have.property('name');
        pet.should.have.property('createdAt');
        pet.should.have.property('updatedAt');
        pet.name.should.equal('Woof');
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should create a new document in users', (done) => {
      models.users_1.create({name: 'Fred Blogs', pet: savePetId})
      .then((user) => {
        should.exist(user);
        user.should.have.property('id');
        user.should.have.property('_id');
        user.should.have.property('_rev');
        user.should.have.property('name');
        user.should.have.property('createdAt');
        user.should.have.property('updatedAt');
        user.name.should.equal('Fred Blogs');
        saveId = user.id;
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should find previously created user by id', (done) => {
      models.users_1.find({id: saveId})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        user.should.have.property('id');
        user.should.have.property('_id');
        user.should.have.property('_rev');
        user.should.have.property('name');
        user.should.have.property('createdAt');
        user.should.have.property('updatedAt');
        user.name.should.equal('Fred Blogs');
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should find user by name', (done) => {
      models.users_1.find({name: 'Fred Blogs'})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        user.name.should.equal('Fred Blogs');
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should find user by name (case insensitive)', (done) => {
      models.users_1.find({name: {contains: 'fred blogs', caseSensitive: false}})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        user.name.should.equal('Fred Blogs');
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should find user by name (case sensitive)', (done) => {
      models.users_1.find({name: {contains: 'Fred Blogs', caseSensitive: true}})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        user.name.should.equal('Fred Blogs');
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should find user by name (case insensitive by default)', (done) => {
      models.users_1.find({name: {contains: 'fred blogs'}})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        user.name.should.equal('Fred Blogs');
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should fail to find user by name (case sensitive)', (done) => {
      models.users_1.find({name: {contains: 'fred blogs', caseSensitive: true}})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(0);
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should update the user name by id', (done) => {
      models.users_1.update(saveId, {name: 'Joe Blogs'})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        user.name.should.equal('Joe Blogs');
        user.should.have.property('id');
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should update the user name by name search', (done) => {
      models.users_1.update({name: 'Joe Blogs'}, {name: 'Joseph Blogs'})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        user.name.should.equal('Joseph Blogs');
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should update the user name by name search (case insensitive)', (done) => {
      models.users_1.update({name: {contains: 'joseph blogs', caseSensitive: false}}, {name: 'joseph blogs'})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        user.name.should.equal('joseph blogs');
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should support complex objects on update', (done) => {
      var complex = {
        age: 100,
        name: 'Fred',
        profile: {
          nested1: {
            value: 50,
            nested2: {
              another_value1: 60,
              another_value2: 70
            }
          }
        }
      };
      models.users_1.update(saveId, {complex: complex})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        user.complex.should.eql(complex);
        complex.age.should.equal(100);
        complex.profile.nested1.nested2.another_value2.should.equal(70);
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should select a top-level field using select', (done) => {
      models.users_1.find({select: ['complex']})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        should.not.exist(users[0].name);
        should.exist(users[0].complex);
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

//    it('should select a top-level field using fields', (done) => {
//      models.users_1.find({}, {fields: {complex: 1}})
//      .then((users) => {
//        console.log('users: users:', users);
//        should.exist(users);
//        users.should.be.an.Array();
//        users.length.should.equal(1);
//        const user = users[0];
//        should.not.exist(users[0].name);
//        should.exist(users[0].complex);
//        done();
//      });
//    });

//    it('should select a 2nd-level field', (done) => {
//      models.users_1.find({select: ['complex.age']})
//      .then((users) => {
//        console.log('users: users:', users);
//        should.exist(users);
//        users.should.be.an.Array();
//        users.length.should.equal(1);
//        const user = users[0];
//        should.not.exist(users[0].name);
//        should.exist(users[0].complex);
//        done();
//      });
//    });

    it('should find by nested where clause', (done) => {
      models.users_1.find({complex: {age: 100}})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        user.complex.age.should.equal(100);
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should find by nested where clause with contains filter', (done) => {
      models.users_1.find({complex: {name: {contains: 'Fr'}}})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        user.complex.name.should.equal('Fred');
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should find by nested where clause with contains filter (case insensitive)', (done) => {
      models.users_1.find({complex: {name: {caseSensitive: false, contains: 'fr'}}})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        user.complex.name.should.equal('Fred');
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should populate pet', (done) => {
      models.users_1.find({})
      .populate('pet')
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        should.exist(user.pet);
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should populate pet and find by pet name', (done) => {
      models.users_1.find({pet: {name: 'Woof'}})
      .populate('pet')
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(1);
        const user = users[0];
        should.exist(user.pet);
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should not return documents with undefined field with <=', (done) => {
      models.users_1.find({notexists: {'lessThanOrEqual': 10}})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(0);
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

    it('should not return documents with undefined field with <', (done) => {
      models.users_1.find({notexists: {'lessThan': 10}})
      .then((users) => {
        should.exist(users);
        users.should.be.an.Array();
        users.length.should.equal(0);
        done();
      })
      .catch((err) => {
        done(err);
      });
    });

  });

  describe('drop collection(s)', () => {
    it('should drop the users_1 collection', (done) => {
      models.users_1.drop((err) => {
        done(err);
      });
    });

    it('should drop the pets_1 collection', (done) => {
      models.pets_1.drop((err) => {
        done(err);
      });
    });
  });


}); // adapter
