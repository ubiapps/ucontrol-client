(function() {
  "use strict";

  var utils = require("../common/utils");
  var config = require("../common/config");
  var serialModule = require("serialport");
  var delimiter = "\r\n";
  var eventEmitter = require('events').EventEmitter;

  function cozir(port) {
    eventEmitter.call(this);

    this._portName = port;
    this._serialPort = null;
    this._timer = 0;
    this._lastCO2 = -999;
    this._lastTemperature = -999;
    this._lastHumidity = -999;
  }

  cozir.maxCO2Delta = 200;
  cozir.maxTemperatureDelta = 2;
  cozir.maxHumidityDelta = 5;

  cozir.prototype = Object.create(eventEmitter.prototype);
  cozir.prototype.constructor = cozir;

  cozir.prototype.start = function() {
    var self = this;

    this._serialPort = new serialModule.SerialPort(this._portName, { parser: serialModule.parsers.readline(delimiter), baudrate: 9600}, false);

    this._serialPort.open(function(err) {
      if (typeof err !== "undefined" && err !== null) {
        console.log("cozir - failed to open port " + self._portName + " - " + JSON.stringify(err));
      } else {
        utils.logger.info("cozir - opened port");

        self._serialPort.on("error", function(e) {
          utils.logger.info("cozir - port error: " + JSON.stringify(e));
        });

        self._serialPort.on("data", function (data) {
          if (typeof data !== "undefined" && data !== null) {
            utils.logger.info("cozir: " + data);
            onDataReceived.call(self, data);
          }
        });

        // Request configuration (sometimes required to get unit to listen to operating mode request.
        setTimeout(function() { self._serialPort.write("*\r\n"); }, 1000);

        // Set 'poll' operating mode.
        setTimeout(function() { self._serialPort.write("K 2\r\n"); }, 5000);
      }
    });
  };

  var startPolling = function() {
    if (this._timer === 0) {
      this._timer = setInterval(poll.bind(this), config.get().cozirPollInterval*60*1000);
    }
  };

  var poll = function() {
    var self = this;

    // ToDo - review sequencing.
    setTimeout(function() { self._serialPort.write("Z\r\n"); }, 500);
    setTimeout(function() { self._serialPort.write("T\r\n"); }, 5500);
    setTimeout(function() { self._serialPort.write("H\r\n"); }, 10500);
  };

  var handleCO2 = function(data) {
    var co2 = parseInt(data.substr(2));
    // Check for rogue values
    var diff = Math.abs(co2 - this._lastCO2);
    if (this._lastCO2 === -999 || diff < cozir.maxCO2Delta) {
      this._lastCO2 = co2;
      this.emit("co2",Date.now(),co2);
    } else {
      utils.logger.info("cozir - co2 delta too big, ignoring: " + co2);
    }
  };

  var handleHumidity = function(data) {
    var humidity = parseInt(data.substr(2))/10;
    // Check for rogue data.
    var diff = Math.abs(humidity - this._lastHumidity);
    if (this._lastHumidity === -999 || diff < cozir.maxHumidityDelta) {
      this._lastHumidity = humidity;
      this.emit("humidity",Date.now(),humidity);
    } else {
      utils.logger.info("cozir - humidity delta too big, ignoring: " + humidity);
    }
  };

  var handleTemperature = function(data) {
    var temp = (parseInt(data.substr(2)) - 1000)/10;
    // Check for rogue data.
    var diff = Math.abs(temp - this._lastTemperature);
    if (this._lastTemperature === -999 || diff < cozir.maxTemperatureDelta) {
      this._lastTemperature = temp;
      this.emit("temperature",Date.now(),temp);
    } else {
      utils.logger.info("cozir - temperature delta too big, ignoring: " + temp);
    }
  };

  var onDataReceived = function(data) {
    switch (data[1]) {
      case "Z":
        handleCO2.call(this,data);
        break;
      case "T":
        handleTemperature.call(this,data);
        break;
      case "H":
        handleHumidity.call(this,data);
        break;
      case "K":
        startPolling.call(this);
        break;
      default:
        utils.logger.info("ignoring data: " + data);
        break;
    }
  };

  module.exports = cozir;

}());
