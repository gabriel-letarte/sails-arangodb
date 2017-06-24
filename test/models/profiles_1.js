/*jshint node: true, esversion: 6*/
'use strict';

const Waterline = require('waterline');

const Profiles = Waterline.Collection.extend({
  identity: 'profiles_1',
  schema: true,
  connection: 'arangodb',

  attributes: {

    id: {
      type: 'string',
      primaryKey: true,
      columnName: '_id'
    },

    url: {
      type: 'string'
    },

  }
});

module.exports = Profiles;
