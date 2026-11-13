FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    asterisk \
    asterisk-modules \
    asterisk-doc \
    curl \
    gettext-base \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY extconfig.conf /etc/asterisk/extconfig.conf
COPY sorcery.conf /etc/asterisk/sorcery.conf
COPY res_pgsql.conf.template /etc/asterisk/res_pgsql.conf.template
COPY pjsip.conf /etc/asterisk/pjsip.conf
COPY http.conf /etc/asterisk/http.conf
COPY rtp.conf /etc/asterisk/rtp.conf
COPY modules.conf /etc/asterisk/modules.conf
COPY extensions.conf.template /etc/asterisk/extensions.conf.template
COPY entrypoint.sh /usr/local/bin/kalamapp-asterisk-entrypoint.sh

RUN chmod +x /usr/local/bin/kalamapp-asterisk-entrypoint.sh \
  && chown -R asterisk:asterisk /etc/asterisk /var/spool/asterisk /var/log/asterisk /var/lib/asterisk

EXPOSE 5060/udp 5060/tcp 8088/tcp 10000-10500/udp

ENTRYPOINT ["/usr/local/bin/kalamapp-asterisk-entrypoint.sh"]
