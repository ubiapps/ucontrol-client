module.exports = (function() {
  
  var log = require("debug")("sms-monitor");
  var EventEmitter = require("events");
  var util = require("util");
  var dongle = require("./dongle");
  var _ = require("lodash");
  
  function SMSMonitor() {
    EventEmitter.call(this);
  }
  
  util.inherits(SMSMonitor, EventEmitter);
  
  SMSMonitor.prototype.start = function(pollInterval) {
    this._pollInterval = pollInterval || 10000;
    startPolling.call(this);
  };
  
  var startPolling = function() {
    if (!this._timer) {
      this._timer = setTimeout(pollHandler.bind(this), this._pollInterval || 10000);
    }
  };
  
  var pollHandler = function() {
    var self = this;
    this._timer = 0;
    
    dongle.getSMSMessages(1,1,100,function(err, result) {
      if (err) {
        log("failed to get SMS list: " + err.message);
      } else {
        if (result && result.messages && result.messages.length > 0) {
          _.forEach(result.messages, function(msg) {
            if (msg.isNew) {
              self.emit(msg); 
            } else {
              // TODO - SMS isn't new => delete it?              
            }
          });
          
          // Re-start polling after all messages have been handled by listeners.
          self.startPolling();
        }
      }
    });
  };
  
  return SMSMonitor;
}());