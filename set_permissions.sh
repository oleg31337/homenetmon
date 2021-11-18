#!/bin/bash
#run this as root
if [ "$EUID" -ne 0 ]
  then echo "Please run this script as root"
  exit
fi
/sbin/setcap cap_net_raw,cap_net_admin,cap_net_bind_service+eip /usr/bin/nmap
/sbin/setcap cap_net_raw,cap_net_admin,cap_net_bind_service+eip /usr/bin/node
