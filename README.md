# homenetmon
## Home network scanner and monitor dashboard
Full stack Node.js/JavaScript application that scans and shows your local network devices in a compact and simple way.

## Features
 * Automatic scheduled nmap scan
 * Define custom names for your hosts
 * Easy filter by host names.
 * On-demand re-scanning of induvidual hosts or entire subnet
 * On-demand pinging of hosts

## Installation
Currently only Linux operating systems are supported.
1. Install node.js version 14 or 16 (So far tested on versions 14 and 16) https://nodejs.org/en/download/package-manager/
2. Install nmap from your Linux package repository (e.g. `apt -y install nmap`)
3. Install nping from your Linux package repository (e.g. `apt -y install nping`)
4. Git clone the app from here https://github.com/oleg31337/homenetmon to a folder on local drive, for example /opt/homenetmon
   For example: `git clone https://github.com/oleg31337/homenetmon homenetmon`
5. Go into the application folder and run "`npm install`" to install required node modules
6. Run as root the `set_permissions.sh` script to grant permissions for nmap and node.js to allow binding to network sockets

### Install as a systemd service
1. Run script `sudo install_service.sh` and follow prompts. You can run the service as your user account, or script can create a service account.
2. Make sure that the service account owns the application folder, otherwise it won't start.

### Uninstall systemd service
1. Run script `sudo install_service.sh -u` to uninstall the service. This will stop the app and remove the systemd service.

## Configuration
Application configuration file app-options.json is created automatically on the first start of the application
**Note:** You need to stop the application before editing the configuration file.

Available options are:
 * HTTPport: Port that application will listen on. You will connect to this port with your web browser. 30450 is used by default.
 * APP_SESSION_FS_SECRET: This is the secret string for local session storage files, random string.
 * APP_SESSION_SECRET: This is the another secret string for browser session cookies, random string.
 * SUBNET: This is your subnet with network mask. e.g. 192.168.1.0/24. Application will try to guess your subnet on the first start.
 * NMAP_SPEED: This is the speed of nmap scanning. Valid options from 1 (slow) to 5 (fast). Fastest may skip some slow ports.
 * NMAP_PORTS: This is the number of ports that will be scanned. Top n ports from the popular ports list of nmap application https://nmap.org/book/nmap-services.html
   By default top 1000 ports from the list will be used.
 * NMAP_CMD_SCAN: This is nmap command line to run for full network scan. Do not change unless you know what you are doing. Consult nmap documentation.
 * NMAP_CMD_SWEEP: This is nmap command line to run for quick network swipe. Do not change unless you know what you are doing. Consult nmap documentation.
 * NPING_CMD: This is nping command line to perform ARP ping. Do not change unless you know what you are doing. Consult nping documentation.
 * NMAP_CRON: This is the CRON expression for scheduled full network scans. https://en.wikipedia.org/wiki/Cron
   by default it will run at 3:30 AM every day - "30 03 * * *"
 * NMAP_CRON_ENABLE: This is the true/false parameter whether to schedule regular full network scans
 * REDIS_URL: URL to access Redis database. Now it is a hard requirement for the application.
 * KEEP_STATS_HISTORY: Keep n days of scan stats history
 * FIRST_RUN: First run indicator, will show settings menu in browser on the first start. For internal app use. Leave at 0.

**Note:** Subnet address, Nmap parameters and Cron expression can be set from the application web page.
**Note:** For the CRON expression, months are counted from 0 to 11 (weird bug in cron for node.js).

## Running the application in the command prompt
1. To run the app in the command prompt:
`npm start`
2. Wait until application will start the http service, then open your browser and navigate to: http://your-host:30450/
where 30450 is the port set in the appOptions.json configuration file

### Running in debugging mode:
1. Run application in the command prompt:
`npm run debug`

## Application data
Application stores the hosts and status information in the Redis database. Make sure to use redis regular dumps so you won't loose data on restart.

## Application logs
By default all logs are printed to stdout. When app is running as a systemd service, the log is recorded by systemd journal.