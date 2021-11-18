const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const fileStore = require('session-file-store')(session); // express session file based store
const ping = require ("net-ping");
const parseString = require('xml2js').parseString;
const CronJob = require('cron').CronJob;

const appOptions = require ('./app-options.json'); // read configuration file

const app = express(); // initialize Express

const appLogger = require ('./applogger.js');

const fileStoreOptions = { // session file store options.
  //secret: appOptions.APP_SESSION_FS_SECRET || "not-very-secure-session-filestore",
  ttl: 3600*24, // 1 day
  logFn: appLogger.debug
};

var localip=[]; //array of local ip addresses
var localmac=[]; // array of corresponding local mac addresses
var globalhosts={}; // in-memory list of all hosts
var globallastscan={};// in-memory last scan stats
var globalarptable={}; // in-memory arp table
var globalnmappid=16777215; // to prevent simultaneous nmap runs

app.set('trust proxy', 1); // support for the app behind reverse proxy, allows secure cookie.
app.use(express.json());
app.use(express.urlencoded({extended: false}));

app.use(session({ // initialize Express session using file store
  store: new fileStore(fileStoreOptions),
  secret: appOptions.APP_SESSION_SECRET || 'not-very-secure-session',
  resave: false,
  saveUninitialized: false,
  cookie:{
    //secure: true,
    unset: 'destroy',
    maxAge: 3600*24*1000 //1 day
  }
}));

app.use('/', express.static(path.join(__dirname, 'public'))); // supply local public content (html,css, scripts, etc.)

app.use((err, req, res, next) => { //global error handler
  appLogger.error(err.stack);
  return res.status(500).type('application/json').send('Internal server error!').end;
})

function findinArray(arr,strng){
    for (var aidx=0;aidx<arr.length;aidx++ ){
        if (arr[aidx]==strng){
            return aidx;
        }
    }
    return -1;
}

function validateIP(ipaddress) { //validate ip address with/without netmask
  if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/(0?[8-9]|[1-2][0-9]|3[0-2])){0,1}$/.test(ipaddress)) {
    return (true);
  }
  return (false);
}

app.post('/api/ping', (req, res, next) => {
  if (typeof(req.body.ip) != undefined && validateIP(req.body.ip)){
    pingHost(req.body.ip, (ip,lat)=>{
      appLogger.debug('pinged address '+ip+' latency '+lat);
      return res.status(200).type('application/json').send('{"msg":"ok","latency":'+lat+'}').end;
    });
  }
  else {
    return res.status(500).type('application/json').send('{"err":["Error","Error pinging"]}').end;
  }
});  

function pingHost(ip,callback) {
  var options = {
    networkProtocol: ping.NetworkProtocol.IPv4,
    packetSize: 16,
    retries: 1,
    sessionId: (Math.floor(Math.random() * 65535) + 1), //random session id to enable parallel ping calls
    timeout: 3000,
    ttl: 128
  };
  var session = ping.createSession (options);
  session.pingHost (ip, function (error,ipaddr,sent,rcvd) {
    if (error){
      appLogger.debug(ipaddr + ": " + error);
      if (typeof(globalarptable[ipaddr])!='undefined') globalhosts[globalarptable[ipaddr]].latency=-1;
      if (typeof(callback)=='function') callback(ipaddr,-1);
      return;
    }
    else {
      appLogger.debug(ipaddr + ": Alive");
      if (typeof(globalarptable[ipaddr])!='undefined') globalhosts[globalarptable[ipaddr]].latency=rcvd-sent;
      if (typeof(callback)=='function') callback(ipaddr,(rcvd-sent));
      return;
    }
  });
}

app.get('/api/gethosts', (req, res, next) => {
  if (Object.keys(globalhosts).length>0){
    return res.status(200).type('application/json').send(JSON.stringify(globalhosts)).end;  
  }
  else {
    return res.status(200).type('application/json').send('{}').end;
  }
});  

app.get('/api/gethost', (req, res, next) => {
  //console.log(req);
  if (Object.keys(globalhosts).length>0 && req.query.mac && globalhosts[req.query.mac]){
    pingHost(globalhosts[req.query.mac].ipaddr, (ip,latency)=>{
      //globalhosts[req.query.mac].latency=latency;
      return res.status(200).type('application/json').send(JSON.stringify(globalhosts[req.query.mac])).end;
    });
  }
  else {
    return res.status(500).type('application/json').send('{"err":"["Error","Malformed request or no host data"]"}').end;
  }
});

