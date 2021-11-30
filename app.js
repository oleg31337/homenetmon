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
var appOptions = {}; // global app options
var globalhosts={}; // in-memory list of all hosts
var globallastscan={};// in-memory last scan stats
var globalarptable={}; // in-memory arp table
var globalnmappid=16777215; // to prevent simultaneous nmap runs
var nmapCron=false; //global nmap cron object

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

function randomString(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * 
 charactersLength));
   }
   return result;
}

function findinArray(arr,strng){
    for (var aidx=0;aidx<arr.length;aidx++ ){
        if (arr[aidx]==strng){
            return aidx;
        }
    }
    return -1;
}

function ip2int(ip)
{
    var d = ip.split('.');
    return ((((((+d[0])*256)+(+d[1]))*256)+(+d[2]))*256)+(+d[3]);
}

function int2ip(num)
{
    var ip = num%256;
    for (var i = 3; i > 0; i--)
    {
        num = Math.floor(num/256);
        ip = num%256 + '.' + ip;
    }
    return ip;
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

function pingHost(ipaddr,callback) {
  var options = {
    timeout: 3
  };
  try {
    ping.sys.probe(ipaddr, function (isAlive) {
      if (!isAlive){
        appLogger.debug(ipaddr + ": Unreachable");
        if (typeof(globalarptable[ipaddr])!='undefined') globalhosts[globalarptable[ipaddr]].latency=-1;
        if (typeof(callback)=='function') callback(ipaddr,-1);
        return;
      }
      else {
        appLogger.debug(ipaddr + ": Alive");
        if (typeof(globalarptable[ipaddr])!='undefined') globalhosts[globalarptable[ipaddr]].latency=1;
        if (typeof(callback)=='function') callback(ipaddr,1);
        return;
      }
    },options);
  }
  catch (err){
    appLogger.debug('Error pinging '+ipaddr +': '+ err);
    if (typeof(globalarptable[ipaddr])!='undefined') globalhosts[globalarptable[ipaddr]].latency=-1;
    if (typeof(callback)=='function') callback(ipaddr,-1);
    return;
  }
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
  if (Object.keys(globalhosts).length>0){
    if (req.query.mac && globalhosts[req.query.mac]){
      pingHost(globalhosts[req.query.mac].ipaddr, (ip,latency)=>{
        //globalhosts[req.query.mac].latency=latency;
        return res.status(200).type('application/json').send(JSON.stringify(globalhosts[req.query.mac])).end;
      });
    }
    else if (req.query.ip && globalarptable[req.query.ip] && globalhosts[globalarptable[req.query.ip]]){
      pingHost(globalhosts[globalarptable[req.query.ip]].ipaddr, (ip,latency)=>{
        //globalhosts[req.query.mac].latency=latency;
        return res.status(200).type('application/json').send(JSON.stringify(globalhosts[globalarptable[req.query.ip]])).end;
      });
    }
    else return res.status(500).type('application/json').send('{"err":"["Error","Malformed request or no host data"]"}').end;
  }
  else {
    return res.status(500).type('application/json').send('{"err":"["Error","Malformed request or no host data"]"}').end;
  }
});

