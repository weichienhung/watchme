#!/usr/bin/env node
const yargs = require('yargs');
const { startWatch, uploadAll } = require('./src/watchme');

var argv = yargs(process.argv.slice(2))
  .usage('Usage: $0 <command> [options]')
  .alias('u', 'upload_all')
  .describe('u', 'upload all files to remote')
  .help('h').argv;

if (argv.upload_all) {
  uploadAll();
} else {
  startWatch();
}
