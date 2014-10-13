"use strict";

var net = require("net");
var zlib = require("zlib");
var utils = require("../common/utils");
var config = require("../common/config");
var _callbacks = {};
var _conn = null;
var _receivedData = null;

function getNextCallbackId() {
  var i = 0;
  while (_callbacks.hasOwnProperty(i)) {
    i++;
  }
  return i;
}

function receive(inp) {
    if (_receivedData === null) {
      _receivedData = inp;
    } else {
      var combined = Buffer.concat([_receivedData,inp]);
      _receivedData = combined;
    }
    zlib.gunzip(_receivedData, function(err, data) {
      if (err !== null) {
        // Assume this is a partial message, wait for the remainder to arrive.
      } else {
        _receivedData = null;
        try {
          var msg = JSON.parse(data);
          if (msg.hasOwnProperty("responseTo") && _callbacks.hasOwnProperty(msg.responseTo)) {
            try {
              var cb = _callbacks[msg.responseTo];
              delete _callbacks[msg.responseTo];
              cb(msg.error, msg.payload);
            } catch (e) {
              utils.logger.info("failure during response callback: " + e.message);
            }
          } else {
            utils.logger.info("no handler for data");
            // ToDo - handle push messages.
          }
        } catch (e) {
          utils.logger.info("corrupt message - failed to parse");
        }
      }
    });
}

function connect(cb) {
  if (_conn === null) {
    var conn = new net.Socket();
    conn.connect(config.get().serverPort, config.get().server, function() {
      utils.logger.info("connected");
      _conn = conn;
      _receivedData = null;
      process.nextTick(function() { cb(_conn); });
    });

    conn.on("data", function(data) {
      receive(data);
    });

    conn.on("error", function(err) {
      utils.logger.info("socket error: " + err.message);
    });

    conn.on("close", function() {
      _conn = null;
      _receivedData = null;
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
      var transmit = JSON.stringify(msg);
      utils.logger.info("uncompressed length: " + transmit.length);
      zlib.gzip(transmit, function(err, result) {
        if (err === null) {
          utils.logger.info("compressed length: " + result.length);
          conn.write(result);
          updateTransmitTotals(result.length);
        } else {
          utils.logger.info("failed to compress transmit buffer");
        }
      });
    } else {
      cb(new Error("failed to connect"));
    }
  });
}

function updateTransmitTotals(count) {
  var totalTransmit = config.getLocal("totalTransmit",0);
  config.setLocal("totalTransmit",totalTransmit + count);
  var afterStart = config.getLocal("sessionTransmit",0);
  config.setLocal("sessionTransmit",afterStart + count);
}

module.exports = {
  sendCommand: sendCommand
};
