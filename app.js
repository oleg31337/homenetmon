const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const fileStore = require('session-file-store')(session); // express session file based store
const ping = require ("ping");
const parseString = require('xml2js').parseString;
const cron = require('cron');
const open = require ('open');
const gw = require('default-gateway');
const ip = require('ip');

const appLogger = require ('./applogger.js'); //logging routines

const app = express(); // initialize Express

const fileStoreOptions = { // session file store options.
  //secret: appOptions.APP_SESSION_FS_SECRET || "not-very-secure-session-filestore",
  ttl: 3600*24, // 1 day
  logFn: appLogger.debug
};

// Global variables
var localip=[]; //array of local ip addresses
var localmac=[]; // array of corresponding local mac addresses
var localsubnet=[]; // array of corresponding subnets
var localprimaryip=''; //primary local interface
var localprimarysubnet=''; //primary local subnet

var appOptions = {}; // global app options
var globalhosts={}; // in-memory list of all hosts
var globallastscan={};// in-memory last scan stats
var globalarptable={}; // in-memory arp table
var nmapCron=false; //global nmap cron object
var nmapruntime; //global nmap exec object
var firstrun = true; // global first run flag

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

app.use((err, req, res, next) => { //Global endpoint error handler
  appLogger.error(err.stack);
  return res.status(200).type('text/plain').send('Internal server error!').end;
})

function randomString(length) { // Function to generate random string with specified length
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * 
 charactersLength));
   }
   return result;
}

function findinArray(arr,strng){ // Function to find string in array and return array index or -1
    for (var aidx=0;aidx<arr.length;aidx++ ){
        if (arr[aidx]==strng){
            return aidx;
        }
    }
    return -1;
}

function ip2int(ip) { // Convert decimal number representation to IP dotted address
    var d = ip.split('.');
    return ((((((+d[0])*256)+(+d[1]))*256)+(+d[2]))*256)+(+d[3]);
}

function int2ip(num) { // Convert IP dotted address to representing decimal number
    var ip = num%256;
    for (var i = 3; i > 0; i--)
    {
        num = Math.floor(num/256);
        ip = num%256 + '.' + ip;
    }
    return ip;
}

function validateIP(ipaddress) { //Validate IP address function with/without netmask
  if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/(0?[8-9]|[1-2][0-9]|3[0-2])){0,1}$/.test(ipaddress)) {
    return (true);
  }
  return (false);
}

app.post('/api/ping', (req, res, next) => {// ICMP Ping host endpoint. Parameters: ip
  if (typeof(req.body.ip) != undefined && validateIP(req.body.ip)){
    pingHost(req.body.ip, (ip,lat)=>{
      appLogger.debug('Pinged address '+ip+' with latency '+lat);
      return res.status(200).type('application/json').send('{"msg":"ok","latency":'+lat+'}').end;
    });
  }
  else {
    return res.status(200).type('application/json').send('{"err":["Error","Error pinging"]}').end;
  }
});  

function pingHost(ipaddr,callback) {// ICMP Ping host function. Parameters: ip, Callback output: ip, state: -1 | 1
  var options = {
    timeout: 3
  };
  try {
    ping.sys.probe(ipaddr, function (isAlive) {
      if (!isAlive){
        appLogger.debug('ICMP ping '+ipaddr + " Unreachable");
        if (typeof(globalarptable[ipaddr])!='undefined' && globalhosts[globalarptable[ipaddr]]) globalhosts[globalarptable[ipaddr]].latency=-1;
        if (typeof(callback)=='function') callback(ipaddr,-1);
        return;
      }
      else {
        appLogger.debug('ICMP ping '+ipaddr + " Alive");
        if (typeof(globalarptable[ipaddr])!='undefined') {
          globalhosts[globalarptable[ipaddr]].latency=1;
          globalhosts[globalarptable[ipaddr]].lastseen=new Date().getTime(); //update lastseen
        }
        if (typeof(callback)=='function') callback(ipaddr,1);
        return;
      }
    },options);
  }
  catch (err){
    appLogger.debug('ICMP ping error '+ipaddr +': '+ err);
    if (typeof(globalarptable[ipaddr])!='undefined') globalhosts[globalarptable[ipaddr]].latency=-1;
    if (typeof(callback)=='function') callback(ipaddr,-1);
    return;
  }
}

app.get('/api/gethosts', (req, res, next) => {// Get hosts endpoint for all hosts.
  if (Object.keys(globalhosts).length>0){
    return res.status(200).type('application/json').send(JSON.stringify(globalhosts)).end;
  }
  else {
    return res.status(200).type('application/json').send('{}').end;
  }
});

