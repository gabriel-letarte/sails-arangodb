/*jshint node: true, esversion: 6*/
'use strict';

const Waterline = require('waterline');

const UsersProfilesGraph = Waterline.Collection.extend({
  identity: 'users_users_graph',
  schema: true,
  connection: 'arangodb',

  attributes: {
    // this is a named graph
    $edgeDefinitions: [
      {
        collection: 'users_know_users',
        from: ['users_1'],
        to: ['users_1']
      }
    ]
  }

});

module.exports = UsersProfilesGraph;
