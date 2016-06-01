var log = require("debug")("command-processor");
var errLog = require("debug")("command-processor:error");
var SMSMonitor = require("../sms-monitor");
var shell = require("shelljs");
var util = require("util");

var monitor = new SMSMonitor();

monitor.on("msg", function(msg) { 
  log("message received: %j", msg);
  // Strip leading command prefix "#"
  var command = msg.body.substr(1);
  // Check this is a shell command.
  if (command.indexOf("!") === 0) {
    executeShellCommand(msg);
  } else {
    switch (command) {
      case "status":
        getInterliNQStatus(msg);
        break;
      default:
        log("unknown non-shell command => ignoring %s", command);
        break;
    }    
  }
});

monitor.start(10000);

var getInterliNQStatus = function(msg) {
  log("checking interliNQ status");
  var tmp = shell.exec("ps aux | grep ucontrol-client/monitor/monitor.js | grep -v grep | wc -l");
  log("command response: %j", tmp);
  var monitorStatus = (tmp.stdout.trim() === "0" ? "not running": "ok");
  var localDate = shell.exec("date").stdout;
  
  var status = util.format("monitor: %s\r\ndate: %s", monitorStatus, localDate);
  
  // Send SMS response.
  monitor.sendResponse(msg.from, status, msg.id);
};

var executeShellCommand = function(msg) {
  var shellCommand = msg.body.substr(2);
  log("executing shell command '%s'", shellCommand);
  shell.exec(shellCommand, function(code, output) {
    log("shell exec result code %d [%s]", code, output);
    // Send SMS response.
    monitor.sendResponse(msg.from, output, msg.id);
  });    
};