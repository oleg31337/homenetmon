import ping from 'ping';
import gw from 'default-gateway';
import ip from 'ip';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { exec } from "child_process";
import { spawn } from "child_process";
import { parseString } from 'xml2js';
import { createRequire } from 'module'; // only needed for dnssd2 as it is outdated
import appLogger from './applogger.mjs'; //logging class
import appOptions from './appoptions.mjs'; //options class
import appUtils from './apputils.mjs'; //utility functions

const require = createRequire(import.meta.url); // this is only used to correctly import dnssd2.
const dnssd = require('dnssd2'); // using old syntax to import dnssd2 as it is outdated
const options = new appOptions(); //define options class
const logger = new appLogger();// define logger class
const utils=new appUtils();//define utils class

class netScanner{
    #nmapruntime=null;
    lastscan=null;
    localip=[];
    localmac=[];
    localsubnet=[];
    localprimaryip='';
    localprimarysubnet='';
    #servicesDB={tcp:{},udp:{}}; //database of TCP/UDP services with descriptions

    constructor() {
        this.getLocalIPs(); // populate global class properties
        this.#servicesDB = JSON.parse(fs.readFileSync('./services-db.json', 'utf8'));
        logger.debug('netFunctions class initialized');
    }

    async pingHost(ipaddr) { //ping with ICMP, if fails try ARP
        try {  
            let latency=await this.pingICMP(ipaddr);
            if (latency < 0) {
                const arp=await this.pingArp(ipaddr);
                latency=arp.latency;
            }
            return latency;
        }
        catch (err) {
            logger.error(`pingHost: Error pinging ${ipaddr}`, err);
            return -1;
        }
    };
    async pingICMP(ipaddr) {
        try {  
            const options = { timeout: 1 };
            const response = await ping.promise.probe(ipaddr,options);
            if (response.alive) {
                //logger.debug(`Ping ICMP: ${ipaddr} is online with latency ${response.max}`);
                return parseFloat(response.max);
            }
            else return -1;
        }
        catch (err) {
            logger.error(`pingICMP: Error pinging ${ipaddr}`, err);
            return -1;
        }
    };
    async pingArp(ipaddr) { // returns latency and mac address of the pinged IP in an object {latency:xxx,mac:xxx}
        return new Promise((resolve, reject) => {
            if (typeof ipaddr == 'undefined' || ! utils.validateIP(ipaddr)) { // validate IP address
                logger.error('Error calling pingArp: Incorrect IP address');
                reject ('Error calling pingArp: Incorrect IP address');
            }
            const npingcmd=options.get('NPING_CMD')+' '+ipaddr;
            exec(npingcmd, (error, stdout, stderr) => {
                const regex = /RCVD \((\d+\.\d+)s\) ARP reply (\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}) is at (([0-9A-Fa-f]{2}[:]){5}([0-9A-Fa-f]{2}))/;
                if (error) {
                    logger.error(`Ping ARP: error ${ipaddr}`,error);
                    reject ('Ping ARP: error');
                }
                if (stderr) {
                    logger.error(`Ping ARP: error ${ipaddr}`,stderr);
                    reject ('Ping ARP: error');
                }
                const match = (stdout.toString()).match(regex);
                
                if (match) {
                    const latency=parseFloat(match[1]);
                    const mac=match[3];
                    //logger.debug(`Ping ARP: ${ipaddr} is online with mac ${mac} and latency ${latency}`);
                    resolve ({latency:latency,mac:mac});
                } else {
                    //logger.debug(`Ping ARP: ${ipaddr} is unreachable`);
                    resolve ({latency:-1,mac:null});
                }
            });
            
        });
    };

    isScanning(){ // Function to check if nmap pid is still running
        try {
            if (this.#nmapruntime != null && this.#nmapruntime.pid) {
                const pid=process.kill(this.#nmapruntime.pid,0);
                //logger.debug('isScanning: pid: '+pid);
                return true;
            }
            else throw('isScanning: nmap is not running');
        }
        catch {
            //logger.debug('isScanning: nmap is not running');
            return false;
        }
    }

    async #nmapRun(nmapcmd){
        return new Promise((resolve, reject) => {
            const [command, ...args] = nmapcmd.split(' ');
            this.#nmapruntime = spawn(command, args, { shell: false });
    
            let stdout = '';
            let stderr = '';
            
            const timeout = setTimeout(() => {
                this.#nmapruntime.kill('SIGTERM');
                this.#nmapruntime.kill('SIGKILL');
                reject(new Error('nmapRun: nmap execution timed out'));
            }, 86400000); // 24 hours

            this.#nmapruntime.stdout.on('data', (data) => {
                stdout += data;
                console.log(data.toString());
            });
    
            this.#nmapruntime.stderr.on('data', (data) => {
                stderr += data;
                console.error(data.toString());
            });
    
            this.#nmapruntime.on('error', (error) => {
                clearTimeout(timeout);
                logger.error('nmapRun: !!!! nmap execution error: ' + error.message);
                reject(error);
            });
    
            this.#nmapruntime.on('exit', (code) => {
                clearTimeout(timeout);
                if (code !== 0) {
                    if (code == null || code == 143 || code == 137 || code == 130) {
                        logger.debug('nmapRun: nmap was killed');
                        reject('nmap was killed');
                    }
                    else {
                        logger.error(`nmapRun: nmap exit code: ${code}, error: ` + stderr);
                        reject(new Error(stderr));
                    }
                } else {
                    if (process.env.DEBUG === 'true') fs.writeFileSync(path.join(process.env.DATA_PATH || '', 'nmap-output.xml'),stdout.toString());
                    parseString(stdout, {attrkey:'p',charkey:'t'}, (err, result) => {
                        if (err) {
                            logger.error("nmapRun: Error converting nmap results to JSON: " + err);
                            logger.debug('nmap XML output content:\n', stdout);
                            reject(err);
                        } else {
                            if (process.env.DEBUG === 'true') fs.writeFileSync(path.join(process.env.DATA_PATH || '', 'nmap-output.json'),JSON.stringify(result,null,2));
                            logger.debug('nmapRun: nmap scan finished.');
                            resolve(result);
                        }
                    });
                }
            });
            logger.debug('nmapRun: nmap started with pid: ' + this.#nmapruntime.pid);
        });
    }
    
    async portScan(ipaddr,type,opts){ //Function to perform port scanning. Parameters: ip,type('portscan'|'discovery'). Callback parameters: ip, parsedhosts_obj, err
        return new Promise((resolve, reject) => {
            var scanscope='host'; // single host scope by default
            var nmapcmd=options.get('NMAP_CMD_SCAN') // full portscan by default
            if (typeof(opts) =='undefined'){
                opts={'speed':options.get('NMAP_SPEED'), 'ports': options.get('NMAP_PORTS')};
            }
            if (typeof(opts.ports)=='undefined') opts.ports=options.get('NMAP_PORTS');
            if (typeof(opts.speed)=='undefined') opts.speed=options.get('NMAP_SPEED');
            //logger.debug(opts);
            nmapcmd+=' -T'+opts.speed;
            if (opts.ports==65535){
                nmapcmd+=' -p1-65535';
            }
            else {
                nmapcmd+=' --top-ports '+opts.ports;
            }
            if (opts.ports==0){type='discovery'} //if 0 ports then it is a discovery scan.
            if (typeof(type)!='undefined' && type=='discovery') { //fast host discovery scan
                ipaddr=options.get('SUBNET');
                nmapcmd=options.get('NMAP_CMD_SWEEP');
                logger.log(`portScan: quick subnet discovery mode`);
            } else type='portscan'; //portscan by default
            if (typeof(ipaddr) != 'undefined' && ipaddr=='subnet'){ //full subnet scan
                ipaddr=options.get('SUBNET');
                scanscope='subnet';
                logger.log(`Starting ${ipaddr} subnet scan`);
            }
            if (typeof(ipaddr) != 'undefined' && utils.validateIP(ipaddr)){
                logger.log(`portScan: starting scan of ${ipaddr}`);
                const promiseNmap=this.#nmapRun(nmapcmd+' '+ipaddr);
                const promiseMdns=this.mdnsScan(5000);
                Promise.all([promiseNmap,promiseMdns]).then(([nmapout,mdnsout])=>{
                    nmapout.scantype=type;
                    nmapout.scanscope=scanscope;
                    nmapout.mdnshosts=mdnsout;
                    var parsedhosts=this.#parseScanResults(nmapout);
                    this.lastscan=JSON.parse(JSON.stringify(parsedhosts.stats)); //deep copy value
                    logger.log(`portScan: scanning of ${ipaddr} is complete`);
                    resolve(parsedhosts);
                }).catch(err => {
                    //console.log(JSON.stringify(err));
                    if (err.toString() == 'nmap was killed') logger.error('portScan: scanning was aborted');
                    else logger.error(`portScan: Error during scanning ${ipaddr}`, err);
                    reject(err);
                });
            }
            else {
                reject (`portScan: IP address ${ipaddr} is not defined or valid`);
            }
        });
    };
    
    async abortScan(){ //abort running scan
        return new Promise((resolve, reject) => {
            try{
                if (this.isScanning()){
                    logger.debug('abortScan: Killing nmap pid:'+this.#nmapruntime.pid);
                    this.#nmapruntime.kill('SIGTERM');
                    this.#nmapruntime.kill('SIGKILL');
                    resolve(true);
                }
                else resolve(false);
            }
            catch (e){
                logger.error('abortScan: Error aborting nmap job:',e);
                reject(e);
            }
        });
    }
    
    getLocalIPs(){ // Function to get local IP addressese and corresponding MAC addresses and update global variables.
        var interfaces=os.networkInterfaces(); //get the list of local interfaces
        this.localip=[];
        this.localmac=[];
        this.localsubnet=[];
        for (var e=0;e<Object.keys(interfaces).length;e++){ //extract local interfaces ip and mac addresses
          //logger.debug(JSON.stringify(interfaces[Object.keys(interfaces)[e]]));
          for (var k=0; k<interfaces[Object.keys(interfaces)[e]].length;k++){
            if (!interfaces[Object.keys(interfaces)[e]][k].internal && interfaces[Object.keys(interfaces)[e]][k].family=='IPv4'){
                this.localip.push(interfaces[Object.keys(interfaces)[e]][k].address);
                this.localmac.push(interfaces[Object.keys(interfaces)[e]][k].mac);
                var netmaskbits=interfaces[Object.keys(interfaces)[e]][k].cidr.split('/')[1]
                this.localsubnet.push(utils.int2ip(utils.ip2int(interfaces[Object.keys(interfaces)[e]][k].address)>>>(32-netmaskbits)<<(32-netmaskbits)>>>0)+'/'+netmaskbits); //calculate local subnet
            }
          }
        }
        const {gateway,gwinterface} = gw.v4.sync();
        for (var i=0; i<this.localsubnet.length; i++){
          if (ip.cidrSubnet(this.localsubnet[i]).contains(gateway)) {
            this.localprimaryip = this.localip[i];
            this.localprimarysubnet = this.localsubnet[i];
          }
        }
        logger.debug('Primary IP: '+this.localprimaryip);
        logger.debug('Primary Subnet: '+ this.localprimarysubnet);
        logger.debug('Local IPs: '+this.localip);
        logger.debug('Local MACs: '+this.localmac);
        logger.debug('Local subnets: '+this.localsubnet);
    }

    async mdnsScan (scantime = 5000) {
        return new Promise ((resolve,reject) => {
            const services = [];
            const browser = dnssd.Browser(dnssd.all(), { interface: this.localprimaryip, resolve: true })
            .on('serviceUp', (service) => {
                let servicebrowser;
                if (service.protocol === 'tcp') {
                servicebrowser = dnssd.Browser(dnssd.tcp(service.name), { interface: this.localprimaryip, resolve: true })
                    .on('serviceUp', (tcpservice) => {
                        services.push(tcpservice);
                    });
                } else if (service.protocol === 'udp'){
                servicebrowser = dnssd.Browser(dnssd.udp(service.name), { interface: this.localprimaryip, resolve: true })
                    .on('serviceUp', (udpservice) => {
                        services.push(udpservice);
                    });
                }
                else return;
                servicebrowser.start();
                setTimeout(() => { servicebrowser.stop(); }, scantime);
            })
            .on('error', (err) => {
                logger.error(`mdnsScan: Error during mDNS scan: ${err}`);
                reject(err);
            });
            logger.debug('Starting mDNS scan');
            browser.start();
            setTimeout(() => {
                const hosts = {};
                browser.stop();
                //console.log(JSON.stringify(services));
                const regex_square = /\s*\[.*?\]\s*/g;
                const regex_dot = /\.$/;
                const regex_colon = /:.*/g;
                for (let i = 0; i < services.length; i++) {
                    for (let j = 0; j < services[i].addresses.length; j++) {
                        if (utils.validateIP(services[i].addresses[j])) {
                            if (typeof hosts[services[i].addresses[j]] === 'undefined') {
                                hosts[services[i].addresses[j]] = {};
                            }
                            if (typeof (services[i].name)!='undefined') hosts[services[i].addresses[j]].name = services[i].name.replace(regex_square,'').replace(regex_colon,'').trim();
                            else hosts[services[i].addresses[j]].name='';
                            if (typeof (services[i].name)!='undefined') hosts[services[i].addresses[j]].host = services[i].host.replace(regex_dot,'').trim();
                            else hosts[services[i].addresses[j]].host='';
                        }
                    }
                }
                logger.debug(`mDNS scan complete. found ${Object.keys(hosts).length} hosts`);
                //console.log(JSON.stringify(hosts,null,2));
                resolve (hosts);
            }, scantime);
        });
    };

    #parseScanResults(data){ // internal Function to parse json nmap output converted from XML. Parameters: nmaprun_json_obj. Returns: parsedhosts_obj
        try{
            var parsedhosts={hosts:{},stats:{}};
            var portsprobed={tcp:[],udp:[]};
            if (typeof (data.nmaprun.host) !='undefined'){
            var hosts=data.nmaprun.host;
            for (var i=0;i<hosts.length;i++){
                var ip = hosts[i].address[0].p.addr;
                var mac = hosts[i].address[1] ? hosts[i].address[1].p.addr : 'unknown';
                if (mac=='unknown'){ //let's try to check if it is one of our local interfaces
                if (utils.findinArray(this.localip,ip)>=0){
                    mac=this.localmac[utils.findinArray(this.localip,ip)];
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
                } else dnsnames=[];
                //if (typeof(data.mdnshosts[ip])!='undefined') {
                //    dnsnames.push(data.mdnshosts[ip].host);
                //}
                var netbiosname='';
                if (typeof(hosts[i].hostscript) != 'undefined'){
                    //logger.debug(JSON.stringify(hosts[i].hostscript[0].script[0].p.output));
                    const re=/^NetBIOS\sname:\s(\S+),\sNetBIOS.*/i;
                    netbiosname=(hosts[i].hostscript[0].script[0].p.output).toString().match(re) ? (hosts[i].hostscript[0].script[0].p.output).toString().match(re)[1] : '';
                    //logger.debug(JSON.stringify(netbiosname));
                    var elem = hosts[i].hostscript[0].script[0].elem ? hosts[i].hostscript[0].script[0].elem : []; //alternative results may be generated by nmap (WTF???)
                    for (var n=0;n<elem.length;n++){
                        if (elem[n].p.key=='server_name') netbiosname=elem[n].t;
                    }
                }
                if (typeof(netbiosname)=='undefined' || netbiosname=='<unknown>') netbiosname='';
                var mdnsname='';
                var mdnshostname='';
                if (typeof(data.mdnshosts[ip])!='undefined' && data.mdnshosts[ip].name !='') {
                    mdnsname=data.mdnshosts[ip].name;
                    mdnshostname=data.mdnshosts[ip].host;
                }

                var vendor = hosts[i].address[1] ? hosts[i].address[1].p.vendor : 'unknown';
                var ports={tcp:{},udp:{}};
                portsprobed={tcp:[],udp:[]};
                if (typeof(hosts[i].ports) != 'undefined' && typeof(hosts[i].ports[0].port) !='undefined'){
                    //console.log("-----------------------------\n",JSON.stringify(hosts[i].ports,null,2),"-----------------------------\n")
                    for (var j=0;j<hosts[i].ports[0].port.length;j++){
                        var portid=hosts[i].ports[0].port[j].p.portid;
                        var protocol=hosts[i].ports[0].port[j].p.protocol;
                        //var service=hosts[i].ports[0].port[j].service[0].p.name ? hosts[i].ports[0].port[j].service[0].p.name : 'unknown';
                        var service = {name:'',desc:''};
                        if (typeof(this.#servicesDB[protocol][portid]) !='undefined'){
                            service=this.#servicesDB[protocol][portid]
                        }
                        var state=hosts[i].ports[0].port[j].state[0].p.state;
                        portsprobed[protocol].push(parseInt(portid));
                        if (state == 'open'){ //only push if port state is open
                            ports[protocol][portid]=service;
                        }
                    }
                    //if (ports.length==0) ports=[];
                }
                else ports={tcp:{},udp:{}};
                //update hosts information
                if (typeof(parsedhosts.hosts[mac])=='undefined'){  //if new host then define an object and add first seen date.
                parsedhosts.hosts[mac]={}; 
                }
                parsedhosts.hosts[mac].lastseen=new Date().getTime(); //set last seen date to now
                parsedhosts.hosts[mac].lastscanned=new Date().getTime(); //set last scanned date to now
                parsedhosts.hosts[mac].ipaddr=ip;
                parsedhosts.hosts[mac].mac=mac;
                parsedhosts.hosts[mac].dnsnames=dnsnames;
                parsedhosts.hosts[mac].netbiosname=netbiosname;
                parsedhosts.hosts[mac].mdnsname=mdnsname;
                parsedhosts.hosts[mac].mdnshostname=mdnshostname;
                parsedhosts.hosts[mac].ports=ports;
                parsedhosts.hosts[mac].vendor=vendor;
                parsedhosts.hosts[mac].scanning=0; //means the scanning is complete
            }
            }
            parsedhosts.stats = {
            'runstats': {...data.nmaprun.runstats[0].finished[0].p, ...data.nmaprun.p},
            'hosts': data.nmaprun.runstats[0].hosts[0].p
            }
            parsedhosts.stats.runstats.portsprobed=portsprobed; //latest portsprobed value, shall be good enough.
            //logger.debug(JSON.stringify(data.nmaprun.scaninfo,2));
            return parsedhosts;
        }
        catch (error) {
            logger.error('parseScanResults: Error parsing scan results: ',error);
            return {};
        }
    };
}

export default netScanner;
