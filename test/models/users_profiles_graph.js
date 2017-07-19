/*jshint node: true, esversion: 6*/
'use strict';

const Waterline = require('waterline');

const UsersProfilesGraph = Waterline.Collection.extend({
  identity: 'users_profiles_graph',
  schema: true,
  connection: 'arangodb',

  attributes: {
    // this is a named graph
    $edgeDefinitions: [
      {
        collection: 'users_profiles',
        from: ['users_1'],
        to: ['profiles_1']
      }
    ]
  }

});

module.exports = UsersProfilesGraph;
