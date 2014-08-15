require("shelljs/global");
var fs = require('fs');

var logger = require("winston");
logger.add(logger.transports.File, { filename: "bootstrap.log" });

function checkInstall() {
  // Has a new version been downloaded?

  // Unzip new version
}

function setReboot() {
  var midnight = new Date();
  midnight.setUTCHours(24,0,0,0);

  var elapse = midnight.getTime() - Date.now();

  var reboot = function() {
    logger.info("rebooting....");
    var exec = require("child_process").exec;
    exec("reboot");
  }

  setTimeout(reboot,elapse);
}

function installUpdate() {
  logger.info("installing update");

  exec("npm install", function(code, output) {
    if (code === 0) {
      logger.info("update installed");
    } else {
      logger.error("npm install failed");
    }
  });
}

function checkUpdate() {
  logger.info("checking for update...");
  logger.info(pwd());

  exec("git pull", function(code,output) {
    logger.info("git finished: " + code + " output: " + output);
    if (code === 0) {
      if (output.toLowerCase().indexOf("already up-to-date") !== -1) {
        logger.info("no update found");
      } else {
        installUpdate();
      }
    } else {
      logger.error("git pull command failed");
    }
  });
}

logger.info("ucontrol starting...");
//checkUpdate();

//var out = fs.openSync('./out.log', 'a');
//var err = fs.openSync('./out.log', 'a');
//
//var cp = require('child_process');
//var child = cp.spawn('forever', ["start","./spawn.js"], { detached: true, stdio: [ 'ignore', out, err ] });
//child.unref();

exec("forever -c node start spawn.js",function(code,output) {
  logger.info("exiting");
});

