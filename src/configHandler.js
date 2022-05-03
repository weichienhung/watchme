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

function santizeConfig(config) {
  const requiredKeys = ['host', 'user', 'remote_path', 'local_path'];

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

function processProfiles(globalConfig, localConfig) {
  const copyKeys = [
    'host',
    'user',
    'remote_path',
    'debug',
    'ignore_regexes',
    'local_path',
  ];
  const outputConfig = {};
  // special for main profile
  localConfig.profiles = localConfig.profiles || {};
  localConfig.profiles.main = localConfig.profiles.main || {};

  function mergeAttrs(config) {
    for (profile in config.profiles) {
      outputConfig[profile] = outputConfig[profile] || {};
      copyKeys.forEach(key => {
        // order:
        // copy from config.profile.key
        // copy from config.key
        // copy form global.key
        // Can't use sytax like xx || yy || zz, because the value might have false
        if (config.profiles[profile][key] !== undefined) {
          outputConfig[profile][key] = config.profiles[profile][key];
        } else if (config[key] !== undefined) {
          outputConfig[profile][key] = config[key];
        } else if (globalConfig[key] !== undefined) {
          outputConfig[profile][key] = globalConfig[key];
        }
      });
      // special key to handle
      outputConfig[profile].name = profile;
      outputConfig[profile].local_path =
        outputConfig[profile].local_path || process.cwd();
    }
  }

  mergeAttrs(localConfig); //local must run before globalConfig.
  mergeAttrs(globalConfig);
  return outputConfig;
}

function getFinalConfig(profiles) {
  const localConfigPath = path.join(process.cwd(), '.watchme.json');
  const localConfig = loadConfig(localConfigPath);

  const globalConfigPath = `${os.homedir()}/.watchme.json`;
  const globalConfig = loadConfig(globalConfigPath);

  let profileConfigs = processProfiles(globalConfig, localConfig);

  const requireProfiles = profiles.split(',').filter(profile => profile);
  if (requireProfiles.length == 0) {
    requireProfiles.push('main');
  }

  const returnProfiles = requireProfiles.map(profile => {
    if (!profileConfigs[profile]) {
      throw new Error(`profile '${profile}' is not defined in .watchme.json`);
    }

    const profileConfig = profileConfigs[profile];
    console.log(`====== profile ${profile} =======>>`);
    console.log(profileConfig);
    console.log(`<<====== profile ${profile} =======`);
    santizeConfig(profileConfig);
    setupLogger({
      config: profileConfig,
      name: profile,
      isDebug: profileConfig.debug,
    });

    return profileConfig;
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
