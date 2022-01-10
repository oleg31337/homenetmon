#!/bin/bash
#run this as root
if [ "$EUID" -ne 0 ]
  then echo "Please run this script with sudo or as root user. E.g: sudo $0"
  exit
fi
nodepath=$(type -p node)
nmappath=$(type -p nmap)
npingpath=$(type -p nping)
error=0
if [ -z "$nodepath" ];then
  echo -e '\033[0;31mError! node.js is not installed. Please install it prior running application.\033[0m'
  error=1
fi
if [ -z "$nmappath" ];then
  echo -e '\033[0;31mError! nmap is not installed. Please install it prior running application.\033[0m'
  error=1
fi
if [ -z "$npingpath" ];then
  echo -e '\033[0;31mError! nping is not installed. Please install it prior running application.\033[0m'
  error=1
fi
if [ $error -eq 1 ];then
  exit 1
fi

/sbin/setcap cap_net_raw,cap_net_admin,cap_net_bind_service+eip $nmappath
/sbin/setcap cap_net_raw,cap_net_admin,cap_net_bind_service+eip $nodepath
/sbin/setcap cap_net_raw,cap_net_admin,cap_net_bind_service+eip $npingpath
