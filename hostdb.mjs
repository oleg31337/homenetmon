import redis from 'redis';
import appLogger from './applogger.mjs';
import appOptions from './appoptions.mjs';
import appUtils from './apputils.mjs';
const logger = new appLogger();
const options = new appOptions();
const utils = new appUtils();

class hostDB {
    #macprefix = 'hostmac:';
    #ipprefix = 'hostip:';
    #statsprefix = 'stats:';
    #redisClient = null;

    constructor() {
        this.connect();
    }

    async connect(redisurl){
        try{
            this.#redisClient = redis.createClient({ url: options.get('REDIS_URL') || 'redis://localhost:6379' });
            await this.#redisClient.connect();
            logger.debug('HostDB: Connected to redis successfully');
            return;
        }
        catch (error) {
            logger.error('HostDB: Could not establish a connection with redis.', error);
            process.exit(0);
        }
    }
    
    async close(){
        try{
            await this.#redisClient.quit();
            logger.debug('HostDB: Disconected from redis successfully');
            return;
        }
        catch (error) {
            logger.error('HostDB: Could not quit redis.', error);
            return error;
        }
    }
    
    async getHost(addr) {
        try {
            let mac=addr;
            if (utils.validateIPaddress(addr)) mac=await this.getmac(addr);
            if (! utils.validateMac(mac)) throw ('invalid host address:'+addr);
            const host = await this.#redisClient.hGetAll(this.#macprefix + mac);
            //logger.debug('HostDB: got host from redis:', host);
            if (typeof host.mac != 'undefined') {
                if (typeof host.ports != 'undefined' && host.ports !='') {
                    try {
                        host.ports = JSON.parse(host.ports);
                    }
                    catch {
                        host.ports = []
                    }
                }
                else {
                    host.ports = []
                }
                if (typeof host.dnsnames !== 'undefined' && host.dnsnames !='') {
                    try {
                        host.dnsnames = JSON.parse(host.dnsnames);
                    }
                    catch {
                        host.dnsnames = []
                    }
                }
                else {
                    host.dnsnames = []
                }
                return Object.assign({}, host);
            } else {
                return null;
            }
        } catch (error) {
            logger.error('hostDB:getHost:',error);
            return null;
        }
    }

