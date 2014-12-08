"use strict";

var fs = require("fs");
var path = require("path");

var utils = require("../common/utils");
utils.initialise("monitor");

var transport = require("./transport");
var FS20 = require("./fs20/cul");
var config = require("../common/config");
var FS20DeviceClass = require("./fs20/fs20Device");

var COzir = require("./cozir");
var cozirMonitor = null;
var cozirId = "z01";

var logger = utils.logger;
var pending = [];
var pendingPacketCount = 0;
var pendingFileCount = 0;
var fhtMonitor = null;
var fs20Devices = {};
var transmitTimer = 0;
var transmitFiles = [];
var transportTimer = 0;
var transportTimeout = 1 * 60 * 1000;  // 1 min timeout.
var wiredSensorData = {};

var getFS20Port = function() {
  return config.getLocal("fs20Port","/dev/ttyAMA0");
};

var getCOzirPort = function() {
  return config.getLocal("cozirPort","");
};

var startMonitoring = function() {
  if (fhtMonitor === null) {
    logger.info("starting fht monitor");
    try {
      var monitorDevices = config.getLocal("monitorDevices",{});
      for (var monitorDevice in monitorDevices) {
        if (monitorDevices.hasOwnProperty(monitorDevice)) {
          var fs20Type = monitorDevice[0];
          if (config.getFS20().hasOwnProperty(fs20Type)) {
            var cfg = config.getFS20()[fs20Type];
            fs20Devices[monitorDevice] = new FS20DeviceClass(monitorDevice,monitorDevices[monitorDevice],cfg.services);
          } else {
            logger.info("no FS20 config found for device " + monitorDevice);
          }
        }
      }
      fhtMonitor = new FS20(getFS20Port());
      fhtMonitor.on("packet", onPacketFS20Received);
      fhtMonitor.start();
    } catch (e) {
      logger.error("failed to start FHT monitor on port: " + getFS20Port() + " error is: " + JSON.stringify(e));
    }

    try {
      var cozirPort = getCOzirPort();
      if (cozirPort.length > 0) {
        logger.info("starting COZIR monitor");
        cozirMonitor = new COzir(cozirPort);
        cozirMonitor.on("co2", onWiredCO2);
        cozirMonitor.on("temperature",onWiredTemperature);
        cozirMonitor.on("humidity",onWiredHumidity);
        cozirMonitor.start();
      } else {
        logger.info("no COZIR attached");
      }
    } catch (e) {
      logger.error("failed to start COZIR monitor on port: " + getFS20Port() + " error is: " + JSON.stringify(e));
    }

    transmitTimer = setTimeout(transmitData,config.get().transmitCheckFrequency*60*1000);
  } else {
    logger.error("fhtMonitor already running");
  }
};

var callHome = function() {
  logger.info("calling home");

  // Make sure all sensors have a name (use defaults from fs20Config if necessary).
  var monitorDevices = config.getLocal("monitorDevices",{});
  var fs20Config = config.getFS20();
  var sensors = {};
  for (var s in monitorDevices) {
    if (monitorDevices.hasOwnProperty(s)) {
      if (!monitorDevices[s].hasOwnProperty("name")) {
        sensors[s] = { name: fs20Config[s[0]].parameters.name };
      }
      else {
        sensors[s] = { name: monitorDevices[s].name };
      }
    }
  }
  var hello = {
    version: config.get().version,
    deviceId: config.getLocal("devKey",""),
    name: config.getLocal("name",""),
    sensors: sensors
  };
  transport.sendCommand("h", hello, function(err, resp) {
    if (err !== null) {
      logger.error("failed to call home: " + JSON.stringify(err));
      setTimeout(callHome,config.get().registrationFrequency*60*1000);
    } else {
      logger.info("called home ok " + JSON.stringify(resp));
      if (resp.checkForUpdates === true) {
        config.setLocal("checkForUpdates",true);
        utils.scheduleReboot(0);
      } else {
        startMonitoring();
      }
    }
  });
};

var createFolder = function(name) {
  var folderPath = path.join(__dirname,name);
  try {
    if (!fs.existsSync(folderPath)) {
      fs.mkdir(folderPath);
    }
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
      transport.sendCommand("r", { name: devName }, function(err, resp) {
        if (err !== null) {
          logger.error("failed to register with server: " + JSON.stringify(err));
          setTimeout(checkRegistration,config.get().registrationFrequency*60*1000);
        } else {
          logger.info("got device key: " + resp.id);
          config.setLocal("devKey",resp.id);
          callHome();
        }
      });
    } else {
      logger.info("waiting for device name");
      setTimeout(checkRegistration,config.get().registrationFrequency*60*1000);
    }
  } else {
    logger.info("device already registered");
    callHome();
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

  moveAllPendingFiles();

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
  } while(fs.existsSync(pendingFile));

  return pendingFile;
}

function moveAllPendingFiles() {
  // Clear pending folder.
  logger.info("transmitting pending logs");
  var pendingFiles = fs.readdirSync(path.join(__dirname,"pending"));
  for (var i = 0, len = pendingFiles.length; i < len; i++) {
    var pendingFile = path.join(__dirname,"pending",pendingFiles[i]);
    pendingToTransmit(pendingFile);
  }
}

