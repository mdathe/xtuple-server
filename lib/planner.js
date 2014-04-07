(function () {
  'use strict';

  var planner = exports;

  var fs = require('fs'),
    path = require('path'),
    pgcli = require('./pg-cli'),
    format = require('string-format'),
    os = require('os'),
    clc = require('cli-color'),
    exec = require('execSync').exec,
    S = require('string'),
    _ = require('underscore'),
    logo_orange = fs.readFileSync(path.resolve(__dirname, './x-orange.ascii'), 'ascii').trim(),
    logo_blue = fs.readFileSync(path.resolve(__dirname, './x-blue.ascii'), 'ascii').trim(),
    logo_mono = fs.readFileSync(path.resolve(__dirname, './x.ascii'), 'ascii').trim(),
    logo_lines= _.map(
      _.object(logo_orange.split('\n'), logo_blue.split('\n')),
      function (blue_line, orange_line) {
        return orange_line + blue_line;
      }
    ),
    tasks = { },
    current = 1;

  _.extend(planner, /** @exports planner */ {

    logfile: path.resolve('install.log'),

    /**
     * Advance progress bar 
     * @protected
     */
    log_progress: function (state) {
      //console.log(clc.reset);
      /*
      _.each(_.range(current), function (i) {
        console.log(logo_lines[i]);
      });

      _.each(_.tail(logo_lines, current), function (i) {
        console.log();
      });
      */

      console.log();
      planner.log({
        prefix: '{phase}.{task}'.format(state),
        msg: state.msg || 'Installing... '
      }, true);

      if (/xt/.test(state.phase)) {
        current += 2;
      }
      else {
        current++;
      }
    },

    format_prefix: function(phaseName, taskName) {
      return phaseName + '.' + taskName;
    },

    /**
     * Log TODO use standard logging lib
     */
    log: function (payload, stdout) {
      var output = '[{prefix}] {msg}'.format({
        prefix: payload.prefix || 'xtuple',
        msg: _.isObject(payload.msg) ? JSON.stringify(payload.msg, null, 2) : payload.msg
      });
      fs.appendFileSync(planner.logfile, output + os.EOL);
      if (stdout) {
        console.log(output);
      }
    },

    /**
     * Log an error and kill the process
     */
    die: function (payload) {
      //console.log(clc.reset);
      planner.log({ msg: clc.red.bold(payload.msg), prefix: payload.prefix }, true);
      console.log();
      process.exit(1);
    },

    /**
     * Invoke a function on each task
     * @callback (task, phaseName, taskName);
     */
    eachTask: function (plan, func) {
      _.map(plan, function (phase) {
        var phaseName = phase.name;
        _.map(phase.tasks, function (taskName) {
          try {
            if (!tasks[phaseName]) {
              tasks[phaseName] = require('../tasks/' + phaseName);
            }
            return func(tasks[phaseName][taskName], phaseName, taskName);
          }
          catch (e) {
            planner.log({ msg: e.stack, prefix: planner.format_prefix(phaseName, taskName) });
            planner.log({ msg: 'See log for error details.', prefix: planner.format_prefix(phaseName, taskName) }, true);
            planner.die({ msg: e.message, prefix: planner.format_prefix(phaseName, taskName) });
          }
        });
      });
    },

    /**
     * Run planner with the  specified plan and options.
     */
    install: function (plan, options) {
      // beforeInstall
      planner.eachTask(plan, function (task, phaseName, taskName) {
        planner.log_progress({ phase: phaseName, task: taskName, msg: 'Before Install...' });
        task.beforeInstall(options);
      });

      // run planner tasks
      planner.eachTask(plan, function (task, phaseName, taskName) {
        planner.log_progress({ phase: phaseName, task: taskName, msg: 'Before Task...' });
        task.beforeTask(options);

        planner.log_progress({ phase: phaseName, task: taskName, msg: 'Install...' });
        task.doTask(options);

        planner.log_progress({ phase: phaseName, task: taskName, msg: 'After Task...' });
        task.afterTask(options);
      });

      // afterInstall
      planner.eachTask(plan, function (task, phaseName, taskName) {
        planner.log_progress({ phase: phaseName, task: taskName, msg: 'After Install...' });
        task.afterInstall(options);
      });
    }
  });

})();