(function() {
  var SerialPortModule = require("serialport");
  var SerialPort = SerialPortModule.SerialPort;
  var culPacket = require('./culPacket');
  var util = require('util');
  var eventEmitter = require('events').EventEmitter;
  var delimiter = "\r\n";

  function cul(portName) {
    eventEmitter.call(this);
    this.packet = {};
    this.devices = {};
    this.serialPort = {};
    this.portName = portName;
  }

  util.inherits(cul,eventEmitter);
  
  cul.PACKET_EVENT = "packet";
  
  cul.prototype.newPacket = function() {
    return new culPacket();
  }

  cul.prototype.getAdapter = function(packet) {
    var adapter;

    switch (packet.getHeader()) {
      case "T":
        var fhtAdapter = require("./fhtAdapter");
        adapter = new fhtAdapter(packet);
        break;
      case "E":
        var emAdapter = require("./emAdapter");
        adapter = new emAdapter(packet);
        break;
      default:
        break;
    }

    return adapter;
  };

  cul.prototype.start = function() {
    var that = this;    
    this.serialPort = new SerialPort(this.portName, { parser: SerialPortModule.parsers.readline(delimiter), baudrate: 38400 }, function(err) {
      if (typeof err !== "undefined" && err !== null) {
        console.log("failed to open port " + that.portName + " - " + JSON.stringify(err));
      }
    });

    this.serialPort.on("open", function() {
      console.log("opened port");
      that.packet = new culPacket();
      that.serialPort.on("data",function(data) {
        if (typeof data !== "undefined" && data !== null) {
          that.receivePacket(data);
        }
      });
      // Initialise the COC
      that.writePacket("V");
      that.writePacket("X61");
    });

    this.serialPort.on("error", function(e) {
      console.log("port error: " + JSON.stringify(e));
    })
  };
  
  cul.prototype.getDevices = function() {
    return this.devices;
  };
  
  cul.prototype.receivePacket = function(data) {
    this.packet.load(data);
    console.log("---------------------------------------------");
    var packetString = this.packet.toString();
    console.log(packetString);

    this.emit(cul.PACKET_EVENT,(new Date()).getTime(), this.packet);

    console.log("---------------------------------------------");
  };
  
  cul.prototype.writePacket = function(pkt) {
    this.serialPort.write(pkt + delimiter);
  };
  
  cul.prototype.writeFHT = function(pkt) {
    this.serialPort.write("T" + pkt + delimiter);
  };

  module.exports = cul;
})();