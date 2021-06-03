const watchman = require('fb-watchman');
const path = require('path');
const fs = require('fs');
const client = new watchman.Client();
const process = require('process');
const exit = process.exit;
const { exec, spawn, execSync } = require('child_process');
const { readdir } = require('fs').promises;

const controlPersistSecs = 300;
const controlPath = '~/.ssh/cs-%h-%r';

const handlerPlaceHolder = {
  rsync: runRsync,
};

const colors = {
  red: msg => {
    return `\x1b[31m${msg}\x1b[0m`;
  },
  green: msg => {
    return `\x1b[32m${msg}\x1b[0m`;
  },
  yellow: msg => {
    return `\x1b[33m${msg}\x1b[0m`;
  },
};

console.info = msg => {
  return console.log(colors.green(msg));
};
console.error = msg => {
  return console.log(colors.red(msg));
};
console.warn = msg => {
  return console.log(colors.yellow(msg));
};

function doAuthWithMasterConnection(config) {
  const { user, host } = config;
  return new Promise(function (resolve, reject) {
    process.stdin.setEncoding('utf8');
    console.info('starting master connection...');
    const child = spawn(
      `ssh -A -tt -o ControlPath=${controlPath} -o ControlMaster=auto -o ControlPersist=${controlPersistSecs} ${user}@${host} echo ${colors.green(
        'authenticate ok'
      )}`,
      {
        shell: true,
        stdio: ['pipe', 'inherit', 'inherit'],
      }
    );
    let inProgress = false;
    let stopStdin = false;

    process.stdin.on('data', function (chunk) {
      if (inProgress || stopStdin) {
        return;
      }
      lines = chunk.split('\n');
      const yubikey = lines[0];
      child.stdin.write(yubikey);
      child.stdin.end();
      inProgress = true;
    });

    child.on('exit', function (code) {
      stopStdin = true;
      if (code == 0) {
        resolve();
      } else {
        console.error('authenticate failed');
        reject();
      }
    });
  });
}

function keepAliveConnection(config) {
  const { user, host } = config;
  setInterval(() => {
    const child = spawn(
      `ssh -S ${controlPath} ${user}@${host} echo keep alive`,
      {
        shell: true,
      }
    );

    child.on('exit', function (code) {
      if (code == 0) {
        console.debug('keep alive ok');
      } else {
        console.warn('keep alive failed');
      }
    });
  }, (controlPersistSecs / 5) * 1000);
}

function runRsync({ user, host, remotePath, filePath }) {
  return new Promise(function (resolve, reject) {
    exec(
      `rsync -avPR -e 'ssh -p 22 -S ${controlPath}' ${filePath} ${user}@${host}:${remotePath}`,
      (error, stdout, stderr) => {
        if (error || stderr) {
          return reject(error || stderr);
        }
        resolve(stdout);
      }
    );
  });
}

function registerOnSubscription(config) {
  const { user, host, remotePath, ignoreRegexes, type } = config;
  const handler = handlerPlaceHolder[type];
  client.on('subscription', function (resp) {
    resp.files.forEach(async file => {
      const filePath = file.name;
      const existMsg = !file.exists ? 'removed' : '';
      const typeMsg = file.type === 'd' ? 'dir' : '';
      const shouldIgnore = ignoreRegexes.some(regx => {
        return filePath.match(regx);
      });
      const ignoreMsg = shouldIgnore ? 'match ignore_regexes' : '';
      if (existMsg || typeMsg || ignoreMsg) {
        console.debug(`${filePath} is ${typeMsg} ${existMsg} ${ignoreMsg}`);
        return;
      }
      try {
        await handler({
          filePath,
          user,
          host,
          remotePath,
        });
        console.debug(`${filePath} ok`);
      } catch {
        console.error(
          `${filePath} fail. please make sure remote permissions ok`
        );
      }
    });
  });
}

function subscribeChanges(config, watch, relative_path) {
  client.command(['clock', watch], function (error, resp) {
    if (error) {
      console.error(`Failed to query clock: ${error}`);
      return;
    }

    sub = {
      expression: ['anyof', ['match', '*'], ['match', '.*']],
      // Which fields we're interested in
      fields: ['name', 'size', 'exists', 'type'],
      // add our time constraint
      since: resp.clock,
    };

    if (relative_path) {
      sub.relative_root = relative_path;
    }

    client.command(
      ['subscribe', watch, 'mysubscription', sub],
      function (error, resp) {
        // handle the result here
        if (error) {
          console.error('subscribe failed. watchme may not work correctly');
          return;
        }
        registerOnSubscription(config);
      }
    );
  });
}

