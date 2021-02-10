require('dotenv').config();

const SITE_ID = process.env.SITE_ID;

const ASSET_TYPES = process.env.ASSET_TYPES.split(",")

const axios = require('axios');

const client2Hire = axios.create({
  baseURL: process.env.BASE_URL,
  headers: {
    'Authorization': `Bearer ${process.env.AUTHORIZATION_BEARER}`,
    'X-SERVICE-TOKEN': process.env.SERVICE_TOKEN
  },
});

function parseApiVehicle(av) {
  return {
    id: av.id,
    license_plate: av.license_plate,
    reference_code: av.reference_code,
    status: av.status,
    available: av.external_status.available,
    pos: { lat: av.latitude, lng: av.longitude },
    status: av.status,
    battery_percentage: av.total_percentage
  }
}

function parseApiServiceSettings(ass) {
  const settings = {}

  ASSET_TYPES.forEach(function(assetType) {
    settings[assetType] = {
      enabled: ass['vehicle']['enabled'][assetType],
      batteryThreshold: ass['vehicle']['lowBattery'][assetType],
      serviceHours: ass['availability'][assetType]['frames']
    }
  });

  return settings;
}

function withinServiceHours(assetTypeSettings) {
  const now = new Date(); // TODO handle different TZs
  const now_hhmm = now.getHours() * 100 + now.getMinutes();

  matchingFrame = assetTypeSettings.serviceHours.find(frame => {
    const start_hhmm = frame.start.hour * 100 + frame.start.minute;
    const end_hhmm = frame.end.hour * 100 + frame.end.minute;

    return (start_hhmm <= now_hhmm) && (now_hhmm <= end_hhmm)
  });

  return !!matchingFrame;
}

function doNotBotherFetchingVehicles(assetTypeSettings) {
  return !assetTypeSettings.enabled || !withinServiceHours(assetTypeSettings);
}

function shouldIncludeVehicle(assetTypeSettings, vehicle) {
  return (
    // v.available && // TODO looks like this is a combination of status + battery check?
    (vehicle.status === "free") &&
    (vehicle.battery_percentage >= assetTypeSettings.batteryThreshold)
  )
}

function difference(vs1, vs2) {
  const diff = {}

  Object.entries(vs1).forEach(([k, v]) => {
    if(!vs2.hasOwnProperty(k)) {
      diff[k] = v;
    }
  });

  return diff;
}

function fetchServiceSettings() {
  return new Promise(function(resolve, reject) {
    client2Hire.get(
      '/admin/api/service/setting', {
        params: {
          site: SITE_ID
        }
      }
    ).then(response => {
      const apiServiceSettings = response.data['data']['specific'][SITE_ID]['service'];

      resolve(parseApiServiceSettings(apiServiceSettings));
    }).catch(err => {
      console.error("Could not fetch service setting:", err.message, err.response && err.response.data);

      reject(err)
    });
  });
}

function fetchAdminVehicles(assetType, assetTypeSettings) {
  return new Promise(function(resolve, reject) {
    if(doNotBotherFetchingVehicles(assetTypeSettings)) {
      resolve([]);
      return;
    }

    client2Hire.get(
      '/admin/api/sharing/vehicle', {
        params: {
          site: SITE_ID,
          mode: 'minimal',
          filters: JSON.stringify({
            _self: {
              online: true,
              type: [assetType]
            }
          })
        }
      }
    ).then(response => {
      const vehicles = {};

      response.data['data'].forEach(av => {
        const v = parseApiVehicle(av);

        if(shouldIncludeVehicle(assetTypeSettings, v)) {
          vehicles[v.id] = v;
        }
      });

      resolve(vehicles);
    }).catch(err => {
      console.error("Could not fetch admin vehicles:", err.message, err.response && err.response.data);

      reject(err);
    });
  });
}

function fetchUserVehicles(assetType) {
  return new Promise(function(resolve, reject) {
    client2Hire.get(
      '/user/api/sharing/vehicle', {
        params: {
          site: SITE_ID,
          filters: JSON.stringify({
            _self: {
              type: [assetType]
            }
          })
        }
      }
    ).then(response => {
      const vehicles = {};

      response.data['data'].forEach(av => {
        const v = parseApiVehicle(av);

        vehicles[v.id] = v;
      });

      resolve(vehicles);
    }).catch(err => {
      console.error("Could not fetch user vehicles:", err.message, err.response && err.response.data);

      reject(err);
    });
  });
}

function showDifferences(assetType, assetTypeSettings) {
  Promise.all([fetchAdminVehicles(assetType, assetTypeSettings), fetchUserVehicles(assetType)])
    .then(([adminVehicles, userVehicles]) => {
      const adminVehiclesNotInUserVehicles = difference(adminVehicles, userVehicles);
      const userVehiclesNotInAdminVehicles = difference(userVehicles, adminVehicles);

      console.log(assetType, "admin vehicles", Object.keys(adminVehicles).length);
      console.log(assetType, "user vehicles", Object.keys(userVehicles).length);
      console.log(assetType, "admin vehicles not in user vehicles", Object.values(adminVehiclesNotInUserVehicles));
      console.log(assetType, "user vehicles not in admin vehicles", Object.values(userVehiclesNotInAdminVehicles));
    })
    .catch(err => {
      console.error("Oooops!", err);
    })
}

fetchServiceSettings()
  .then(settings => {
    console.log("settings", settings);

    ASSET_TYPES.forEach(function(assetType) {
      showDifferences(assetType, settings[assetType]);
    });
  })
  .catch(err => {
    console.error("Oooops!", err);
  })