app.get('/api/getlastscan', (req, res, next) => {
  //console.log(req);
  if (globallastscan){
    return res.status(200).type('application/json').send(JSON.stringify(globallastscan)).end;  
  }
  else {
    return res.status(500).type('application/json').send('{"err":"["Not available","Last scan info is not available yet"]"}').end;
  }
});

app.post('/api/nmapscan', (req, res, next) => {
  if (typeof(req.body.ip) != undefined){
    if (!checkNmappid()) {
      if (req.body.ip=='subnet'){
            portScan(req.body.ip, req.body.type);
            return res.status(200).type('application/json').send('{"msg":["Network scan started","Please wait few minutes until it is complete, then hit Refresh"]}').end;
          }
      portScan(req.body.ip, req.body.type, (ip,data,err)=>{
        if (data && data.hosts) {
          //console.log('scanned address '+ip+' status '+JSON.stringify(data));
          pingHost(req.body.ip, (ipaddr,latency)=>{
            globalhosts[Object.keys(data.hosts)[0]].latency=latency;
            data.hosts[Object.keys(data.hosts)[0]].latency=latency;
            return res.status(200).type('application/json').send(JSON.stringify({msg:data.hosts})).end;
          });
        }
        else {
          if (err) return res.status(500).type('application/json').send(JSON.stringify({err:['Error',err]})).end;
          else return res.status(500).type('application/json').send('{"err":["Error","Unknown nmap error. Check logs."]}').end;
        }
      });
    }
    else {
      return res.status(200).type('application/json').send('{"err":["Busy","Another network scan is still running.</br>Please wait a few minutes until it is complete before starting the next one."]}').end;
    }
  }
  else {
    return res.status(500).type('application/json').send('{"err":"["Error","Missing ip information"]"}').end;
  }
});  

app.post('/api/setname', (req, res, next) => {
  if (typeof(req.body.mac) != undefined && typeof(req.body.newname) != undefined && globalhosts[req.body.mac]){
    globalhosts[req.body.mac].name=req.body.newname.toString().trim();
    saveGlobalhosts();
    return res.status(200).type('application/json').send('{"msg":"ok"}').end;
  }
  else {
    return res.status(500).type('application/json').send('{"err":"["Error","Error setting new name"]"}').end;
  }
});

app.post('/api/deletehost', (req, res, next) => {
  if (typeof(req.body.mac) != undefined && typeof(req.body.ip) != undefined && globalhosts[req.body.mac] && globalhosts[req.body.mac].ipaddr==req.body.ip){
    delete globalhosts[req.body.mac];
    saveGlobalhosts();
    return res.status(200).type('application/json').send('{"msg":"ok"}').end;
  }
  else {
    return res.status(500).type('application/json').send('{"err":"["Error","Error deleting host"]"}').end;
  }
});

function checkNmappid(){
  try {
    var $pid=process.kill(globalnmappid,0);
    //console.log('pid: '+$pid);
    return true
  }
  catch (e) {
    //console.log('pid: false');
    return false
  }
}


function updateArp(ipaddr,macaddr) {
  if (typeof(ipaddr)!='undefined' && typeof(macaddr)!='undefined'){
    globalarptable[ipaddr]=macaddr;
  }
  else {
    globalarptable={};
    for(var i=0;i<Object.keys(globalhosts).length;i++){
      globalarptable[globalhosts[Object.keys(globalhosts)[i]].ipaddr]=Object.keys(globalhosts)[i];
    }
  }
  appLogger.debug('Global ARP table updated');
  return;
}

