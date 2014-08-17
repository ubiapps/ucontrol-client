"use strict";
var shell = require("shelljs");
var logger = require("winston");

var initialise = function(logName) {
  logger.add(logger.transports.File, { filename: logName + ".log" });
};

// Reboot after the given time interval.
var scheduleReboot = function(timeout) {
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
  };

  if (elapse > 0) {
    logger.info("requesting reboot in " + (elapse/1000/60/60) + " hrs");
  } else {
    logger.info("rebooting NOW");
  }

  setTimeout(reboot,elapse);
};

module.exports = {
  initialise: initialise,
  logger: logger,
  scheduleReboot: scheduleReboot
};