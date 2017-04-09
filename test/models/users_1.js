/*jshint node: true, esversion: 6*/
'use strict';

const Waterline = require('waterline');

const Users = Waterline.Collection.extend({
  identity: 'users_1',
  schema: true,
  connection: 'arangodb',

  attributes: {

    id: {
      type: 'string',
      primaryKey: true,
      columnName: '_key'
    },

    name: {
      type: 'string',
      required: true
    },

    complex: { type: 'object' },

    pet: {
      model: 'pets_1'
    },

    second: {
      type: 'string'
    }

  }
});

module.exports = Users;
