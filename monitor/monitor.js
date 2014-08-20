"use strict";

var fs = require("fs");
var path = require("path");
var FS20 = require("./fs20/cul");
var config = require("../common/config");
var FHTAdapterClass = require("./fs20/fhtAdapter");
var FS20DeviceClass = require("./fs20/fs20Device");
var utils = require("../common/utils");
utils.initialise("monitor");

var logger = utils.logger;
var pending = [];
var pendingPacketCount = 0;
var pendingFileCount = 0;
var fhtMonitor = null;
var fs20Device = null;
var measuredTemp = 0.0;

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

var initDevice = function() {
  // Send temperature set point request.
  var deviceCode = config.getLocal("fs20Code","");
  if (deviceCode.length > 0) {
    var msg = deviceCode + "41" + "0034";
    logger.info("set point on " + deviceCode + " : " + msg);
    fhtMonitor.writeFHT(msg);
  }
};

var startFHT = function() {
  if (fhtMonitor === null) {
    logger.info("starting fht monitor");
    try {
      fs20Device = new FS20DeviceClass(config.getLocal("fs20Code"));
      fhtMonitor = new FS20(getFS20Port());
      fhtMonitor.on("packet", onPacketReceived);
      fhtMonitor.start();
      setTimeout(transmitData,config.get().transmitFrequency);
      setTimeout(initDevice,10000);
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
  // Schedule re-boot at midnight.
  logger.info("scheduling reboot");
  utils.scheduleReboot();

  // Ensure log folders exist.
  logger.info("checking log folders");
  createFolder("logs");
  createFolder("transmit");
  createFolder("pending");

  // Clear pending folder.
  logger.info("transmitting pending logs");
  var pendingFiles = fs.readdirSync(path.join(__dirname,"pending"));
  for (var i = 0, len = pendingFiles.length; i < len; i++) {
    var pendingFile = pendingFiles[i];
    fs.renameSync(path.join(__dirname,"pending",pendingFile),path.join(__dirname,"transmit", pendingFile));
  }

  // Reset transmission data count.
  config.setLocal("sessionTransmit",0);

  // Reset seen device list.
  config.setLocal("seenDevices",{});

  logger.info("checking device key");
  var devKey = config.getLocal("devKey","");
  if (devKey.length === 0) {
    logger.info("registering device");
    request.post(config.get().server + "/register", { json: {} }, function(err,resp,body) {
      if (err !== null || body.id.length === 0) {
        logger.error("failed to register with server: " + JSON.stringify(err));
        setTimeout(initialise,config.get().networkErrorRebootTime);
      } else {
        logger.info("got device key: " + body.id);
        config.setLocal("devKey",body.id);
        startFHT();
      }
    });
  } else {
    startFHT();
  }
};

function deviceSeen(devCode) {
  var seen = config.getLocal("seenDevices",{});
  if (!seen.hasOwnProperty(devCode)) {
    seen[devCode] = true;
    config.setLocal("seenDevices",seen);
  }
}

function onPacketReceived(timestamp, packet) {
  // Received a new packet - store it.
  var packetDate = new Date(timestamp);

  // Add packet to catch-all log file.
  var logFile = path.join(__dirname,'logs/fhz-' + packetDate.getUTCDate() + '-' + packetDate.getUTCMonth() + '-' + packetDate.getUTCFullYear() + '.log');
  fs.appendFileSync(logFile,timestamp + " " + packet.toString() + "\n");

  var adapter = new FHTAdapterClass(packet);
  var deviceCode = adapter.getDeviceCode().toUpperCase();
  deviceSeen(deviceCode);

  if (deviceCode === config.getLocal("fs20Code","").toUpperCase()) {
    adapter.applyTo(fs20Device);

    logger.info("received data: " + adapter.toString());

    if (measuredTemp !== fs20Device.getData("measuredTemp")) {
      logger.info("temp changed from: " + measuredTemp + " to " + fs20Device.getData("measuredTemp"));
      measuredTemp = fs20Device.getData("measuredTemp");

      // Add packet to pending file
      var pendingFile = path.join(__dirname,'pending/' + pendingFileCount + '.log');
      fs.appendFileSync(pendingFile,timestamp + " " + measuredTemp + "\n");

      pendingPacketCount++;

      if (pendingPacketCount === config.get().pendingPacketThreshold) {
        logger.info("reached packet threshold - moving to transmit");
        fs.renameSync(pendingFile,path.join(__dirname,'transmit/' + pendingFileCount + '.log'));
        pendingFileCount++;
        pendingPacketCount = 0;
      }
    } else {
      logger.info("temperature not changed at: " + measuredTemp);
    }
  }
}

function updateTransmitTotals(count) {
  var totalTransmit = config.getLocal("totalTransmit",0);
  config.setLocal("totalTransmit",totalTransmit + count);
  var afterStart = config.getLocal("sessionTransmit",0);
  config.setLocal("sessionTransmit",afterStart + count);
}

function doTransmit(files,index,cb) {
  var file = files[index];
  var transmitData = fs.readFileSync(file).toString();
  updateTransmitTotals(transmitData.length);
  logger.info("transmitting file: " + file + ", " + transmitData.length + " bytes");
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
  logger.info("checking files for transmit");
  var transmitDir = path.join(__dirname,'transmit');
  var transmitFiles = fs.readdirSync(transmitDir).map(function(f) { return path.join(transmitDir,f); });
  if (transmitFiles.length > 0) {
    logger.info("transmitting " + transmitFiles.length + " files");
    doTransmit(transmitFiles,0,function() {
      setTimeout(transmitData,config.get().transmitFrequency);
    });
  } else {
    logger.info("no files to transmit");
    setTimeout(transmitData,config.get().transmitFrequency);
  }
}

initialise();