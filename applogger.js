//const fs = require('fs');
const appOptions = require ('./app-options.json'); // read configuration file
const log = function (...theArgs){ console.log((new Date()).toISOString()+' '+theArgs) }
const debug = function (...theArgs){
  if (appOptions.DEBUG == true) {
    console.log((new Date()).toISOString()+' '+theArgs);
  }
}
const error = function (...theArgs){ console.error((new Date()).toISOString()+' '+theArgs) }

module.exports.log = log;
module.exports.debug = debug;
module.exports.error = error;