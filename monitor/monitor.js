"use strict";

var fs = require("fs");
var path = require("path");
var FS20 = require("./fs20/cul");
var config = require("../common/config");
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
var transmitTimer = 0;
var transmitFiles = [];
var requestTimer = 0;
var requestTimeout = 30 * 60 * 1000;  // 30 mins request timeout.

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
    logger.info("starting fht monitor");
    try {
      fs20Device = new FS20DeviceClass(config.getLocal("fs20Code"));
      fhtMonitor = new FS20(getFS20Port());
      fhtMonitor.on("packet", onPacketReceived);
      fhtMonitor.start();
      transmitTimer = setTimeout(transmitData,config.get().transmitCheckFrequency*60*1000);
    } catch (e) {
      logger.error("failed to open transceiver port: " + getFS20Port() + " error is: " + JSON.stringify(e));
    }
  } else {
    logger.error("fhtMonitor already running");
  }
};

var createFolder = function(name) {
  var folderPath = path.join(__dirname,name);
  try {
    fs.mkdir(folderPath);
  } catch (e) {
    // Probably because folder already exists - do nothing.
  }
};

var checkRegistration = function() {
  logger.info("checking device key");
  var devKey = config.getLocal("devKey","");
  if (devKey.length === 0) {
    logger.info("no device key, checking name");
    var devName = config.getLocal("name","");
    if (devName.length > 0) {
      logger.info("got device name, registering device: " + devName);
      request.post(config.get().server + "/register", { json: { name: devName } }, function(err,resp,body) {
        if (err !== null || body.id.length === 0) {
          logger.error("failed to register with server: " + JSON.stringify(err));
          setTimeout(checkRegistration,config.get().registrationFrequency*60*1000);
        } else {
          logger.info("got device key: " + body.id);
          config.setLocal("devKey",body.id);
          startFHT();
        }
      });
    } else {
      logger.info("waiting for device name");
      setTimeout(checkRegistration,config.get().registrationFrequency*60*1000);
    }
  } else {
    logger.info("device registered, starting monitor");
    startFHT();
  }
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
    try {
      fs.renameSync(path.join(__dirname,"pending",pendingFile),path.join(__dirname,"transmit", pendingFile));
    } catch (e) {
      logger.error("failed to move pending file to transmit");
    }
  }

  findNextPendingFile();

  // Reset transmission data count.
  config.setLocal("sessionTransmit",0);

  // Reset seen device list.
  config.setLocal("seenDevices",{});

  checkRegistration();
};

function deviceSeen(devCode) {
  var seen = config.getLocal("seenDevices",{});
  if (!seen.hasOwnProperty(devCode)) {
    seen[devCode] = true;
    config.setLocal("seenDevices",seen);
  }
}

function findNextPendingFile() {
  var pendingFile;
  do {
    pendingFileCount++;
    pendingFile = path.join(__dirname,'pending/' + pendingFileCount + '.log');
  } while(fs.exists(pendingFile));

  return pendingFile;
}

function onPacketReceived(timestamp, packet) {
  // Received a new packet - store it.
  var packetDate = new Date(timestamp);

  // Add packet to catch-all log file.
  var logFile = path.join(__dirname,'logs/fhz-' + packetDate.getUTCDate() + '-' + packetDate.getUTCMonth() + '-' + packetDate.getUTCFullYear() + '.log');
  fs.appendFileSync(logFile,timestamp + " " + packet.toString() + "\n");

  var adapter = fhtMonitor.getAdapter(packet);
  if (typeof adapter !== "undefined") {
    var deviceCode = adapter.getDeviceCode().toLowerCase();
    deviceSeen(deviceCode);

    if (deviceCode === config.getLocal("fs20Code","").toLowerCase()) {
      adapter.applyTo(fs20Device);

      logger.info("received data: " + adapter.toString());

      if (measuredTemp !== fs20Device.getData("temperature")) {
        logger.info("temp changed from: " + measuredTemp + " to " + fs20Device.getData("temperature"));
        measuredTemp = fs20Device.getData("temperature");

        // Add packet to pending file
        var pendingFile = path.join(__dirname,'pending/' + pendingFileCount + '.log');
        fs.appendFileSync(pendingFile,timestamp + " " + measuredTemp + "\n");

        pendingPacketCount++;

        if (pendingPacketCount === config.get().pendingPacketThreshold) {
          logger.info("reached packet threshold - moving to transmit");
          try {
            fs.renameSync(pendingFile,path.join(__dirname,'transmit/' + pendingFileCount + '.log'));
          } catch (e) {
            logger.error("failed to move file from pending to transmit");
          }
          findNextPendingFile();
          pendingPacketCount = 0;
        }
      } else {
        logger.info("temperature not changed at: " + measuredTemp);
      }
    }
  }
}

