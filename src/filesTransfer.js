const { exec, spawn } = require('child_process');
const { exit } = require('process');
const fs = require('fs');
const path = require('path');

const { getFinalConfig } = require('./configHandler');
const { doAuthWithMasterConnection } = require('./watchCore');

async function uploadAll(profiles) {
  let myProfiles;
  try {
    myProfiles = getFinalConfig(profiles);
  } catch (e) {
    console.error(e);
    exit(1);
  }
  if (myProfiles.length > 1) {
    myProfiles[0].logger.warn(
      'Current only support one profile for uploadAll at the same time'
    );
    exit(1);
  }
  const config = myProfiles[0];
  const { user, host, localPath, remotePath, ignoreRegexes, logger } = config;
  let connectionSharePath;
  try {
    connectionSharePath = await doAuthWithMasterConnection(config);
  } catch (e) {
    logger.error(e);
    exit(1);
  }
  logger.info('=== Prepare to upload all files to remote ===');

  let fileList;
  try {
    fileList = await new Promise(function (resolve, reject) {
      const child = spawn(`find ${localPath} -type f`, { shell: true });
      let resultString = '';
      const has_error = false;
      child.stdout.on('data', function (data) {
        resultString += data.toString();
      });

      child.stderr.on('data', function (data) {
        has_error = true;
      });

      child.on('close', function (code) {
        logger.info('child process exited with code ' + code);
        if (has_error) {
          reject();
        } else {
          resolve(resultString.split('\n'));
        }
      });
    });
  } catch {
    logger.error('failed to generate filelist');
    exit(1);
  }
  logger.info(`total files: ${fileList.length}`);

  const relativePathList = fileList.map(filePath => {
    return filePath.replace(localPath, '');
  });

  const filteredList = relativePathList
    .filter(filePath => {
      return !ignoreRegexes.some(regx => filePath.match(regx));
    })
    .filter(filePath => filePath);
  logger.info(`after filtered files: ${filteredList.length}`);

  logger.info('create upload file list ...');
  const tmpFileListPath = path.join(localPath, '.watchme_upload_list');
  const writeStream = fs.createWriteStream(tmpFileListPath);
  filteredList.forEach(function (path) {
    writeStream.write(path + '\n');
  });
  writeStream.end();

  logger.info('run rsync to upload files to remote ...');
  try {
    await new Promise(function (resolve, reject) {
      exec(
        `rsync -avP --progress --files-from=${tmpFileListPath} -e 'ssh -p 22 -S ${connectionSharePath}' ${localPath} ${user}@${host}:${remotePath}`,
        (error, stdout, stderr) => {
          if (error || stderr) {
            return reject(error || stderr);
          }
          logger.debug(stdout);
          resolve(stdout);
        }
      );
    });
  } catch {
    logger.error('upload failed. could be permission issue on remote site');
  }

  logger.info('clean up upload file list');
  fs.unlinkSync(tmpFileListPath);

  exit(0);
}

async function downloadAll(profiles) {
  let myProfiles;
  try {
    myProfiles = getFinalConfig(profiles);
  } catch (e) {
    console.error(e);
    exit(1);
  }
  if (myProfiles.length > 1) {
    myProfiles[0].logger.warn(
      'Current only support one profile for downloadAll at the same time'
    );
    exit(1);
  }
  const config = myProfiles[0];
  const { user, host, remotePath, localPath, ignoreRegexes, logger } = config;
  let connectionSharePath;
  try {
    connectionSharePath = await doAuthWithMasterConnection(config);
  } catch (e) {
    logger.error(e);
    exit(1);
  }
  logger.info('=== Prepare to download all files from remote ===');

  let fileList;
  try {
    fileList = await new Promise(function (resolve, reject) {
      exec(
        `ssh -A -W ${connectionSharePath} ${user}@${host} find ${remotePath} -type f`,
        (error, stdout, stderr) => {
          if (error || stderr) {
            return reject(error || stderr);
          }
          resolve(stdout.split('\n'));
        }
      );
    });
  } catch {
    logger.error('failed to generate filelist on remote host');
    exit(1);
  }
  logger.info(`total files: ${fileList.length}`);

  const relativePathList = fileList.map(filePath => {
    return filePath.replace(remotePath, '');
  });

  const filteredList = relativePathList
    .filter(filePath => {
      return !ignoreRegexes.some(regx => filePath.match(regx));
    })
    .filter(filePath => filePath);
  logger.info(`after filtered files: ${filteredList.length}`);

  logger.info('create download file list ...');
  const tmpFileListPath = path.join(localPath, '.watchme_download_list');
  const writeStream = fs.createWriteStream(tmpFileListPath);
  filteredList.forEach(function (path) {
    writeStream.write(path + '\n');
  });
  writeStream.end();

  logger.info('run rsync to download files from remote ...');
  await new Promise(function (resolve, reject) {
    exec(
      `rsync -avP --progress --files-from=${tmpFileListPath} -e 'ssh -p 22 -S ${connectionSharePath}' ${user}@${host}:${remotePath} ${localPath}`,
      (error, stdout, stderr) => {
        if (error || stderr) {
          return reject(error || stderr);
        }
        logger.debug(stdout);
        resolve(stdout);
      }
    );
  });

  logger.info('clean up download file list');
  fs.unlinkSync(tmpFileListPath);

  exit(0);
}

module.exports = {
  uploadAll,
  downloadAll,
};
