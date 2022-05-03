#!/usr/bin/env node
const yargs = require('yargs');
const { startWatchAll } = require('./src/watchProfiles');
const { initConfig } = require('./src/configHandler');
const { uploadAll, downloadAll } = require('./src/filesTransfer');

var argv = yargs(process.argv.slice(2))
  .usage('Usage: $0 [options]')
  .alias('i', 'init')
  .alias('u', 'upload')
  .alias('d', 'download')
  .alias('p', 'profile')
  .default('p', 'main')
  .string('p')
  .describe('p', 'specify multiple profiles to watch. separated by comma')
  .describe('i', 'init a config at current folder')
  .describe('u', 'upload all files to remote')
  .describe('d', 'download all files from remote')
  .help()
  .alias('help', 'h').argv;

if (argv.upload) {
  uploadAll(argv.p);
} else if (argv.init) {
  initConfig();
} else if (argv.download) {
  downloadAll(argv.p);
} else {
  startWatchAll(argv.p);
}
