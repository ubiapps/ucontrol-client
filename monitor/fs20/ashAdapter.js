(function () {
  var zeroFill = require("./zeroFill");

  // Offsets of ASH data in packet data
  var DEVICE_INDEX = 0;     // Device code

  // Constructor
  function ashAdapter(packet) {
    this.packet = packet;
  }
  
  ashAdapter.APPLY_TO_WRONG_DEVICE = -1;
  
  ashAdapter.prototype.applyTo = function(ash) {
    if (ash.device && ash.device.length > 0 && this.getDeviceCode().toLowerCase() !== ash.device.toLowerCase()) {
      return ashAdapter.APPLY_TO_WRONG_DEVICE;
    }
    
    ash.device = this.getDeviceCode();

    var data = parse.call(this);
    ash.setData("temperature", data.temp);
    ash.setData("humidity", data.humidity);

    return 0;
  }
    
  ashAdapter.prototype.getDeviceCode = function() {
    return this.packet.getHeader() + zeroFill(this.packet.get(DEVICE_INDEX).toString(16),2);
  };

  var parse = function() {
    var tempSign = (this.packet.get(0) & 0x80) === 0 ? 1 : -1;
    var tempTens = this.packet.get(2) &  0x0f;
    var tempUnits = this.packet.get(1) >> 4;
    var tempTenths = this.packet.get(1) & 0x0f;
    var humidTens = this.packet.get(3) >> 4;
    var humidUnits = this.packet.get(3) & 0x0f;
    var humidTenths = this.packet.get(2) >> 4;
    return {
      temp: tempSign * (tempTens*10 + tempUnits + tempTenths*0.1),
      humidity: humidTens*10 + humidUnits + humidTenths*0.1
    };
  };

  ashAdapter.prototype.toString = function() {
    var data = parse.call(this);
    var cmdString = "Temp: " + data.temp + " Humidity: " + data.humidity;
    return cmdString;
  }
  
  module.exports = ashAdapter;
})();