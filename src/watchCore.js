const watchman = require('fb-watchman');
const client = new watchman.Client();
const process = require('process');
const { exec, spawn } = require('child_process');

const controlPersistSecs = 300;
const controlPath = '~/.ssh/cs-%h-%r';

let focusChild = null;
process.stdin.setEncoding('utf8');
process.stdin.on('data', function (chunk) {
  if (!focusChild) {
    return;
  }
  lines = chunk.split('\n');
  const yubikey = lines[0];
  focusChild.stdin.write(yubikey);
  focusChild.stdin.end();
});

function doAuthWithMasterConnection(config) {
  const { user, host, logger } = config;
  return new Promise(function (resolve, reject) {
    process.stdin.setEncoding('utf8');
    logger.info('starting master connection...');
    const child = spawn(
      `ssh -A -tt -o ControlPath=${controlPath} -o ControlMaster=auto -o ControlPersist=${controlPersistSecs} ${user}@${host} echo ${`${host} authenticate ok`}`,
      {
        shell: true,
        stdio: ['pipe', 'inherit', 'inherit'],
      }
    );

    if (focusChild) {
      logger.error("has focusChild. Shouldn't happen");
      reject();
    }

    child.on('exit', function (code) {
      focusChild = null;
      if (code == 0) {
        resolve(controlPath);
      } else {
        reject();
      }
    });
  });
}

function keepAliveConnection(config) {
  const { user, host, logger } = config;
  setInterval(() => {
    const child = spawn(
      `ssh -S ${controlPath} ${user}@${host} echo keep alive`,
      {
        shell: true,
      }
    );

    child.on('exit', function (code) {
      if (code == 0) {
        logger.debug('=== keep alive ok ===');
      } else {
        logger.warn('=== keep alive failed ===');
      }
    });
  }, (controlPersistSecs / 5) * 1000);
}

function runRsync({ user, host, remotePath, filePath, logger }) {
  return new Promise(function (resolve, reject) {
    exec(
      `rsync -avPR -e 'ssh -p 22 -S ${controlPath}' ${filePath} ${user}@${host}:${remotePath}`,
      (error, stdout, stderr) => {
        if (error || stderr) {
          return reject(error || stderr);
        }
        logger.debug(stdout);
        resolve(stdout);
      }
    );
  });
}

function registerOnSubscription(config) {
  const { user, host, remotePath, ignoreRegexes, logger } = config;
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
        await runRsync({
          filePath,
          user,
          host,
          remotePath,
          logger,
        });
      } catch {
        logger.error(
          `${filePath} fail. please make sure remote permissions ok`
        );
      }
    });
  });
}

function subscribeChanges(config, watch, relative_path) {
  client.command(['clock', watch], function (error, resp) {
    if (error) {
      throw new Error(error);
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
          throw new Error(error);
        }
        registerOnSubscription(config);
      }
    );
  });
}

function watchFolder(config) {
  const { localPath, remotePath, logger } = config;
  // Initiate the watch
  client.command(['watch-project', localPath], function (error, resp) {
    if (error) {
      throw new Error(`Error initiating watch: ${error}`);
    }

    // It is considered to be best practice to show any 'warning' or
    // 'error' information to the user, as it may suggest steps
    // for remediation
    if ('warning' in resp) {
      logger.warn('warning: ', resp.warning);
    }

    // `watch-project` can consolidate the watch for your
    // dir_of_interest with another watch at a higher level in the
    // tree, so it is very important to record the `relative_path`
    // returned in resp

    logger.info('watch on local', resp.watch);
    logger.info('to remote', remotePath);

    subscribeChanges(config, resp.watch, resp.relative_path);
  });
}

function startWatch(config) {
  return new Promise(function (resolve, reject) {
    client.capabilityCheck(
      { optional: [], required: ['relative_root'] },
      async function (error, resp) {
        if (error) {
          // error will be an Error object if the watchman service is not
          // installed, or if any of the names listed in the `required`
          // array are not supported by the server
          reject(`Please install watchman first. ${error}`);
        }

        try {
          await doAuthWithMasterConnection(config);
          keepAliveConnection(config);
          watchFolder(config);
          resolve();
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

module.exports = {
  startWatch,
  doAuthWithMasterConnection,
};
