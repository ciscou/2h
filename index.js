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

client2Hire.get(
  '/admin/api/service/setting', {
    params: {
      site: SITE_ID
    }
  }
).then(response => {
  const settings = response.data['data']['specific'][SITE_ID]['service'];

  ASSET_TYPES.forEach(function(assetType) {
    console.log(assetType, "enabled", settings['vehicle']['enabled'][assetType]);
    console.log(assetType, "battery threshold", settings['vehicle']['lowBattery'][assetType]);
    console.log(assetType, "service hours", settings['availability'][assetType]['frames']);
  });
}).catch(err => {
  console.error("Could not fetch service setting:", err.message, err.response && err.response.data);
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

function difference(vs1, vs2) {
  const diff = {}

  Object.entries(vs1).forEach(([k, v]) => {
    if(!vs2.hasOwnProperty(k)) {
      diff[k] = v;
    }
  });

  return diff;
}

function fetchAdminVehicles(assetType) {
  return new Promise(function(resolve, reject) {
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
        if(av.external_status.available) {
          vehicles[av.id] = parseApiVehicle(av);
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
        vehicles[av.id] = parseApiVehicle(av);
      });

      resolve(vehicles);
    }).catch(err => {
      console.error("Could not fetch user vehicles:", err.message, err.response && err.response.data);

      reject(err);
    });
  });
}

function showDifferences(assetType) {
  Promise.all([fetchAdminVehicles(assetType), fetchUserVehicles(assetType)])
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

ASSET_TYPES.forEach(function(assetType) {
  showDifferences(assetType);
});
