var Arango = require('arangojs'),
    Q = require('q'),
    async = require('async'),
    _ = require('underscore'),
    aqb = require('aqb');

module.exports = (function () {

  'use strict';

  var defaults = {
    createCustomIndex: false,
    idProperty: 'id'
  },
      server,
      graph,
      dbHelper = function (db, graph, collections, config) {
        this.db = db;
	this.graph = graph;
        this.collections = collections;
        this.config = _.extend(config, defaults);
      },
      ensureDB = function (database) {
        var deferred = Q.defer();
	server.database(database.name, true, function (res, db) {
	  deferred.resolve(db);
	});
        return deferred.promise;
      },
      ensureGraph = function (db, database) {
        var deferred = Q.defer();
	db.graph(database.graph, true, function (res, graph) {
	  deferred.resolve(graph);
	});
        return deferred.promise;
      },
      getDb = function (connection) {
	var serverUrl = 'http://' + connection.host + ':' + connection.port;
        if (!server) {
          server = new Arango({ url: serverUrl });
	}
	  
        return ensureDB(connection.database);
      },
      getGraph = function (db, connection) {
	return ensureGraph(db, connection.database);
      },
      findCollectionByName = function (collections, collectionName) {
        return _.find(collections, function (v, k) {
          return k.toLowerCase() == collectionName.toLowerCase();
        });
      };
  
  dbHelper.prototype.db = null;
  dbHelper.prototype.collections = null;
  dbHelper.prototype.config = null;
  dbHelper.prototype._classes = null;
  
  dbHelper.prototype.getClass = function (collection) {
    return this._classes[collection];
  };

  dbHelper.prototype.ensureIndex = function () {
    // to be implemented?
  };
  
  /*Makes sure that all the collections are synced to database classes*/
  dbHelper.prototype.registerCollections = function () {
    var deferred = Q.defer(),
        me = this,
        db = me.db,
	graph = me.graph,
        collections = this.collections;

    async.auto({
      getCollections: function (next) {
	db.collections(function (res, cols) {
	  next(null, cols);
	});
      },
      getEdgeCollections: function (next) {
	var edgeCollections = [];
	_.each(collections, function (v, k) {
	  _.each(v.attributes, function (vv, kk) {
	    if (vv.edge) {
	      edgeCollections.push(vv);
	    }
	  });
	});

	next(null, edgeCollections);
      },
      createMissingCollections: ['getCollections', function (next, results) {
        var classes = results.getCollections,
            klassesToBeAdded = _.filter(collections, function (v, k) {
              return _.find(classes, function (klass) {
                return v.tableName == klass.name;
              }) == null;
	    });
	if (klassesToBeAdded.length > 0) {
          async.mapSeries(klassesToBeAdded,
			  function (collection, cb) {
			    db.createCollection(collection.tableName);
			    cb(null, collection);
			  },
                          function (err, created) {
                            next(err, created);
                          });
        } else {
	  next(null, []);
	}
      }],
      createMissingEdges: ['getCollections', 'getEdgeCollections', function (next, results) {
        var classes = results.getCollections;
	async.mapSeries(results.getEdgeCollections,
			function (collection, cb)
			{
			  if (!_.find(classes, function (v) { return (v == collection.edge); }))
			  {
			    db.createCollection({ name: collection.edge, type: 3 });
			    return cb(null, collection);
			  }
			  return cb(null, null);
			},
			function (err, created)
			{
			  next(err, created);
			});
      }],
      addVertexCollections: ['createMissingCollections', function (next, results) {
	async.mapSeries(results.createMissingCollections,
			function (collection, cb)
			{
			  graph.addVertexCollection(collection.tableName, function () {
			    return cb(null, collection);
			  });
			},
			function (err, created)
			{
			  next(null, results);
			});
      }],
      addEdgeDefinitions: ['addVertexCollections', 'createMissingEdges', function (complete, results) {
	async.mapSeries(results.getEdgeCollections,
			function (edge, cb)
			{
			  graph.addEdgeDefinition({
			    from: [ edge.via ],
			    collection: edge.edge,
			    to: [ edge.collection ] }, function () {
			      cb(null, edge);
			    });
			},
			function (err, created)
			{
			  complete(null, results);
			});
      }]
    }, 
	       function (err, results) {
		 if (err) {
		   deferred.reject(err);
		   return;
		 }
		 
		 deferred.resolve(results.createMissingCollections);
		 
	       });
    return deferred.promise;
  };

  dbHelper.prototype.quote = function (val) {
    return aqb(val).toAQL();
  },
  
  /*Query methods starts from here*/
  dbHelper.prototype.query = function (collection, query, cb) {
    this.db.query(query, function (err, cursor) {
      if (err) return cb(err);
      cursor.all(function (err, vals) {
	return cb(err, fixIds(vals));
      });
    });    
  };

  dbHelper.prototype.getDB = function (cb) {
    var db = this.db;
    return cb(db);
  }
  
  var optionsToQuery = function (collection, options) {
    var qb = aqb.for_('d').in_(collection);
    if (options.where) {
      var whereStr = '';
      _.each(options.where, function (v, k) {
	if (whereStr != '') whereStr += ' AND ';
	switch (k)
	{
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
  }, fixIds = function (vals) {
    _.each(vals, function (v, k) {
      vals[k]['id'] = vals[k]['_key'];
    });
    return vals;
  };
  
  dbHelper.prototype.find = function (collection, options, cb) {
    var qb = optionsToQuery(collection, options);
    qb = qb.return_('d');
    
    this.db.query(qb.toAQL(), function (err, cursor) {
      if (err) return cb(err);
      cursor.all(function (err, vals) {
	return cb(err, fixIds(vals));
      });
    });
  };

  //Deletes a collection from database
  dbHelper.prototype.drop = function (collection, relations, cb) {
    var me = this;      
    this.db.dropCollection(collection, function (err) {
      if (err) return cb(err);
      cb(null, collection);
    });
  };

  /*
    Creates a new document from a collection
  */
  dbHelper.prototype.create = function (collection, options, cb) {
    var me = this;      
    this.db.collection(collection, function (err, collection) {
      if (err) return cb(err);
      
      collection.save(options, function (err, res)
		      {
			cb(err, (!err ? { id: res._id, '_id' : res._id, '_rev' : res._rev, '_key' : res._key } : null));
		      });
    });
  };

  /*
    Updates a document from a collection
  */
  dbHelper.prototype.update = function (collection, options, values, cb) {
    var qb = optionsToQuery(collection, options), doc = aqb(values);
    qb = qb.update('d').with_(doc).in_(collection);
    this.db.query(qb.toAQL() + ' LET modified = NEW RETURN modified', function (err, cursor) {
      if (err) return cb(err);
      cursor.all(function (err, vals) {
	return cb(err, fixIds(vals));
      });
    });
  };

  /*
    Deletes a document from a collection
  */
  dbHelper.prototype.destroy = function (collection, options, cb) {
    var qb = optionsToQuery(collection, options);
    qb = qb.remove('d').in_(collection);
    this.db.query(qb.toAQL() + ' LET removed = OLD RETURN removed', function (err, cursor) {
      if (err) return cb(err);
      cursor.all(function (err, vals) {
	return cb(err, fixIds(vals));
      });
    });
  };

  /*
    Perform simple join
  */
  dbHelper.prototype.join = function (collection, criteria, cb) {
    var qb = optionsToQuery(collection, criteria).toAQL(), me = this, ret = ' RETURN { "d" : d';
    _.each(criteria.joins, function (join) {
      ret += ', "' + join.alias + '" : (FOR ' + join.alias + ' IN GRAPH_NEIGHBORS(' +
	  aqb.str(me.graph.name).toAQL() + ',' +
	  aqb.str(join.parent + '/' + criteria.where[join.childKey]).toAQL() +
	  ', { "vertexCollectionRestriction" : ' + aqb.str(join.parentKey).toAQL() + ' }) RETURN ' + join.alias + ')';
    });
    ret += ' }';
    this.db.query(qb + ret , function (err, cursor) {
      if (err) return cb(err);
      cursor.all(function (err, vals) {
	if (err) return cb(err, null);

	return cb(null, fixIds(_.map(vals, function (item) {
	  var bo = item.d;
	  _.each(criteria.joins, function (join) {
	    bo[join.alias] = _.map(item[join.alias], function (i) {
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

  var toArangoRef = function (val) {
    var ret = val, col;
    if (typeof ret === 'object') {
      ret = ret._id.split('/', 2);
    } else {
      ret = ret.split('/', 2);
    }
    return ret;
  };

  dbHelper.prototype.createEdge = function (from, to, options, cb) {
    var src = toArangoRef(from), dst = toArangoRef(to), srcAttr;

    srcAttr = _.find(this.collections[src[0]].attributes, function (i) { return i.collection == dst[0]; });

    // create edge
    this.graph.edgeCollection(srcAttr.edge,
			      function (err, collection)
			      {
				if (err) return cb(err);

				collection.save((options.data ? options.data : {}),
						src.join('/'),
						dst.join('/'),
						function (err, edge)
						{
						  if (err) return cb(err);
						  cb(null, edge);
						});
			      });
  };
  
  /*
   * Removes edges between two vertices pointed by from and to
   */
  dbHelper.prototype.deleteEdges = function (from, to, options, cb) {
    var src = toArangoRef(from), dst = toArangoRef(to), srcAttr;

    srcAttr = _.find(this.collections[src[0]].attributes, function (i) { return i.collection == dst[0]; });

    // delete edge
    this.db.collection(srcAttr.edge,
		       function (err, collection)
		       {
			 if (err) return cb(err);

			 collection.edges(src.join('/'), function (err, edges) {
			   var dErr = err;
			   if (err) return cb(err);
			   _.each(edges, function (i) { collection.remove(i._id, function (err, edge) { dErr = err; }); });
			   if (dErr != null) {
			     return cb(dErr);
			   }
			   cb(null, edges);
			 });
		       });
  };
  
  var connect = function (connection, collections) {
    // if an active connection exists, use
    // it instead of tearing the previous
    // one down
    var d = Q.defer();
    
    try {
      getDb(connection, collections).then(function (db) {
	getGraph(db, connection).then(function (graph) {
          var helper = new dbHelper(db, graph, collections, connection);
          helper.registerCollections()
            .then(function (classes, err) {
              d.resolve(helper);
            });
        });
      });
      
    } catch (err) {
      console.log('An error has occured when trying to connect to ArangoDB:');
      d.reject(err);
      throw err;
    }
    return d.promise;
    
  };

  return {
    create: function (connection, collections) {
      return connect(connection, collections);
    }
  };  
})();