app.get('/api/getnmaprun', (req, res, next) => { // check if nmap is running
  //console.log(req);
  if (!checkNmappid()){
    return res.status(200).type('application/json').send('{"msg":"ok"}').end;  
  }
  else {
    return res.status(200).type('application/json').send('{"err":["Busy","Another network scan is still running.</br>Please wait a few minutes until it is complete before starting the next one."]}').end;
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

app.post('/api/savesettings', (req, res, next) => { //////////////////////NEED TO ADD ALL POSSIBLE ERROR CHECKING
  //console.log(typeof(req.body));
  //console.log(req.body);
  if (typeof(req.body)=='object'){
    appOptions.SUBNET=req.body.subnet+'/'+req.body.netmask;
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
      appLogger.log('Cancelling scheduled network scan');
    }
    else appLogger.error('Error: Cron is not properly initialized!');
    //console.log(appOptions);
    saveAppOptions(appOptions);
  }
  res.redirect('/');
});

app.get('/api/getsettings', (req, res, next) => {
  //console.log(req);
  if (appOptions){
    let settings={};
    settings.subnet=appOptions.SUBNET ? appOptions.SUBNET.split('/')[0] : localsubnet.split('/')[0];
    settings.netmask=appOptions.SUBNET ? appOptions.SUBNET.split('/')[1]: localsubnet.split('/')[1];
    settings.ports=appOptions.NMAP_PORTS ? appOptions.NMAP_PORTS : '1000';
    settings.speed=appOptions.NMAP_SPEED ? appOptions.NMAP_SPEED : 5;
    settings.cronexpr=appOptions.NMAP_CRON ? appOptions.NMAP_CRON : '0 3 * * *';
    settings.cronenable=(typeof(appOptions.NMAP_CRON_ENABLE)!='undefined') ? appOptions.NMAP_CRON_ENABLE : true; // this one is tricky as it is boolean
    return res.status(200).type('application/json').send(JSON.stringify(settings)).end;  
  }
  else {
    return res.status(500).type('application/json').send('{"err":"["Not available","Error getting settings. Check application log"]"}').end;
  }
});

app.post('/api/nmapscan', (req, res, next) => {
  if (typeof(req.body.ip) != undefined){
    if (!checkNmappid()) {
      if (req.body.ip=='subnet'){
            portScan(req.body.ip, req.body.type);
            return res.status(200).type('application/json').send('{"msg":["Network scan started","It will take some time to complete"]}').end;
          }
      if (globalarptable[req.body.ip]){
        globalhosts[globalarptable[req.body.ip]].scanning=true; //set host in scanning mode (if found in arp table of course)
      }
      portScan(req.body.ip, req.body.type,);
      return res.status(200).type('application/json').send('{"msg":["Host scan started","It will take some time to complete"]}').end;
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
  var nmapcmd=appOptions.NMAP_CMD_SCAN // full scan by default
  if (appOptions.NMAP_SPEED){
    nmapcmd+=' -T'+appOptions.NMAP_SPEED;
  }
  if (appOptions.NMAP_PORTS){
    nmapcmd+=' --top-ports '+appOptions.NMAP_PORTS;
  }
  if (typeof(type)!='undefined' && type=='fast') {
    nmapcmd=appOptions.NMAP_CMD_SWEEP; //fast scan
  }
  else type='subnet'; //full subnet scan by default
  if (typeof(ipaddr) != 'undefined' && ipaddr=='subnet'){
    ipaddr=appOptions.SUBNET;
    scantype='subnet';
    appLogger.log('Starting on-demand full network scan');
  }
  if (typeof(ipaddr) != 'undefined'){
    var nmaprun = exec(nmapcmd+' '+ipaddr, (error, stdout, stderr) => {
      if (error) {
        appLogger.error('Error: '+error.message);
        if (typeof(callback)=='function') callback(ipaddr,false,error.message.toString());
        return;
      }
      if (stderr) {
        appLogger.error('Error: '+stderr);
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
      
    },{maxBuffer: 10485760, timeout: 86400000}); // 10mb buffer and 24 hour timout
    globalnmappid=nmaprun.pid;
    appLogger.debug('Nmap started with pid: '+nmaprun.pid);
  }
  else if (typeof(callback)=='function') callback(ipaddr,false);
}

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
      parsedhosts.hosts[mac].scanning=false; //means the scanning is complete
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

function getLocalIP(callback){
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
  appLogger.debug('Local IPs: '+localip);
  appLogger.debug('Local MACs: '+localmac);
  appLogger.debug('Local subnets: '+localsubnet);
  if (typeof(callback)=='function') callback(localip,localmac,localsubnet);
}

function saveGlobalhosts(callback){
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

function saveAppOptions(data,callback){
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

function readLastscan(callback){
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
  portScan(appOptions.SUBNET,'subnet',(ip,data)=>{
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
  if (fs.existsSync('./app-options.json')) { // check if options file exist
    appLogger.log('Reading application options');
    try {
      appOptions=JSON.parse(fs.readFileSync('./app-options.json'));
    }
    catch(err) {
      appLogger.error('Error reading options file! Check the app-options.json file or remove it to use defaults');
      process.exit(1);
    }
    getLocalIP();//get local IP and mac addresses
  }
  else {
    appLogger.log('Application options file is not found, using defaults');
    appOptions={
      HTTPport: 30450,
      APP_SESSION_FS_SECRET: randomString(40),
      APP_SESSION_SECRET: randomString(40),
      SUBNET: '192.168.1.0/24',
      NMAP_SPEED: 5,
      NMAP_PORTS: 1000,
      NMAP_CMD_SCAN: "/usr/bin/nmap --privileged -oX - -sU -sT --max-retries 1 --script nbstat",
      NMAP_CMD_SWEEP: "/usr/bin/nmap --privileged -oX - -sU -p137 -T5 --max-retries 1 --script nbstat",
      NMAP_CRON: "30 03 * * *",
      NMAP_CRON_ENABLE: false
    };
    getLocalIP((ips,macs,subnets)=>{ // get local ip and mac and populate subnet value in appOptions
      appOptions.SUBNET=subnets[0] ? subnets[0] : '192.168.1.0/24';
      saveAppOptions(appOptions,function(ok,err){
        if (ok) appLogger.log('Application options file was created');
        if (err) appLogger.error('Error saving application options file',err);
      });
    });
  }

  
  readLastscan(); // read last scan results if available
  if (fs.existsSync('./globalhosts.json')) { // check if globalhosts file exist
    appLogger.log('Reading hosts data from globalhosts.json file');
    var mtime = fs.statSync('./globalhosts.json').mtime; // get the modification time of the globalhosts file.
    try {
      globalhosts=JSON.parse(fs.readFileSync('./globalhosts.json'));
      for (var h=0;h<Object.keys(globalhosts).length;h++){ // reset scanning state in case it was crashed or saved like that
        globalhosts[Object.keys(globalhosts)[h]].scanning=false;
      }
    }
    catch(err) {
      appLogger.log('Hosts data is missing need to run full scan');
      initScan();
    }
    updateArp(); //update global ARP table after reading globalhosts file
    var nowDate = new Date();
    if (nowDate-mtime > 86400000){ // only re-scan network if it is older than 24 hours
      appLogger.log('Hosts data is too old, need to rescan');
      appLogger.log('Starting full network scan');
      fullScan();
    }
  }
  else { //if globalhosts file doesn't exist, run from scratch, start fast scan, then slow scan
    appLogger.log('Hosts data is missing need to run full scan');
    initScan();
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
    if (!err) {appLogger.log("Server is listening on port "+appOptions.HTTPport)} 
    else {appLogger.error("Error starting server on port "+appOptions.HTTPport,err);}
  });
}

appInit(); //Finally initialize the app
