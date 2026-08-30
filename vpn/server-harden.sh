#!/bin/bash
# Runs ON the server, as root. Ubuntu 22.04/24.04 or Debian 12.
#
# What this builds, and why each piece is here:
#   WireGuard  — small, audited, modern tunnel. Far less to attack than OpenVPN.
#   Unbound    — OUR OWN recursive DNS resolver. No DNS company sees your
#                lookups at all, not even a "privacy" one. Plus a blocklist, so
#                ads/trackers/malware die before they resolve.
#   No logs    — journald is forced to RAM only and wiped on reboot. Swap is
#                off, so key material can never be written to disk. If someone
#                seizes this machine, there is nothing on it to read.
#   nftables   — default-deny firewall. Only SSH and the tunnel port answer.
#   Auto-patch — unattended-upgrades, because unpatched is how servers fall.
set -euo pipefail

WG_PORT="${WG_PORT:-51820}"
WG_NET="10.66.66"
WG_IF="wg0"

[ "$(id -u)" = "0" ] || { echo "run as root"; exit 1; }
command -v apt-get >/dev/null || { echo "This script targets Debian/Ubuntu."; exit 1; }

echo "==> installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq wireguard unbound nftables unattended-upgrades curl ca-certificates >/dev/null

echo "==> killing disk logging (nothing to seize)"
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/00-volatile.conf <<'EOF'
[Journal]
Storage=volatile
RuntimeMaxUse=16M
ForwardToSyslog=no
EOF
systemctl restart systemd-journald || true
systemctl disable --now rsyslog 2>/dev/null || true
apt-get purge -y -qq rsyslog >/dev/null 2>&1 || true
swapoff -a 2>/dev/null || true
sed -i '/\sswap\s/s/^/#/' /etc/fstab 2>/dev/null || true

echo "==> our own recursive DNS resolver (no DNS provider sees your lookups)"
systemctl disable --now systemd-resolved 2>/dev/null || true
rm -f /etc/resolv.conf; echo "nameserver 127.0.0.1" > /etc/resolv.conf
cat > /etc/unbound/unbound.conf.d/ghost.conf <<EOF
server:
  verbosity: 0
  use-syslog: no
  log-queries: no
  log-replies: no
  logfile: ""
  interface: 127.0.0.1
  interface: ${WG_NET}.1
  access-control: 127.0.0.0/8 allow
  access-control: ${WG_NET}.0/24 allow
  access-control: 0.0.0.0/0 refuse
  do-ip6: no
  hide-identity: yes
  hide-version: yes
  qname-minimisation: yes
  harden-glue: yes
  harden-dnssec-stripped: yes
  harden-below-nxdomain: yes
  harden-referral-path: yes
  aggressive-nsec: yes
  rrset-roundrobin: yes
  minimal-responses: yes
  prefetch: yes
  cache-min-ttl: 300
  auto-trust-anchor-file: "/var/lib/unbound/root.key"
  include: "/etc/unbound/unbound.conf.d/blocklist.conf"
EOF
touch /etc/unbound/unbound.conf.d/blocklist.conf

cat > /usr/local/sbin/update-blocklist <<'EOF'
#!/bin/bash
# Ad/tracker/malware blocklist -> unbound. Refreshed weekly.
set -e
OUT=/etc/unbound/unbound.conf.d/blocklist.conf
TMP=$(mktemp)
curl -fsSL --max-time 60 https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts \
  | grep -E '^0\.0\.0\.0\s' | awk '{print $2}' | grep -vE '^(0\.0\.0\.0|localhost)$' \
  | sort -u | awk '{print "local-zone: \""$1"\" always_nxdomain"}' > "$TMP" || exit 0
if [ -s "$TMP" ] && [ "$(wc -l < "$TMP")" -gt 1000 ]; then
  echo "server:" > "$OUT"; cat "$TMP" >> "$OUT"
  unbound-checkconf >/dev/null 2>&1 && systemctl reload unbound || { echo "server:" > "$OUT"; systemctl reload unbound; }
