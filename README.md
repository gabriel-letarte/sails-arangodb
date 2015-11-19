![image_squidhome@2x.png](http://i.imgur.com/RIvu9.png)

# sails-arangodb

Provides easy access to `arangodb` from Sails.js & Waterline.

This module is a Waterline/Sails adapter, an early implementation of a
rapidly-developing, tool-agnostic data standard. Its goal is to
provide a set of declarative interfaces, conventions, and
best-practices for integrating with all sorts of data sources.
Not just database s-- external APIs, proprietary web services, or even hardware.

Strict adherence to an adapter specification enables the (re)use of
built-in generic test suites, standardized documentation, reasonable
expectations around the API for your users, and overall, a more
pleasant development experience for everyone.

This adapter has been developed pretty quickly and not at all tested
well.

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

###### `quote()`

Quotes a value for AQL.

###### `join()`

###### `query()`

Raw AQL query.

###### `createEdge(@from,@to,@options,@callback)`
Creates edge between specified two models using "@from" and "@to"
(which can be objects or strings). NOTE: There's a current bug in
arangojs library 3.3.0 which prevents creation of edges without a patch.

usage:
  ```javascript
 //Assume a model named "Post"
  Post.createEdge(post, comment, {'data': { 'additional : 'data' }},function(err, result){

  });
  ```

###### `deleteEdges(@from,@to,@options,@callback)`
Deletes edges between specified two models using "@from" and "@to".

usage:
  ```javascript
 //Assume a model named "Post"
  Post.deleteEdges(post, comment ,null,function(err, result){

  });
  ```

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

Check out **Connections** in the Sails docs, or see the `config/connections.js` file in a new Sails project for information on setting up adapters.

### Sample connection configuration in connection.js
```javascript

localArangoDB: {
    adapter: 'sails-arangodb',

    host: 'localhost',
    port: 8529,

    user: 'root',
    password: 'CgdYW3zBLy5yCszR',

    database: '_system'

    graph: 'examplegraph'            // ArangoDB specific
    collection: 'examplecollection'  // ArangoDB specific
}
```



### License

**[MIT](./LICENSE)**
&copy; 2014 Taneli Leppä ([rosmo](http://github.com/rosmo)) & [thanks to]
[vjsrinath](http://github.com/vjsrinath) & [thanks to]
[balderdashy](http://github.com/balderdashy), [Mike McNeil](http://michaelmcneil.com), [Balderdash](http://balderdash.co) & contributors

This adapter has been developed using [vjsrinath](http://github.com/vjsrinath)'s sails-orientdb as a template.

[Sails](http://sailsjs.org) is free and open-source under the [MIT License](http://sails.mit-license.org/).


