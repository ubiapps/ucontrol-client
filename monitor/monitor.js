"use strict";

var fs = require("fs");
var path = require("path");
var FS20 = require("./fs20/cul");
var config = require("../common/config")
var pending = [];
var pendingCounter = 0;
var pendingThreshold = 10;
var fhtMonitor = null;

var logger = require("winston");
logger.add(logger.transports.File, { filename: "client.log" });

var requestLib = require("request");
var request = requestLib.defaults({
  headers: {
    "x-api-key": config.get()["x-api-key"]
  },
  auth: {
    user: config.get().user,
    pass: config.get().pass
  }
});

var startFHT = function() {
  if (fhtMonitor === null) {
    try {
      fhtMonitor = new FS20(config.get().fs20Port);
      fhtMonitor.on("packet", onPacketReceived);
      fhtMonitor.start();
    } catch (e) {
      logger.error("failed to open transceiver port: " + config.get().fs20Port + " error is: " + JSON.stringify(e));
    }
  } else {
    logger.error("fhtMonitor already running");
  }
};

var initialise = function() {
  var devKey = config.getLocal("devKey","");
  if (devKey.length === 0) {
    request.post(config.get().server + "/register", { json: {} }, function(err,resp,body) {
      if (err !== null || body.id.length === 0) {
        logger.error("failed to register with server: " + JSON.stringify(err));
        setTimeout(initialise,config.get().transmitFrequency);
      } else {
        config.setLocal("devKey",body.id);
        startFHT();
      }
    });
  } else {
    startFHT();
  }
};

function onPacketReceived(timestamp, packet) {
  // Received a new packet - store it.
  var packetDate = new Date(timestamp);

  // Add packet to running log file.
  var d = new Date(packetDate.getUTCFullYear(), packetDate.getUTCMonth(), packetDate.getUTCDate(),  packetDate.getUTCHours(), packetDate.getUTCMinutes(), packetDate.getUTCSeconds());
  var logFile = path.join(__dirname,'logs/fhz-' + d.getDate() + '-' + d.getMonth() + '-' + d.getFullYear() + '.log');
  fs.appendFileSync(logFile,d.getTime() + " " + packet.toString() + "\n");

  // Add packet to pending file
  var pendingFile = path.join(__dirname,'pending/' + pendingCounter + '.log');
  fs.appendFileSync(pendingFile,d.getTime() + " " + packet.toString() + "\n");

  pending.push({
    timestamp: d.getTime(),
    payload: packet.toString()
  });

  if (pending.length === pendingThreshold) {
    fs.renameSync(pendingFile,path.join(__dirname,'transmit/' + pendingCounter + '.log'));
    pendingCounter++;
    pending = [];
  }
}

function doTransmit(files,index,cb) {
  var file = files[index];
  var transmitData = fs.readFileSync(file).toString();

  request.post(config.get().server + "/data/" + config.getLocal("devKey"), { json: { data: transmitData }}, function(err,resp,body) {
    if (err !== null) {
      logger.error("failed to post data to server: " + JSON.stringify(err));
      cb();
    } else if (!body.hasOwnProperty("ok") || body.ok !== true) {
      logger.error("failed to post data to server: " + JSON.stringify(body));
      cb();
    } else {
      logger.info("transmit successful: " + file);
      fs.unlink(file);
      index++;
      if (index === files.length) {
        cb();
      } else {
        doTransmit(files,index,cb);
      }
    }
  });
}

function transmitData() {
  var transmitDir = path.join(__dirname,'transmit');
  var transmitFiles = fs.readdirSync(transmitDir).map(function(f) { return path.join(transmitDir,f); });
  if (transmitFiles.length > 0) {
    doTransmit(transmitFiles,0,function() {
      setTimeout(transmitData,config.get().transmitFrequency);
    });
  } else {
    logger.info("no files to transmit");
    setTimeout(transmitData,config.get().transmitFrequency);
  }
}

setTimeout(transmitData,config.get().transmitFrequency);