app.get('/api/gethost', (req, res, next) => { // Get host info endpoint. Parameters: mac or ip
  //console.log(req);
  if (Object.keys(globalhosts).length>0){
    var ipaddr;
    var macaddr;
    if (req.query.mac && globalhosts[req.query.mac]){
      macaddr=req.query.mac;
      ipaddr=globalhosts[req.query.mac].ipaddr;
    }
    else if (req.query.ip && globalarptable[req.query.ip] && globalhosts[globalarptable[req.query.ip]]){
      macaddr=globalarptable[req.query.ip]
      ipaddr=globalhosts[macaddr].ipaddr
    }
    else return res.status(200).type('application/json').send('{"err":"["Error","Malformed request or no host data"]"}').end;
    pingHost(ipaddr, (ip,latency)=>{
      if (latency == -1){ // if ICMP ping fails try ARP ping
        pingArp(ip,(retip,state,err)=>{
          return res.status(200).type('application/json').send(JSON.stringify(globalhosts[macaddr])).end;
        });
      }
      else return res.status(200).type('application/json').send(JSON.stringify(globalhosts[macaddr])).end;
    });
  }
  else {
    return res.status(200).type('application/json').send('{"err":"["Error","Malformed request or no host data"]"}').end;
  }
});

app.get('/api/getnmaprun', (req, res, next) => { // Check nmap running endpoint. Output: msg_ok/err_busy
  //console.log(req);
  if (!checkNmappid()){
    return res.status(200).type('application/json').send('{"msg":"ok"}').end;  
  }
  else {
    return res.status(200).type('application/json').send('{"err":["Busy","Another network scan is still running.</br>Please wait a few minutes until it is complete before starting the next one."]}').end;
  }
});

app.get('/api/getlastscan', (req, res, next) => { // Get last scan endpoint. Output: globallastscan variable contents
  //console.log(req);
  if (globallastscan){
    return res.status(200).type('application/json').send(JSON.stringify(globallastscan)).end;  
  }
  else {
    return res.status(200).type('application/json').send('{"err":"["Not available","Last scan info is not available yet"]"}').end;
  }
});

app.post('/api/importhostsjson', (req, res, next) => { // Save settings endpoint. Parameters: settings_objec
  //console.log(typeof(req.body));
  //console.log(req.body);
  if (typeof(req.body)=='object'){
    let hosts=req.body;
    appLogger.log('Importing hosts data');
    //console.log(hosts);
    var data_is_valid=true;
    if (Object.keys(hosts).length >1){ // validating the data
      for (var i=0; i<Object.keys(hosts).length; i++){
        var host=hosts[Object.keys(hosts)[i]];
        //console.log(host);
        try {
          if (!host.ipaddr || !host.mac || Object.keys(hosts)[i].toLowerCase() != host.mac.toLowerCase()) data_is_valid=false;
        }
        catch {
          data_is_valid=false;
        }
      }
    }
    else data_is_valid=false;
    if (data_is_valid){
      globalhosts=hosts;
      saveGlobalhosts();
      return res.status(200).type('application/json').send('{"msg":["Success","Hosts file imported successfully"]}').end;
    }
    else {
      appLogger.error('Error importing hosts data. Data is invalid');
      return res.status(200).type('application/json').send('{"err":["Error","Hosts file is invalid"]}').end;
    }
  }
  else {
    appLogger.error('Error importing hosts data. Data is empty');
    return res.status(200).type('application/json').send('{"err":["Error","Hosts file is invalid"]}').end;
  }
});

app.post('/api/savesettings', (req, res, next) => { // Save settings endpoint. Parameters: settings_objec
  //console.log(typeof(req.body));
  //console.log(req.body);
  if (typeof(req.body)=='object'){
    appOptions.SUBNET=req.body.subnet.split('/')[0]+'/'+req.body.netmask;
    appOptions.NMAP_SPEED=req.body.speed;
    appOptions.NMAP_PORTS=req.body.ports;
    appOptions.NMAP_CRON=req.body.cronexpr;
    if (typeof(req.body.cronenable)=='undefined') appOptions.NMAP_CRON_ENABLE=false
    else appOptions.NMAP_CRON_ENABLE=true;
    if (appOptions.NMAP_CRON_ENABLE && nmapCron) { // schedule cron job
      nmapCron.setTime(new cron.CronTime(appOptions.NMAP_CRON));
      nmapCron.start();
      appLogger.log('Scheduling next automatic full network scan on '+nmapCron.nextDates().toString());
    }
    else if (nmapCron){
      nmapCron.stop();
      appLogger.log('Disabling scheduled network scan');
    }
    else appLogger.error('Error: Cron is not properly initialized!');
    //console.log(appOptions);
    saveAppOptions(appOptions);
    if (typeof(req.body.firstrun)!='undefined' && req.body.firstrun=='on') {
      if (!checkNmappid()) {
        initScan(); // start first scan, it will reset the firstrun flag on completion
      }
    }
  }
  res.redirect('/');
});