function updateTransmitTotals(count) {
  var totalTransmit = config.getLocal("totalTransmit",0);
  config.setLocal("totalTransmit",totalTransmit + count);
  var afterStart = config.getLocal("sessionTransmit",0);
  config.setLocal("sessionTransmit",afterStart + count);
}

var clearTransmitFiles = function() {
  logger.info("deleting successfully transmitted files");
  transmitFiles.forEach(function(f) {
    try {
      fs.unlink(f);
      logger.info("deleted file " + f);
    } catch (e) {
      logger.error("failed to delete file: " + f);
    }
  });
  transmitFiles = [];
};

function onRequestTimeOut(cb) {
  logger.error("request timed out - aborting transmit files");
  transmitFiles = [];
  requestTimer = 0;
  cb();
}

function doTransmit(transmitPayload,cb) {
  if (requestTimer === 0) {
    requestTimer = setTimeout(function() { onRequestTimeOut(cb); }, requestTimeout);
    logger.info("transmitting data: " + transmitPayload.length + " bytes");
    request.post(config.get().server + "/data/" + config.getLocal("devKey"), { json: { data: transmitPayload }}, function(err,resp,body) {
      if (requestTimer !== 0) {
        clearTimeout(requestTimer);
        requestTimer = 0;
      }
      var success;
      if (err !== null) {
        logger.error("failed to post data to server: " + JSON.stringify(err));
        success = false;
      } else if (!body.hasOwnProperty("ok") || body.ok !== true) {
        logger.error("failed to post data to server: " + JSON.stringify(body));
        success = false;
      } else {
        logger.info("transmit successful");
        updateTransmitTotals(transmitPayload.length);
        clearTransmitFiles();
        success = true;
      }
      cb(success);
    });
  } else {
    logger.error("unexpected: - requestTimer running");
    cb(false);
  }
}

function transmitData() {
  transmitFiles = [];
  var transmitDir = path.join(__dirname,'transmit');
  var transmitCandidates = fs.readdirSync(transmitDir).map(function(f) { return path.join(transmitDir,f); });
  if (transmitCandidates.length > 0) {
    var transmitPayload = "";
    for (var i = 0, len = transmitCandidates.length; i < len; i++) {
      var file = transmitCandidates[i];
      var fileData = fs.readFileSync(file).toString();
      transmitPayload += fileData;
      transmitFiles.push(file);
      if (transmitPayload.length > config.get().maximumTransmitKB*1024) {
        break;
      }
    }
    logger.info("transmitting " + transmitPayload.length + " bytes");
    doTransmit(transmitPayload,function(ok) {
      if (ok === true) {
        logger.info("transmit success - rescheduling in " + config.get().transmitCheckFrequency + " mins");
        transmitTimer = setTimeout(transmitData,config.get().transmitCheckFrequency*60*1000);
      } else {
        logger.info("transmit failed - rescheduling in " + config.get().transmitErrorFrequency + " mins");
        transmitTimer = setTimeout(transmitData,config.get().transmitErrorFrequency*60*1000);
      }
    });
  } else {
    transmitTimer = setTimeout(transmitData,config.get().transmitCheckFrequency*60*1000);
  }
}

initialise();
