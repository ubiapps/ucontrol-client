(function() {
  "use strict";

  var utils = require("../common/utils");
  var config = require("../common/config");
  var serialModule = require("serialport");
  var delimiter = "\r\n";
  var eventEmitter = require('events').EventEmitter;

  var deviceMappings = {
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
        "name": "power1",
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
    this._configuredDevices = config.getLocal("oemDevices");
    this._cachedData = {};
  }

  OEM.prototype = Object.create(eventEmitter.prototype);
  OEM.prototype.constructor = OEM;

  OEM.prototype.start = function() {
    var self = this;

    this._serialPort = new serialModule.SerialPort(this._portName, { parser: serialModule.parsers.readline(delimiter), baudrate: 38400}, false);

    this._serialPort.open(function(err) {
      if (typeof err !== "undefined" && err !== null) {
        console.log("OEM - failed to open port " + self._portName + " - " + JSON.stringify(err));
      } else {
        utils.logger.info("OEM - opened port");

        self._serialPort.on("error", function(e) {
          utils.logger.info("OEM - port error: " + JSON.stringify(e));
        });

        self._serialPort.on("data", function (data) {
          if (typeof data !== "undefined" && data !== null) {
            utils.logger.info("OEM: " + data);
            onDataReceived.call(self, data);
          }
        });
      }
    });
  };

  var onDataReceived = function(data) {

    var split = data.split(' ');
    if (split.length < 2 || split[0] !== "OK") {
      utils.logger.info("OEM - bad frame: " + data);
    } else {
      var nodeId = split[1];
      if (this._configuredDevices.hasOwnProperty(nodeId)) {
        var logDevice = this._configuredDevices[nodeId];
        var deviceType = logDevice.type;
        if (deviceMappings.hasOwnProperty(deviceType)) {
          var deviceConfig = deviceMappings[deviceType];
          var logObj = {};
          var dataIndex = 2;
          for (var i = 0, len = deviceConfig.length; i < len; i++) {
            if (logDevice.log.hasOwnProperty(deviceConfig[i].name)) {
              var dataItem = parseInt(split[dataIndex]) + parseInt(split[dataIndex+1])*256;
              logObj[deviceConfig[i].name] = dataItem;
            }
          }

          // Check if data has changed.
          var jsonData = JSON.stringify(logObj);
          if (jsonData === this._cachedData[nodeId]) {
            utils.logger.info("OEM - data not changed for node " + nodeId);
          } else {
            this.emit("data",Date.now(),nodeId, logObj);
          }
          this._cachedData[nodeId] = logObj;
        } else {
          utils.logger.info("OEM - no configuration for device type: " + deviceType);
        }

      } else {
        utils.logger.info("OEM - ignoring data for node " + nodeId);
      }
    }
  };

  module.exports = OEM;
}());