app.get('/api/getsettings', (req, res, next) => { // Get settings endpoint. output: settings_object
  //console.log(req);
  if (appOptions){
    let settings={};
    settings.subnet=appOptions.SUBNET ? appOptions.SUBNET.split('/')[0] : localsubnet[0].split('/')[0];
    settings.netmask=appOptions.SUBNET ? appOptions.SUBNET.split('/')[1]: localsubnet[0].split('/')[1];
    settings.ports=appOptions.NMAP_PORTS ? appOptions.NMAP_PORTS : '1000';
    settings.speed=appOptions.NMAP_SPEED ? appOptions.NMAP_SPEED : 5;
    settings.cronexpr=appOptions.NMAP_CRON ? appOptions.NMAP_CRON : '0 3 * * *';
    settings.cronenable=(typeof(appOptions.NMAP_CRON_ENABLE)!='undefined') ? appOptions.NMAP_CRON_ENABLE : true; // this one is tricky as it is boolean
    settings.localsubnet=localsubnet;
    settings.localprimaryip=localprimaryip;
    settings.localprimarysubnet=localprimarysubnet;
    if (firstrun==true) settings.firstrun=true; // let frontend know if it is a first run.
    return res.status(200).type('application/json').send(JSON.stringify(settings)).end;  
  }
  else {
    return res.status(200).type('application/json').send('{"err":"["Not available","Error getting settings. Check application log"]"}').end;
  }
});

app.post('/api/nmapscan', (req, res, next) => { // Nmap scan endpoint. Parameters: ip: ipaddress|'subnet|abort', type: portscan|discovery
  if (typeof(req.body.ip) != undefined){
    if (checkNmappid() && typeof(req.body.ip) != 'undefined' && req.body.ip == 'abort') { //abort mechanism
      appLogger.log('Aborting nmap scan by request');
      nmapruntime.kill('SIGINT');
      return res.status(200).type('application/json').send('{"msg":["Aborted","Network scan was aborted"]}').end;
    }
    else if (typeof(req.body.ip) != 'undefined' && req.body.ip == 'abort') {
      return res.status(200).type('application/json').send('{"err":["Error","Network scan was not running"]}').end;
    }
    if (!checkNmappid()) {
      if (req.body.ip=='subnet'){
            portScan(req.body.ip, req.body.type, req.body.options);
            return res.status(200).type('application/json').send('{"msg":["Subnet scan started","It will take some time to complete"]}').end;
          }
      if (globalarptable[req.body.ip]){
        globalhosts[globalarptable[req.body.ip]].scanning=true; //set host in scanning mode (if found in arp table of course)
      }
      portScan(req.body.ip, req.body.type, req.body.options);
      return res.status(200).type('application/json').send('{"msg":["Host scan started","It will take some time to complete"]}').end;
    }
    else {
      return res.status(200).type('application/json').send('{"err":["Busy","Another network scan is still running.</br>Please wait a few minutes until it is complete before starting the next one."]}').end;
    }
  }
  else {
    return res.status(200).type('application/json').send('{"err":"["Error","Missing ip information"]"}').end;
  }
});  

app.post('/api/setname', (req, res, next) => {// Rename host endpoint. Parameters: mac, newname
  if (typeof(req.body.mac) != undefined && typeof(req.body.newname) != undefined && globalhosts[req.body.mac]){
    globalhosts[req.body.mac].name=req.body.newname.toString().trim();
    saveGlobalhosts();
    return res.status(200).type('application/json').send('{"msg":"ok"}').end;
  }
  else {
    return res.status(200).type('application/json').send('{"err":"["Error","Error setting new name"]"}').end;
  }
});

app.post('/api/deletehost', (req, res, next) => { // Delete host endpoint. Parameters: mac, ip
  if (typeof(req.body.mac) != undefined && typeof(req.body.ip) != undefined && globalhosts[req.body.mac] && globalhosts[req.body.mac].ipaddr==req.body.ip){
    delete globalhosts[req.body.mac];
    saveGlobalhosts();
    return res.status(200).type('application/json').send('{"msg":"ok"}').end;
  }
  else {
    return res.status(200).type('application/json').send('{"err":"["Error","Error deleting host"]"}').end;
  }
});