function portScan(ipaddr,type,callback){
  //console.log('portscan: '+ipaddr);
  var scantype='host';
  const { exec } = require("child_process");
  var nmapcmd=appOptions.NMAP_CMD_SCAN; // full scan by default
  if (typeof(type)!='undefined' && type=='fast') {
    nmapcmd=appOptions.NMAP_CMD_SWEEP; //fast scan
  }
  else type='full';
  if (typeof(ipaddr) != 'undefined' && ipaddr=='subnet'){
    ipaddr=appOptions.SUBNET;
    scantype='subnet';
    appLogger.log('Starting on-demand full network scan');
  }
  if (typeof(ipaddr) != 'undefined'){
    var nmaprun = exec(nmapcmd+' '+ipaddr, (error, stdout, stderr) => {
      if (error) {
        appLogger.error(`Error: ${error.message}`);
        if (typeof(callback)=='function') callback(ipaddr,false,error.message.toString());
        return;
      }
      if (stderr) {
        appLogger.error(`Error: ${stderr}`);
        if (typeof(callback)=='function') callback(ipaddr,false,stderr.toString());
        return;
      }
      //var data = convert.xml2js(stdout,{compact: true, spaces: 0});
      parseString(stdout,{attrkey:'p',charkey:'t'}, (err, result)=>{ // convert from XML to JavaScript object
        if (err) {
          appLogger.error("Error parsing nmap results: "+err);
          if (typeof(callback)=='function') callback(ipaddr,false);
          return;
        }
        //console.dir(result);
        result.scantype=type;
        var parsedhosts=parseNmapOut(result);
        saveGlobalhosts();
        updateArp();
        if (scantype=='subnet'){
          globallastscan=JSON.parse(JSON.stringify(parsedhosts.stats)); //update globallastscan var
          saveLastscan(globallastscan); //save globallastscan
          appLogger.log('Full on-demand network scan is complete');
        }
        if (typeof(callback)=='function') callback(ipaddr,parsedhosts,false);
        //console.log(parsedhosts);
      });
      
    });
    globalnmappid=nmaprun.pid;
    appLogger.debug('Nmap started with pid: '+nmaprun.pid);
  }
  else if (typeof(callback)=='function') callback(ipaddr,false);
}

// function netbiosScan(ipaddr,callback){
  // const { exec } = require("child_process");
  // var nbtscancmd='/usr/bin/nbtscan -r -e'; // NetBIOS scan
  // if (typeof(ipaddr) != 'undefined' && validateIP(ipaddr)){
    // var nbtscan = exec(nbtscancmd+' '+ipaddr, (error, stdout, stderr) => {
      // if (error) {
        // appLogger.error(`Error: ${error.message}`);
        // if (typeof(callback)=='function') callback(ipaddr,false);
        // return;
      // }
      // if (stderr) {
        // appLogger.error(`Error: ${stderr}`);
        // if (typeof(callback)=='function') callback(ipaddr,false);
        // return;
      // }
      
      // var data=stdout.trim().split(/\s+/);
      // var netbiosname=data.pop().trim();
      // //console.log(netbiosname);
      // if (typeof(callback)=='function') callback(ipaddr,stdout.trim());
    // });
    // //console.log('nbtscan pid: '+nbtscan.pid);
    // return;
  // }
  // else if (typeof(callback)=='function') callback(ipaddr,false);
// }

