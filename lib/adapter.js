var Connection = require('./connection');
var Processor = require('./processor');
var Q = require('q');
var _ = require('lodash');
var u = require('util');
var debug = require('debug')('sails-arangodb');

debug('loaded');

/**
 * sails-arangodb
 *
 * Most of the methods below are optional.
 *
 * If you don't need / can't get to every method, just implement what you have
 * time for. The other methods will only fail if you try to call them!
 *
 * For many adapters, this file is all you need. For very complex adapters, you
 * may need more flexiblity. In any case, it's probably a good idea to start
 * with one file and refactor only if necessary. If you do go that route, it's
 * conventional in Node to create a `./lib` directory for your private
 * submodules and load them at the top of the file with other dependencies. e.g.
 * var update = `require('./lib/update')`;
 */
module.exports = (function() {

  // You'll want to maintain a reference to each connection
  // that gets registered with this adapter.
  var connections = {};

  // You may also want to store additional, private data
  // per-connection (esp. if your data store uses persistent
  // connections).
  //
  // Keep in mind that models can be configured to use different databases
  // within the same app, at the same time.
  //
  // i.e. if you're writing a MariaDB adapter, you should be aware that one
  // model might be configured as `host="localhost"` and another might be
  // using
  // `host="foo.com"` at the same time. Same thing goes for user, database,
  // password, or any other config.
  //
  // You don't have to support this feature right off the bat in your
  // adapter, but it ought to get done eventually.
  //
  var getConn = function(config, collections) {
    debug('getConn() get connection');
    return Connection.create(config, collections);
  };

  var adapter = {

    // Set to true if this adapter supports (or requires) things like data
    // types, validations, keys, etc.
    // If true, the schema for models using this adapter will be
    // automatically synced when the server starts.
    // Not terribly relevant if your data store is not SQL/schemaful.
    //
    // If setting syncable, you should consider the migrate option,
    // which allows you to set how the sync will be performed.
    // It can be overridden globally in an app (config/adapters.js)
    // and on a per-model basis.
    //
    // IMPORTANT:
    // `migrate` is not a production data migration solution!
    // In production, always use `migrate: safe`
    //
    // drop => Drop schema and data, then recreate it
    // alter => Drop/add columns as necessary.
    // safe => Don't change anything (good for production DBs)
    //
    syncable: false,

    // Primary key format is string (_key)
    pkFormat: 'string',

    getConnection: getConn,

    /**
     *
     * This method runs when a model is initially registered at
     * server-start-time. This is the only required method.
     *
     * @param {[type]}
     *            connection [description]
     * @param {[type]}
     *            collection [description]
     * @param {Function}
     *            cb [description]
     * @return {[type]} [description]
     */
    registerConnection: function(connection, collections, cb) {
      debug('registerConnection()');

      if (!connection.identity)
        return cb(new Error('Connection is missing an identity.'));
      if (connections[connection.identity])
        return cb(new Error('Connection is already registered.'));
      // Add in logic here to initialize connection
      // e.g. connections[connection.identity] = new Database(connection,
      // collections);

      getConn(connection, collections).then(function(helper) {
        connections[connection.identity] = helper;
        cb();
      });
    },

    /**
     * Fired when a model is unregistered, typically when the server is
     * killed. Useful for tearing-down remaining open connections, etc.
     *
     * @param {Function}
     *            cb [description]
     * @return {[type]} [description]
     */
    // Teardown a Connection
    teardown: function(conn, cb) {
      debug('teardown()');

      if (typeof conn == 'function') {
        cb = conn;
        conn = null;
      }
      if (!conn) {
        connections = {};
        return cb();
      }
      if (!connections[conn])
        return cb();
      delete connections[conn];
      cb();
    },

    // Return attributes
    describe: function(connection, collection, cb) {
      debug('describe()');
      // Add in logic here to describe a collection (e.g. DESCRIBE TABLE
      // logic)

      connections[connection].collection.getProperties(collection,
        function(res, err) {
          cb(err, res);
        });

    },

    /**
     *
     * REQUIRED method if integrating with a schemaful (SQL-ish) database.
     *
     */
    define: function(connection, collection, definition, cb) {
      debug('define()');
      // Add in logic here to create a collection (e.g. CREATE TABLE
      // logic)
      var deferred = Q.defer();
      return connections[connection].createCollection(collection, function(db) {
        deferred.resolve(db);
      });
    },

    /**
     *
     * REQUIRED method if integrating with a schemaful (SQL-ish) database.
     *
     */
    drop: function(connection, collection, relations, cb) {
      debug('drop()');
      // Add in logic here to delete a collection (e.g. DROP TABLE logic)
      return connections[connection].drop(collection, relations, cb);
    },

    /**
     *
     * REQUIRED method if users expect to call Model.find(),
     * Model.findOne(), or related.
     *
     * You should implement this method to respond with an array of
     * instances. Waterline core will take care of supporting all the other
     * different find methods/usages.
     *
     */
    //Gets the underlying arango instance used by adapter
    getDB: function(connectionName, collectionName, cb) {
      debug('getDB()');
      return connections[connectionName].getDB(cb);
    },

    find: function(connectionName, collectionName, searchCriteria, cb) {
      debug('find() connectionName:', connectionName, 'collectionName:', collectionName, 'searchCriteria:', searchCriteria);

      var qlimit = '';
      searchCriteria.skip = searchCriteria.skip || 0;
      if (searchCriteria.limit) {
        qlimit = `LIMIT ${searchCriteria.skip},${searchCriteria.limit}`
      }

      var db = connections[connectionName].db;
      var col = db.collection(collectionName);

      var qfor = 'FOR x IN ' + collectionName;
      var qfilter = this._queryFormatter(searchCriteria.where, '==', 'FILTER');
      var qreturn = 'RETURN x'

      debug('find() qfilter:', qfilter);

      db.query([qfor, qfilter, qlimit, qreturn].join(' '), function(e, r){
        if (e){
          debug('find() query err:', e);
          return cb(e);
        }
//        debug('find() result:', r);

        // filter to selected fields
        if (searchCriteria.select && searchCriteria.select.length > 0) {
          // r is an arangodb cursor
          r.map((v) => {
            let nv = {};
            ['_id', '_key', '_rev'].forEach((k) => { nv[k] = v[k] });

            searchCriteria.select.forEach((sk) => {
              nv[sk] = v[sk];
            });
            return nv;
          })
          .then((newr) => {
//            debug('find() select mapped results:', newr);
            let processor = new Processor(connections[connectionName].collections);
            return cb(null, processor.cast(collectionName, {_result: newr}));
          })
          .catch((err) => {
            console.error('find() error:', err);
            throw new Error(err);
          });
        } else {
          var processor = new Processor(connections[connectionName].collections);
          return cb(null, processor.cast(collectionName, r));
        }
      });
    },

    //Executes the query using Arango's query method
    query: function(connectionName, collectionName, options, cb) {
      return connections[connectionName].query(collectionName, options, cb);
    },

    /**
     *
    */
    neighbors: function(connectionName, collectionName, searchCriteria, graphName, cb){
      debug('neighbors()');

      var db = connections[connectionName].db;
      var col = db.collection(collectionName);

      var q = "RETURN GRAPH_NEIGHBORS("
      q += "'" + graphName + "', ";
      q += "{'_id': '" + searchCriteria + "'}, ";
      q += "{includeData: true})";

      console.log('-------------------');
      console.log('Still WIP');
      console.log(searchCriteria);
      console.log(graphName);
      console.log(q);
      console.log('-------------------');

      db.query(q, function(e, r){
        if (e){
          return cb(e);
        }
        return cb(null, r._result[0])
      });

    },

    /**
     * @TODO: This method will be bound to WaterlineORM objects, E.g:
     *        `User.createEdge`
     *        But it's not using the User in any way...
     *
     * edgeCollectionName: name of the edge collection
     * id1: document handle (`_id`) for vertex 1 (something like `user/4715390689`)
     * id2: document handle for vertex 2
     * attributes [optionnal]: data to include in the edge
     * cb
    */
    createEdge: function(connectionName, collectionName, edgeCollectionName, id1, id2, attributes, cb){
      debug('createEdge()');

      var db = connections[connectionName].db;

      if (cb === undefined){
        cb = attributes;
        attributes = {};
      }

      var data = _.merge(attributes, {
        _from: id1,
        _to: id2,
      });

      var edges = db.edgeCollection(edgeCollectionName);
      edges.save(data, function(e, r){
        if (e){
          return cb(e);
        }
        return cb(null, r); // @TODO: Return something usefull if possible
      });
    },

    /**
     * @TODO: Same as `createEdge`
     *
     * edgeCollectionName: name of the edge collection
     * id1: document handle (`_id`) for the edge (something like `useredge/4715390689`)
     * cb
    */
    deleteEdge: function(connectionName, collectionName, edgeCollectionName, id, cb){
      debug('deleteEdge()');

      var db = connections[connectionName].db;

      if (cb === undefined){
        cb = attributes;
        attributes = {};
      }

      var data = _.merge(attributes, {
        _from: id1,
        _to: id2,
      });

      var edges = db.edgeCollection(edgeCollectionName);
      edges.remove(id, function(e, r){
        if (e){
          return cb(e);
        }
        return cb(null, r); // @TODO: Return something usefull if possible
      });
    },

    create: function(connectionName, collectionName, data, cb) {
      debug('create()');
      var col = connections[connectionName].db.collection(collectionName);
      return col.save(data, cb);
    },

    // Although you may pass .update() an object or an array of objects,
    // it will always return an array of objects.
    // Any string arguments passed must be the ID of the record.
    // If you specify a primary key (e.g. 7 or 50c9b254b07e040200000028)
    // instead of a criteria object, any .where() filters will be ignored.
    update: function(connectionName, collectionName, searchCriteria , values , cb) {
      debug('update() connectionName:', connectionName, 'collectionName:', collectionName, 'searchCriteria:', searchCriteria, 'values:', values);

      var db = connections[connectionName].db;
      var col = db.collection(collectionName);

      var qfor = 'FOR x IN ' + collectionName;
      var qfilter = this._queryFormatter(searchCriteria.where, '==', 'FILTER');
      var qupdate = 'UPDATE { _key: x._key, ' +
        this._updateStringify(values) + ' } IN ' + collectionName;
//        this._queryFormatter(values, ':') + ' } IN ' + collectionName;
      var qreturn = 'RETURN NEW'

      console.log('-------------------');
      console.log('Still WIP');
      console.log(searchCriteria);
      console.log(searchCriteria.where);
      console.log(values);
      console.log([qfor, qfilter, qupdate, qreturn].join(' '));
      console.log('-------------------');

      return db.query([qfor, qfilter, qupdate, qreturn].join(' '), function(e, r){
        if (e){
          console.log('sails-arangodb update err:', e);
          return cb(e);
        }
        return cb(null, r._result)
      });
    },

    destroy: function(connectionName, collectionName, options, cb) {
      debug('destroy()');
      return connections[connectionName].destroy(collectionName, options, cb);
    },

    // @TODO: Look into ArangoJS for similar & better functions
    _limitFormatter: function(searchCriteria) {
      debug('_limitFormatter()');
      var r = '';
      if (searchCriteria.LIMIT){
        r = 'LIMIT '
        if (searchCriteria.SKIP){
          r += searchCriteria.SKIP;
          delete searchCriteria.SKIP;
        }
        r += searchCriteria.LIMIT;
        delete searchCriteria.LIMIT;
      }
      return r;
    },

    _updateStringify: function (values) {
      debug('_updateStringify()');
      var r = '';
      r = JSON.stringify(values);

      // remove leading and trailing {}'s
      return r.replace(/(^{|}$)/g, '');
    },

    // @TODO: Look into ArangoJS for similar & better functions
    /**
     * @param searchCriteria {Object}
     * @param separator {String} == or :         @TODO: Find other way or put in const
    */
    _queryFormatter: function(searchCriteria, separator, begin) {
      var r = '';
      var user = {};

      debug('in _queryFormatter() searchCriteria:', searchCriteria, 'separator:', separator, 'begin:', begin);

      for (var k in searchCriteria) {
        if (r === '' && begin !== undefined){
          r = begin + ' ';
        }
        else if (r !== ''){
          if (separator === '=='){
            r += ' AND ';
          }
          else {
            r += ', ';
          }
        }
        if (searchCriteria.hasOwnProperty(k)) {
          var k_override = k;
          var v_override = searchCriteria[k];
          var begin = '';
          if (separator === '=='){
            begin = 'x.';
          }

          // ArangoDB has '_id' instead of 'id'
          if (k === 'id'){
            k_override = '_id';
          }

          // Datetime to arangodb format
          if (v_override !== null && v_override.constructor == Date){
            v_override = v_override.toISOString();
          }

          r += begin + k_override + separator + this._queryParamWrapper(v_override);
        }
      }
      return r;
    },

    // @TODO: Prevent injection
    _queryParamWrapper: function(param) {
      debug('_queryParamWrapper()');
      if (typeof param === 'string'){
        return "'" + param + "'";
      }
      else if (typeof param === 'object') {
        var s, ii;
        if (Object.prototype.toString.call(param) === '[object Array]') {
          s = '[';
          for (ii=0; ii < param.length; ii++) {
            if (ii) s += ',';
            s += this._queryParamWrapper(param[ii]);
          }
          s += ']';
        }
        else {
          s = '{';
          for (ii in param) {
            s += ii + ':'
            s += this._queryParamWrapper(param[ii]);
          }
          s += '}';
        }
        return s;
      }
      return param;
    },

    /*
     * // Custom methods defined here will be available on all models // which
     * are hooked up to this adapter: // // e.g.: // foo: function
     * (collectionName, options, cb) { return cb(null,"ok"); }, bar: function
     * (collectionName, options, cb) { if (!options.jello) return
     * cb("Failure!"); else return cb(); destroy: function (connection,
     * collection, options, values, cb) { return cb(); } // So if you have three
     * models: // Tiger, Sparrow, and User // 2 of which (Tiger and Sparrow)
     * implement this custom adapter, // then you'll be able to access: // //
     * Tiger.foo(...) // Tiger.bar(...) // Sparrow.foo(...) // Sparrow.bar(...) //
     * Example success usage: // // (notice how the first argument goes away:)
     * Tiger.foo({}, function (err, result) { if (err) return
     * console.error(err); else console.log(result); // outputs: ok }); //
     * Example error usage: // // (notice how the first argument goes away:)
     * Sparrow.bar({test: 'yes'}, function (err, result){ if (err)
     * console.error(err); else console.log(result); // outputs: Failure! })
     */

    quote: function(connection, collection, val) {
      debug('quote()');
      return connections[connection].quote(val);
    },

    join: function(connection, collection, criteria, cb) {
      debug('join()');
      return connections[connection].join(collection, criteria, cb);
    }

  };

  // Expose adapter definition
  return adapter;

})();
