// webpack polyfill 'usage' does not seem to work on modules.
// include directly.
import "core-js/modules/es7.array.includes";
import "core-js/modules/es6.promise";

import MyQ from 'myq-api';

const username = scriptConfiguration.getString('username');
const password = scriptConfiguration.getString('password');

if (!username || !password) {
  throw new Error('The "username" and/or "password" script configuration values are missing..');
}

function VirtualDevice() {
  var account = new MyQ(username, password);
  
  account.login()
  .then((result) => {
    this.account = account;

    try {
      this.deviceId = scriptConfiguration.getInt('deviceId');
      log.i(`controlling garage door: ${this.deviceId}`);
      // all configured successfully, can wait for commands now.
      return;
    }
    catch (e) {
      log.e('The existing "deviceId" script configuration value was invalid: ' + e);
    }

    log.i('The "deviceId" script configuration was not provided, listing devices to determine a default door.');
  
    account.getDevices([17])
    .then((result) => {
      result = result.devices;
      if (result.length == 0) {
        log.e('No doors found.');
        return;
      }
      if (result.length != 1) {
        log.e('Multiple doors were found. The "deviceId" script configuration value must be provided from one of the following:')
        for (var i = 0; i < result.length; i++) {
          var r = result[i];
          log.e(`${r.id}: ${r.name}`);
        }
        return;
      }

      var r = result[0];
      log.i(`Door found. Setting "deviceId" script configuration value to ${r.id}: ${r.name}`);
      scriptConfiguration.putInt('deviceId', r.id);
      this.deviceId = r.id;
    })
    .catch((err) => {
      log.e('Error listing devices: ' + err);
    }); 
  })
  .catch((err) => {
    log.e('Error logging in. Are the "username" and/or "password" script configuration values correct?\n' + err);
  });
}

// implementation of Entry
VirtualDevice.prototype.close = function() {
  if (!this.account) {
    log.e('could not close garage door, account login failed');
    return;
  }

  if (!this.deviceId) {
    log.e('no "deviceId" script setting was found or inferred.')
    return;
  }

  this.account.setDoorState(this.deviceId, 0)
  .then((result) => {
    // command success
    log.i('garage door closed');
  })
  .catch((err) => {
    log.e('garage door close failed: ' + err);
  });
};

VirtualDevice.prototype.open = function() {
  if (!this.account) {
    log.e('could not close, account login failed');
    return;
  }

  if (!this.deviceId) {
    log.e('no "deviceId" script setting was found or inferred.')
    return;
  }

  this.account.setDoorState(this.deviceId, 1)
  .then((result) => {
    log.i('garage door opened');
  })
  .catch((err) => {
    log.e('garage door open failed: ' + err);
  });
};

exports.result = new VirtualDevice();
