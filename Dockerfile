### Dockerfile ###
FROM node:20-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y nmap avahi-utils redis
COPY . /app
RUN mkdir /data
RUN sudo echo 'bind 127.0.0.1 \
protected-mode yes \
port 6379 \
tcp-backlog 511 \
timeout 0 \
tcp-keepalive 300 \
daemonize yes \
supervised no \
pidfile /var/run/redis/redis-server.pid \
loglevel notice \
logfile /data/redis-server.log \
databases 1 \
always-show-logo no \
save 60 1 \
stop-writes-on-bgsave-error yes \
rdbcompression yes \
rdbchecksum yes \
dbfilename redis-db.rdb \
dir /data \
' >/etc/redis/redis.conf
RUN sudo /app/set_permissions.sh
RUN npm install
ENV DATA_PATH /data
CMD ["redis-server", "--daemonize", "yes"]
ENTRYPOINT ["npm", "run"]
