#!/bin/bash

# Function to stop Redis server and Node application
function stop_app {
    echo "Stopping application..."
    node_pid=$(pgrep node)
    redis_pid=$(pgrep redis-server)
    if [[ -n $node_pid ]]; then
        kill $node_pid
    fi
    if [[ -n $redis_pid ]]; then
        kill $redis_pid
    fi
}

# Set trap to call stop_app function when SIGINT is received
trap stop_app SIGINT

cd /app

#update nmap database (services definitions and scripts)
/usr/bin/nmap --script-updatedb

#start Redis DB
/usr/bin/redis-server --bind 127.0.0.1 --loglevel warning --port 30451 --daemonize no --save 60 1 --dbfilename redis.rdb --dir $DATA_PATH &
redis_server_pid=$!

#start Node app
npm start &
homenetmon_pid=$!

# Stop the app before script exits
stop_app

# Wait for Node process to exit
wait $homenetmon_pid

#try again to stop anything that left
stop_app

# Wait for Redis process to exit
wait $redis_server_pid

echo "Application stopped."
exit 0