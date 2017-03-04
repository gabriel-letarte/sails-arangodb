Running tests

copy test-example.json to test.json and edit appropriately for your instance of arangodb, e.g.:

{
  "host": "localhost",
  "port": 8529,
  "user": "test",
  "password": "test",
  "database": {
    "name": "test",
    "graph": "test"
  }
}

{
  "host": "localhost",
  "port": 8529,
  "user": "test",
  "password": "test",
  "database": "test"
}