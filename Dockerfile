### Dockerfile ###
FROM node:20-bookworm-slim
LABEL version="2.0"
USER root
WORKDIR /app
RUN apt-get update && apt-get -y dist-upgrade && apt-get install -y avahi-utils redis iproute2 net-tools iputils-ping wget alien
COPY . /app
RUN wget https://nmap.org/dist/nping-0.7.94-1.x86_64.rpm
RUN wget https://nmap.org/dist/nmap-7.94-1.x86_64.rpm
RUN alien --to-deb nmap-7.94-1.x86_64.rpm
RUN alien --to-deb nping-0.7.94-1.x86_64.rpm
RUN dpkg -i *.deb
RUN rm -f *.rpm *.deb
RUN apt-get -y purge wget alien && apt-get -y autoremove && apt-get -y autoclean
RUN nmap --script-updatedb
RUN mkdir /data
RUN npm install
ENV DATA_PATH /data
#ENV DEBUG true #not needed for production
ENTRYPOINT ["/app/homenetmon-docker.sh"]