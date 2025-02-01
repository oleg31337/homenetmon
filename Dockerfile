FROM node:20-alpine
LABEL version="2.0"
USER root
WORKDIR /app

# Install dependencies using Alpine's package manager (apk)
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
        avahi-tools \
        iproute2 \
        net-tools \
        iputils \
        curl \
        nmap \
        nmap-ncat \
        nmap-nping \
        nmap-scripts \
        nmap-nselibs \
        bash && \
    nmap --script-updatedb && \
    mkdir /data
COPY . /app
RUN npm install
#RUN chmod +x /app/homenetmon-docker.sh

ENV DATA_PATH=/data
ENV DEBUG=true

ENTRYPOINT ["npm"]
CMD ["start"]
HEALTHCHECK --interval=1m --timeout=3s --retries=3 CMD curl -f http://localhost:30450/api/healthcheck || exit 1