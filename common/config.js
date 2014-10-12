"use strict";

var fs = require("fs");
var path = require("path");
var config = require("../config.json");
var fs20Config = require("../fs20Config.json");
var localConfigPath = path.join(__dirname,"../","config.local.json");
var utils = require("./utils");
var localConfig = {};

var loadLocal = function() {
  if (fs.existsSync(localConfigPath)) {
    var txt = fs.readFileSync(localConfigPath);
    try {
      localConfig = JSON.parse(txt);
    } catch (e) {
      utils.logger.error("failed to parse config file!");
      localConfig = {};
    }
  } else {
    utils.logger.error("config file missing - creating new");
    localConfig = {};
  }
  return localConfig;
};

var saveLocal = function() {
  fs.writeFileSync(localConfigPath, JSON.stringify(localConfig,null,2));
};

var getLocal = function(name, def) {
  loadLocal();
  if (typeof name === "undefined") {
    return localConfig;
  } else {
    if (!localConfig.hasOwnProperty(name)) {
      localConfig[name] = def;
    }

    return localConfig[name];
  }
};

var setLocal = function(name,val) {
  localConfig[name] = val;
  saveLocal();
};

var resetLocal = function() {
  localConfig.gitFailCount = 0;
  localConfig.fs20Port = "/dev/ttyAMA0";
  localConfig.sessionTransmit = 0;
  localConfig.totalTransmit = 0;
  localConfig.seenDevices = {};
  delete localConfig.fs20Code;
  delete localConfig.devKey;
  delete localConfig.name;

  saveLocal();
};

loadLocal();

module.exports = {
  get: function() { return config; },
  getFS20: function() { return fs20Config; },
  getLocal: getLocal,
  setLocal: setLocal,
  resetLocal: resetLocal
};
