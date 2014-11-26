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
  }

  cozir.prototype = Object.create(eventEmitter.prototype);
  cozir.prototype.constructor = cozir;

  cozir.prototype.start = function() {
    var self = this;

    this._serialPort = new serialModule.SerialPort(this._portName, { parser: serialModule.parsers.readline(delimiter), baudrate: 9600}, function(err) {
      if (typeof err !== "undefined" && err !== null) {
        console.log("cozir - failed to open port " + self._portName + " - " + JSON.stringify(err));
      }
    });

    this._serialPort.on("open", function() {
      utils.logger.info("cozir - opened port");

      // Set 'poll' operating mode.
      self._serialPort.write("K 2\r\n");
    });

    self._serialPort.on("data",function(data) {
      if (typeof data !== "undefined" && data !== null) {
        utils.logger.info("cozir: " + data);
        onDataReceived.call(self, data);
      }
    });

    this._serialPort.on("error", function(e) {
      utils.logger.info("cozir - port error: " + JSON.stringify(e));
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
    setTimeout(function() { self._serialPort.write("Z\r\n"); }, 0);
    setTimeout(function() { self._serialPort.write("T\r\n"); }, 250);
    setTimeout(function() { self._serialPort.write("H\r\n"); }, 500);
  };

  var handleCO2 = function(data) {
    var co2 = data.substr(2);
    this.emit("co2",Date.now(),parseInt(co2));
  };

  var handleHumidity = function(data) {
    var humidity = data.substr(2);
    this.emit("humidity",Date.now(),parseInt(humidity)/10);
  };

  var handleTemperature = function(data) {
    var temp = data.substr(2);
    this.emit("temperature",Date.now(),(parseInt(temp) - 1000)/10);
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