    async getAllHosts() {
        let hosts = {};
        try {
            const hostkeys = await this.#redisClient.keys(this.#macprefix + '*');
            if (hostkeys.length == 0) return null;
            for (let i = 0; i < hostkeys.length; i++) {
                const mac = hostkeys[i].replace(this.#macprefix, '');
                const host = await this.getHost(mac);
                hosts[mac] = host;
            }
            return hosts;
        } catch (error) {
            logger.error('hostDB:getHosts:',error);
            return null;
        }
    }

    async setHost(mac, host) { // set entire host object
        try {
            logger.debug(`setting ${mac} host`);
            if (!utils.validateMac(mac)) throw ('invalid MAC address:'+mac);
            host.mac=mac; //make sure the mac address matches
            for (let i=0;i<Object.keys(host).length;i++){ //replace any undefined values with blanks
                if (typeof(host[Object.keys(host)[i]]) == 'undefined') host[Object.keys(host)[i]] = '';
            }
            if (typeof host.ports != 'undefined' && host.ports !='') {
                try {
                    host.ports = JSON.stringify(host.ports);
                }
                catch {
                    host.ports = '[]';
                }
            }
            else {
                host.ports = '[]';
            }
            if (typeof host.dnsnames != 'undefined' && host.dnsnames !='') {
                try {
                    host.dnsnames = JSON.stringify(host.dnsnames);
                }
                catch {
                    host.dnsnames = '[]';
                }
            }
            else {
                host.dnsnames = '[]';
            }
            host.scanning = host.scanning ? 1 : 0;
            await this.#redisClient.hSet(this.#macprefix + mac, host);
            if (typeof(host.ipaddr) != 'undefined' && host.ipaddr != null) {
                await this.#redisClient.set(this.#ipprefix + host.ipaddr, mac); //update ARP table entry on every host update
            }
            return;
        } catch (error) {
            logger.error('hostDB:setHost:',error,host);
            return error;
        }
    }

    async setAllhosts(hosts) { //set all host objects as a bundle (e.g., after full network scan)
        try{
            for (let i=0;i<Object.keys(hosts).length;i++){ // we have to be synchronous as we need to rebuild ARP table after
                const mac=Object.keys(hosts)[i];
                if (utils.validateMac(mac)){
                    await this.setHost(mac, hosts[mac]);
                }
                else {
                    console.error('setAllhosts: skipping invalid MAC address: '+mac);
                    continue;
                }
            }
            logger.debug('hostDB:setAllhosts: All hosts are set');
            await this.rebuildARPtable();
            return null;
        }
        catch(error){
            logger.error('setAllhosts:',error);
            return error;
        }
    }

    async setparamAll(param,value) { //set one parameter of each host to a specific single value
        try{
            if (typeof(param) == undefined || typeof(value)=='undefined' || param==null || value==null) throw('Wrong parameters supplied',param,value);
            const hostkeys = await this.#redisClient.keys(this.#macprefix + '*');
            for (let i = 0; i < hostkeys.length; i++) {
                const mac = hostkeys[i].replace(this.#macprefix, '');
                this.set(mac,param,value);
            }
            logger.debug(`hostDB:setparamAllhosts: All hosts '${param}' are set to '${value}'`);
            await this.rebuildARPtable();
            return null;
        }
        catch(error){
            logger.error('hostDB:setparamAllhosts:',error);
            return error;
        }
    }

    async del(mac){ //delete host
        try {
            await this.#redisClient.del(this.#macprefix + mac);
            return;
        } catch (error) {
            logger.error('hostDB:del:', error);
            return error;
        }
    }

    async set(mac, param, value) { //set one host parameter
        try {
            if (typeof(mac) == 'undefined' || typeof(param) == undefined || typeof(value)=='undefined' || mac==null || param==null) throw('Wrong parameters supplied',mac,param);
            if (typeof(value)=='undefined' || value == null) value = ''; //maybe need to delete the param using hdel?
            if (!utils.validateMac(mac)) throw ('invalid MAC address: '+mac);
            if (param == 'ports' || param == 'dnsnames') {
                value = JSON.stringify(value);
            }
            if (param =='mac') value=mac; //make sure the mac can't be different from host key
            if (param =='scanning') value = value ? 1 : 0; //convert true/false to 1/0
            await this.#redisClient.hSet(this.#macprefix + mac, param, value);
            if (param =='ipaddr' && typeof(value) != 'undefined' && value != null) {
                await this.#redisClient.set(this.#ipprefix + value, mac); //update ARP table entry on every host IP address update
            }
            return;
        } catch (error) {
            logger.error('hostDB:set:', error);
            return error;
        }
    }

    async get(mac, param) { //get one host parameter
        try {
            if (typeof(mac) == 'undefined' || typeof(param) == undefined || mac==null || param==null) throw('Wrong parameters supplied');
            const host = await this.getHost(mac);
            const value = host[param];
            logger.debug('hostDB:get: read host from redis:', mac);
            if (typeof value != 'undefined') {
                return value;
            } else {
                return null;
            }
        } catch (error) {
            logger.error('hostDB:get:',error);
            return null;
        }
    }

    // ARP table functions
    async rebuildARPtable(){
        try {
            await this.wipeDBarp();
            const hostkeys= await this.#redisClient.keys(this.#macprefix+'*');
            for(let i=0;i<hostkeys.length;i++){
                const mac = hostkeys[i].replace(this.#macprefix, '');
                const ip = await this.#redisClient.hGet(this.#macprefix+mac,'ipaddr');
                if (typeof(ip) != 'undefined' && ip != null) {
                    this.#redisClient.set(this.#ipprefix + ip, mac);
                }
            }
            logger.debug('hostDB:rebuildARPtable: ARP table is rebuilt');
        }
        catch (error){
            logger.error('hostDB:rebuildARPtable:', error);
            return error;
        }
    }

    async getmac(ip) {
        try {
            if (!utils.validateIP(ip)) throw ('invalid IP address');
            const mac = await this.#redisClient.get(this.#ipprefix + ip);
            if (typeof(mac)=='undefined') return null;
            return mac;
        } catch (error) {
            logger.error('hostDB:getmac:', error);
            return null;
        }
    }

    async getip(mac) {
        try {
            if (!utils.validateMac(mac)) throw ('invalid MAC address');
            const ip = await this.#redisClient.hGet(this.#macprefix + mac,'ipaddr');
            if (typeof(ip) == 'undefined') return null
            return ip;
        } catch (error) {
            logger.error('hostDB:getip:', error);
            return null;
        }
    }

    //stats functions
    async setStats(stats) {
        try {
            if (typeof(stats) != 'undefined' && typeof(stats.runstats) != 'undefined'){
                const statstext=JSON.stringify(stats);
                await this.#redisClient.set(this.#statsprefix+stats.runstats.time,statstext, 'EX', options.get('KEEP_STATS_HISTORY')*24*3600); //set to expire records
                await this.#redisClient.set(this.#statsprefix+'last',statstext); //set the last value as persistent
            }
            else throw('Stats not defined!');
            return;
        } catch (error) {
            logger.error('hostDB:setStats:', error);
            return error;
        }
    }
    
    async getlastStats() {
        try {
            const statstext = await this.#redisClient.get(this.#statsprefix+'last');
            if (typeof(statstext) != 'undefined' && statstext != 'null'){
                return JSON.parse(statstext);
            }
            else return null;
        } catch (error) {
            logger.error('hostDB:getlastStats:', error);
            return null;
        }
    }

    async getallStats() {
        try {
            const allstats=[];
            const statskeys = await this.#redisClient.keys(this.#statsprefix+'*');
            statskeys.sort((a,b) => parseInt(a.replace(this.#statsprefix,'')) - parseInt(b.replace(this.#statsprefix,''))); //sort by time
            for (let i=0;i<statskeys.length;i++){
                const statstext = await this.#redisClient.get(statskeys[i]);
                allstats.push(JSON.parse(statstext));
            }
            return allstats;
        } catch (error) {
            logger.error('hostDB:getallStats:', error);
            return null;
        }
    }

    //DB maintenance functions
    async syncDB(){
        try {
            await this.#redisClient.bgSave();
        }
        catch(error) {
            logger.error('hostDB:syncDB:', error);
            return;
        }
    }
    async wipeDBall() { //wipe entire redis database
        try {
            logger.debug('hostDB:wipeDBall: Deleting all DB data');
            await this.wipeDBarp();
            await this.wipeDBhosts();
            await this.wipeDBstats();
            return;
        }
        catch (error) {
            logger.error('hostDB:wipeDBall:', error);
            return;
        }
    }
    async wipeDBhosts() {
        try {
            const hostkeys = await this.#redisClient.keys(this.#macprefix + '*');
            for (let i=0;i<hostkeys.length;i++){
                this.#redisClient.del(hostkeys[i]);
            }
            logger.debug('hostDB:wipeDBhosts: Hosts table cleared');
            return;
        }
        catch (error) {
            logger.error('hostDB:wipeDBhosts:', error);
            return;
        }
    }
    async wipeDBarp() {
        try {
            const ipkeys = await this.#redisClient.keys(this.#ipprefix + '*');
            for (let i=0;i<ipkeys.length;i++){
                this.#redisClient.del(ipkeys[i]);
            }
            logger.debug('hostDB:wipeDBarp: ARP table cleared');
            return;
        }
        catch (error) {
            logger.error('hostDB:wipeDBarp:', error);
            return;
        }
    }
    async wipeDBstats() {
        try {
            const statskeys = await this.#redisClient.keys(this.#statsprefix + '*');
            for (let i=0;i<statskeys.length;i++){
                this.#redisClient.del(statskeys[i]);
            }
            logger.debug('hostDB:wipeDBstats: Stats table cleared');
            return;
        }
        catch (error) {
            logger.error('hostDB:wipeDBstats:', error);
            return;
        }
    }
}

export default hostDB;