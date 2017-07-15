![image_squidhome@2x.png](http://i.imgur.com/RIvu9.png)

# sails-arangodb

Provides easy access to `ArangoDB` from Sails.js & Waterline.

Take a look at <a href="https://github.com/gabriel-letarte/sails-arangodb-demo">
sails-arangodb-demo</a> for more up-to-date examples.

This module is a Waterline/Sails adapter, an early implementation of a
rapidly-developing, tool-agnostic data standard. Its goal is to
provide a set of declarative interfaces, conventions, and
best-practices for integrating with all sorts of data sources.
Not just database s-- external APIs, proprietary web services, or even hardware.

Strict adherence to an adapter specification enables the (re)use of
built-in generic test suites, standardized documentation, reasonable
expectations around the API for your users, and overall, a more
pleasant development experience for everyone.

This adapter has been developed pretty quickly and may contain bugs.

### Installation

To install this adapter, run:

```sh
$ npm install sails-arangodb
```

### Usage

This adapter exposes the following methods:

###### `find()`

###### `create()`

###### `update()`

###### `destroy()`

###### `createGraph()` # Create a Named Graph

###### `neighbors()`  # Experimental, method signature is subject to change

###### `createEdge()` # Experimental, method signature is subject to change

###### `deleteEdge()` # Experimental, method signature is subject to change

### Connection

Check out **Connections** in the Sails docs, or see the `config/connections.js` file in a new Sails project for information on setting up adapters.

in connection.js
```javascript

localArangoDB: {
    adapter: 'sails-arangodb',

    host: 'localhost',
    port: 8529,

    user: 'root',
    password: 'CgdYW3zBLy5yCszR',

    database: '_system'

    collection: 'examplecollection'  // ArangoDB specific
}
```

### Schema for Graphs

#### Defining a Named Graph in the Schema
```
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

```
If a model has an attribute called `$edgeDefinitions` then the model becomes a named
graph.  Any further attributes are ignored.

[See tests](tests/) for further examples.

### Unit Testing

To run unit-tests every time you save a change to a file, simply:
```
$ gulp
```

One off run of sails-arangodb specific tests (same as above):
```
$ gulp test  # or mocha
```

To run full test suite (including the waterline adapter compliance tests):
```
$ gulp full
```
(Important: you must create a test.json file for your local db instance first - see [test/README.md](test/README.md))

To run just the waterline adapter compliance tests:
```
$ gulp waterline
```

Generate api jsdocs:
```
$ gulp docs
```
(these are also generated in the default 'watch' mode above)

---

# Older doc

### Example model definitions

```javascript
/**
 * User Model
 *
 * The User model represents the schema of authentication data
 */
module.exports = {

    // Enforce model schema in the case of schemaless databases
    schema: true,
    tableName: 'User',
    attributes: {
        id: {
            type: 'string',
            primaryKey: true,
            columnName: '_key'
        },
        username: {
            type: 'string',
            unique: true
        },
        email: {
            type: 'email',
            unique: true
        },
        profile: {
            collection: 'Profile',
            via: 'user',
            edge: 'userCommented'
        }
    }
};
```
```javascript

// api/models/Profile.js
module.exports = {
    tableName: 'profile',
    attributes: {
        id: {
            type: 'string',
            primaryKey: true,
            columnName: '_key'
        },
        user: {
            model: "User",
            required: true
        },
        familyName: {
            type: 'string'
        },
        givenName: {
            type: 'string'
        },
        profilePic: {
            type: 'string'
        }
    }
    }

// api/models/User.js
module.exports = {
    tableName: 'user',
    attributes: {
        id: {
            type: 'string',
            primaryKey: true,
            columnName: '_key'
        },
        username: {
            type: 'string'
        },
        profile: {
            collection: 'profile',
            via: 'user',
            edge: 'profileOf'
        }
    }
};
;
```


### License

**[MIT](./LICENSE)**
&copy; 2016 Gabriel Letarte ([gabriel-letarte](http://github.com/gabriel-letarte)) & [thanks to]
Taneli Leppä ([rosmo](http://github.com/rosmo)) & [thanks to]
[vjsrinath](http://github.com/vjsrinath) & [thanks to]
[balderdashy](http://github.com/balderdashy), [Mike McNeil](http://michaelmcneil.com), [Balderdash](http://balderdash.co) & contributors

This adapter has been developed using [vjsrinath](http://github.com/vjsrinath)'s sails-orientdb as a template.

[Sails](http://sailsjs.org) is free and open-source under the [MIT License](http://sails.mit-license.org/).


