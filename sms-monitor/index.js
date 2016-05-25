var log = require("debug")("sms-index");
var request = require("request");
var _host = "192.168.9.1";
var _baseURL = "http://" + _host + "/";
var _getSMSPath = "goform/goform_get_cmd_process";
 
var getSMS = function() {
  var options = {    
    url: _baseURL + _getSMSPath,
    method: "POST",
    headers: {
      Host: _host,
      Referer: _referrer      
    },
    body: "cmd=sms_page_data&page=0&data_per_page=10&mem_store=1&tags=12&order_by=order+by+id+desc&_=" + Date.now()
  };
  request(options, function(err, response, body) {
    if (err || (response && response.statusCode !== 200)) {
      var msg = err.message || response.body.message;
      log("failed to get sms: " + msg);
    } else {
      // Got SMS response.
      var smsList = body;
      
    }
  });    
};
