### Dockerfile ###
FROM node:20-bookworm
USER root
WORKDIR /app
RUN apt-get update && apt-get install -y nmap avahi-utils redis iproute2 net-tools iputils-ping
RUN nmap --script-updatedb
COPY . /app
RUN mkdir /data
RUN npm install
ENV DATA_PATH /data
ENV DEBUG true
ENTRYPOINT ["/app/homenetmon-docker.sh"]