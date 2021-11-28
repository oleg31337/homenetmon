#!/bin/bash
if [ "$EUID" -eq 0 ];then
  echo -e '\033[0;31mRunning as root is a bad idea in general. Please consider using a regular user account.\033[0m'
fi
scriptpath="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

nodepath=$(type -p node)
nmappath=$(type -p nmap)

if [ -z "$nodepath" ];then
  echo -e '\033[0;31mError! Node.js is not installed. Please install it prior running application.\033[0m'
  exit 1
fi
if [ -z "$nmappath" ];then
  echo -e '\033[0;31mError! Nmap is not installed. Please install it prior running application.\033[0m'
  exit 1
fi

nodecap=$(getcap /usr/bin/node) #get nmap capabilities
nmapcap=$(getcap /usr/bin/nmap) #get node capabilities

if [ "$nodecap" != "/usr/bin/node = cap_net_bind_service,cap_net_admin,cap_net_raw+eip" ];then
  echo -e '\033[0;31mError! Required permissions are not set for nodejs. Please run set_permissions.sh as root.\033[0m'
  exit 1
fi
if [ "$nmapcap" != "/usr/bin/nmap = cap_net_bind_service,cap_net_admin,cap_net_raw+eip" ];then
  echo -e '\033[0;31mError! Required permissions are not set for nmap. Please run set_permissions.sh as root.\033[0m'
  exit 1
fi


cd $scriptpath
$nodepath app.js