app.post('/api/pingarp', (req, res, next) => { // Ping arp endpoint. Parameters: ip
  //console.log(req.body.ip);
  if (typeof(req.body.ip) != undefined && validateIP(req.body.ip)){
    pingArp(req.body.ip, (ipaddr,state,err)=>{
      if (err){
        return res.status(200).type('application/json').send('{"err":"["Error","Error calling pingarp"]"}').end;
      }
      if (state){
        return res.status(200).type('application/json').send(JSON.stringify({msg:{ip:ipaddr,mac:state,status:1}})).end;
      }
      else {
        return res.status(200).type('application/json').send(JSON.stringify({msg:{ip:ipaddr,mac:false,status:0}})).end;
      }
    });
  }
  else {
    return res.status(200).type('application/json').send('{"err":"["Error","Error calling pingarp"]"}').end;
  }
});

function pingArp(ipaddr,callback){ //Nping ARP pinger function. Callback output variables: ip,status:macaddr|false,err
  const { exec } = require("child_process");
  if (typeof(ipaddr)!='undefined' && validateIP(ipaddr)){
    var npingcmd=appOptions.NPING_CMD+' '+ipaddr;
    var npingrun = exec(npingcmd+' '+ipaddr, (error, stdout, stderr) => {
      //console.log('nping exec');
      let re = new RegExp('.+ARP reply '+ipaddr.split('.').join('\\.')+' is at (.+)');
      if (error){
        appLogger.error('ARP ping error '+ipaddr+' '+error.toString());
        if (typeof(callback)=='function') callback(ipaddr,false,'pingArp: '+error.toString());
        return;
      }
      if (stderr){
        appLogger.error('ARP ping error '+ipaddr+' '+stderr);
        if (typeof(callback)=='function') callback(ipaddr,false,'pingArp: '+stderr.toString());
        return;
      }
      if (re.test(stdout.toString())){ // check the stdout for ARP reply
        var macaddr=(stdout.toString()).match(re)[1];
        if (typeof(globalhosts[macaddr])!='undefined') {
          globalhosts[macaddr].latency=1;
          globalhosts[macaddr].lastseen=new Date().getTime(); //update lastseen
        }
        appLogger.debug('ARP ping '+ipaddr+' Available');
        if (typeof(callback)=='function') callback(ipaddr,macaddr,false);
        return;
      }
      else{
        appLogger.debug('ARP ping '+ipaddr+' Unreachable');
        if (typeof(callback)=='function') callback(ipaddr,false,false);
        return;
      }
    });
  }
  else if (typeof(callback)=='function') {
    appLogger.error('Error calling pingArp: Incorrect IP address');
    callback(ipaddr,false,'pingArp: Incorrect IP address');
  }
  return;
}

function checkNmappid(){ // Function to check if nmap pid is still running
  try {
    var $pid=process.kill(nmapruntime.pid,0);
    //console.log('pid: '+$pid);
    return true
  }
  catch (e) {
    //console.log('pid: false');
    return false
  }
}

