"use strict";

var config = require("../common/config.js");
var shell = require("shelljs");
var logger = require("winston");
logger.add(logger.transports.File, { filename: "bootstrap.log" });

/**********************************************************
 * DEBUG ONLY
**********************************************************/
/*
var shell = require("./shell.js"); // also need to install shelljs locally
var forceInstall = false; // force npm install
*/
/**********************************************************/

// Reboots after the given time interval.
function setReboot(timeout) {
  logger.info("requesting reboot");

  var elapse;
  // If no timeout given default to midnight.
  if (typeof timeout === "undefined") {
    var midnight = new Date();
    midnight.setUTCHours(24,0,0,0);
    elapse = midnight.getTime() - Date.now();
  } else {
    elapse = timeout;
  }

  var reboot = function() {
    logger.info("rebooting....");
    shell.exec("sudo reboot");
  }

  setTimeout(reboot,elapse);
}

// Executes npm install
function installUpdate() {
  logger.info("installing update");

  shell.exec("npm install", function(code, output) {
    if (code === 0) {
      logger.info("update installed");
      config.setLocal("npmFailCount",0);
      shell.exec("reboot");
    } else {
      logger.error("npm install failed");
      config.setLocal("npmFailCount", config.getLocal("npmFailCount",0) + 1);

      // Could be network error?
      setReboot(config.get().networkErrorRebootTime);
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
    config.setLocal("gitFailCount",config.getLocal("gitFailCount",0) + 1);
    // Now what? Could be network error?
    setReboot(config.get().networkErrorRebootTime);
  };

  shell.exec("git fetch -v origin " + config.get().remoteBranch, function(code,output) {
    logger.info("git fetch finished: " + code + " output: " + output);
    if (code === 0) {
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
          config.setLocal("gitFailCount",0);

          // If an update was received we need to install it.
          if (upToDate && config.getLocal("npmFailCount",0) === 0 && forceInstall === false) {
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
  logger.info("starting monitor");

  shell.exec("forever -c node start monitor/monitor.js",function(code,output) {
    if (code === 0) {
      logger.info("monitor started ok");
    } else {
      logger.error("monitor failed to start with error code: " + code + " and output: " + output);
    }
  });
}

logger.info("ucontrol booting...");
setWorkingDirectory();
checkUpdate();
setReboot();
