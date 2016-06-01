(function() {
  
  var config = require("./config.json");
  var dongle = require("./dongle");
  var _smsTimer = setInterval(pollSMS, config.pollInterval);
  
  
}());