function parseNmapOut(data){
  var parsedhosts={hosts:{},stats:{}};
  if (typeof (data.nmaprun.host) !='undefined'){
    var hosts=data.nmaprun.host;
    for (var i=0;i<hosts.length;i++){
      var ip = hosts[i].address[0].p.addr;
      var mac = hosts[i].address[1] ? hosts[i].address[1].p.addr : 'unknown';
      if (mac=='unknown'){ //let's try to check if it is one of our local interfaces
        if (findinArray(localip,ip)>=0){
          mac=localmac[findinArray(localip,ip)];
        }
      }
      var dnsnames = [];
      if (typeof(hosts[i].hostnames[0].hostname) != 'undefined') {
        for (var nn=0;nn<hosts[i].hostnames[0].hostname.length;nn++){
          dnsnames.push(hosts[i].hostnames[0].hostname[nn].p.name);
        }
      }
      else dnsnames=[''];
      
      var netbiosname='';
      if (typeof(hosts[i].hostscript) != 'undefined'){
        //console.log(JSON.stringify(hosts[i].hostscript[0].script[0].p.output));
        const re=/^NetBIOS\sname:\s(\S+),\sNetBIOS.*/i;
        netbiosname=(hosts[i].hostscript[0].script[0].p.output).toString().match(re) ? (hosts[i].hostscript[0].script[0].p.output).toString().match(re)[1] : '';
        //console.log(JSON.stringify(netbiosname));
        var elem = hosts[i].hostscript[0].script[0].elem ? hosts[i].hostscript[0].script[0].elem : []; //alternative results may be generated by nmap (WTF???)
        for (var n=0;n<elem.length;n++){
          if (elem[n].p.key=='server_name') netbiosname=elem[n].t;
        }
      }
      if (typeof(netbiosname)=='undefined') netbiosname='';
      if (netbiosname=='<unknown>') netbiosname='';
      var vendor = hosts[i].address[1] ? hosts[i].address[1].p.vendor : 'unknown';
      var ports=[];
      if (data.scantype!='fast') {
        if (typeof(hosts[i].ports) != 'undefined' && typeof(hosts[i].ports[0].port) !='undefined'){
          for (var j=0;j<hosts[i].ports[0].port.length;j++){
            ports.push({
              'number': hosts[i].ports[0].port[j].p.portid,
              'protocol' : hosts[i].ports[0].port[j].p.protocol ? hosts[i].ports[0].port[j].p.protocol : 'undefined',
              'service': hosts[i].ports[0].port[j].service[0].p.name ? hosts[i].ports[0].port[j].service[0].p.name : 'unknown'
            });
          }
        }
      }
      else ports='nodata';
      //update hosts information but don't erase the name
      if (typeof(parsedhosts.hosts[mac])=='undefined'){ parsedhosts.hosts[mac]={} } //if new host then define as empty object
      parsedhosts.hosts[mac].ipaddr=ip;
      parsedhosts.hosts[mac].mac=mac;
      parsedhosts.hosts[mac].dnsnames=dnsnames;
      parsedhosts.hosts[mac].netbiosname=netbiosname;
      parsedhosts.hosts[mac].ports=ports;
      parsedhosts.hosts[mac].vendor=vendor;
      parsedhosts.hosts[mac].latency=-1; // set status to -1 as it was just scanned and we don't know if it accepts ICMP
      parsedhosts.hosts[mac].name = globalhosts[mac] ? globalhosts[mac].name : '';
      if (typeof(parsedhosts.hosts[mac].name)=='undefined' || parsedhosts.hosts[mac].name=='') { //check if name exists in globalhosts
        if (netbiosname != '') {
          parsedhosts.hosts[mac].name=netbiosname;
        }
        else if (dnsnames[0] != '') {
          parsedhosts.hosts[mac].name=dnsnames[0];
        }
        else parsedhosts.hosts[mac].name='';
      }
      //update globalhosts list
      globalhosts[mac]=JSON.parse(JSON.stringify(parsedhosts.hosts[mac]));
    }
  }
  parsedhosts.stats = {
    'runstats': {...data.nmaprun.runstats[0].finished[0].p, ...data.nmaprun.p},
    'hosts': data.nmaprun.runstats[0].hosts[0].p
  }
  //console.log(JSON.stringify(data.nmaprun.scaninfo,2));
  return parsedhosts;
}

function getLocalIP(){
  var interfaces=os.networkInterfaces(); //get the list of local interfaces
  for (var e=0;e<Object.keys(interfaces).length;e++){ //extract local interfaces ip and mac addresses
    //console.log(JSON.stringify(interfaces[Object.keys(interfaces)[e]]));
    for (var k=0; k<interfaces[Object.keys(interfaces)[e]].length;k++){
      if (!interfaces[Object.keys(interfaces)[e]][k].internal){ //&& interfaces[Object.keys(interfaces)[e]][k].family=='IPv4'
        localip.push(interfaces[Object.keys(interfaces)[e]][k].address);
        localmac.push(interfaces[Object.keys(interfaces)[e]][k].mac);
      }
    }
  }
  appLogger.debug('Local IP: '+localip);
  appLogger.debug('Local MAC: '+localmac);
}

function saveGlobalhosts(callback){
  fs.copyFile('./globalhosts.json', './globalhosts.bak.json', (err) => { //backup file if it exists
    if (err) {
      if (err.code!='ENOENT'){
        appLogger.error('Error backing up globalhosts.json: '+err);
        return;
      }
    }
    fs.writeFile('./globalhosts.json', JSON.stringify(globalhosts), function (err) {
      if (err) appLogger.error("Error saving globalhosts.json file "+err);
      appLogger.debug('globalhosts.json saved');
      if (typeof(callback)=='function') callback();
    });
  });  
}

