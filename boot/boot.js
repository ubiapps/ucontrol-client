"use strict";
var forceInstall = false;

var shell = require("shelljs");
//var shell = require("./shell.js");
var config = require("../common/config.js");

// Start logger.
var logger = require("winston");
logger.add(logger.transports.File, { filename: "bootstrap.log" });

function setReboot(timeout) {
  var elapse;
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

function setWorkingDirectory() {
  logger.info("setting working directory");
  logger.info("changing to : " + __dirname);
  shell.cd(__dirname);
  shell.cd("..");
  logger.info("now in: " + shell.pwd());
}

function checkUpdate() {
  var upToDate = false;
  logger.info("checking for update...");

  var gitFailure = function(cmd) {
    logger.error("git " + cmd + " command failed");
    config.setLocal("gitFailCount",config.getLocal("gitFailCount",0) + 1);
    // Now what? Could be network error?
    setReboot(config.get().networkErrorRebootTime);
  };

  shell.exec("git fetch --all -v", function(code,output) {
    logger.info("git fetch finished: " + code + " output: " + output);
    if (code === 0) {
      upToDate = output.indexOf("up to date") !== -1;
      if (upToDate) {
        logger.info("already up to date");
      } else {
        logger.info("update received");
      }
      shell.exec("git reset --hard origin/master", function(code,output) {
        logger.info("git reset finished: " + code + " output: " + output);
        if (code === 0) {
          config.setLocal("gitFailCount",0);

          // Check if an update was received (or there is a pending install)
          if (upToDate && config.getLocal("npmFailCount",0) === 0 && forceInstall === false) {
            logger.info("npm install not required");
            startMonitor();
          } else {
            // npm install update received - install it.
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
setReboot(5*60000);
