// webpack polyfill 'usage' does not seem to work on modules.
// include directly.
import MyQ from 'myq-api';
import sdk from '@scrypted/sdk';

const {deviceManager} = sdk;
const username = scriptSettings.getString('username');
const password = scriptSettings.getString('password');

function alertAndThrow(msg) {
  log.a(msg);
  throw new Error(msg);
}

if (!username) {
  alertAndThrow('The "username" Script Setting values is missing.');
}

if (!password) {
  alertAndThrow('The "password" Script Setting values is missing.');
}

function GarageController() {
  this.devices = {};

  this.ensureLogin()
  .then(() => {
    var devices = [];
    var payload = {
        devices,
    };
    return this.account.getDevices([3, 7, 17])
    .then((result) => {
      if (!result) {
        log.e('Unable to query MyQ service. Are your "username" and "password" correct?');
        return;
      }

      log.i(`device query: ${JSON.stringify(result)}`);
      if (!result) {
        log.e('Unable to query MyQ service. Are your "username" and "password" correct?');
        return;
      }
      result = result.devices;
      for (var r of result) {
        if (r.typeId == 3) {
          var info = {
            name: r.name,
            // native id is a number. make sure we pass a string.
            nativeId: r.id.toString(),
            interfaces: ['OnOff', 'Refresh'],
            events: ['OnOff'],
            type: 'Light',
          }
          this.devices[info.nativeId] = new GarageLight(this, info);
        }
        else if (r.typeId == 7 || r.typeId == 17) {
          var info = {
            name: r.name,
            // native id is a number. make sure we pass a string.
            nativeId: r.id.toString(),
            interfaces: ['Entry', 'Refresh'],
            events: ['Entry'],
            type: 'Entry',
          }
          this.devices[info.nativeId] = new GarageDoor(this, info);
        }
        else {
          continue;
        }

        devices.push(info);
      }

      deviceManager.onDevicesChanged(payload);
    });
  });
}

GarageController.prototype.ensureLogin = function() {
  // 30 minute token it seems
  if (this.account && this.loginTokenTime > Date.now() - 29 * 60 * 1000) {
    return Promise.resolve(this.account);
  }

  var account = new MyQ(username, password);
  
  return account.login()
  .then((result) => {
    if (result.returnCode !== 0) {
      throw new Error(JSON.stringify(result));
    }
    log.i(`login result: ${JSON.stringify(result)}`);
    this.account = account;
    this.loginTokenTime = Date.now();

    return this.account;
  })
  .catch((err) => {
    log.e('Error logging in. Are the "username" and/or "password" script configuration values correct?\n' + err);
    throw err;
  });
};

GarageController.prototype.getDevice = function(nativeId) {
  return this.devices[nativeId];
}

function GarageDoor(controller, info) {
  this.controller = controller;
  this.info = info;
  setImmediate(() => this.state = deviceManager.getDeviceState(info.nativeId));
}

function doorStateCommand(state) {
  return function() {
    this.controller.ensureLogin()
    .then(() => this.controller.account.setDoorState(this.info.nativeId, state))
    .then((result) => {
      log.i(JSON.stringify(result));
    })
    .catch((err) => {
      log.e('garage door command failed: ' + err);
    })
    .then(() => this.refresh());
    }
}

GarageDoor.prototype.closeEntry = doorStateCommand(0);
GarageDoor.prototype.openEntry = doorStateCommand(1);

GarageDoor.prototype.getRefreshFrequency = function() {
  return 60;
};

GarageDoor.prototype.refresh = function() {
  this.controller.ensureLogin()
  .then(() => this.controller.account.getDoorState(this.info.nativeId))
  .then((result) => {
    log.i(`Refresh: ${JSON.stringify(result)}`);
    if (result.doorState !== undefined) {
      this.state.entryOpen = result.doorState !== 2;
    }
  })
  .catch((err) => {
    log.e(`error getting door state: ${err}`);
  });
};

function GarageLight(controller, info) {
  this.controller = controller;
  this.info = info;
  setImmediate(() => this.state = deviceManager.getDeviceState(info.nativeId));
}

function lightStateCommand(state) {
  return function() {
    this.controller.ensureLogin()
    .then(() => this.controller.account.setLightState(this.info.nativeId, state))
    .then((result) => {
      log.i(JSON.stringify(result));
    })
    .catch((err) => {
      log.e('light command failed: ' + err);
    })
    .then(() => this.refresh());
    }
}

GarageLight.prototype.turnOn = lightStateCommand(1);
GarageLight.prototype.turnOff = lightStateCommand(0);

GarageLight.prototype.refresh = function() {
  this.controller.ensureLogin()
  .then(() => this.controller.account.getLightState(this.info.nativeId))
  .then((result) => {
    log.i(`Refresh: ${JSON.stringify(result)}`);
    if (result.lightState !== undefined) {
      this.state.on = result.lightState !== 0;
    }
  })
  .catch((err) => {
    log.e(`error getting light state: ${err}`);
  });
};

GarageLight.prototype.getRefreshFrequency = function() {
  return 60;
};

export default new GarageController();
