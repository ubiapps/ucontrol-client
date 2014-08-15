var fs = require("fs");
var path = require("path");
var FS20 = require("./fs20/cul");
var pending = [];
var pendingCounter = 0;
var pendingThreshold = 10;

var logger = require("winston");
logger.add(logger.transports.File, { filename: "client.log" });

try {
  var configTxt = fs.readFileSync("./config.json");
  var config = JSON.parse(configTxt);
} catch (e) {
  logger.error("failed to load config file: " + JSON.stringify(e));
}

var requestLib = require("request");
var request = requestLib.defaults({
  headers: {
    "x-api-key": "c9a66"
  },
  auth: {
    user: "ubiapps",
    pass: "sppaibu"
  }
});

var startFHT = function() {
  if (config.hasOwnProperty("devKey")) {
    try {
      fhtMonitor = new FS20(config.fs20Port);
      fhtMonitor.on("packet", onPacketReceived);
      fhtMonitor.start();
    } catch (e) {
      logger.error("failed to open transceiver port: " + config.fs20Port + " error is: " + JSON.stringify(e));
    }
  }
};

if (!config.hasOwnProperty("devKey")) {
  request.post(config.server + "/register", { json: {} }, function(err,resp,body) {
    if (err !== null) {
      logger.error("failed to register with server: " + JSON.stringify(err));
    } else {
      config.devKey = body.id;
      fs.writeFileSync("./config.json",JSON.stringify(config,null,2));
      startFHT();
    }
  });
} else {
  startFHT();
}

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

  request.post(config.server + "/data/" + config.devKey, { json: { data: transmitData }}, function(err,resp,body) {
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
      setTimeout(transmitData,config.period);
    });
  } else {
    logger.info("no files to transmit");
    setTimeout(transmitData,config.period);
  }
}

setTimeout(transmitData,config.period);
