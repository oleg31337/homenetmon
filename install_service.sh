#!/bin/bash
if [ "$EUID" -ne 0 ]
  then echo "Please run this script with sudo or as root user. E.g: sudo $0"
  exit
fi
SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
cd $SCRIPTPATH

function install-svc(){
  cp -f ./homenetmon.service.template ./homenetmon.service
  echo -n -e 'Please specify service account name\nPress enter to use default: [homenetmon]:>'
  read serviceaccount
  if [ -z "$serviceaccount" ];then
    serviceaccount=homenetmon
  fi
  echo -n -e 'Please specify service account group name\nPress enter to use default: [homenetmon]:>'
  read servicegroup
  if [ -z "$servicegroup" ];then
    servicegroup=homenetmon
  fi
  groupadd $servicegroup >/dev/null 2>&1
  if [ "$?" -ne 0 ];then
    echo Service account group $servicegroup already exists
  else
    echo Creating group: $servicegroup
  fi
  useradd -M -N -g $servicegroup -d $SCRIPTPATH $serviceaccount >/dev/null 2>&1
  if [ "$?" -ne 0 ];then
    echo Service account $serviceaccount already exists
  else
    echo Creating service account: $serviceaccount
  fi
  regex='s/{{HOMENETMONPATH}}/'$(echo $SCRIPTPATH | sed -r 's/\//\\\//g')'/g' #using sed to replace / with \/ in path for regex
  sed -i $regex homenetmon.service
  sed -i "s/{{SERVICEACCOUNT}}/$serviceaccount/g" homenetmon.service
  sed -i "s/{{SERVICEGROUP}}/$servicegroup/g" homenetmon.service
  ln -s $SCRIPTPATH/homenetmon.service /lib/systemd/system/homenetmon.service
  systemctl daemon-reload
  systemctl enable homenetmon.service
  echo -e 'Service is installed.\nStart the service using this commmand: sudo systemctl start homenetmon'
  echo
  folderowner=$(stat -c '%U' .)
  if [ "$folderowner" != "$serviceaccount" ];then
    echo -e '\033[1;31m--------------------Attention!!!--------------------\033[0m'
    echo Service user account $serviceaccount is not owning the application folder $SCRIPTPATH
    echo Application may not be able to run properly.
    echo You can run chown command to fix this issue. 
    echo E.g: sudo chown -R $serviceaccount:$servicegroup $SCRIPTPATH
    echo
  fi
}
function uninstall-svc(){
  systemctl stop homenetmon.service
  systemctl disable homenetmon.service
  rm -f /lib/systemd/system/homenetmon.service
  rm -f ./homenetmon.service
  systemctl daemon-reload
}

if [ "$1" = "-u" -o "$1" = "-U" -o "$1" = "--uninstall" -o "$1" = "-uninstall" -o "$1" = "uninstall" ];then
  echo Uninstalling service
  uninstall-svc
  exit 0
fi

if [ -e "/lib/systemd/system/homenetmon.service" ];then
  echo Service already exists, re-installing
  uninstall-svc
fi
echo
echo Installing homenetmon service
install-svc
