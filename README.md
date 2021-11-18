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
1. Install node.js (versions 12 or newer are supported)
2. Install nmap from your Linux package repository
3. Git clone the app from here https://github.com/oleg31337/homenetmon
4. Run "`npm install`" to install required node modules
5. Run as root the `set_permissions.sh` script to grant permissions to nmap and node to bind to network sockets
6. Add the `set_permissions.sh` script to your system startup as the setcap settings get reset after restart

## Configuration
Edit JSON configuration file app-options.json.
Options are:
 * HTTPport: Port that application will listen on. You will connect to this port with your web browser. 30450 by default.
 * APP_SESSION_FS_SECRET: This is the secret string for local session storage files, set it to something random.
 * APP_SESSION_SECRET: This is the another secret string for browser session cookies, set it to something random.
 * SUBNET: This is your subnet with network mask. 192.168.1.0/24 by default.
 * NMAP_CMD_SCAN: This is nmap command line to run for full network scan. Do not change unless you know what you are doing. Consult nmap documentation.
 * NMAP_CMD_SWEEP: This is nmap command line to run for quick network swipe. Do not change unless you know what you are doing. Consult nmap documentation.
 * NMAP_CRON: This is the CRON expression for scheduled full network scans. https://en.wikipedia.org/wiki/Cron
   by default it will run at 3:30 AM every day - "30 03 * * *"
 * DEBUG": This is to enable debugging of the backend application. You will get more logs in the command line.

**Note:** If you change the configuration file you have to restart the application.

## Running
1. To run the app in the command line:
`node app.js`
2. Wait until application will start the http service, then connect your web browser to the app:
http://your-host:30450/
where 30450 is the port set in the appOptions.json configuration file

Alternatively you can create a *systemd* startup script, but make sure to cd to the application folder first before running node executable.

Application stores the hosts and status information in the plain text files in JSON format.
Files are called: `globalhosts.json` and `globallastscan.json`.
If application is restarted, it will try to read those files into memory and if files are not found it will run the full network scan.
