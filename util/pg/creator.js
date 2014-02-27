(function () {
  'use strict';

  var os = require('os'),
    tuner = require('./tuner');

  if (os.platform() !== 'linux') {
    throw 'pgone is only supported on linux at this time';
  }

  /**
   *  params {
   *    version: 9.1,
   *    customer: 'TTOYS',
   *    users: 8,
   *    disk: 300gb,
   *  }
   */
  function setup (params) {

    var cluster = pg_createcluster(params.version, params.customer);
    // TODO parse output
      /*
      $ sudo pg_createcluster {version} kelhay
      [sudo] password for tjwebb: 
      Creating new cluster {version}/kelhay ...
        config /etc/postgresql/{version}/kelhay
        data   /var/lib/postgresql/{version}/kelhay
        locale en_US.UTF-8
        port   5437
      */

    tuner.tune(cluster);
  }

  function pg_createcluster (version, customer) {
    // $ pg_createcluster 9.1 kelhay
  }

})();

