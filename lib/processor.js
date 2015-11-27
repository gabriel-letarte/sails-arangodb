var _ = require('lodash');

/**
 * Processes data returned from a AQL query.
 * Taken and modified from https://github.com/balderdashy/sails-postgresql/blob/master/lib/processor.js
 */
var Processor = module.exports = function Processor(schema) {
  this.schema = _.cloneDeep(schema);
  return this;
};

/**
 * Cast special values to proper types.
 *
 * Ex: Array is stored as "[0,1,2,3]" and should be cast to proper
 * array for return values.
 */

Processor.prototype.cast = function(collectionName, result) {

  var self = this;
  var _result = _.cloneDeep(result._result);

  // _result is in the following form:
  // [ { name: 'Gab',
  //   createdAt: '2015-11-26T01:09:44.197Z',
  //   updatedAt: '2015-11-26T01:09:44.197Z',
  //   username: 'gab-arango',
  //   _id: 'user/4715390689',
  //   _rev: '5874132705',
  //   _key: '4715390689' } ]
  _result.forEach(function(r){
    Object.keys(r).forEach(function(key) {
      self.castValue(collectionName, key, r[key], r);
    });
  });

  return _result;
};

/**
 * Cast a value
 *
 * @param {String} key
 * @param {Object|String|Integer|Array} value
 * @param {Object} schema
 * @api private
 */

 Processor.prototype.castValue = function(table, key, value, attributes) {

  var self = this;
  var identity = table;
  var attr;

  // Check for a columnName, serialize so we can do any casting
  Object.keys(this.schema[identity]._attributes).forEach(function(attribute) {
    if(self.schema[identity]._attributes[attribute].columnName === key) {
      attr = attribute;
      return;
    }
  });

  if(!attr) attr = key;

  // Lookup Schema "Type"
  if(!this.schema[identity] || !this.schema[identity]._attributes[attr]) return;
  var type;

  if(!_.isPlainObject(this.schema[identity]._attributes[attr])) {
    type = this.schema[identity]._attributes[attr];
  } else {
    type = this.schema[identity]._attributes[attr].type;
  }


  if(!type) return;

  // Attempt to parse Array
  if(type === 'array') {
    try {
      attributes[key] = JSON.parse(value);
    } catch(e) {
      return;
    }
  }

};
