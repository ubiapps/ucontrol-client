(function () {
  var zeroFill = require("./zeroFill");

  // Offsets of FHT data in packet data
  var DEVICE_INDEX = 0;     // Device code
  var COUNTER_INDEX = 2;
  var CUMULATIVE_INDEX = 3;
  var INTERVAL_INDEX = 5;
  var PEAK_INDEX = 7;

  // Constructor
  function emAdapter(packet) {
    this.packet = packet;
  }
  
  emAdapter.APPLY_TO_WRONG_DEVICE = -1;
  
  emAdapter.prototype.applyTo = function(em) {
    if (em.device && em.device.length > 0 && this.getDeviceCode() !== em.device) {
      return emAdapter.APPLY_TO_WRONG_DEVICE;
    }
    
    em.device = this.getDeviceCode();

    em.setData("counter", this.packet.get(COUNTER_INDEX));

    var cumulativeRevs = this.packet.get(CUMULATIVE_INDEX+1)*256 + this.packet.get(CUMULATIVE_INDEX);
    var cumulativeConsumption = cumulativeRevs / em.config.revsPerkWh;
    em.setData("cumulative", cumulativeConsumption);

    // The number of revolutions in the last interval (5 mins).
    var intervalRevs = this.packet.get(INTERVAL_INDEX+1)*256 + this.packet.get(INTERVAL_INDEX);
    // The equivalent hourly consumption (given 12 intervals of 5 mins in an hour).
    var intervalConsumption = (intervalRevs * 12) / em.config.revsPerkWh;
    em.setData("interval", intervalConsumption);

    // The time in seconds of the fastest revolution in the interval (5 mins).
    var peakTime = (this.packet.get(PEAK_INDEX+1)*256 + this.packet.get(PEAK_INDEX))/10;
    var peakConsumption = (3600/peakTime) / em.config.revsPerkWh;
    em.setData("peak", peakConsumption);

    return 0;
  }
    
  emAdapter.prototype.getDeviceCode = function() {
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

  emAdapter.prototype.toString = function() {
    var cmdString = "Counter: " + this.packet.get(COUNTER_INDEX) + " Cumulative: " + (this.packet.get(CUMULATIVE_INDEX+1)*256 + this.packet.get(CUMULATIVE_INDEX)) + " Interval: " + (this.packet.get(INTERVAL_INDEX+1)*256 + this.packet.get(INTERVAL_INDEX)) + " Peak: " + (this.packet.get(PEAK_INDEX+1)*256 + this.packet.get(PEAK_INDEX));
    return cmdString;
  }
  
  module.exports = emAdapter;
})();