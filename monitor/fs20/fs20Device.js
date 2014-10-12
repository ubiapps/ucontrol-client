(function() {
  function device(deviceCode, config, services) {
    this.device = deviceCode;
    this.config = config;
    this.services = services;
    this.data = {};
    this.dirty = false;
  }

  device.prototype.clearDirty = function() {
    this.dirty = false;
  };

  device.prototype.isDirty = function() {
    return this.dirty;
  };

  device.prototype.getData = function(lookup) {
    if (this.data.hasOwnProperty(lookup)) {
    return this.data[lookup];
    } else {
      return 0;
    }
  };

  device.prototype.setData = function(lookup, val) {
    if (!this.data.hasOwnProperty(lookup) || this.data[lookup] !== val) {
      this.dirty = true;
      this.data[lookup] = val;
    }
  };

  device.prototype.getServiceData = function() {
    var serviceData = {};
    for (var s in this.services) {
      if (this.services.hasOwnProperty(s) && this.data.hasOwnProperty(s)) {
        serviceData[this.services[s].name] = this.data[s];
      }
    }
    return serviceData;
  };

  module.exports = device;
}());