function updateArp(ipaddr,macaddr) { // Function to update ARP table in app memory. Optional parameters: ip, mac
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

function portScan(ipaddr,type,options,callback){ //Function to perform port scanning. Parameters: ip,type('portscan'|'discovery'). Callback parameters: ip, parsedhosts_obj, err
  var scanscope='host'; // single host scope by default
  const { exec } = require("child_process");
  var nmapcmd=appOptions.NMAP_CMD_SCAN // full portscan by default
  if (typeof(options) != 'object'){
    options={'speed':appOptions.NMAP_SPEED, 'ports': appOptions.NMAP_PORTS};
  }
  //console.log(options);
  nmapcmd+=' -T'+options.speed;
  nmapcmd+=' --top-ports '+options.ports;
  if (typeof(options)!='undefined' && typeof(options.ports)!='undefined' && options.ports==0){type='discovery'} //if 0 ports then it is discovery.
  if (typeof(type)!='undefined' && type=='discovery') { //fast host discovery scan
    nmapcmd=appOptions.NMAP_CMD_SWEEP;
    appLogger.debug('Starting fast network swipe of '+ipaddr);
  }
  else type='portscan'; //portscan by default
  if (typeof(ipaddr) != 'undefined' && ipaddr=='subnet'){
    ipaddr=appOptions.SUBNET;
    scanscope='subnet';
    appLogger.log('Starting full subnet network scan');
  }
  if (typeof(ipaddr) != 'undefined'){
    nmapruntime = exec(nmapcmd+' '+ipaddr, {maxBuffer: 10485760, timeout: 86400000}, (error, stdout, stderr) => {
      if (error) {
        appLogger.error('Error Nmap: '+error.message);
        if (typeof(callback)=='function') callback(ipaddr,false,error.message.toString());
        return;
      }
      if (stderr) {
        appLogger.error('Error Nmap: '+stderr);
        if (typeof(callback)=='function') callback(ipaddr,false,stderr.toString());
        return;
      }
      //var data = convert.xml2js(stdout,{compact: true, spaces: 0});
      mdnsScan(20000,(mdnshosts)=>{ //run mDNS scan for 20 seconds before parsing to include it's results in name resolution
        parseString(stdout,{attrkey:'p',charkey:'t'}, (err, result)=>{ // convert from XML to JavaScript object
          if (err) {
            appLogger.error("Error parsing nmap results: "+err);
            if (typeof(callback)=='function') callback(ipaddr,false,err);
            return;
          }
          //console.dir(result);
          result.scantype=type;
          result.scanscope=scanscope;
          result.mdnshosts=mdnshosts;
          var parsedhosts=parseNmapOut(result);
          saveGlobalhosts();
          updateArp();
          if (scanscope=='subnet'){
            globallastscan=JSON.parse(JSON.stringify(parsedhosts.stats)); //update globallastscan var
            saveLastscan(globallastscan); //save globallastscan
            appLogger.log('Full network scan is complete');
          }
          if (typeof(callback)=='function') callback(ipaddr,parsedhosts,false);
          //console.log(parsedhosts);
        });
      });
    });
    appLogger.debug('Nmap started with pid: '+nmapruntime.pid);
  }
  else if (typeof(callback)=='function') callback(ipaddr,false);
}

function parseNmapOut(data){ // Function to parse json nmap output converted from XML. Parameters: nmaprun_json_obj. Returns: parsedhosts_obj
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
      if (mac=='unknown'){ // if mac is still unknown, skip this host
        continue;
      }
      var dnsnames = [];
      if (typeof(hosts[i].hostnames[0].hostname) != 'undefined') {
        for (var nn=0;nn<hosts[i].hostnames[0].hostname.length;nn++){
          if (hosts[i].hostnames[0].hostname[nn].p.name.toString().trim().length >= 3){ // only use hostname if it is more than 3 in length.
            dnsnames.push(hosts[i].hostnames[0].hostname[nn].p.name.toString().trim());
          }
        }
      }
      else dnsnames=[];
      if (typeof(data.mdnshosts[ip])!='undefined') {
        dnsnames.push(data.mdnshosts[ip].host.toString().trim());
      }
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
      if (typeof(netbiosname)=='undefined' || netbiosname=='<unknown>') netbiosname='';
      if (typeof(data.mdnshosts[ip])!='undefined' && data.mdnshosts[ip].name !='' && netbiosname=='') {
        netbiosname=data.mdnshosts[ip].name;
      }
      var vendor = hosts[i].address[1] ? hosts[i].address[1].p.vendor : 'unknown';
      var ports=[];
      if (data.scantype!='discovery') {
        if (typeof(hosts[i].ports) != 'undefined' && typeof(hosts[i].ports[0].port) !='undefined'){
          for (var j=0;j<hosts[i].ports[0].port.length;j++){
            ports.push({
              'number': hosts[i].ports[0].port[j].p.portid,
              'protocol' : hosts[i].ports[0].port[j].p.protocol ? hosts[i].ports[0].port[j].p.protocol : 'undefined',
              'service': hosts[i].ports[0].port[j].service[0].p.name ? hosts[i].ports[0].port[j].service[0].p.name : 'unknown'
            });
          }
          if (ports.length==0) ports='nodata';
        }
        else ports='nodata';
      }
      else {
        if (typeof(globalhosts[mac])!='undefined' && typeof(globalhosts[mac].ports)!='undefined') ports=globalhosts[mac].ports;
        else {
          if (firstrun) ports='discovery';
          else ports='nodata';
        }
      }
      //update hosts information
      if (typeof(parsedhosts.hosts[mac])=='undefined'){  //if new host then define an object and add first seen date.
        parsedhosts.hosts[mac]={}; 
        parsedhosts.hosts[mac].firstseen=new Date().getTime();
      }
      parsedhosts.hosts[mac].lastseen=new Date().getTime(); //set last seen date to now
      parsedhosts.hosts[mac].lastscanned=new Date().getTime(); //set last scanned date to now
      parsedhosts.hosts[mac].ipaddr=ip;
      parsedhosts.hosts[mac].mac=mac;
      parsedhosts.hosts[mac].dnsnames=dnsnames;
      parsedhosts.hosts[mac].netbiosname=netbiosname;
      parsedhosts.hosts[mac].ports=ports;
      parsedhosts.hosts[mac].vendor=vendor;
      parsedhosts.hosts[mac].latency=1; // set latency to 1 as 
      parsedhosts.hosts[mac].scanning=false; //means the scanning is complete
      parsedhosts.hosts[mac].name = globalhosts[mac] ? globalhosts[mac].name : ''; // get name from globalhosts file (if exists)
      if (typeof(parsedhosts.hosts[mac].name)=='undefined' || parsedhosts.hosts[mac].name=='') { //assign name if was not yet defined
        if (netbiosname != '') {
          parsedhosts.hosts[mac].name=netbiosname;
        }
        else if (typeof(dnsnames[0])!='undefined' && dnsnames[0] != '') {
          parsedhosts.hosts[mac].name=dnsnames[0];
        }
        else parsedhosts.hosts[mac].name='';
      }
      //update globalhosts list
      globalhosts[mac]=JSON.parse(JSON.stringify(parsedhosts.hosts[mac])); // do a full recursive object clone
    }
  }
  parsedhosts.stats = {
    'runstats': {...data.nmaprun.runstats[0].finished[0].p, ...data.nmaprun.p},
    'hosts': data.nmaprun.runstats[0].hosts[0].p
  }
  //console.log(JSON.stringify(data.nmaprun.scaninfo,2));
  return parsedhosts;
}

