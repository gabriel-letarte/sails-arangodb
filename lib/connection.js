/*jshint node: true, esversion:6 */
'use strict';

/*global console, process*/
var Arango = require('arangojs'),
    Q = require('q'),
    async = require('async'),
    _ = require('lodash'),
    aqb = require('aqb'),
    debug = require('debug')('sails-arangodb:connection');

/**
 *
 * @module
 * @name connection
 */
module.exports = (function() {

  var serverUrl = '';
  var defaults = {
    createCustomIndex: false,
    idProperty: 'id',
    caseSensitive: false
  };

  var server;

  var DbHelper = function(db, graph, collections, config) {
    this.db = db;
    this.graph = graph;
    this.collections = collections;
    this.config = _.extend(config, defaults);
  };

  /**
   * Connect to ArangoDB and use the requested database or '_system'
  */
  var getDb = function(connection) {
    debug('getDB() connection:', connection);
    var userpassword = '';
    if (connection.user && connection.password) {
      userpassword = connection.user + ':' + connection.password + '@';
    }

    serverUrl = 'http://' + userpassword + connection.host + ':' + connection.port;
    if (!server) {
      server = new Arango({
        url: serverUrl,
        databaseName: connection.database || '_system'
      });
    }
    return server;
  };

  var getGraph = function(db, connection) {
    return db.graph(connection.graph);
  };

  var getCollection = function(db, connection) {
    return db.collection(connection.collection);
  };

  DbHelper.logError = function(err) {
    console.error(err.stack);
  };

  DbHelper.prototype.db = null;
  DbHelper.prototype.collections = null;
  DbHelper.prototype.config = null;
  DbHelper.prototype._classes = null;

  DbHelper.prototype.getClass = function(collection) {
    return this._classes[collection];
  };

  DbHelper.prototype.ensureIndex = function() {
    // to be implemented?
  };

  /*Makes sure that all the collections are synced to database classes*/
  DbHelper.prototype.registerCollections = function() {
    var deferred = Q.defer();
    var me = this;
    var db = me.db;
    var graph = me.graph;
    var collections = this.collections;

    async.auto({
        ensureDB: function(next) {
          var system_db = Arango({
            url: serverUrl,
            databaseName: '_system'
          });
          system_db.listDatabases(function(err, dbs) {
            if (err) {
              DbHelper.logError(err);
              process.exit(1);
            }

            // Create the DB if needed
            if (dbs.indexOf(db.name) === -1) {
              system_db.createDatabase(db.name, function(err, result) {
                if (err) {
                  DbHelper.logError(err);
                  process.exit(1);
                }
                debug('Created database: ' + db.name);
                next(null);
              });
            }
            else {
              next(null);
            }
          });
        },
        // Get collections from DB
        getCollections: ['ensureDB', function(next) {
          db.collections(function(err, cols) {
            if (err){
              DbHelper.logError(err);
              process.exit(1);
            }
            var docCollection = cols.filter(function(c){
              if (c.type == 2){ // @TODO: Use something like ArangoDB.EDGE_COLLECTION
                                // see https://github.com/gabriel-letarte/arangojs/blob/master/src/collection.js
                                // export const types = {
                                //   DOCUMENT_COLLECTION: 2,
                                //   EDGE_COLLECTION: 3
                                // };
                return c;
              }
            });
            var edgeCollection = cols.filter(function(c){
              if (c.type == 3){ // @TODO: see above
                return c;
              }
            });
            next(null, {
              'docCollection': docCollection,
              'edgeCollection': edgeCollection,
            });
          });


          // var cols = [];
          // _.each(collections, function(v, k){
          //   cols.push(k);
          // });
          // next(null, cols);
        }],
        // Get relations from DB
        getEdgeCollections: ['ensureDB', function(next) {
          var edgeCollections = [];
          _.each(collections, function(v, k) {
            _.each(v.attributes, function(vv, kk) {
              if (vv.edge) {
                vv.from = v.tableName;
                edgeCollections.push(vv);
              }
            });
          });
          next(null, edgeCollections);
        }],

        createMissingCollections: ['getCollections', function(next, results) {
          var currentCollections = results.getCollections.docCollection;
          var missingCollections = _.filter(collections, function(v, k) {
            return _.find(currentCollections, function(klass) {
              return v.adapter.collection == klass.name;
            }) === undefined;
          });
          if (missingCollections.length > 0) {
            async.mapSeries(missingCollections,
              function(collection, cb) {
                debug('db.collection - CALLED', collection.adapter.collection);
                db.collection(collection.adapter.collection).create(function(err){
                  if (err) {
                    debug('err:', err);
                    return cb(err, null);
                  }
                  debug('db.collection - DONE');
                  return cb(null, collection);
                });
              },
              function(err, created) {
                next(err, created);
              });
          } else {
            next(null, []);
          }
        }],
        createMissingEdges: ['getCollections', 'getEdgeCollections', function(next, results) {
          var classes = results.getCollections;
          async.mapSeries(results.getEdgeCollections,
            function(collection, cb) {
              if (!_.find(classes, function(v) {
                  return (v == collection.edge);
                })) {
                debug('db.edgeCollection - CALLED');
                db.edgeCollection(collection.edge).create(function(results){
                  debug('db.edgeCollection - DONE');
                  return cb(null, collection);
                });
              }
              return cb(null, null);
            },
            function(err, created) {
              next(err, created);
            });
        }],
        addVertexCollections: ['createMissingCollections', function(next, results) {
          async.mapSeries(results.createMissingCollections,
            function(collection, cb) {
              graph.addVertexCollection(collection.tableName, function() {
                return cb(null, collection);
              });
            },
            function(err, created) {
              next(null, results);
            });
        }],
        addEdgeDefinitions: ['addVertexCollections', 'createMissingEdges', function(complete, results) {
          async.mapSeries(results.getEdgeCollections,
            function(edge, cb) {
              graph.addEdgeDefinition({
                from: [edge.from],
                collection: edge.edge,
                to: [edge.collection]
              }, function() {
                cb(null, edge);
              });
            },
            function(err, created) {
              complete(null, results);
            });
        }]
      },
      function(err, results) {
        debug('ASYNC.AUTO - DONE');
        if (err) {
          deferred.reject(err);
          return;
        }

        deferred.resolve(results.createMissingCollections);

      });

    return deferred.promise;
  };

  DbHelper.prototype.quote = function(val) {
    return aqb(val).toAQL();
  };

  /*Query methods starts from here*/
  DbHelper.prototype.query = function(collection, query, cb) {
    debug('query() ', query);
    this.db.query(query, function(err, cursor) {
      if (err) return cb(err);
      cursor.all(function(err, vals) {
        return cb(err, vals);
      });
    });
  };

  DbHelper.prototype.getDB = function(cb) {
    var db = this.db;
    return cb(db);
  };

//  var optionsToQuery = function(collection, options, qb) {
  DbHelper.prototype.optionsToQuery = function(collection, options, qb) {
    var self = this;

    debug('optionsToQuery() options:', options);
    qb = qb ? qb : aqb.for('d').in(collection);

    function buildWhere(where, recursed) {
      debug('buildWhere where:', where);
      _.each(where, function(v, k) {

        if (!recursed) {
          if (whereStr !== '') whereStr += ' AND ';
        }

        // like as keyword
        if (k === 'like') {
          k = Object.keys(v)[0];
          v = { 'like': v[k] };
        }

        // Handle filter operators
        debug('options.where before operators: k:', k, 'v:', typeof v, v);
        var operator = '==';
        var eachFunction = '';
        var skip = false;
        var pre = '';

        // handle config default caseSensitive option
        debug('config caseSensitive:', self.config.caseSensitive);
        if (self.config.hasOwnProperty('caseSensitive')) {
          if (!self.config.caseSensitive) {
            eachFunction = 'LOWER';
          } else {
            eachFunction = '';
          }
        }

        if (v && typeof v === 'object') {
          // handle array of values for IN
          if (_.isArray(v)) {
            operator = 'IN';
            eachFunction = '';
          } else {
            // Handle filter's options

            debug('v caseSensitive:', v.caseSensitive);
            if (v.hasOwnProperty('caseSensitive')) {
              if (!v.caseSensitive) {
                eachFunction = 'LOWER';
              } else {
                eachFunction = '';
              }
              delete v.caseSensitive;
            }

            _.each(v, (vv, kk) => {
              debug('optionsToQuery kk:', kk, 'vv:', typeof vv, vv);
              v = vv;
              switch(kk) {
                case 'contains':
                  operator = 'LIKE';
                  v = `%${vv}%`;
                  break;

                case 'like':
                  operator = 'LIKE';
                  break;

                case 'startsWith':
                  operator = 'LIKE';
                  v = `${vv}%`;
                  break;

                case 'endsWith':
                  operator = 'LIKE';
                  v = `%${vv}`;
                  break;

                case 'lessThanOrEqual':
                case '<=':
                  operator = '<=';
                  pre = `HAS(d, "${k}") AND`;
                  break;

                case 'lessThan':
                case '<':
                  operator = '<';
                  pre = `HAS(d, "${k}") AND`;
                  break;

                case 'greaterThanOrEqual':
                case '>=':
                  operator = '>=';
                  break;

                case 'greaterThan':
                case '>':
                  operator = '>';
                  break;

                case 'not':
                case '!':
                  if (_.isArray(vv)) {  // in waterline v0.11/12
                    operator = 'NOT IN';
                    eachFunction = '';
                  } else {
                    operator = '!=';
                  }
                  break;

                case 'nin':   // in waterline master (upcoming)
                  operator = 'NOT IN';
                  eachFunction = '';
                  break;

                default:
                  const newWhere = {};
                  newWhere[`${k}.${kk}`] = vv;
                  buildWhere(newWhere, true);  // recursive for next level
                  skip = true;
              }
            });
          }
        }

        if (skip) {
          return; // to outer each() loop
        }


        switch (k) {
          case 'id':
            whereStr += `${eachFunction}(d._key) ${operator} ${eachFunction}(${aqb.str(v).toAQL()})`;
            break;
          case '_key':
          case '_rev':
            whereStr += `${eachFunction}(d.${k}) ${operator} ${eachFunction}(${aqb.str(v).toAQL()})`;
            break;
          default:
            whereStr += `(${pre} ${eachFunction}(d.${k}) ${operator} ${eachFunction}(${aqb(v).toAQL()}))`;
            break;
        }

      });
    } // function buildWhere

    if (options.where && options.where !== {}) {
      var whereStr = '';

      buildWhere(options.where);

      debug('whereStr:', whereStr);
      debug('qb:', qb);
      qb = qb.filter(aqb.expr('(' + whereStr + ')'));
    }

    // handle sort option
    if (options.sort && !_.isEmpty(options.sort)) {
      var sortArgs;
      debug('sort options:', options.sort);
      // as an object {'field': -1|1}
      sortArgs = _.map(options.sort, (v, k) => {
        return [`d.${k}`, `${v < 0 ? 'DESC' : 'ASC'}`];
      });

      // force consistent results
      sortArgs.push(['d._key', 'ASC']);

      sortArgs = _.flatten(sortArgs);

      debug('sortArgs:', sortArgs);
      qb = qb.sort.apply(qb, sortArgs);
    }

    if (options.limit !== undefined) {
      qb = qb.limit((options.skip ? options.skip : 0), options.limit);
    } else if (options.skip !== undefined) {
      qb = qb.limit(options.skip, Number.MAX_SAFE_INTEGER);
    }

    debug('optionsToQuery() returns:', qb);
    return qb;
  };

    // e.g. FOR d IN userTable2 COLLECT Group="all" into g RETURN {age: AVERAGE(g[*].d.age)}
  DbHelper.prototype.applyFunctions = function (options, qb) {
    // handle functions
    var funcs = {};
    _.each(options, function (v, k) {
      if (_.includes(['where', 'sort', 'limit', 'skip', 'select', 'joins'], k)) {
        return;
      }
      funcs[k] = v;
    });
    debug('applyFunctions() funcs:', funcs);

    if (Object.keys(funcs).length === 0) {
      qb = qb.return({'d': 'd'});
      return qb;
    }

    var funcs_keys = Object.keys(funcs);
    debug('applyFunctions() funcs_keys:', funcs_keys);

    qb = qb.collect('Group', '"all"').into('g');

    var retobj = {};
    funcs_keys.forEach(function(func) {
      options[func].forEach(function(field) {
        if (typeof field !== 'object') {
          retobj[field] = aqb.fn(func.toUpperCase())('g[*].d.' + field);
        }
      });
    });
    debug('retobj:', retobj);
    qb = qb.return({'d': retobj});
    return qb;
  };

  DbHelper.prototype.find = function(collection, options, cb) {
    var me = this;
    debug('connection find() collection:', collection, 'options:', options);
    var qb = this.optionsToQuery(collection, options);
    qb = me.applyFunctions(options, qb);

    var find_query = qb.toAQL();
    debug('find_query:', find_query);

    this.db.query(find_query, function(err, cursor) {
      debug('connection find() query err:', err);
      if (err) return cb(err);

      me._filterSelected(cursor, options)
      .then((vals) => {
        debug('query find response:', vals.length, 'documents returned for query:', find_query);
        debug('vals:', vals);
        return cb(null, _.map(vals, function(item) {
          return item.d;
        }));
      })
      .catch((err) => {
        console.error('find() error:', err);
        cb(err, null);
      });
    });
  };

  //Deletes a collection from database
  DbHelper.prototype.drop = function(collection, relations, cb) {
    this.db.collection(collection).drop(cb);
  };

  /*
    Updates a document from a collection
  */
  DbHelper.prototype.update = function(collection, options, values, cb) {
    var qb = this.optionsToQuery(collection, options),
        doc = aqb(values);

    qb = qb.update('d').with_(doc).in(collection);
    var query = qb.toAQL() + ' LET modified = NEW RETURN modified';
    debug('update() query:', query);

    this.db.query(query, function(err, cursor) {
      if (err) return cb(err);
      cursor.all(function(err, vals) {
        return cb(err, vals);
      });
    });
  };

  /*
    Deletes a document from a collection
  */
  DbHelper.prototype.destroy = function(collection, options, cb) {
    var qb = this.optionsToQuery(collection, options);
    qb = qb.remove('d').in(collection);
    this.db.query(qb.toAQL() + ' LET removed = OLD RETURN removed', function(err, cursor) {
      if (err) return cb(err);
      cursor.all(function(err, vals) {
        return cb(err, vals);
      });
    });
  };

  DbHelper.prototype._filterSelected = function(cursor, criteria) {
    // filter to selected fields
    return cursor.map((v) => {
      debug('_filterSelected v:', v);
      if (criteria.select && criteria.select.length > 0) {
        let nv = {d: {}};
        _.each(criteria.joins, function(join) {
          nv[join.alias] = v[join.alias];
        });

        ['_id', '_key', '_rev'].forEach((k) => { nv.d[k] = v.d[k]; });

        criteria.select.forEach((sk) => {
          nv.d[sk] = v.d[sk];
        });
        debug('nv:', nv);
        return nv;
      }
      return v;
    });
  };

  /*
    Perform simple join
  */
  DbHelper.prototype.join = function(collection, criteria, cb) {
    debug('join collection:', collection, 'criteria:', criteria, 'this.graph.name:', this.graph.name);

    var me = this,
        join_query;

    if (!me.graph.name) { // Join
      var q = aqb.for(collection).in(collection);
      var mergeObj = {};
      _.each(criteria.joins, function(join) {
        q = q
        .for(join.parentKey)
        .in(join.child)
        .filter(aqb.eq(`${join.parentKey}.${join.childKey}`, `${join.parent}.${join.parentKey}`));
        mergeObj[join.parentKey] = join.parentKey;
      });
      q = q.return(aqb.MERGE(collection, mergeObj));
      var q_d = aqb.for('d').in(q);
      var q_opts = this.optionsToQuery(collection, criteria, q_d);
//      join_query = q_opts.return({d: 'd'});
      join_query = me.applyFunctions(criteria, q_opts);

    } else { // graph

      // TODO: Use above AQB approach with graphs too

      var qb = this.optionsToQuery(collection, criteria).toAQL(),
        ret = ' RETURN { "d" : d';

      _.each(criteria.joins, function(join) {
        debug('join each:', join);
        var _id;
        if (criteria.where) {
          _id = criteria.where[join.childKey];
          if (!_id)
            _id = criteria.where._key;
        }
        debug('join criteria _id field:', _id);

        ret += ', "' + join.alias + '" : (FOR ' + join.alias + ' IN ANY ' + aqb.str(join.parent + '/' + _id).toAQL() +
          ' GRAPH ' + aqb.str(me.graph.name).toAQL() + '' +
          ' OPTIONS {bfs: true, uniqueVertices: true} FILTER IS_SAME_COLLECTION("' +join.child + '", ' + join.alias + ') RETURN ' + join.alias + ')';
      });
      ret += ' }';
      join_query = qb + ret;
    }

    debug('join query:', join_query);
    this.db.query(join_query, function(err, cursor) {
      if (err) return cb(err);

      debug('join() criteria.select:', criteria.select);

      me._filterSelected(cursor, criteria)
      .then((vals) => {
        debug('query join response:', vals.length, 'documents returned for query:', join_query.toAQL());
        return cb(null, _.map(vals, function(item) {
          var bo = item.d;

          if (me.graph.name) {
            _.each(criteria.joins, function(join) {
              if (!criteria.select || criteria.select.includes(join.alias)) {
                bo[join.alias] = _.map(item[join.alias], function(i) {
                  return i;
                });
              }
            });
          }
          return bo;
        }));
      })
      .catch((err) => {
        console.error('join() error:', err);
        cb(err, null);
      });

    });
  };

  /*
   * Creates edge between two vertices pointed by from and to
   */

  var toArangoRef = function(val) {
    var ret = val;
    if (typeof ret === 'object') {
      ret = ret._id.split('/', 2);
    } else {
      ret = ret.split('/', 2);
    }
    return ret;
  };

  DbHelper.prototype.createEdge = function(from, to, options, cb) {
    var src = toArangoRef(from),
      dst = toArangoRef(to),
      srcAttr;

    srcAttr = _.find(this.collections[src[0]].attributes, function(i) {
      return i.collection == dst[0];
    });

    // create edge
    this.graph.edgeCollection(srcAttr.edge,
      function(err, collection) {
        if (err) return cb(err);

        collection.save((options.data ? options.data : {}),
          src.join('/'),
          dst.join('/'),
          function(err, edge) {
            if (err) return cb(err);
            cb(null, edge);
          });
      });
  };

  /*
   * Removes edges between two vertices pointed by from and to
   */
  DbHelper.prototype.deleteEdges = function(from, to, options, cb) {
    var src = toArangoRef(from),
      dst = toArangoRef(to),
      srcAttr;

    srcAttr = _.find(this.collections[src[0]].attributes, function(i) {
      return i.collection == dst[0];
    });

    // delete edge
    this.db.collection(srcAttr.edge,
      function(err, collection) {
        if (err) return cb(err);

        collection.edges(src.join('/'), function(err, edges) {
          var dErr = err;
          if (err) return cb(err);
          _.each(edges, function(i) {
            collection.remove(i._id, function(err, edge) {
              dErr = err;
            });
          });
          if (dErr !== null) {
            return cb(dErr);
          }
          cb(null, edges);
        });
      });
  };

  var connect = function(connection, collections) {
    // if an active connection exists, use
    // it instead of tearing the previous
    // one down
    var d = Q.defer();

    try {
      var db = getDb(connection);
      var graph = getGraph(db, connection);
      var helper = new DbHelper(db, graph, collections, connection);
      helper.registerCollections().then(function(classes, err) {
        d.resolve(helper);
      });
    } catch (err) {
      console.log('An error has occured when trying to connect to ArangoDB:', err);
      d.reject(err);
      throw err;
    }
    return d.promise;
  };

  return {
    create: function(connection, collections) {
      return connect(connection, collections);
    }
  };
})();
