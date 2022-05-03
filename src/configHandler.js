const fs = require('fs');
const path = require('path');
const os = require('os');
const process = require('process');
const { execSync } = require('child_process');

const { getLogger } = require('./utils');

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    const rawdata = fs.readFileSync(configPath);
    return JSON.parse(rawdata);
  } catch (err) {
    throw new Error(`${configPath} is not valid json`);
  }
}

function setupLogger({ config, name, isDebug }) {
  config.logger = getLogger(name, isDebug);
}

function santizeConfig(config, requiredKeys) {
  const allKeysReady = requiredKeys.every(key => {
    return config[key];
  });
  if (!allKeysReady) {
    throw new Error(`missing required keys in config. ${requiredKeys}`);
  }

  config.remotePath = config.remote_path.endsWith('/')
    ? config.remote_path
    : `${config.remote_path}/`;
  delete config.remote_path;

  config.localPath = config.local_path.endsWith('/')
    ? config.local_path
    : `${config.local_path}/`;
  delete config.local_path;

  const rawRegx = config.ignore_regexes || [];
  const compiledRegx = rawRegx.map(regx => new RegExp(regx, 'gi'));
  config.ignoreRegexes = compiledRegx;
  delete config.ignore_regexes;

  return config;
}

function buildMainProfile(config) {
  config.profiles = config.profiles || {};
  config.profiles['main'] = config.profiles['main'] || {};

  const copyKeys = ['host', 'user', 'remote_path', 'debug'];
  copyKeys.forEach(key => {
    config.profiles['main'][key] = config[key];
  });
  config.profiles['main']['local_path'] = config.local_path || process.cwd();
}

function getFinalConfig(profiles) {
  const localConfigPath = path.join(process.cwd(), '.watchme.json');
  const localConfig = loadConfig(localConfigPath);

  const globalConfigPath = `${os.homedir()}/.watchme.json`;
  const globalConfig = loadConfig(globalConfigPath);

  const mergedConfig = { ...globalConfig, ...localConfig };
  buildMainProfile(mergedConfig);

  let requireProfiles = '' + profiles || '';
  requireProfiles = requireProfiles.split(',').filter(profile => profile);
  if (requireProfiles.length == 0) {
    requireProfiles.push('main');
  }

  const requiredKeys = ['host', 'user', 'remote_path', 'local_path'];
  const returnProfiles = requireProfiles.map(profile => {
    if (!mergedConfig.profiles[profile]) {
      throw new Error(`profile '${profile}' is not defined in .watchme.config`);
    }

    const profileConfig = mergedConfig.profiles[profile];
    const profileMergedConfig = { ...globalConfig, ...profileConfig };
    console.log(`====== profile ${profile} =======>>`);
    console.log(profileMergedConfig);
    console.log(`<<====== profile ${profile} =======`);
    santizeConfig(profileMergedConfig, requiredKeys);
    setupLogger({
      config: profileMergedConfig,
      name: profile,
      isDebug: profileMergedConfig.debug,
    });
    mergedConfig.profiles[profile] = profileMergedConfig;

    return profileMergedConfig;
  });

  return returnProfiles;
}

function initConfig() {
  const localConfigPath = path.join(process.cwd(), '.watchme.json');
  const whoami = execSync('whoami', { encoding: 'utf-8' });
  const username = String(whoami).trim();
  const config = {
    user: username,
    host: 'host',
    remote_path: `/home/${username}`,
    debug: true,
    ignore_regexes: [
      'watchme\\.json',
      '/venv/',
      '\\.svn/',
      '\\.hg/',
      '\\.git/',
      '\\.bzr',
      '_darcs',
      'CVS',
      '\\.DS_Store',
      'Thumbs\\.db',
      'desktop\\.ini',
      'node_modules/',
      '__pycache__/',
      '\\.vscode',
    ],
    profiles: {
      profileA: {
        host: 'hostA',
        local_path: '/home/${username}/projectA',
        remote_path: `/home/${username}/projectA`,
      },
    },
  };
  fs.writeFile(localConfigPath, JSON.stringify(config, null, 2), () => {
    console.log('config initial done');
    process.exit(0);
  });
}

module.exports = {
  getFinalConfig,
  initConfig,
};