function mdnsScan(scantime,callback){
  if (typeof(scantime)=='undefined') scantime=10000; //set to default 10 seconds scan (most optimal time)
  var services=[];
  var dnssd = require('dnssd2');
  var browser = dnssd.Browser(dnssd.all(),{interface:localprimaryip,resolve:true})
  .on('serviceUp', service => {
    var servicebrowser=undefined;
    if (service.protocol=='tcp') {
      servicebrowser = dnssd.Browser(dnssd.tcp(service.name),{interface:localprimaryip,resolve:true})
      .on('serviceUp', tcpservice => {
        //console.log('tcp service');
        services.push(tcpservice);
      });
    }
    else {
      servicebrowser = dnssd.Browser(dnssd.udp(service.name),{interface:localprimaryip,resolve:true})
      .on('serviceUp', udpservice => {
        //console.log('udp service');
        services.push(udpservice);
      });
    }
    servicebrowser.start();
    setTimeout(()=>{servicebrowser.stop()},scantime); //stop the browser after 10 seconds
  });
  appLogger.debug('Starting mDNS scan');
  browser.start();
  setTimeout(function () {
    var hosts = {};
    browser.stop();
    //console.log(JSON.stringify(services));
    //console.log(services.length);
    for (var i=0;i<services.length;i++){
      for (var j=0;j<services[i].addresses.length;j++){
        if (validateIP(services[i].addresses[j])){
          if (typeof(hosts[services[i].addresses[j]])=='undefined') hosts[services[i].addresses[j]]={};
          hosts[services[i].addresses[j]].name=services[i].name ? services[i].name : '';
          hosts[services[i].addresses[j]].host=services[i].host ? services[i].host : '';
        }
      }
    }
    //console.log(hosts);
    appLogger.debug('mDNS scan complete. found '+Object.keys(hosts).length+' hosts');
    if (typeof(callback)=='function') callback(hosts);
  },scantime);
}

async function getLocalIP(callback){ // Function to get local IP addressese and corresponding MAC addresses and update global variables.
  var interfaces=os.networkInterfaces(); //get the list of local interfaces
  for (var e=0;e<Object.keys(interfaces).length;e++){ //extract local interfaces ip and mac addresses
    //console.log(JSON.stringify(interfaces[Object.keys(interfaces)[e]]));
    for (var k=0; k<interfaces[Object.keys(interfaces)[e]].length;k++){
      if (!interfaces[Object.keys(interfaces)[e]][k].internal && interfaces[Object.keys(interfaces)[e]][k].family=='IPv4'){
        localip.push(interfaces[Object.keys(interfaces)[e]][k].address);
        localmac.push(interfaces[Object.keys(interfaces)[e]][k].mac);
        var netmaskbits=interfaces[Object.keys(interfaces)[e]][k].cidr.split('/')[1]
        localsubnet.push(int2ip(ip2int(interfaces[Object.keys(interfaces)[e]][k].address)>>>(32-netmaskbits)<<(32-netmaskbits)>>>0)+'/'+netmaskbits); //calculate local subnet
      }
    }
  }
  const {gateway,gwinterface} = gw.v4.sync();
  for (var i=0; i<localsubnet.length; i++){
    if (ip.cidrSubnet(localsubnet[i]).contains(gateway)) {
      localprimaryip = localip[i];
      localprimarysubnet = localsubnet[i];
    }
  }
  appLogger.debug('Primary IP: '+localprimaryip);
  appLogger.debug('Primary Subnet: '+ localprimarysubnet);
  appLogger.debug('Local IPs: '+localip);
  appLogger.debug('Local MACs: '+localmac);
  appLogger.debug('Local subnets: '+localsubnet);
  if (typeof(callback)=='function') callback(localip,localmac,localsubnet);
}

