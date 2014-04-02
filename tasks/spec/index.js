global.options = { };

describe('xTuple Installer', function () {
  var assert = require('chai').assert,
    exec = require('execSync').exec,
    _ = require('underscore'),
    path = require('path'),
    pgcli = require('../../lib/pg-cli'),
    pgPhase = require('../pg'),
    getOptions = function ($k) {
      return {
        xt: {
          version: '4.4.0',
          name: $k,
          setupdemos: true,
          appdir: path.resolve('/tmp/', 'xtmocha', '4.4.0', $k),
          adminpw: '123'
        },
        nginx: {
          incrt: path.resolve('/srv/ssl/', 'localhost' + $k +'.crt'),
          inkey: path.resolve('/srv/ssl/', 'localhost' + $k +'.key'),
          outcrt: path.resolve('/srv/ssl/', 'localhost' + $k +'.crt'),
          outkey: path.resolve('/srv/ssl/', 'localhost' + $k +'.key')
        },
        pg: {
          version: '9.1',
          host: 'localhost',
          mode: 'test',
          snapshotcount: 7,
          config: {
            slots: 1,
            shared_buffers: 128,
            temp_buffers: 8,
            max_connections: 8,
            work_mem: 1,
            maintenance_work_mem: 8,
            locale: 'en_US.UTF-8'
          }
        }
      };
    };

  /**
   * Require root prvileges
   */
  before(function () {
    assert(
      exec('id -u').stdout.indexOf('0') === 0,
      'installer tests must be run with sudo'
    );
  });

  /**
   * Create clean cluster for each test
   */
  beforeEach(function () {
    _.extend(global.options, getOptions(Math.round((Math.random() * 2e16)).toString(16)));

    pgPhase.config.run(global.options);
    pgPhase.cluster.validate(global.options);
    pgPhase.cluster.run(global.options);
  });

  afterEach(function () {
    pgcli.dropcluster(global.options.pg.cluster);
  });

  require('./sys');
  require('./pg');
  require('./nginx');
  require('./xt');
});
