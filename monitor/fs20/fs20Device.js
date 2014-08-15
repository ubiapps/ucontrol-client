(function() {

  function device(deviceCode, config) {
    this.device = deviceCode;
    this.config = config;
    this.data = {};
  }

  device.prototype.getData = function(lookup) {
    if (this.data.hasOwnProperty(lookup)) {
    return this.data[lookup];
    } else {
      return 0;
    }
  };

  device.prototype.setData = function(lookup, val) {
    return this.data[lookup] = val;
  }

  module.exports = device;
}())