function saveGlobalhostnames(callback){
  fs.copyFile('./globalhostnames.json', './globalhostnames.bak.json', (err) => { //backup file if it exists
    if (err) {
      if (err.code!='ENOENT'){
        appLogger.error('Error backing up globalhostnames.json: '+err);
      }
    }
    fs.writeFile('./globalhostnames.json', JSON.stringify(globalhostnames), function (err) {
      if (err) appLogger.error("Error saving globalhostnames.json file "+err);
      appLogger.debug('globalhostnames.json saved');
      if (typeof(callback)=='function') callback();
    });
  });
}

function saveLastscan(data,callback){
  fs.writeFile('./globallastscan.json', JSON.stringify(data), function (err) {
    if (err) appLogger.error("Error saving globallastscan.json file "+err);
    appLogger.debug('globallastscan.json saved');
    if (typeof(callback)=='function') callback();
  });
}

function initScan(){
  appLogger.log('Starting quick network swipe');
  portScan(appOptions.SUBNET,'fast',(ip,data)=>{
    if (data && data.hosts) {
      globallastscan=JSON.parse(JSON.stringify(data.stats));
      saveLastscan(globallastscan);
      saveGlobalhosts();
      appLogger.log('Quick network swipe is complete');
      appLogger.log('Starting full network scan');
      fullScan();
    }
    else {
      appLogger.error('Error running quick network swipe');
    }
  });
}

function fullScan(callback){
  for (var h=0;h<Object.keys(globalhosts).length;h++){ // set status of all hosts to 0
    globalhosts[Object.keys(globalhosts)[h]]['latency']=-1;
  }
  portScan(appOptions.SUBNET,'full',(ip,data)=>{
    if (data && data.hosts) {
      globallastscan=JSON.parse(JSON.stringify(data.stats));
      saveLastscan(globallastscan);
      appLogger.log('Full network scan is complete');
      saveGlobalhosts();
      if (typeof(callback)=='function') callback(true);
    }
    else {
      appLogger.error('Error running full network scan');
      if (typeof(callback)=='function') callback(false);
    }
  });
}

function appInit() { // main function that starts everything
  appLogger.log('Starting homenetmon application');
  getLocalIP(); // get local ip and mac
  if (fs.existsSync('./globallastscan.json')) {
    try {
      globallastscan=JSON.parse(fs.readFileSync('./globallastscan.json')); //if last scan stats exists, then read it
    }
    catch(err) {
      appLogger.debug('Last scan data is missing.');
      globallastscan={};
    }
  }
  if (fs.existsSync('./globalhosts.json')) { // check if file exists
    appLogger.log('Reading hosts data from globalhosts.json file');
    var mtime = fs.statSync('./globalhosts.json').mtime; // get the modification time of the file.
    try {
      globalhosts=JSON.parse(fs.readFileSync('./globalhosts.json'));
    }
    catch(err) {
      appLogger.log('Hosts data is missing need to run full scan');
      initScan();
    }
    updateArp(); //update global ARP table after reading globalhosts file
    var nowDate = new Date();
    if (nowDate-mtime > 86400000){ // only re-scan network if it is older than 24 hours
      appLogger.log('Hosts data is too old, need to rescan');
      fullScan();
    }
  }
  else { //if globalhosts file doesn't exist, run from scratch, start fast scan, then slow scan
    appLogger.log('Hosts data is missing need to run full scan');
    initScan();
  }
  //scheduling automatic scan
  var nmapCron = new CronJob(appOptions.NMAP_CRON, function() {
    appLogger.log('Starting scheduled full network scan');
    fullScan();
  });
  nmapCron.start();
  appLogger.log('Scheduling next automatic full network scan on '+nmapCron.nextDates().toString());
  appLogger.log ('Starting HTTP server');
  const serverHTTP = http.createServer(app).listen(appOptions.HTTPport, (err)=> { // start HTTP service and connect to Express app
    if (!err) {appLogger.log("Server is listening on port "+appOptions.HTTPport)} 
    else {appLogger.error("Error starting server on port "+appOptions.HTTPport,err);}
  });
}

appInit(); //Finally initialize the app