function watchFolder(config) {
  // Initiate the watch
  client.command(['watch-project', process.cwd()], function (error, resp) {
    if (error) {
      console.error(`Error initiating watch: ${error}`);
      return;
    }

    // It is considered to be best practice to show any 'warning' or
    // 'error' information to the user, as it may suggest steps
    // for remediation
    if ('warning' in resp) {
      console.warn('warning: ', resp.warning);
    }

    // `watch-project` can consolidate the watch for your
    // dir_of_interest with another watch at a higher level in the
    // tree, so it is very important to record the `relative_path`
    // returned in resp

    console.info('watch on local', resp.watch);
    console.info('to remote', config.remote_path);

    subscribeChanges(config, resp.watch, resp.relative_path);
  });
}

function loadConfig(configPath) {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const rawdata = fs.readFileSync(configPath);
    return JSON.parse(rawdata);
  } catch (err) {
    console.error(`${configPath} is not valid json`);
  }
  return null;
}

function checkConfigKeys(config) {
  const requiredKeys = ['host', 'user', 'remote_path'];
  const allKeysReady = requiredKeys.every(key => {
    return config[key];
  });
  if (!allKeysReady) {
    console.error(`missing required keys in config. ${requiredKeys}`);
    return null;
  }

  config.type = config.type || 'rsync';
  if (!handlerPlaceHolder[config.type]) {
    console.error(`${config.type} is not support`);
    return null;
  }
  config.remotePath = config.remote_path.endsWith('/')
    ? config.remote_path
    : `${config.remote_path}/`;
  config.ignoreRegexes = config.ignore_regexes || [];

  return config;
}

function getFinalConfig() {
  const localConfigPath = path.join(process.cwd(), '.watchme.json');
  const localConfig = loadConfig(localConfigPath);
  if (!localConfig) {
    logger.error(`${localConfigPath} is not found`);
    exit(1);
  }

  const globalConfigPath = `${require('os').homedir()}/.watchme.json`;
  const globalConfig = loadConfig(globalConfigPath);

  const mergedConfig = { ...globalConfig, ...localConfig };
  console.info('==== final config ====');
  console.info(mergedConfig);
  const config = checkConfigKeys(mergedConfig);
  if (!config) {
    exit(1);
  }

  if (!config.debug) {
    console.debug = () => {};
  }
  return config;
}

function startWatch() {
  client.capabilityCheck(
    { optional: [], required: ['relative_root'] },
    async function (error, resp) {
      if (error) {
        // error will be an Error object if the watchman service is not
        // installed, or if any of the names listed in the `required`
        // array are not supported by the server
        console.error(error);
        console.error('Please install watchman first.');
        exit(1);
      }

      const config = getFinalConfig();

      try {
        await doAuthWithMasterConnection(config);
      } catch {
        exit(1);
      }
      keepAliveConnection(config);
      watchFolder(config);
    }
  );
}

async function getFilesUnder({ rootDir, dir, ignoreRegexes }) {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map(dirent => {
      let pathName = path.resolve(dir, dirent.name);
      pathName = dirent.isDirectory() ? `${pathName}/` : pathName;
      const shouldIgnore = ignoreRegexes.some(regx => {
        return pathName.match(regx);
      });
      if (shouldIgnore) {
        console.debug(`${pathName} match ignore_regexes.`);
        return null;
      }
      return dirent.isDirectory()
        ? getFilesUnder({
            rootDir,
            dir: pathName,
            ignoreRegexes,
          })
        : pathName;
    })
  );
  const flattenFiles = Array.prototype.concat(...files);
  const filteredFiles = flattenFiles.filter(file => file);
  const relativeFiles = filteredFiles.map(file => {
    return file.replace(`${rootDir}/`, '');
  });
  return relativeFiles;
}

async function uploadAll() {
  const config = getFinalConfig();
  try {
    await doAuthWithMasterConnection(config);
  } catch {
    exit(1);
  }
  const { user, host, remotePath, type, ignoreRegexes } = config;
  console.info('=== Prepare to upload all files ===');
  const files = await getFilesUnder({
    rootDir: process.cwd(),
    dir: process.cwd(),
    ignoreRegexes,
  });
  const handler = handlerPlaceHolder[type];
  for (let index = 0; index < files.length; index++) {
    const filePath = files[index];
    try {
      await handler({
        filePath,
        user,
        host,
        remotePath,
      });
      console.debug(`${filePath} ok`);
    } catch {
      console.warn(`${filePath} failed`);
    }
  }
  exit(0);
}

function initConfig() {
  const localConfigPath = path.join(process.cwd(), '.watchme.json');
  const whoami = execSync('whoami', { encoding: 'utf-8' });
  const username = String(whoami).trim();
  const config = {
    user: username,
    host: '',
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
  };
  fs.writeFile(localConfigPath, JSON.stringify(config, null, 2), () => {
    console.info('config initial done');
  });
}

module.exports = {
  startWatch,
  uploadAll,
  initConfig,
};
