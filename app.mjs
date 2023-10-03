import path from 'path';
import http from 'http';
import redis from 'redis';
import connectRedis from 'connect-redis';
import express from 'express';
import session from 'express-session';
import cron from 'cron';
import { fileURLToPath } from 'url';

import appLogger from './applogger.mjs'; //logging class
import appOptions from './appoptions.mjs'; //options class
import hostDB from './hostdb.mjs'; //host data mgmt class
import appUtils from './apputils.mjs'; //utility functions
import netScanner from './netscanner.mjs' //network scanning functions
import { setTimeout } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const options = new appOptions(); //define options class
const hostdb = new hostDB(); // define hosts class
const logger = new appLogger();// define logger class
const utils=new appUtils();//define utils class
const netscan = new netScanner();//define network scanning class

const nmapCron = new cron.CronJob(options.get('NMAP_CRON'), scheduledScan); //cron object

// init Redis client for session store
const redisClient = redis.createClient({ url: options.get('REDIS_URL') }); //initialize Redis client for sessions data
await redisClient.connect().catch(console.error);
const redisStore = new connectRedis({
  client: redisClient,
  prefix: 'session:',
});
redisClient.on('error', function (err) {
  logger.log('Session store: Could not establish a connection with Redis. ' + err.toString());
  process.exit(1);
});
redisClient.on('connect', function () {
  logger.log('Session store: Connected to Redis successfully');
});

const app = express(); // initialize Express app
app.set('trust proxy', 1); // support for the app behind reverse proxy, allows secure cookie.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    // initialize Express session using Redis store
    store: redisStore,
    secret: options.get('APP_SESSION_SECRET') || 'not-very-secure-session',
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      unset: 'destroy',
      httpOnly: false,
      maxAge: 7 * 3600 * 24 * 1000 //7 days
    },
  })
);
app.use('/', express.static(path.join(__dirname, 'public'))); // supply local public content (html,css, scripts, etc.)
app.use((err, req, res, next) => {
  //Global endpoint error handler
  logger.error(err.stack);
  return res.status(500).type('text/plain').send('Internal server error!').end;
});

app.post('/api/ping', (req, res, next) => {// Ping host endpoint. Parameters: body:{"ip":"x.x.x.x"}
  if (typeof(req.body.ip) != undefined && utils.validateIPaddress(req.body.ip)){
    netscan.pingHost(req.body.ip).then((latency)=>{
      logger.debug('API/ping: address '+req.body.ip+' latency '+latency);
      if (latency>=0){
        hostdb.getmac(req.body.ip).then((mac)=>{
          hostdb.set(mac,'lastseen',new Date().getTime()); //set the last seen date of the host
        });
      }
      return res.status(200).type('application/json').send('{"msg":"ok","latency":'+latency+'}').end;
    });
  }
  else {
    return res.status(200).type('application/json').send('{"err":["Error","Malformed IP address"]}').end;
  }
});

app.get('/api/gethosts', (req, res) => {// Get hosts endpoint for all hosts. No parameters
  try {
    //logger.debug('API/gethost: Getting all hosts');
    hostdb.getAllHosts().then((hosts)=>{
      if (hosts==null) hosts={};
      return res.status(200).type('application/json').send(hosts).end;
    });
  }
  catch (error) {
    logger.error('api/gethosts: error: '+error);
    return res.status(200).type('application/json').send('{}').end;
  }
});

app.get('/api/gethost', (req, res) => { // Get host info endpoint. Parameters: url query: address (ip or mac)
  try {
    var addr=req.query.address;
    if (typeof(addr) == 'undefined' || addr == null) throw ('malformed address');
    //logger.debug('API/gethost: Getting host with address: '+addr);
    hostdb.getHost(addr).then((host)=>{
      if (host == null || typeof(host) != 'object') return res.status(200).type('application/json').send('{"err":"["Error","No host data"]"}').end;
      if (typeof(host.name)=='undefined'){
        if (typeof(host.dnsnames[0])!='undefined' && host.dnsnames[0]!='') host.name=host.dnsnames[0];
        else if (host.netbiosname.trim() !='') host.name=host.netbiosname.trim();
        else if (host.mdnsname.trim() !='') host.name=host.mdnsname;
        if (typeof(host.name)!='undefined' && host.name !='') hostdb.set(host.mac,'name',host.name); //set name in DB if we were able to set it
      }
      netscan.pingHost(host.ipaddr).then((latency)=>{
        host.latency=latency;
        hostdb.set(host.mac,'latency',latency); //set the latency in the DB
        if (latency >= 0) hostdb.set(host.mac,'lastseen',new Date().getTime()); //set last seen date if host is online
        return res.status(200).type('application/json').send(JSON.stringify(host)).end;
      });
    });    
  }
  catch (error) {
    logger.error('api/gethost: error: '+error);
    return res.status(200).type('application/json').send('{"err":"["Error","'+error+'"]"}').end;
  }
});

