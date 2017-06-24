/*jslint browser: true, node: true, vars: true, esversion: 6*/
'use strict';

var gulp = require('gulp'),
    mocha = require('gulp-mocha'),
    gulpLoadPlugins = require('gulp-load-plugins'),
    plugins = gulpLoadPlugins(),
    jsdoc = require('gulp-jsdoc3'),
    del = require('del'),
    watch = require('gulp-watch'),
    batch = require('gulp-batch'),
    spawn = require('child_process').spawn;

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

var watching = false;

gulp.task('mocha', function () {
  return gulp.src(['test/**/*.js', '!test/models/*.js', '!test/integration/runner.js'], { read: false })
  .pipe(mocha({
    reporter: 'spec',
    globals: {
      should: require('should').noConflict()
    }
  }))
  .once('error', function (err) {
    console.log('mocha errored... ');
    if (watching) {
      this.emit('end');
    } else {
      process.exit(1);
    }
  })
  .once('end', function () {
    console.log('mocha ended...');
    if (watching) {
      this.emit('end');
    } else {
      process.exit(0);
    }
  });
});

gulp.task('waterline', function (done) {
  var cp = spawn('/usr/bin/npm', ['test'], {stdio: 'inherit'});
  cp.on('close', (code) => {
    console.log('waterline adapter tests completed rc:', code);
    done();
  });
});

gulp.task('test', ['mocha']);
gulp.task('testwdocs', ['mocha', 'docs']);
gulp.task('full', ['mocha', 'waterline']);

gulp.task('watch', function () {
  watching = true;
  watch([
    'lib/**',
    'test/**'
  ], {
    ignoreInitial: false,
    verbose: false,
    readDelay: 1500 // filter duplicate changed events from Brackets
  }, batch(function (events, done) {
    gulp.start('testwdocs', done);
  }));
});
gulp.task('default', ['watch']);

gulp.task('docs', function (cb) {
  del(['./jsdocs/**']);
  gulp.src(['lib/*.js', './README.md'])
  .pipe(jsdoc(
    {
      opts: {
        destination: './jsdocs'
      },
      plugins: [
        'plugins/markdown'
      ],
      templates: {
        'cleverLinks': false,
        'monospaceLinks': false,
        'default': {
          'outputSourceFiles': true
        },
        'path': 'ink-docstrap',
        'theme': 'cerulean',
        'navType': 'vertical',
        'linenums': true,
        'dateFormat': 'MMMM Do YYYY, h:mm:ss a'
      }
    },
    cb
  ));
});
