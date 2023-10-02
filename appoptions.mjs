import fs from 'fs';
import path from 'path';
import appLogger from './applogger.mjs'; //logging routines
import appUtils from './apputils.mjs'; //utility functions

const logger=new appLogger();
const utils=new appUtils();

class appOptions {
    #options = {}; //define internal properties
    #optionsfilelastmod=''; //define last modification time of the options file
    #defaults = {
        HTTPport: 30450,
        APP_SESSION_SECRET: utils.randomString(40),
        SUBNET: '192.168.1.0/24',
        NMAP_SPEED: 5, // maximum speed by default
        NMAP_PORTS: 1000, // scan only 1000 popular ports by default
        NMAP_CMD_SCAN:  "/usr/bin/nmap --privileged -oX - -sS -sU --max-retries 5 --script nbstat --system-dns",
        NMAP_CMD_SWEEP: "/usr/bin/nmap --privileged -oX - -sS -sU --max-retries 2 --script nbstat --system-dns --top-ports 10 -T5",
        NPING_CMD: "/usr/bin/nping --privileged --arp -c10 --rate=100",
        NMAP_CRON: "30 03 * * *",// default full scan schedule at 3:30am
        NMAP_CRON_ENABLE: 0, //disable scheduled scanning by default
        REDIS_URL: "redis://localhost:30451", // non-standard redis port, this is for docker container to run on host network
        KEEP_STATS_HISTORY: 30, //keep 30 days of scan stats history by default
        FIRST_RUN: 1 //first run indicator, will show settings menu in browser on the first start
    };

    constructor() {
        if (process.platform == 'win32'){ // if we are on Windows, then omit full path as nmap is added to system path by default
            this.#defaults.NMAP_CMD_SCAN = "nmap.exe --privileged -oX - -sU -sS --max-retries 5 --script nbstat --system-dns"
            this.#defaults.NMAP_CMD_SWEEP = "nmap.exe --privileged -oX - -sS -sU --top-ports 10 -T5 --script nbstat --max-retries 2 --system-dns"
            this.#defaults.NPING_CMD = "nping.exe --privileged --arp -c10 --rate=100" //10 attempts to ARP ping
        }
        this.readOptionsFromFile();
    }

    optionsFilePath() {
        return process.env.OPTIONS_FILE || path.join(process.env.DATA_PATH || '', 'app-options.json');
    }

    get(option) {
        this.#rereadOptions(); //make sure options are in sync
        if (typeof(this.#options[option]) != 'undefined') {
            return this.#options[option];
        }
        else {
            logger.error(`AppOptions: The option ${option} does not exist!`);
            return null;
        }
        
    }

    set(option, value) {
        this.#rereadOptions(); //make sure options are in sync
        if (Object.keys(this.#defaults).includes(option)) { // compare schema to default options
            this.#options[option] = value;
            this.writeOptionsToFile();
        } else {
            logger.error(`AppOptions: The option ${option} does not exist!`);
        }
    }

    #rereadOptions(){ // re-read options file only if it is changed on disk
        if (fs.existsSync(this.optionsFilePath())) {
            const stats = fs.statSync(this.optionsFilePath());
            if (stats.mtime.getTime() != this.#optionsfilelastmod) this.readOptionsFromFile(); //re-read options file if mtime is different
        }
        else this.readOptionsFromFile(); //make sure the file is re-created by reading procedure
    }
    
    readOptionsFromFile() {
        try {
            if (fs.existsSync(this.optionsFilePath())) {
                const optionsData = fs.readFileSync(this.optionsFilePath());
                const stats = fs.statSync(this.optionsFilePath());
                this.#optionsfilelastmod=stats.mtime.getTime();
                //logger.debug('options mtime',stats.mtime.getTime());
                logger.debug('AppOptions: Options file found and loaded')
                this.#options=JSON.parse(optionsData);
                return;
            } else {
                logger.debug('AppOptions: Options file not found, using defaults')
                this.#options=this.#defaults;
                this.writeOptionsToFile();
                return;
            }
        } catch (error) {
            logger.error('AppOptions: Error reading options from file:', error);
            return null;
        }
    }

    writeOptionsToFile() {
        const optionsData = JSON.stringify(this.#options, null, 2);
        try {
            fs.writeFileSync(this.optionsFilePath(), optionsData);
            const stats = fs.statSync(this.optionsFilePath());
            this.#optionsfilelastmod=stats.mtime.getTime();
        } catch (error) {
            logger.error('AppOptions: Error writing options to file:', error);
        }
    }
}

export default appOptions;