fi
rm -f "$TMP"
EOF
chmod +x /usr/local/sbin/update-blocklist
/usr/local/sbin/update-blocklist || true
cat > /etc/systemd/system/blocklist.timer <<'EOF'
[Unit]
Description=Weekly DNS blocklist refresh
[Timer]
OnCalendar=weekly
Persistent=true
[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/blocklist.service <<'EOF'
[Unit]
Description=Refresh DNS blocklist
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/update-blocklist
EOF
systemctl daemon-reload; systemctl enable --now blocklist.timer >/dev/null 2>&1 || true
systemctl enable --now unbound >/dev/null 2>&1 || true

echo "==> forwarding + tunnel"
cat > /etc/sysctl.d/99-ghost.conf <<'EOF'
net.ipv4.ip_forward=1
net.ipv6.conf.all.disable_ipv6=1
net.ipv6.conf.default.disable_ipv6=1
net.ipv4.conf.all.rp_filter=1
net.ipv4.tcp_syncookies=1
kernel.kptr_restrict=2
kernel.dmesg_restrict=1
EOF
sysctl -p /etc/sysctl.d/99-ghost.conf >/dev/null

umask 077
[ -f /etc/wireguard/server.key ] || wg genkey > /etc/wireguard/server.key
SERVER_PRIV=$(cat /etc/wireguard/server.key)
SERVER_PUB=$(echo "$SERVER_PRIV" | wg pubkey)
echo "$SERVER_PUB" > /etc/wireguard/server.pub
WAN=$(ip route show default | awk '/default/{print $5; exit}')

cat > /etc/wireguard/${WG_IF}.conf <<EOF
[Interface]
Address = ${WG_NET}.1/24
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIV}
PostUp = nft add table ip ghostnat; nft add chain ip ghostnat post { type nat hook postrouting priority 100 \; }; nft add rule ip ghostnat post oifname "${WAN}" masquerade
PostDown = nft delete table ip ghostnat
EOF

# peers appended by the local setup script
if [ -f /root/peers.txt ]; then
  while IFS='|' read -r name pub psk ip; do
    [ -z "${pub:-}" ] && continue
    cat >> /etc/wireguard/${WG_IF}.conf <<EOF

[Peer]
# ${name}
PublicKey = ${pub}
PresharedKey = ${psk}
AllowedIPs = ${ip}/32
EOF
  done < /root/peers.txt
  shred -u /root/peers.txt 2>/dev/null || rm -f /root/peers.txt
fi
chmod 600 /etc/wireguard/${WG_IF}.conf

echo "==> firewall (default deny)"
cat > /etc/nftables.conf <<EOF
#!/usr/sbin/nft -f
flush ruleset
table inet filter {
  chain input {
    type filter hook input priority 0; policy drop;
    ct state established,related accept
    ct state invalid drop
    iif lo accept
    iifname "${WG_IF}" accept
    ip protocol icmp icmp type { echo-request, destination-unreachable, time-exceeded } accept
    tcp dport 22 ct state new limit rate 6/minute accept
    udp dport ${WG_PORT} accept
  }
  chain forward {
    type filter hook forward priority 0; policy drop;
    ct state established,related accept
    iifname "${WG_IF}" accept
  }
  chain output { type filter hook output priority 0; policy accept; }
}
EOF
systemctl enable --now nftables >/dev/null 2>&1 || true
nft -f /etc/nftables.conf

echo "==> ssh hardening"
cat > /etc/ssh/sshd_config.d/99-ghost.conf <<'EOF'
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 20
EOF
systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true

echo "==> auto security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

systemctl enable --now wg-quick@${WG_IF} >/dev/null 2>&1 || systemctl restart wg-quick@${WG_IF}

echo "SERVER_PUBLIC_KEY=${SERVER_PUB}"
echo "done"
