#!/bin/bash
if [ "$EUID" -eq 0 ];then
  echo -e '\033[0;31mWarning! Running as root is a bad idea in general. Please consider using a regular user account.\033[0m'
fi
scriptpath="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

nodepath=$(type -p node)
npmpath=$(type -p npm)
nmappath=$(type -p nmap)
npingpath=$(type -p nping)

if [ -z "$nodepath" ];then
  echo -e '\033[0;31mError! Node.js is not installed. Please install it prior running application.\033[0m'
  exit 1
fi
if [ -z "$npmpath" ];then
  echo -e '\033[0;31mError! Npm is not installed. Please install it prior running application.\033[0m'
  exit 1
fi
if [ -z "$nmappath" ];then
  echo -e '\033[0;31mError! Nmap is not installed. Please install it prior running application.\033[0m'
  exit 1
fi
if [ -z "$npingpath" ];then
  echo -e '\033[0;31mError! Nping is not installed. Please install it prior running application.\033[0m'
  exit 1
fi

nodecap=$(getcap $nodepath) #get nmap capabilities
nmapcap=$(getcap $nmappath) #get node capabilities
npingcap=$(getcap $npingpath) #get node capabilities

if [ "$nodecap" != "/usr/bin/node = cap_net_bind_service,cap_net_admin,cap_net_raw+eip" ];then
  echo -e '\033[0;31mError! Required permissions are not set for nodejs. Please run "sudo '$scriptpath'/set_permissions.sh"\033[0m'
  exit 1
fi
if [ "$nmapcap" != "/usr/bin/nmap = cap_net_bind_service,cap_net_admin,cap_net_raw+eip" ];then
  echo -e '\033[0;31mError! Required permissions are not set for nmap. Please run "sudo '$scriptpath'/set_permissions.sh"\033[0m'
  exit 1
fi
if [ "$npingcap" != "/usr/bin/nping = cap_net_bind_service,cap_net_admin,cap_net_raw+eip" ];then
  echo -e '\033[0;31mError! Required permissions are not set for nping. Please run "sudo '$scriptpath'/set_permissions.sh"\033[0m'
  exit 1
fi

if [ "$1" == "-d" -o "$1" == "--debug" -o "$2" == "-d" -o "$2" == "--debug" ];then
    export DEBUG=true
fi

if [ "$1" == "-s" -o "$1" == "--service" -o "$2" == "-s" -o "$2" == "--service" ];then
    export RUNASSERVICE=true
fi

cd $scriptpath
$npmpath ci
$nodepath app.js