app.post('/api/netscan', (req, res, next) => { // Network scan endpoint. Parameters: body: {"ip": "ipaddress|subnet|abort"", "type": "portscan|discovery"}
  if (typeof(req.body.ip) != undefined){
    
    const isscanning = netscan.isScanning();
    if (isscanning && typeof(req.body.ip) != 'undefined' && req.body.ip == 'abort') { //abort mechanism
      logger.log('api/netscan: aborting scan by request');
      netscan.abortScan();
      return res.status(200).type('application/json').send('{"msg":["Aborted","Network scan was aborted"]}').end;
    }
    else if (typeof(req.body.ip) != 'undefined' && req.body.ip == 'abort') {
      return res.status(200).type('application/json').send('{"err":["Error","Network scan was not running"]}').end;
    }

    if (!isscanning) {
      netscan.portScan(req.body.ip, req.body.type, req.body.options).then((results)=>{
        logger.log('api/netscan: scan complete');
        if (typeof(results.hosts) != 'undefined' && results.hosts != {} && Object.keys(results.hosts).length > 0){
          if (Object.keys(results.hosts).length == 1) {//single host scan
            const mac = Object.keys(results.hosts)[0];
            hostdb.setHost(mac,results.hosts[mac]);
            hostdb.setStats(results.stats);
          }
          else {
            hostdb.setAllhosts(results.hosts);
            hostdb.setStats(results.stats);
          }
        }
      });
      if (req.body.ip=='subnet' || utils.validateIPsubnet(req.body.ip)){
        return res.status(200).type('application/json').send('{"msg":["Subnet scan started","It will take some time to complete"]}').end;
      }
      else {
        hostdb.getmac(req.body.ip).then((mac)=>{
          if (mac != null) hostdb.set(mac,'scanning', 1); // if found in arp table set host to scanning mode
        });
        return res.status(200).type('application/json').send('{"msg":["Host scan started","It will take some time to complete"]}').end;
      }
    }
    else {
      return res.status(200).type('application/json').send('{"err":["Busy","Another network scan is in progress.</br>Please wait a few moments until it is done."]}').end;
    }
  }
  else {
    return res.status(200).type('application/json').send('{"err":"["Error","Missing ip information"]"}').end;
  }
});  

app.get('/api/getnmaprun', (req, res, next) => { // Check nmap running endpoint. Output: msg_ok/err_busy
  //console.log(req);
  if (!netscan.isScanning()){
    return res.status(200).type('application/json').send('{"msg":"ok"}').end;  
  }
  else {
    return res.status(200).type('application/json').send('{"err":["Busy","Another network scan is in progress.</br>Please wait a few moments until it is done."]}').end;
  }
});

app.get('/api/getlastscan', (req, res, next) => { // Get last scan endpoint. Output: globallastscan variable contents
  //console.log(req);
  hostdb.getlastStats().then((laststats)=>{
    if (laststats != null){
      return res.status(200).type('application/json').send(JSON.stringify(laststats)).end;  
    }
    else {
      return res.status(200).type('application/json').send('{"err":"["Not available","Last scan info is not available yet"]"}').end;
    }
  })
  
});

app.post('/api/setname', (req, res, next) => {// Rename host endpoint. Parameters: mac, newname
  if (typeof(req.body.mac) != undefined && typeof(req.body.newname) != undefined){
    hostdb.set(req.body.mac, 'name', req.body.newname.toString().trim()).then(()=>{
      return res.status(200).type('application/json').send('{"msg":"ok"}').end;
    }).catch((e)=>{
      return res.status(200).type('application/json').send('{"err":"["Error","Error setting new name"]"}').end;
    });
  }
  else {
    return res.status(200).type('application/json').send('{"err":"["Error","Error setting new name"]"}').end;
  }
});

app.post('/api/deletehost', (req, res, next) => { // Delete host endpoint. Parameters: mac, ip
  if (typeof(req.body.mac) != undefined && typeof(req.body.ip) != undefined){
    hostdb.del(req.body.mac).then(()=>{
      return res.status(200).type('application/json').send('{"msg":"ok"}').end;
    }).catch ((e)=>{
      return res.status(200).type('application/json').send('{"err":"["Error","Error deleting host"]"}').end;
    });
  }
  else {
    return res.status(200).type('application/json').send('{"err":"["Error","Error deleting host"]"}').end;
  }
});

