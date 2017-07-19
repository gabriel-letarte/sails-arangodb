/*jshint node: true, esversion: 6*/
'use strict';

const Waterline = require('waterline');

const Pets = Waterline.Collection.extend({
  identity: 'pets_1',
  schema: true,
  connection: 'arangodb',

  attributes: {

    id: {
      type: 'string',
      primaryKey: true,
      columnName: '_id'
    },

    name: {
      type: 'string',
      required: true
    },

    complex: { type: 'object' }

  }
});

module.exports = Pets;
