"use strict";
var shell = require("shelljs");
var logger = {
  info: require("debug")("utils"),
  error: require("debug")("error:utils")
};

var shutdown = function() {
  logger.info("shutdown....");
  shell.exec("sudo halt");
};

// Reboot after the given time interval.
var scheduleReboot = function(timeout, cleanup) {
  var elapse;

  if (typeof timeout === "function") {
    cleanup = timeout;
  }
  // If no timeout given default to midnight.
  if (typeof timeout === "undefined" || typeof timeout === "function") {
    var midnight = new Date();
    midnight.setUTCHours(24,0,0,0);
    elapse = midnight.getTime() - Date.now();
  } else {
    elapse = timeout;
  }

  var reboot = function() {
    if (typeof cleanup === "function") {
      cleanup();
    }
    logger.info("rebooting....");
    shell.exec("sync; sudo reboot");
  };

  if (elapse > 0) {
    logger.info("requesting reboot in " + (elapse/1000/60/60) + " hrs");
  } else {
    logger.info("rebooting NOW");
  }

  setTimeout(reboot,elapse);
};

module.exports = {
  scheduleReboot: scheduleReboot,
  shutdown: shutdown,
  commands: {
    register: "r"
  }
};