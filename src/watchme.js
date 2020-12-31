const watchman = require('fb-watchman');
const path = require('path');
const fs = require('fs');
const client = new watchman.Client();
const { exec } = require('child_process');
const { exit } = require('process');

function preCheck(config) {
  const { user, host } = config;
  return new Promise(function (resolve, reject) {
    exec(`ssh -A ${user}@${host} echo helloworld`, (error, stdout, stderr) => {
      if (error || stderr) {
        console.error(`error: ${error.message}`);
        console.error(`please authenticate ssh to ${host} first`);
        reject();
        return;
      }
      console.log(`precheck ${user}@${host} ok`);
      resolve();
    });
  });
}

function runRsync({ user, host, remotePath, filePath, debug }) {
  exec(
    `rsync -av ${filePath} ${user}@${host}:${remotePath}/${filePath}`,
    (error, stdout, stderr) => {
      if (error || stderr) {
        console.error(`error: ${error.message}`);
        console.error(
          'please make sure remote folder exist or file permissions'
        );
        return;
      }
      if (debug) {
        console.log(`rsync ${filePath} to ${host}:${remotePath} ok`);
      }
    }
  );
}

function registerOnSubscription(config) {
  const handlerPlaceHolder = {
    rsync: runRsync,
  };

  const {
    user,
    debug,
    host,
    remote_path: remotePath,
    ignore_regexes: ignoreRegexes,
    type,
  } = config;
  const handler = handlerPlaceHolder[type];
  client.on('subscription', function (resp) {
    resp.files.forEach(file => {
      const filePath = file.name;
      const shouldIgnore = ignoreRegexes.some(regx => {
        return filePath.match(regx);
      });
      if (shouldIgnore) {
        if (debug) {
          console.log(`${filePath} match ignore_regexes. ignore`);
        }
        return;
      }
      handler({ filePath, user, host, remotePath, debug });
    });
  });
}

function subscribeChanges(config, watch, relative_path) {
  client.command(['clock', watch], function (error, resp) {
    if (error) {
      console.error('Failed to query clock:', error);
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
      console.error('Error initiating watch:', error);
      return;
    }

    // It is considered to be best practice to show any 'warning' or
    // 'error' information to the user, as it may suggest steps
    // for remediation
    if ('warning' in resp) {
      console.log('warning: ', resp.warning);
    }

    // `watch-project` can consolidate the watch for your
    // dir_of_interest with another watch at a higher level in the
    // tree, so it is very important to record the `relative_path`
    // returned in resp

    console.log(
      'watch established on ',
      resp.watch,
      resp.relative_path ? ' relative_path' : '',
      resp.relative_path ? resp.relative_path : ''
    );

    subscribeChanges(config, resp.watch, resp.relative_path);
  });
}

function getConfig() {
  const configPath = path.join(process.cwd(), '.watchme.json');
  let config;
  try {
    if (!fs.existsSync(configPath)) {
      console.error(`${configPath} is missing`);
      return null;
    }
    const rawdata = fs.readFileSync(configPath);
    config = JSON.parse(rawdata);
  } catch (err) {
    console.error(`${configPath} is not valid json`);
    return null;
  }
  const requiredKeys = ['host', 'user', 'type', 'remote_path'];
  const allKeysReady = requiredKeys.every(key => {
    return config[key];
  });
  if (!allKeysReady) {
    console.error(`missing required keys in config. ${requiredKeys}`);
    return null;
  }
  if (config.type !== 'rsync') {
    console.error('type only supports rsync now');
    return null;
  }
  config.ignore_regexes = config.ignore_regexes || [];
  return config;
}

function start() {
  client.capabilityCheck(
    { optional: [], required: ['relative_root'] },
    function (error, resp) {
      if (error) {
        // error will be an Error object if the watchman service is not
        // installed, or if any of the names listed in the `required`
        // array are not supported by the server
        console.error(error);
        console.error('Please install watchman first.');
        exit(1);
      }

      const config = getConfig();
      if (!config) {
        exit(1);
      }

      preCheck(config)
        .then(_ => {
          watchFolder(config);
        })
        .catch(_ => {
          exit(1);
        });
    }
  );
}

module.exports = start;
