var path = require('path'),
  exec = require('child_process').execSync,
  moment = require('moment'),
  semver = require('semver'),
  r = require('node-latest-version'),
  _ = require('lodash'),
  crontab = require('cron-tab');

var util = module.exports = {

  /**
   * Return a xtuple server task; npm install if not found
   */
  requireTask: function (phaseName, taskName) {
    var name = 'xtuple-server-' + phaseName + '-' + taskName;
    try {
      return require(name);
    }
    catch (e) {
      log.info('npm install', name);
      exec('npm install --no-global '+ name);
    }
    return require(name);
  },

  /**
   * Resolve the latest node version for the xtuple dist
   */
  resolveNodeVersion: function (options, dir) {
    var pkg = require(path.resolve(dir || options.xt.coredir, 'package'));
    var node = pkg.engines && pkg.engines.node;
    options.xt.nodeVersion = r.satisfy.sync(node);
    log.info('xt-install', 'using node', options.xt.nodeVersion);
  },

  /**
   * Invoke a function on each task
   * @callback func (task, phase, taskName);
   */
  eachTask: function (plan, func, options) {
    _.each(plan, function (phase) {
      _.each(phase.tasks, function (taskName) {
        log.silly(phase.name + '.' + taskName, 'eachTask');
        return func(util.requireTask(phase.name, taskName), phase, taskName);
      });
    });
  },

  /**
   * Create a crontab entry for a xtuple-server cli command
   * @public
   */
  createJob: function (plan, type, schedule, argv, options) {
    var cmd = [ 'sudo', 'xtuple-server', plan, type].concat(argv).join(' ');
    var tab = crontab.load.sync(options.xt.name);
    var job = tab.create(cmd, schedule, 'created during '+ options.planName);
    tab.save.sync();
    return job;
  },

  /**
   * Map edition -> extension[]. These lists of extensions are in addition
   * to the 'core' extensions already installed by default.
   */
  editions: {
    core: [ ],
    manufacturing: [
      'inventory',
      'manufacturing'
    ],
    distribution: [
      'inventory',
      'distribution'
    ],
    enterprise: [
      'inventory',
      'distribution',
      'manufacturing'
    ]
  },

  // extension path mapping
  // TODO deprecate with npm modularization
  extension_prefixes: {
    'private': [
      'manufacturing',
      'inventory',
      'distribution'
    ],
    'xtuple': [

    ]
  },

  /**
   * Generate the build command
   * TODO require build_app module directly
   *
   * @param db { filename: PATH, dbname: STRING, type: 's'/'b' }
   * @param options the typical options object
   * @static
   */
  getDatabaseBuildCommand: function (db, options) {
    var buildApp = path.resolve(options.xt.coredir, 'scripts/build_app.js');
    var cmd = [
        'cd', options.xt.coredir,
        '&& sudo -u', options.xt.name, 'node', buildApp,
        '-c', options.xt.configfile,
        '-d', db.dbname,
        '-i -'+ db.type, db.filename
      ].join(' ');

    log.verbose('lib.util getDatabaseBuildCommand', cmd);

    return cmd;
  },

  /**
   * Generate the extension installation command
   * TODO require build_app module directly
   *
   * @public
   */
  getExtensionBuildCommand: function (db, options, extension) {
    var buildApp = path.resolve(options.xt.coredir, 'scripts/build_app.js');
    var prefix = _.find(_.keys(util.extension_prefixes), function (key) {
      return _.contains(util.extension_prefixes[key], extension);
    });
    var extensionPath = path.resolve(options.xt.userdist, prefix + '-extensions', 'source', extension);
    var cmd = [
      'cd', options.xt.coredir, '&&',
      'sudo -u', options.xt.name, 'node', buildApp,
      '-c', options.xt.configfile,
      '-e', extensionPath, '-f',
      '-d', db.dbname
    ].join(' ');

    log.verbose('lib.util getExtensionBuildCommand', cmd);

    return cmd;
  },

  /**
   * Return whether this installation will install any private extensions
   */
  hasPrivateExtensions: function (options) {
    return _.intersection(
      util.extension_prefixes.private, util.editions[options.xt.edition]
    ).length > 0;
  },

  wrapModule: function (obj) {
    return 'module.exports = '+ JSON.stringify(obj, null, 2) + ';';
  },

  /**
   * Generate password using openssl rand
   * TODO use node-forge
   * @public
   */
  getPassword: function () {
    exec('sleep 1');
    var pass = exec('openssl rand 6 | base64').toString();
      
    if (!_.isEmpty(pass)) {
      return pass.trim().replace(/\W/g, '');
    }
    else {
      throw new Error('Failed to generate password: '+ JSON.stringify(pass));
    }
  },

  /**
   * Return the name of a forked database.
   *
   * @param options.pg.dbname {String}  name of database
   * @param globals           {Boolean} true if this is a backup of the cluster globals
   * @param date              {Date}    optional date object to be formatted as timestapm
   * @public
   */
  getForkName: function (options, globals, date) {
    var timestamp = (moment(date) || moment()).format('MMDDhhmm');
    var prefix = globals ? 'globals' : options.pg.dbname;

    return [ prefix, 'copy', timestamp ].join('_');
  },

  /**
   * Return path of a snapshot file
   *
   * @param options.pg.dbname       {String}  name of database
   * @param options.pg.snapshotdir  {String}  path to the snapshot directory
   * @param globals                 {Boolean} true if this is a backup of the globals
   * @param date                    {Date}    optional date object to be formatted as timestamp
   * @public
   */
  getSnapshotPath: function (options, globals, date) {
    var ext = (globals ? '.sql' : '.dir.gz');
    return path.resolve(options.pg.snapshotdir, util.getForkName(options, globals, date) + ext);
  },

  /**
   * Return an object consisting of the backup filename components.
   * @public
   */
  parseForkName: function (filename) {
    var base = path.basename(filename),
      halves = base.split('_copy_');

    return {
      original: filename,
      dbname: halves[0],
      ts: moment(halves[1], 'MMDDhhmm').valueOf()
    };
  },

  /**
   * Derive the name of the instance from the specified parameters.
   * @public
   */
  $: function (options) {
    return options.xt.name + '-' + options.xt.version.replace(/\./g, '') + '-' + options.type;
  },

  /**
   * Offset from the postgres cluster port that this server connects to,
   * default port minus postgres port.
   * (8888 - 5432)
   *
   * Interestingly:
   * (3456 mod 1111) + (5432 mod 1111) = 1111
   *
   * @memberof lib.util
   * @public
   */
  portOffset: 3456,

  /** @public */
  getServerPort: function (options) {
    return parseInt(options.pg.cluster.port) + util.portOffset;
  },

  /** @public */
  getServerSSLPort: function (options) {
    return parseInt(options.pg.cluster.port) + util.portOffset - 445;
  },

  /**
   * TODO use node-forge
   * @public
   */
  getRandom: function (bitlen) {
    return exec('openssl rand '+ bitlen +' -hex').toString();
  },

  /**
   * @return list of repositories to clone
   * @public
   */
  getRepositoryList: function (options) {
    return _.compact([
      'xtuple',
      'xtuple-extensions',
      util.hasPrivateExtensions(options) && 'private-extensions'
    ]);
  },

  getNpmPackageId: function (name, version) {
    return name + '@' + version;
  }
};
