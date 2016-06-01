var dongle = require("./dongle");
var log = require("debug")("sms-index");

dongle.getSMSMessages(1, 1, 100, function(err, result) {
  if (err) {
    log("failed to get SMS: " + err.message);
  } else {
    log(result);
    dongle.deleteSMS(3, function(err, result) {
      if (err) {
        log("failed to delete SMS: " + err.message);
      } else {
        log(result);
        dongle.sendSMS("07973421233","testing",Math.random(), function(err, result) {
          if (err) {
            log("failed to send SMS: " + err.message);
          } else {
            log(result);
          }          
        });
      }
    });
  }  
});

