#!/usr/bin/env node
const yargs = require('yargs');
const {
  startWatch,
  uploadAll,
  downloadAll,
  initConfig,
} = require('./src/watchme');

var argv = yargs(process.argv.slice(2))
  .usage('Usage: $0 <command> [options]')
  .alias('i', 'init')
  .alias('u', 'upload')
  .alias('d', 'download')
  .describe('i', 'init a config at current folder')
  .describe('u', 'upload all files to remote')
  .describe('d', 'download all files from remote')
  .help('h').argv;

if (argv.upload) {
  uploadAll();
} else if (argv.init) {
  initConfig();
} else if (argv.download) {
  downloadAll();
} else {
  startWatch();
}
