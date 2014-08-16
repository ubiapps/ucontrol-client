"use strict";

var fs = require("fs");
var path = require("path");
var FS20 = require("./fs20/cul");
var config = require("../common/config");
var FHTAdapterClass = require("./fs20/fhtAdapter");
var FS20DeviceClass = require("./fs20/fs20Device");
var pending = [];
var pendingPacketCount = 0;
var pendingFileCount = 0;
var fhtMonitor = null;
var fs20Device = null;
var measuredTemp = 0.0;

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

var getFS20Port = function() {
  return config.getLocal("fs20Port","/dev/ttyAMA0");
};

var startFHT = function() {
  if (fhtMonitor === null) {
    try {
      fs20Device = new FS20DeviceClass(config.getLocal("fs20Code"));
      fhtMonitor = new FS20(getFS20Port());
      fhtMonitor.on("packet", onPacketReceived);
      fhtMonitor.start();
      setTimeout(transmitData,config.get().transmitFrequency);
    } catch (e) {
      logger.error("failed to open transceiver port: " + getFS20Port() + " error is: " + JSON.stringify(e));
    }
  } else {
    logger.error("fhtMonitor already running");
  }
};

var createFolder = function(name) {
  var folderPath = path.join(__dirname,name);
  fs.mkdir(folderPath);
};

var initialise = function() {
  // Check log folders.
  createFolder("logs");
  createFolder("transmit");
  createFolder("pending");

  var devKey = config.getLocal("devKey","");
  if (devKey.length === 0) {
    request.post(config.get().server + "/register", { json: {} }, function(err,resp,body) {
      if (err !== null || body.id.length === 0) {
        logger.error("failed to register with server: " + JSON.stringify(err));
        setTimeout(initialise,config.get().networkErrorRebootTime);
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

  // Add packet to catch-all log file.
  var logFile = path.join(__dirname,'logs/fhz-' + packetDate.getUTCDate() + '-' + packetDate.getUTCMonth() + '-' + packetDate.getUTCFullYear() + '.log');
  fs.appendFileSync(logFile,timestamp + " " + packet.toString() + "\n");

  var adapter = new FHTAdapterClass(packet);
  if (adapter.getDeviceCode().toLowerCase() === config.getLocal("fs20Code").toLowerCase()) {
    adapter.applyTo(fs20Device);

    if (measuredTemp !== fs20Device.getData("measuredTemp")) {
      measuredTemp = fs20Device.getData("measuredTemp");

      // Add packet to pending file
      var pendingFile = path.join(__dirname,'pending/' + pendingFileCount + '.log');
      fs.appendFileSync(pendingFile,timestamp + " " + measuredTemp + "\n");

      pendingPacketCount++;

      if (pendingPacketCount === config.get().pendingPacketThreshold) {
        fs.renameSync(pendingFile,path.join(__dirname,'transmit/' + pendingFileCount + '.log'));
        pendingFileCount++;
        pendingPacketCount = 0;
      }
    }
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

initialise();

