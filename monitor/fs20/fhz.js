(function() {
  var SerialPortModule = require("serialport");
  var SerialPort = SerialPortModule.SerialPort;
  var fhzPacket = require('./fhzPacket');
  var util = require('util');
  var eventEmitter = require('events').EventEmitter;

  var FHT_PREFIX = '020183';

  function fhz(portName) {
    eventEmitter.call(this);
    this.devices = {};
    this.serialPort = {};
    this.portName = portName;
    this.packet = new fhzPacket();
  }

  util.inherits(fhz,eventEmitter);
  
  fhz.PACKET_EVENT = "packet";
  
  fhz.prototype.newPacket = function() {
    return new fhzPacket();
  }

  fhz.prototype.getAdapter = function(packet) {
    var adapter;

    // FHZ only supports FHT devices.
    var fhtAdapter = require("./fhtAdapter");
    adapter = new fhtAdapter(packet);

    return adapter;
  };

  fhz.prototype.start = function() {
    var that = this;    
    this.serialPort = new SerialPort(this.portName, { parser: SerialPortModule.parsers.raw, baudrate: 9600 });

    this.serialPort.on("open", function() {
      console.log("fhz - opened port " + that.portName);
      that.serialPort.on("data",function(data) {
        that.packet.parse(data,function(ok) { that.receivePacket(ok); });
      });
    });
  };
  
  fhz.prototype.getDevices = function() {
    return this.devices;
  };
  
  fhz.prototype.receivePacket = function(ok) {
    if (ok) {
      console.log("---------------------------------------------");
      console.log(this.packet.toString());
      this.emit(fhz.PACKET_EVENT,Date.now(),this.packet);
      console.log("---------------------------------------------");
    } else { 
      console.log("packet invalid");
    }
  };

  fhz.prototype.writeFHT = function(str) {
    var refresh = new fhzPacket();
    refresh.fromString(FHT_PREFIX + str);
    this.serialPort.write(refresh.getRaw());
  };
  
  fhz.prototype.writePacket = function(pkt) {
    this.serialPort.write(pkt.getRaw());
  };
  
  module.exports = fhz;
})();