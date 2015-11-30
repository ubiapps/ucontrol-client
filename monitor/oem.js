(function() {
  "use strict";

  var config = require("../common/config");
  var serialModule = require("serialport");
  var delimiter = "\r\n";
  var eventEmitter = require('events').EventEmitter;
  var logger = {
    info: require("debug")("oem"),
    error: require("debug")("error:oem")
  };

  var oemDeviceConfiguration = {
    "emonTH": [
      {
        "name": "temperature",
        "scale": 0.1
      },
      { "name": "external temp",
        "scale": 0.1
      },
      { "name": "humidity",
        "scale": 0.1
      },
      { "name": "voltage",
        "scale": 0.1
      }
    ],
    "emonTx": [
      {
        "name": "power",
        "scale": 1
      },
      {
        "name": "power2",
        "scale": 1
      },
      {
        "name": "power3",
        "scale": 1
      },
      {
        "name": "power4",
        "scale": 1
      },
      {
        "name": "voltage",
        "scale": 0.01
      },
      {
        "name": "temperature",
        "scale": 0.1
      }
    ]
  }

  function OEM(port) {
    eventEmitter.call(this);

    this._portName = port;
    this._serialPort = null;
    this._cachedData = {};
  }

  OEM.prototype = Object.create(eventEmitter.prototype);
  OEM.prototype.constructor = OEM;

  OEM.prototype.start = function() {
    var self = this;

    var baud = config.getLocal("oemBaud",9600);
    this._serialPort = new serialModule.SerialPort(this._portName, { parser: serialModule.parsers.readline(delimiter), baudrate: baud}, false);

    this._serialPort.open(function(err) {
      if (typeof err !== "undefined" && err !== null) {
        console.log("OEM - failed to open port " + self._portName + " - " + JSON.stringify(err));
      } else {
        logger.info("OEM - opened port");

        self._serialPort.on("error", function(e) {
          logger.info("OEM - port error: " + JSON.stringify(e));
        });

        self._serialPort.on("data", function (data) {
          if (typeof data !== "undefined" && data !== null) {
            logger.info("OEM: " + data);
            onDataReceived.call(self, data);
          }
        });

        // Set quiet mode.
        setTimeout(function() { self._serialPort.write("1q"); }, 1000);

        // Set radio Node ID to 1.
        setTimeout(function() { self._serialPort.write("1i"); }, 2000);

        // Ensure we're in 433Mhz mode.
        setTimeout(function() { self._serialPort.write("4b"); }, 3000);

        // Set the network group.
        setTimeout(function() { self._serialPort.write(config.getLocal("oemNetwork","210") + "g"); }, 4000);
      }
    });
  };

  var onDataReceived = function(data) {

    var split = data.split(' ');
    if (split.length < 2 || (split[0] !== "OK" && split[0] !== "")) {
      logger.info("OEM - ignoring frame: " + data);
    } else {
      var monitoredDevices = config.getLocal("monitorDevices",{});
      var nodeId = parseInt(split[1]);
      var monitoredDevice;
      for (var m in monitoredDevices) {
        if (monitoredDevices.hasOwnProperty(m)) {
          if (monitoredDevices[m].nodeId === nodeId) {
            monitoredDevice = monitoredDevices[m];
            if (oemDeviceConfiguration.hasOwnProperty(monitoredDevice.type)) {
              var deviceConfig = oemDeviceConfiguration[monitoredDevice.type];
              var logObj = {};
              var dataIndex = 2;
              for (var i = 0, len = deviceConfig.length; i < len; i++) {
                if (monitoredDevice.log.hasOwnProperty(deviceConfig[i].name)) {
                  var dataItem = ((parseInt(split[dataIndex]) + parseInt(split[dataIndex+1])*256) * deviceConfig[i].scale).toFixed(1);
                  logObj[deviceConfig[i].name] = dataItem;
                }
                dataIndex += 2;
              }

              // Check if data has changed.
              var jsonData = JSON.stringify(logObj);
              if (jsonData === this._cachedData[nodeId]) {
                logger.info("OEM - data not changed for node " + nodeId);
              } else {
                logObj.timestamp = Date.now();
                this.emit("data",m, logObj);
                this._cachedData[nodeId] = jsonData;
              }
            } else {
              logger.info("OEM - no configuration for device type: " + monitoredDevice.type);
            }
            break;
          }
        }
      }
      if (typeof monitoredDevice === "undefined") {
        logger.info("OEM - ignoring data for node " + nodeId);
      }
    }
  };

  module.exports = OEM;
}());
