"use strict";

var config = require("../common/config");
var shell = require("shelljs");
var utils = require("../common/utils");
var logger = {
  info: require("debug")("boot"),
  error: require("debug")("error:boot")
};

// Executes npm install
function installUpdate() {
  logger.info("installing update");

  shell.exec("npm install --loglevel verbose", function(code, output) {
    if (code === 0) {
      logger.info("update installed");
      config.setDiagnostics("npmFailCount",0);
      utils.scheduleReboot(0);
    } else {
      logger.error("npm install failed");
      config.setDiagnostics("npmFailCount", config.getDiagnostics("npmFailCount",0) + 1);
      // Could be network error?
      utils.scheduleReboot(config.get().networkErrorRebootTime * 60 * 1000);
    }
  });
}

// Changes the working directory to be the project root.
function setWorkingDirectory() {
  logger.info("setting working directory");
  logger.info("changing to : " + __dirname);
  shell.cd(__dirname);
  shell.cd("..");
  logger.info("now in directory: " + shell.pwd());
}

// Executes git fetch on project repository.
function checkUpdate() {
  logger.info("checking for update...");
  var upToDate = false;

  var gitFailure = function(cmd) {
    logger.error("git " + cmd + " command failed");
    config.setDiagnostics("gitFailCount",config.getDiagnostics("gitFailCount",0) + 1);
    // Now what? Could be network error?
    startMonitor();
  };

  shell.exec("git fetch -v origin " + config.get().remoteBranch + ":refs/remotes/origin/" + config.get().remoteBranch, function(code,output) {
    logger.info("git fetch finished: " + code + " output: " + output);
    if (code === 0) {
      config.setDiagnostics("checkForUpdates",false);

      // Determine if anything new was fetched.
      upToDate = output.indexOf("up to date") !== -1;
      if (upToDate) {
        logger.info("already up to date");
      } else {
        logger.info("update received");
      }

      // Reset local index to remote master.
      shell.exec("git reset --hard origin/" + config.get().remoteBranch, function(code,output) {
        logger.info("git reset finished: " + code + " output: " + output);
        if (code === 0) {
          config.setDiagnostics("gitFailCount",0);

          // If an update was received we need to install it.
          if (upToDate && config.getDiagnostics("npmFailCount",0) === 0) {
            logger.info("npm install not required");
            startMonitor();
          } else {
            // npm install update received - install it.
            logger.info("npm install required");
            installUpdate();
          }
        } else {
          gitFailure("reset");
        }
      });
    } else {
      gitFailure("fetch");
    }
  });
}

// Launch the monitor script using forever
function startMonitor() {
  logger.info("modprobe");
  shell.exec("modprobe cp210x", function(code,output) {
    if (code === 0) {
      logger.info("modprobe OK");
    } else {
      logger.info("modprobe failed with error code: " + code + " and output " + output);
    }
  });

  logger.info("starting monitor");
  shell.exec("DEBUG=error:* forever start --uid monitor -a monitor/monitor.js",function(code,output) {
    if (code === 0) {
      logger.info("monitor started ok");
    } else {
      logger.error("monitor failed to start with error code: " + code + " and output: " + output);
    }
  });

  // TOBY - disabled this for the time being. It's not really feasible to connect remotely when using 2G/3G.
  //logger.info("starting admin UI");
  //shell.exec("forever -c node start -a -l configForever.log -o configOut.log -e configError.log configuration/setup.js",function(code,output) {
  //  if (code === 0) {
  //    logger.info("admin UI started ok");
  //  } else {
  //    logger.error("admin UI failed to start with error code: " + code + " and output: " + output);
  //  }
  //});
}

logger.info("ucontrol booting...");
setWorkingDirectory();

if (config.getDiagnostics("checkForUpdates") === true) {
  // Wait a while before checking updates - to all 3g connection to establish.
  logger.info("will check for updates in 60 secs");
  setTimeout(checkUpdate,60000);
} else {
  startMonitor();
}
