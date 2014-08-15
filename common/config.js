var fs = require("fs");
var path = require("path");
var config = require("../config.json");
var localConfigPath = path.join(__dirname,"../","config.local.json");
var localConfig = {};

var load = function() {
  return config;
};

var loadLocal = function() {
  if (fs.exists(localConfigPath)) {
    localConfig = require(localConfigPath);
  }
  return localConfig;
};

var saveLocal = function() {
  fs.writeFileSync(localConfigPath, JSON.stringify(localConfig,null,2));
};

var getLocal = function(name, def) {
  if (!localConfig.hasOwnProperty(name)) {
    localConfig[name] = def;
  }

  return localConfig[name];
};

var setLocal = function(name,val) {
  localConfig[name] = val;
  saveLocal();
};

loadLocal();

module.exports = {
  get: load,
  getLocal: getLocal,
  setLocal: setLocal
}