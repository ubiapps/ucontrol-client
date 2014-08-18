var messages = {
  portSaved: {
    msg: "Port saved successfully - you will need to reboot the device for the changs to take effect.",
    redirect: "/",
    timer: 5
  },
  invalidPort: {
    msg: "Invalid port",
    redirect: "/",
    timer: 5
  },
  notImplemented: {
    msg: "not implemented",
    redirect: "/",
    timer: 5
  },
  resetSuccess: {
    msg: "The device has been reset",
    redirect: "/rebootConfirmed",
    timer: 5
  },
  rebooting: {
    msg: "The device will now reboot",
    redirect: "/",
    timer: 200
  },
  deviceSet: {
    msg: "Device set successfully",
    redirect: "/",
    timer: 5
  },
  invalidDeviceCode: {
    msg: "Invalid device code",
    redirect: "/changeDevice",
    timer: 5
  },
  versionUpdate: {
    msg: "Software update check scheduled for next reboot",
    redirect: "/",
    timer: 5
  }
};

module.exports = messages;