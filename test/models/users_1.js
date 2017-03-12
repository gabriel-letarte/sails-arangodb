/*jshint node: true, esversion: 6*/
'use strict';

const Waterline = require('waterline');

const Users = Waterline.Collection.extend({
  identity: 'users_1',
  schema: true,
  connection: 'arangodb',

  attributes: {

    name: {
      type: 'string',
      required: true
    },

    complex: { type: 'object' }

  }
});

module.exports = Users;
