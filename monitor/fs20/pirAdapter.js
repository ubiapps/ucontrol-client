(function () {
  var zeroFill = require("./zeroFill");

  // Offsets of PIR data in packet data
  var DEVICE_INDEX = 0;     // Device code

  // Constructor
  function pirAdapter(packet) {
    this.packet = packet;
  }
  
  pirAdapter.APPLY_TO_WRONG_DEVICE = -1;
  
  pirAdapter.prototype.applyTo = function(pir) {
    if (pir.device && pir.device.length > 0 && this.getDeviceCode().toLowerCase() !== pir.device.toLowerCase()) {
      return pirAdapter.APPLY_TO_WRONG_DEVICE;
    }
    
    pir.device = this.getDeviceCode();

    var data = parse.call(this);
    pir.setData("brightness", data.brightness);

    return 0;
  };

  pirAdapter.prototype.getDeviceCode = function() {
    var deviceCode;
    var c1 = this.packet.get(DEVICE_INDEX);
    if (typeof c1 !== "undefined") {
      var c2 = this.packet.get(DEVICE_INDEX+1);
      if (typeof c2 !== "undefined") {
        deviceCode = this.packet.getHeader() + zeroFill(c1.toString(16),2) + zeroFill(c2.toString(16),2);
      } else {
        deviceCode = this.packet.getHeader() + zeroFill(c1.toString(16),2);
      }
    } else {
      deviceCode = this.packet.getHeader();
    }
    return deviceCode;
  };

  var parse = function() {
    var brightness = this.packet.get(5);
    return {
      brightness: brightness
    };
  };

  pirAdapter.prototype.toString = function() {
    var data = parse.call(this);
    var cmdString = "Brightness: " + data.brightness;
    return cmdString;
  };
  
  module.exports = pirAdapter;
})();