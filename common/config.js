"use strict";

var fs = require("fs");
var path = require("path");
var fs20Config = require("../fs20Config.json");
var utils = require("./utils");
var logger = {
  info: require("debug")("config"),
  error: require("debug")("error:config")
};

/******************************************************************************
 * system config
 */
var config = require("../config.json");

/******************************************************************************
 * local config
 */
var localConfigPath = path.join(__dirname,"../","config.local.json");
var localConfig = {};
var loadLocal = function() {
  if (fs.existsSync(localConfigPath)) {
    var txt = fs.readFileSync(localConfigPath);
    try {
      localConfig = JSON.parse(txt);
      if (localConfig.oemNetwork) {
        // This looks like a valid config - save as a backup.
        fs.writeFileSync(localConfigPath + ".bak", txt);
      }
    } catch (e) {
      logger.error("failed to parse config file - aborting...");
      process.exit();
    }
  } else {
    logger.error("config file missing - creating new");
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
  delete localConfig.fs20Code;
  delete localConfig.devKey;
  delete localConfig.name;
  saveLocal();
};

loadLocal();

/******************************************************************************
 * diagnostic store
 */
var diagnosticStorePath = path.join(__dirname,"../","diagnostic.json");
var diagnosticStore = {};
var loadDiagnostic = function() {
  if (fs.existsSync(diagnosticStorePath)) {
    var txt = fs.readFileSync(diagnosticStorePath);
    try {
      diagnosticStore = JSON.parse(txt);
    } catch (e) {
      logger.error("failed to diagnostic file - resetting to empty");
      diagnosticStore = {};
    }
  } else {
    logger.error("diagnostic store file not found - creating new");
    diagnosticStore = {};
  }
  return diagnosticStore;
};

var saveDiagnostic = function() {
  fs.writeFileSync(diagnosticStorePath, JSON.stringify(diagnosticStore,null,2));
};

getDiagnostics = function(name, def) {
  loadDiagnostic();
  if (typeof name === "undefined") {
    return diagnosticStore;
  } else {
    if (!diagnosticStore.hasOwnProperty(name)) {
      diagnosticStore[name] = def;
    }
    return diagnosticStore[name];
  }  
};

setDiagnostics = function(name, val) {
  diagnosticStore[name] = val;
  saveDiagnostic();  
};

var resetDiagnostics = function() {
  diagnosticStore.gitFailCount = 0;
  diagnosticStore.fs20Port = "/dev/ttyAMA0";
  diagnosticStore.sessionTransmit = 0;
  diagnosticStore.totalTransmit = 0;
  diagnosticStore.seenDevices = {};
  saveDiagnostic();
};

loadDiagnostic();

module.exports = {
  get: function() { return config; },
  getFS20: function() { return fs20Config; },
  getLocal: getLocal,
  setLocal: setLocal,
  getDiagnostics: getDiagnostics,
  setDiagnostics: setDiagnostics,
  resetDiagnostics: resetDiagnostics
};
