const { getFinalConfig } = require('./configHandler');
const { startWatch } = require('./watchCore');
const { exit } = require('process');

async function startWatchAll(profiles) {
  let myProfiles;
  try {
    myProfiles = getFinalConfig(profiles);
  } catch (e) {
    console.error(e);
    exit(1);
  }
  for (let profile of myProfiles) {
    try {
      await startWatch(profile);
    } catch (e) {
      console.error(e);
      exit(1);
    }
  }
}

module.exports = {
  startWatchAll,
};
