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
  this.state = deviceManager.getDeviceState();
  this.ensureLogin()
  .catch();
}

GarageController.prototype.ensureLogin = function() {
  // 30 minute token it seems
  if (this.account && this.loginTokenTime > Date.now() - 29 * 60 * 1000) {
    return Promise.resolve(this.account);
  }

  var account = new MyQ(username, password);
  
  return account.login()
  .then((result) => {
    log.i(`login result: ${JSON.stringify(result)}`);
    this.account = account;
    this.loginTokenTime = Date.now();

    try {
      this.deviceId = scriptSettings.getInt('deviceId');
      if (this.deviceId) {
        log.i(`controlling garage door: ${this.deviceId}`);
        // all configured successfully, can wait for commands now.
        return Promise.resolve(this.account);
      }
      log.i('No "deviceId" Script Setting found. Searching for default door');
    }
    catch (e) {
      log.e('The existing "deviceId" script configuration value was invalid: ' + e);
      throw e;
    }

    log.i('The "deviceId" script configuration was not provided, listing devices to determine a default door.');
  
    return account.getDevices([7, 17])
    .then((result) => {
      log.i(`device query: ${JSON.stringify(result)}`);
      if (!result) {
        log.e('Unable to query MyQ service. Are your "username" and "password" correct?');
        return;
      }
      result = result.devices;
      if (result.length == 0) {
        log.e('No doors found.');
        return Promise.reject();
      }
      if (result.length != 1) {
        log.e('Multiple doors were found. The "deviceId" script configuration value must be provided from one of the following:')
        for (var i = 0; i < result.length; i++) {
          var r = result[i];
          log.e(`${r.id}: ${r.name}`);
        }
        return Promise.reject();
      }
  
      var r = result[0];
      log.i(`Door found. Setting "deviceId" script configuration value to ${r.id}: ${r.name}`);
      scriptSettings.putInt('deviceId', r.id);
      this.deviceId = r.id;

      return this.account;
    })
  })
  .then(() => this.refresh())
  .catch((err) => {
    log.e('Error logging in. Are the "username" and/or "password" script configuration values correct?\n' + err);
    throw err;
  });
};

GarageController.prototype.closeEntry = function() {
  if (!this.account) {
    log.e('could not close garage door, account login failed');
    return;
  }

  if (!this.deviceId) {
    log.e('no "deviceId" script setting was found or inferred.')
    return;
  }

  this.ensureLogin()
  .then(() => this.account.setDoorState(this.deviceId, 0))
  .then((result) => {
    // command success
    log.i('garage door closed');
    log.i(JSON.stringify(result));
  })
  .catch((err) => {
    log.e('garage door close failed: ' + err);
  })
  .then(() => this.refresh());
};

GarageController.prototype.openEntry = function() {
  if (!this.account) {
    log.e('could not close, account login failed');
    return;
  }

  if (!this.deviceId) {
    log.e('no "deviceId" script setting was found or inferred.')
    return;
  }

  this.ensureLogin()
  .then(() => this.account.setDoorState(this.deviceId, 1))
  .then((result) => {
    log.i('garage door opened');
    log.i(JSON.stringify(result));
  })
  .catch((err) => {
    log.e('garage door open failed: ' + err);
  })
  .then(() => this.refresh());
};

GarageController.prototype.getRefreshFrequency = function() {
  return 60;
};

GarageController.prototype.refresh = function() {
  if (!this.account) {
    return;
  }

  this.ensureLogin()
  .then(() => this.account.getDoorState(this.deviceId))
  .then((result) => {
    log.i(`Refresh: ${JSON.stringify(result)}`);
    if (result.doorState !== undefined) {
      this.state.entryOpen = result.doorState !== 2;
    }
    else {
      delete this.account;
    }
  })
  .catch((err) => {
    log.e(`error getting door state: ${err}`);
  });
};

export default new GarageController();