app.get('/api/getsettings', (req, res, next) => { // Get settings endpoint. output: settings_object
    try{
      let settings={};
      settings.subnet=options.get('SUBNET').split('/')[0];
      settings.netmask=options.get('SUBNET').split('/')[1];
      settings.ports=options.get('NMAP_PORTS');
      settings.speed=options.get('NMAP_SPEED');
      settings.cronexpr=options.get('NMAP_CRON');
      settings.cronenable=options.get('NMAP_CRON_ENABLE');
      settings.localsubnet=netscan.localsubnet;
      settings.localprimaryip=netscan.localprimaryip;
      settings.localprimarysubnet=netscan.localprimarysubnet;
      settings.firstrun=options.get('FIRST_RUN'); // let frontend know if it is a first run.
      return res.status(200).type('application/json').send(JSON.stringify(settings)).end;
    }
    catch {
      logger.error('/api/getsettings:',error);
      return res.status(200).type('application/json').send('{"err":"["Not available","Error getting settings. Check application log"]"}').end;
    }
});

app.post('/api/savesettings', (req, res, next) => { // Save settings endpoint. Parameters: settings_objec
  //console.log(typeof(req.body));
  //console.log(req.body);
  try{
    if (typeof(req.body)=='object'){
      options.set('SUBNET',req.body.subnet.split('/')[0]+'/'+req.body.netmask);
      options.set('NMAP_SPEED',req.body.speed);
      options.set('NMAP_PORTS',req.body.ports);
      options.set('NMAP_CRON',req.body.cronexpr);
      if (typeof(req.body.cronenable)=='undefined') options.set('NMAP_CRON_ENABLE',0);
      else options.set('NMAP_CRON_ENABLE',1);
      if (options.get('NMAP_CRON_ENABLE')) { // schedule cron job
        nmapCron.setTime(new cron.CronTime(options.get('NMAP_CRON')));
        nmapCron.start();
        logger.log('Scheduling next automatic full network scan on '+nmapCron.nextDates().toString());
      }
      else if (nmapCron){
        nmapCron.stop();
        logger.log('Disabling scheduled network scan');
      }
      else logger.error('Error: Cron is not properly initialized!');

      if (typeof(req.body.firstrun)!='undefined' && req.body.firstrun=='on') {
        options.set('FIRST_RUN', 0); //reset first run status
        if (!netscan.isScanning()) {
          initScan(); // start init scan
        }
      }
    }
    res.redirect('/');
  }
  catch (err){
    logger.error('api/savesettings:',err);
    res.redirect('/');
  }
});

function initScan(){ //First run network quick scan
  netscan.portScan('subnet', 'discovery').then((results)=>{
    logger.log('api/initScan: initial quick scan is complete');
    if (typeof(results.hosts) != 'undefined' && results.hosts != {} && Object.keys(results.hosts).length > 0){
      hostdb.setAllhosts(results.hosts);
      hostdb.setStats(results.stats);
    }
  });
}

function scheduledScan(){ // Function to perform full subnet network scan
  logger.log('scheduledScan: Starting scheduled full network scan');
  netscan.portScan('subnet', 'portscan').then((results)=>{
    logger.log('api/scheduledScan: scheduled scan is complete');
    if (typeof(results.hosts) != 'undefined' && results.hosts != {} && Object.keys(results.hosts).length > 0){
      hostdb.setAllhosts(results.hosts);
      hostdb.setStats(results.stats);
    }
  });
}

async function appInit() { // main function that loads parameters and starts everything else
  logger.log('Starting homenetmon application on '+process.platform);
  if (options.get('NMAP_CRON_ENABLE')==1) {
    nmapCron.start();
    logger.log('Scheduling next automatic full network scan on '+nmapCron.nextDates().toString());
  }
  else logger.log('Scheduled network scan is disabled');
  hostdb.setparamAll('scanning',0); //reset scanning status of all hosts in DB
  logger.debug ('Starting HTTP server on port '+options.get('HTTPport'));
  const serverHTTP = http.createServer(app).listen(options.get('HTTPport'), (err)=> {
    if (err) {
      logger.error('appInit: Error starting HTTP server',err)
      appShutdown();
      return;
    }
    logger.log('HTTP server started: http://'+netscan.localprimaryip+':'+options.get('HTTPport')+'/');
  });
}

function appShutdown() { //function to gracefully shutdown the app
  logger.log('Caught kill signal, terminating the app');
  setTimeout(5000,()=>{process.exit(0);}); //give the app time to terminate, then kill.
  hostdb.syncDB().then((error) =>{
    hostdb.close().then((err)=>{
      process.exit(0);
    });
  });
}

process.on('SIGTERM', appShutdown); // register the shutdown function on receiving TERM signal
process.on('SIGINT', appShutdown); // register the shutdown function on receiving INT signal
appInit();