function pendingToTransmit(file) {
  var fileOnly = path.basename(file);
  var transmitFile = path.join(__dirname,'transmit/' + fileOnly);
  try {
    if (!fs.existsSync(transmitFile)) {
      fs.renameSync(file,transmitFile);
    } else {
      logger.info("couldn't move file to transmit - file already exists");
    }
  } catch (e) {
    logger.error("failed to move file from pending to transmit");
  }
}

function isMonitored(deviceCode) {
  return config.getLocal("monitorDevices",{}).hasOwnProperty(deviceCode);
}

function onWiredData(timestamp, data, key) {
  var old = wiredSensorData[key];

  if (old !== data) {
    wiredSensorData[key] = data;

    logger.info("wired " + key + " changed from: " + old + " to " + data);
    wiredSensorData.timestamp = timestamp;

    // Add packet to pending file
    var pendingFile = path.join(__dirname,'pending/' + pendingFileCount + '.log');
    fs.appendFileSync(pendingFile,cozirId + " " + JSON.stringify(wiredSensorData) + "\n");

    pendingPacketCount++;

    if (pendingPacketCount === config.get().pendingPacketThreshold) {
      logger.info("reached packet threshold - moving to transmit");
      moveAllPendingFiles();
      findNextPendingFile();
      pendingPacketCount = 0;
    }
  } else {
    logger.info("wired " + key + " not changed at " + old);
  }
}

function onWiredCO2(timestamp, co2) {
  onWiredData.call(this, timestamp, co2, "co2");
}

function onWiredTemperature(timestamp, temp) {
  onWiredData.call(this, timestamp, temp, "temperature");
}

function onWiredHumidity(timestamp, humidity) {
  onWiredData.call(this, timestamp, humidity, "humidity");
}

function onPacketFS20Received(timestamp, packet) {
  // Received a new packet - store it.
  var packetDate = new Date(timestamp);

  // Add packet to catch-all log file.
  var logFile = path.join(__dirname,'logs/fhz-' + packetDate.getUTCDate() + '-' + packetDate.getUTCMonth() + '-' + packetDate.getUTCFullYear() + '.log');
  fs.appendFileSync(logFile,timestamp + " " + packet.toString() + "\n");

  var adapter = fhtMonitor.getAdapter(packet);
  if (typeof adapter !== "undefined") {
    var deviceCode = adapter.getDeviceCode().toLowerCase();
    deviceSeen(deviceCode);

    if (isMonitored(deviceCode)) {
      var fs20Device = fs20Devices[deviceCode];
      var old = JSON.stringify(fs20Device.getServiceData());
      adapter.applyTo(fs20Device);

      logger.info("received data: " + adapter.toString());

      var serviceData = fs20Device.getServiceData();
      var update = JSON.stringify(serviceData);

      if (old !== update) {
        logger.info(deviceCode + " changed from: " + old + " to " + update);
        serviceData.timestamp = timestamp;

        // Add packet to pending file
        var pendingFile = path.join(__dirname,'pending/' + pendingFileCount + '.log');
        fs.appendFileSync(pendingFile,deviceCode + " " + JSON.stringify(serviceData) + "\n");

        pendingPacketCount++;

        if (pendingPacketCount === config.get().pendingPacketThreshold) {
          logger.info("reached packet threshold - moving to transmit");
          moveAllPendingFiles();
          findNextPendingFile();
          pendingPacketCount = 0;
        }
      } else {
        logger.info(deviceCode + " not changed at " + old);
      }
    }
  }
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

function onTransportTimeOut(cb) {
  logger.error("transport timed out - aborting transmit files");
  transmitFiles = [];
  transportTimer = 0;
  cb(false);
}

function doTransmit(transmitPayload,cb) {
  if (transportTimer === 0) {
    transportTimer = setTimeout(function() { onTransportTimeOut(cb); }, transportTimeout);
    logger.info("transmitting data: " + transmitPayload.length + " bytes");
    transport.sendCommand("d", { devKey: config.getLocal("devKey"), data: transmitPayload }, function(err, resp) {
      if (transportTimer !== 0) {
        clearTimeout(transportTimer);
        transportTimer = 0;
      }
      var success;
      if (err !== null) {
        logger.error("failed to post data to server: " + JSON.stringify(err));
        success = false;
      } else if (!resp.hasOwnProperty("ok") || resp.ok !== true) {
        logger.error("failed to post data to server: " + JSON.stringify(resp));
        success = false;
      } else {
        logger.info("transmit successful");
        clearTransmitFiles();
        success = true;
      }
      cb(success);
    });
  } else {
    logger.error("unexpected: - transportTimer running");
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
      } else {
        logger.info("transmit failed - rescheduling in " + config.get().transmitErrorFrequency + " mins");
      }
      transmitTimer = setTimeout(transmitData,config.get().transmitCheckFrequency*60*1000);
    });
  } else {
    transmitTimer = setTimeout(transmitData,config.get().transmitCheckFrequency*60*1000);
  }
}

initialise();