function saveGlobalhosts(callback){ // Function to save globalhosts variable to file
  fs.copyFile('./globalhosts.json', './globalhosts.bak.json', (err) => { //backup file if it exists
    if (err) {
      if (err.code!='ENOENT'){
        appLogger.error('Error backing up globalhosts.json: '+err);
        if (typeof(callback)=='function') callback(false,err);
        return;
      }
    }
    fs.writeFile('./globalhosts.json', JSON.stringify(globalhosts), function (err) {
      if (err) {
        appLogger.error("Error saving globalhosts.json file "+err);
        if (typeof(callback)=='function') callback(false,err);
      }
      appLogger.debug('globalhosts.json saved');
      if (typeof(callback)=='function') callback(true,false);
    });
  });  
}

function saveAppOptions(data,callback){ // Function to save application options variable to file
  let options=appOptions;
  if (typeof(data)=='object'){
    options=data;
  }
  fs.writeFile('./app-options.json', JSON.stringify(options,null,2), function (err) {
    if (err) {
      appLogger.error("Error saving app-options.json file "+err);
      if (typeof(callback)=='function') callback(false,err);
    }
    appLogger.debug('app-options.json file saved');
    if (typeof(callback)=='function') callback(true,false);
  });
}

function saveLastscan(data,callback){
  fs.writeFile('./globallastscan.json', JSON.stringify(data), function (err) {
    if (err) {
      appLogger.error("Error saving globallastscan.json file "+err);
      if (typeof(callback)=='function') callback(false,err);
    }
    appLogger.debug('globallastscan.json saved');
    if (typeof(callback)=='function') callback(true,false);
  });
}

function readLastscan(callback){ // Function to read last scan information from file.
  if (fs.existsSync('./globallastscan.json')) {
    try {
      globallastscan=JSON.parse(fs.readFileSync('./globallastscan.json')); //if last scan stats exists, then read it
    }
    catch(err) {
      appLogger.debug('Last scan data is missing.');
      globallastscan={};
      if (typeof(callback)=='function') callback(false,err);
    }
    if (typeof(callback)=='function') callback(true,false);
  }
  else {
    if (typeof(callback)=='function') callback(false,{err:'file globallastscan.json doesn\'t exist'});
  }
}

function initScan(){ // Function to do initial network swipe before full scan
  appLogger.log('Starting quick network swipe');
  portScan(appOptions.SUBNET,'discovery',undefined,(ip,data,err)=>{
    if (!err) {
      globallastscan=JSON.parse(JSON.stringify(data.stats));
      saveLastscan(globallastscan);
      appLogger.log('Quick network swipe is complete');
      appLogger.log('Starting full network scan');
      firstrun=false;
      fullScan();
    }
    else {
      appLogger.error('Error running quick network swipe:',err);
    }
  });
}

async function resetHostStatus(){ // reset 'discovery' status
  for (var i=0; i<Object.keys(globalhosts).length; i++){
    if (globalhosts[Object.keys(globalhosts)[i]].ports=='discovery') {
      globalhosts[Object.keys(globalhosts)[i]].ports='nodata';
      globalhosts[Object.keys(globalhosts)[i]].scanning=false;
    }
  }
}

function fullScan(callback){ // Function to perform full subnet network scan
  portScan(appOptions.SUBNET,'portscan',undefined,(ip,data)=>{
    if (data && data.hosts) {
      globallastscan=JSON.parse(JSON.stringify(data.stats));
      saveLastscan(globallastscan);
      appLogger.log('Full network scan is complete');
      firstrun=false;
      resetHostStatus(); // reset discovery status of hosts
      saveGlobalhosts();
      if (typeof(callback)=='function') callback(true);
    }
    else {
      appLogger.error('Error running full network scan');
      if (typeof(callback)=='function') callback(false);
    }
  });
}

function appShutdown() { //function to gracefully shutdown the app
  appLogger.log('Caught kill signal, terminating the app');
  saveGlobalhosts(()=>{
    process.exit(0);
  });
}

