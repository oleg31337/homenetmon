#!/bin/bash

# Function to stop Redis server
function stop_app {
    echo "Stopping application..."
    node_pid=$(pgrep node)
    redis_pid=$(pgrep redis-server)
    if [[ -n $redis_pid && -n $node_pid ]]; then
        kill $node_pid
        kill $redis_pid
    else
        exit 1
    fi
}

# Set trap to call stop_app function when SIGINT is received
trap stop_app SIGINT

cd /app

#update nmap database
/usr/bin/nmap --script-updatedb

#start Redis DB
/usr/bin/redis-server --bind 127.0.0.1 --loglevel warning --port 30451 --daemonize no --save 60 1 --dbfilename redis.rdb --dir $DATA_PATH &
redis_server_pid=$!

#start app
npm start &
homenetmon_pid=$!

# Stop Redis server before script exits
stop_redis

# Wait for Redis server process to exit
wait $homenetmon_pid
wait $redis_server_pid
echo "Application stopped."
exit 0