var express = require('express');
var basicAuth = require('basic-auth-connect');
var util = require('util');
var bodyParser = require('body-parser');
var fs = require("fs");
var path = require("path");
var config = require("../common/config");
var messages = require("./messages");
var shell = require("shelljs");
var rebootRequired = false;

var app = express();
app.use(basicAuth('admin', 'ubi123'));
app.use(bodyParser.json());       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.get('/', function(req, res){
  res.render("settings",{ static: config.get(), local: config.getLocal(), rebootRequired: rebootRequired });
});

app.get("/changeDevice", function(req,res) {
  res.render("changeDevice",{ static: config.get(), local: config.getLocal() });
});

app.get("/versionUpdate", function(req,res) {
  config.setLocal("forceUpdate",true);
  rebootRequired = true;
  res.redirect("success/versionUpdate");
});

app.get("/success/:id", function(req,res) {
  var msg = messages[req.params.id];
  res.render("success", { message: msg });
});

app.get("/failed/:id", function(req,res) {
  var msg = messages[req.params.id];
  res.render("failed", { message: msg });
});

app.post("/setDevice", function(req, res) {
  var devCode = req.body.devices;
  if (devCode.length !== 5) {
    res.redirect("failed/invalidDeviceCode");
  } else {
    config.setLocal("fs20Code",devCode.toLowerCase());
    rebootRequired = true;
    res.redirect("success/deviceSet");
  }
});

app.post("/setPort", function(req,res) {
  var port = req.body.fs20Port;
  if (port.length > 0) {
    config.setLocal("fs20Port",port);
    rebootRequired = true;
    res.redirect("success/portSaved");
  } else {
    res.redirect("failed/invalidPort");
  }
});

app.post("/setWebPort", function(req,res) {
  var port = parseInt(req.body.adminWebPort);
  if (port > 0) {
    config.setLocal("adminWebPort",port);
    rebootRequired = true;
    res.redirect("success/portSaved");
  } else {
    res.redirect("failed/invalidPort");
  }
});

app.post("/resetConfirmed",function(req,res) {
  config.resetLocal();
  rebootRequired = true;
  res.redirect("success/resetSuccess");
});

app.get("/reboot",function(req,res) {
  res.render("rebootConfirm");
});

app.get("/rebootConfirmed", function(req,res) {
  shell.exec("reboot");
  res.redirect("success/rebooting");
});

app.post("/setThreshold", function(req,res) {
  res.redirect("failed/notImplemented");
});

app.get("/resetDevice", function(req,res) {
  res.render("resetConfirm");
});

var server = app.listen(config.getLocal("adminWebPort",80), function() {
  console.log('Listening on port %d', server.address().port);
});