function appInit() { // main function that loads parameters and starts everything else
  appLogger.log('Starting homenetmon application on '+process.platform);
  //set app options defaults
  appOptions={
    HTTPport: 30450,
    APP_SESSION_FS_SECRET: randomString(40),
    APP_SESSION_SECRET: randomString(40),
    SUBNET: '192.168.1.0/24',
    NMAP_SPEED: 5,
    NMAP_PORTS: 1000,
    NMAP_CMD_SCAN: "/usr/bin/nmap --privileged -oX - -sU -sS --max-retries 1 --script nbstat",
    NMAP_CMD_SWEEP: "/usr/bin/nmap --privileged -oX - -sU -p137 -T3 --script nbstat",
    NPING_CMD: "/usr/bin/nping --privileged --arp -c2",
    NMAP_CRON: "30 03 * * *",
    NMAP_CRON_ENABLE: false
  };
  if (process.platform == 'win32'){ // if we are on Windows, then omit full path as nmap is added to system path by default
    appOptions.NMAP_CMD_SCAN = "nmap.exe --privileged -oX - -sU -sS --max-retries 1 --script nbstat"
    appOptions.NMAP_CMD_SWEEP = "nmap.exe --privileged -oX - -sU -p137 -T3 --script nbstat"
    appOptions.NPING_CMD = "nping.exe --privileged --arp -c2"
  }

  if (fs.existsSync('./app-options.json')) { // check if options file exists, then read it
    appLogger.log('Reading application options');
    try {
      appOptions=JSON.parse(fs.readFileSync('./app-options.json'));
    }
    catch(err) {
      appLogger.error('Error reading options file! Check the app-options.json file or remove it to use defaults');
      process.exit(1);
    }
    getLocalIP(); // get local ip and mac addresses
    firstrun=false; // if appoptions.json exist then it is not the first run.
  }
  else {
    appLogger.log('Application options file is not found, using defaults');
    getLocalIP((ips,macs,subnets)=>{ // get local ip and mac and populate subnet value in appOptions
      appOptions.SUBNET=localprimarysubnet ? localprimarysubnet : '192.168.1.0/24';
      saveAppOptions(appOptions,function(ok,err){
        if (ok) appLogger.log('Application options file was created');
        if (err) appLogger.error('Error saving application options file',err);
      });
    });
  }
  readLastscan(); // Read last scan results from disk if available
  if (fs.existsSync('./globalhosts.json')) { // check if globalhosts file exist
    appLogger.log('Reading hosts data from globalhosts.json file');
    var mtime = fs.statSync('./globalhosts.json').mtime; // get the modification time of the globalhosts file.
    try {
      globalhosts=JSON.parse(fs.readFileSync('./globalhosts.json'));
      resetHostStatus(); //reset host scanning status
    }
    catch(err) {
      globalhosts={};//clear variable in case of parsing errors.
      appLogger.log('Error reading globalhosts.json file. Need a full network scan.');
      if (!firstrun) initScan(); //run full network scan if it is not a first run only.
    }
    updateArp(); //update global ARP table after reading globalhosts file
    // var nowDate = new Date();
    // if (nowDate-mtime > 86400000){ // only re-scan network if it is older than 24 hours
      // appLogger.log('Hosts data is too old, need to rescan');
      // appLogger.log('Starting full network scan');
      // fullScan();
    // }
  }
  else { //if globalhosts file doesn't exist, run from scratch, start fast scan, then slow scan
    appLogger.log('Hosts data is missing. Need a full network scan');
    if (!firstrun) initScan(); //run full network scan if it is not a first run only.
  }
  //scheduling automatic scan
  nmapCron = new cron.CronJob(appOptions.NMAP_CRON, function() {
    appLogger.log('Starting scheduled full network scan');
    fullScan();
  });
  if (typeof(appOptions.NMAP_CRON_ENABLE) != 'undefined' && appOptions.NMAP_CRON_ENABLE) {
    nmapCron.start();
    appLogger.log('Scheduling next automatic full network scan on '+nmapCron.nextDates().toString());
  }
  else appLogger.log('Scheduled nmap scan is disabled');
  appLogger.log ('Starting HTTP server');
  const serverHTTP = http.createServer(app).listen(appOptions.HTTPport, (err)=> { // start HTTP service and connect to Express app
    if (!err) {
      appLogger.log("Server is listening on port "+appOptions.HTTPport)
      if (!process.env.RUNASSERVICE) open('http://localhost:'+appOptions.HTTPport); // open browser window if running interactively
      }
    else {appLogger.error("Error starting server on port "+appOptions.HTTPport,err);}
  });
}

process.on('SIGTERM', appShutdown); // register the shutdown function on receiving TERM signal
process.on('SIGINT', appShutdown); // register the shutdown function on receiving INT signal

appInit(); //Finally initialize the app
