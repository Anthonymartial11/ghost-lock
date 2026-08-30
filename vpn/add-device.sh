#!/bin/bash
# Add another device later:  ./add-device.sh <server-ip> <name> [ssh-user] [port]
set -euo pipefail
cd "$(dirname "$0")"; source ./lib.sh
SERVER="${1:-}"; NAME="${2:-}"; SSH_USER="${3:-root}"; WG_PORT="${4:-51820}"
[ -n "$SERVER" ] && [ -n "$NAME" ] || die "Usage: ./add-device.sh <server-ip> <name> [ssh-user] [port]"
OUT="$HOME/GhostTunnel"; mkdir -p "$OUT"; chmod 700 "$OUT"

USED=$(ssh "$SSH_USER@$SERVER" "grep -oE '10\.66\.66\.[0-9]+' /etc/wireguard/wg0.conf | sort -t. -k4 -n | tail -1" || echo "10.66.66.1")
NEXT=$(( ${USED##*.} + 1 )); [ "$NEXT" -lt 255 ] || die "No addresses left."
PRIV=$(gen_private); PUB=$(pub_from_private "$PRIV"); PSK=$(gen_psk); IP="10.66.66.$NEXT"

ssh "$SSH_USER@$SERVER" "cat >> /etc/wireguard/wg0.conf" <<EOF

[Peer]
# ${NAME}
PublicKey = ${PUB}
PresharedKey = ${PSK}
AllowedIPs = ${IP}/32
EOF
SERVER_PUB=$(ssh "$SSH_USER@$SERVER" "cat /etc/wireguard/server.pub")
ssh "$SSH_USER@$SERVER" "systemctl restart wg-quick@wg0"

cat > "$OUT/ghost-$NAME.conf" <<EOF
[Interface]
PrivateKey = ${PRIV}
Address = ${IP}/24
DNS = 10.66.66.1

[Peer]
PublicKey = ${SERVER_PUB}
PresharedKey = ${PSK}
Endpoint = ${SERVER}:${WG_PORT}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EOF
chmod 600 "$OUT/ghost-$NAME.conf"
ok "Created $OUT/ghost-$NAME.conf"
