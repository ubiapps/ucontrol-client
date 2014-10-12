"use strict";

var net = require("net");
var utils = require("../common/utils");
var config = require("../common/config");
var _callbacks = {};
var _conn = null;
var _receivedData = "";

function getNextCallbackId() {
  var i = 0;
  while (_callbacks.hasOwnProperty(i)) {
    i++;
  }
  return i;
}

function receive(data) {
  try {
    _receivedData += data.toString();
    var msg = JSON.parse(_receivedData);
    _receivedData = "";
    if (msg.hasOwnProperty("responseTo") && _callbacks.hasOwnProperty(msg.responseTo)) {
      try {
        var cb = _callbacks[msg.responseTo];
        delete _callbacks[msg.responseTo];
        cb(msg.error, msg.payload);
      } catch (e) {
        utils.logger.log("failure during response callback: " + e.message);
      }
    } else {
      utils.logger.log("no handler for data");
    }
  } catch (e) {
    // Assume this is a partial message, wait for the remainder to arrive.
  }
}

function connect(cb) {
  if (_conn === null) {
    var conn = new net.Socket();
    conn.connect(config.get().serverPort, config.get().server, function() {
      utils.logger.log("connected");
      _conn = conn;
      _receivedData = "";
      process.nextTick(function() { cb(_conn); });
    });

    conn.setEncoding("utf8");
    conn.on("data", function(data) {
      utils.logger.log(data.toString());
      receive(data);
    });

    conn.on("error", function(err) {
      // ToDo - reconnect.
      utils.logger.log("socket error: " + err.message);
      utils.logger.log("ToDo - reconnect now");
    });

    conn.on("close", function() {
      _conn = null;
      _receivedData = "";
    });
  } else {
    process.nextTick(function() { cb(_conn); });
  }
};

function sendCommand(cmd, payload, cb) {
  connect(function(conn) {
    if (conn) {
      var msg = {
        cmd: cmd,
        payload: payload
      };
      if (typeof cb === "function") {
        msg.replyTo = getNextCallbackId();
        _callbacks[msg.replyTo] = cb;
      }
      conn.write(JSON.stringify(msg));
    } else {
      cb(new Error("failed to connect"));
    }
  });
}

module.exports = {
  sendCommand: sendCommand
};

