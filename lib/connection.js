var Arango = require('arangojs'),
  Q = require('q'),
  async = require('async'),
  _ = require('underscore'),
  aqb = require('aqb');

module.exports = (function() {

  'use strict';

  var defaults = {
    createCustomIndex: false,
    idProperty: 'id'
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
    var userpassword = '';
    if (connection.user && connection.password) {
      userpassword = connection.user + ':' + connection.password + '@'
    }

    var serverUrl = 'http://' + userpassword + connection.host + ':' + connection.port;
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
        getCollections: function(next) {
          db.collections(function(res, cols) {
            next(null, cols);
          });
        },
        getEdgeCollections: function(next) {
          var edgeCollections = [];
          _.each(collections, function(v, k) {
            _.each(v.attributes, function(vv, kk) {
              if (vv.edge) {
                vv['from'] = v.tableName;
                edgeCollections.push(vv);
              }
            });
          });

          next(null, edgeCollections);
        },
        createMissingCollections: ['getCollections', function(next, results) {
          var classes = results.getCollections,
            klassesToBeAdded = _.filter(collections, function(v, k) {
              return _.find(classes, function(klass) {
                return v.tableName == klass.name;
              }) === null;
            });
          if (klassesToBeAdded.length > 0) {
            async.mapSeries(klassesToBeAdded,
              function(collection, cb) {
                db.createCollection(collection.tableName);
                cb(null, collection);
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
                db.createCollection({
                  name: collection.edge,
                  type: 3
                });
                return cb(null, collection);
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
    this.db.query(query, function(err, cursor) {
      if (err) return cb(err);
      cursor.all(function(err, vals) {
        return cb(err, fixIds(vals));
      });
    });
  };

  DbHelper.prototype.getDB = function(cb) {
    var db = this.db;
    return cb(db);
  };

  var optionsToQuery = function(collection, options) {
      var qb = aqb.for('d').in(collection);
      if (options.where) {
        var whereStr = '';
        _.each(options.where, function(v, k) {
          if (whereStr !== '') whereStr += ' AND ';
          switch (k) {
            case 'id':
              whereStr += 'd._key == ' + aqb.str(v).toAQL();
              break;
            case '_key':
            case '_rev':
              whereStr += 'd.' + k + ' == ' + aqb.str(v).toAQL();
              break;
            default:
              whereStr += 'd.' + k + ' == ' + aqb(v).toAQL();
              break;
          }
        });
        qb = qb.filter(aqb.expr('(' + whereStr + ')'));
      }
      if (options.limit) {
        qb = qb.limit((options.skip ? options.skip : 0), options.limit);
      }
      return qb;
    },
    fixIds = function(vals) {
      _.each(vals, function(v, k) {
        vals[k]['id'] = vals[k]['_key'];
        if (vals[k]['createdAt']) {
          vals[k]['createdAt'] = new Date(vals[k]['createdAt']);
        }
        if (vals[k]['updatedAt']) {
          vals[k]['updatedAt'] = new Date(vals[k]['updatedAt']);
        }
      });
      return vals;
    };

  DbHelper.prototype.find = function(collection, options, cb) {
    var qb = optionsToQuery(collection, options);
    qb = qb.return('d');

    this.db.query(qb.toAQL(), function(err, cursor) {
      if (err) return cb(err);
      cursor.all(function(err, vals) {
        return cb(err, fixIds(vals));
      });
    });
  };

  //Deletes a collection from database
  DbHelper.prototype.drop = function(collection, relations, cb) {
    this.db.dropCollection(collection, function(err) {
      if (err) return cb(err);
      cb(null, collection);
    });
  };

  /*
    Creates a new document from a collection
  */
  DbHelper.prototype.create = function(collection, options, cb) {
    var me = this;
    this.db.collection(collection, function(err, coll) {
      if (err) return cb(err);

      coll.save(options, function(err, res) {
        if (err) return cb(err, null);
        var qb = optionsToQuery(collection, {
          'where': {
            '_key': res._key
          },
          'limit': 1
        });
        qb = qb.return('d');
        me.db.query(qb.toAQL(), function(err, cursor) {
          if (err) return cb(err);
          cursor.all(function(err, vals) {
            return cb(err, fixIds(vals)[0]);
          });
        });
      });
    });
  };

  /*
    Updates a document from a collection
  */
  DbHelper.prototype.update = function(collection, options, values, cb) {
    var qb = optionsToQuery(collection, options),
      doc = aqb(values);
    qb = qb.update('d').with_(doc).in(collection);
    this.db.query(qb.toAQL() + ' LET modified = NEW RETURN modified', function(err, cursor) {
      if (err) return cb(err);
      cursor.all(function(err, vals) {
        return cb(err, fixIds(vals));
      });
    });
  };

  /*
    Deletes a document from a collection
  */
  DbHelper.prototype.destroy = function(collection, options, cb) {
    var qb = optionsToQuery(collection, options);
    qb = qb.remove('d').in(collection);
    this.db.query(qb.toAQL() + ' LET removed = OLD RETURN removed', function(err, cursor) {
      if (err) return cb(err);
      cursor.all(function(err, vals) {
        return cb(err, fixIds(vals));
      });
    });
  };

  /*
    Perform simple join
  */
  DbHelper.prototype.join = function(collection, criteria, cb) {
    var qb = optionsToQuery(collection, criteria).toAQL(),
      me = this,
      ret = ' RETURN { "d" : d';
    _.each(criteria.joins, function(join) {
      ret += ', "' + join.alias + '" : (FOR ' + join.alias + ' IN GRAPH_NEIGHBORS(' +
        aqb.str(me.graph.name).toAQL() + ',' +
        aqb.str(join.parent + '/' + criteria.where[join.childKey]).toAQL() +
        ', { "vertexCollectionRestriction" : ' + aqb.str(join.parentKey).toAQL() + ' }) RETURN ' + join.alias + ')';
    });
    ret += ' }';
    this.db.query(qb + ret, function(err, cursor) {
      if (err) return cb(err);
      cursor.all(function(err, vals) {
        if (err) return cb(err, null);

        return cb(null, fixIds(_.map(vals, function(item) {
          var bo = item.d;
          _.each(criteria.joins, function(join) {
            bo[join.alias] = _.map(item[join.alias], function(i) {
              return i.vertex;
            });
          });
          return bo;
        })));
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
      var db = getDb(connection, collections)
      var graph = getGraph(db, connection)
      var collection = getGraph(db, connection)
      var helper = new DbHelper(db, graph, collections, connection);
      helper.registerCollections().then(function(classes, err) {
        d.resolve(helper);
      });
    } catch (err) {
      console.log('An error has occured when trying to connect to ArangoDB:');
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
