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

const loggerPlaceHolder = {};
function logger(name, debug) {
  this.isDebugEnable = debug;
  this.name = `[${name}]`;
}
logger.prototype = {
  debug: function (...msg) {
    if (this.isDebugEnable === false) {
      return;
    }
    msg.unshift(this.name);
    return console.log(msg.join(' '));
  },
  info: function (...msg) {
    msg.unshift(this.name);
    return console.log(colors.green(msg.join(' ')));
  },
  error: function (...msg) {
    msg.unshift(this.name);
    return console.log(colors.red(msg.join(' ')));
  },
  warn: function (...msg) {
    msg.unshift(this.name);
    return console.log(colors.yellow(msg.join(' ')));
  },
};
function getLogger(name, debug) {
  if (loggerPlaceHolder[name]) {
    return loggerPlaceHolder[name];
  }
  loggerPlaceHolder[name] = new logger(name, debug);
  return loggerPlaceHolder[name];
}

module.exports = {
  getLogger,
};
