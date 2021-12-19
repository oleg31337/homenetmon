const log = function (...theArgs){ 
  var tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
  var localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
  console.log(localISOTime+' '+theArgs);
}
const debug = function (...theArgs){
  if (process.env.DEBUG == 'true') {
    var tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
    var localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
    console.log(localISOTime+' '+theArgs);
  }
}
const error = function (...theArgs){
  var tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
  var localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
  console.error(localISOTime+' '+theArgs);
}
module.exports.log = log;
module.exports.debug = debug;
module.exports.error = error;