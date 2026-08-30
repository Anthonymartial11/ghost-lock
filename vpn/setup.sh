#!/bin/bash
# Ghost Tunnel — build your own VPN. Run this ON YOUR MAC.
#
#   ./setup.sh <server-ip> [ssh-user] [wg-port]
#
# Device private keys are generated here and never leave this machine.
# Only public keys are sent to the server.
set -euo pipefail
cd "$(dirname "$0")"
source ./lib.sh

SERVER="${1:-}"; SSH_USER="${2:-root}"; WG_PORT="${3:-51820}"
[ -n "$SERVER" ] || die "Usage: ./setup.sh <server-ip> [ssh-user] [wg-port]"

OUT="$HOME/GhostTunnel"; mkdir -p "$OUT"; chmod 700 "$OUT"

say "1. Generating keys on THIS machine"
declare -A PRIV PUB PSK IP
i=2
for dev in mac iphone; do
  PRIV[$dev]=$(gen_private)
  PUB[$dev]=$(pub_from_private "${PRIV[$dev]}")
  PSK[$dev]=$(gen_psk)
  IP[$dev]="10.66.66.$i"; i=$((i+1))
  ok "$dev — private key stays here, public key goes to the server"
done

say "2. Sending ONLY public keys to the server"
PEERS=$(mktemp)
for dev in mac iphone; do
  echo "${dev}|${PUB[$dev]}|${PSK[$dev]}|${IP[$dev]}" >> "$PEERS"
done
scp -q "$PEERS" "$SSH_USER@$SERVER:/root/peers.txt" || die "Could not copy to the server. Check SSH access."
scp -q ./server-harden.sh "$SSH_USER@$SERVER:/root/server-harden.sh" || die "Could not copy the setup script."
shred -u "$PEERS" 2>/dev/null || rm -f "$PEERS"
ok "sent (public keys only)"

say "3. Building and hardening the server"
RESULT=$(ssh "$SSH_USER@$SERVER" "WG_PORT=$WG_PORT bash /root/server-harden.sh" 2>&1) || { echo "$RESULT"; die "Server setup failed."; }
echo "$RESULT" | grep -vE '^(SERVER_PUBLIC_KEY|done)' | sed 's/^/   /'
SERVER_PUB=$(echo "$RESULT" | awk -F= '/^SERVER_PUBLIC_KEY=/{print $2}')
[ -n "$SERVER_PUB" ] || die "Did not get the server's public key back."
ok "server ready"

say "4. Writing your device profiles"
for dev in mac iphone; do
  cat > "$OUT/ghost-$dev.conf" <<EOF
[Interface]
PrivateKey = ${PRIV[$dev]}
Address = ${IP[$dev]}/24
DNS = 10.66.66.1

[Peer]
PublicKey = ${SERVER_PUB}
PresharedKey = ${PSK[$dev]}
Endpoint = ${SERVER}:${WG_PORT}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EOF
  chmod 600 "$OUT/ghost-$dev.conf"
  ok "$OUT/ghost-$dev.conf"
done

if command -v qrencode >/dev/null 2>&1; then
  say "iPhone QR code (scan in the WireGuard app):"
  qrencode -t ansiutf8 < "$OUT/ghost-iphone.conf"
fi

say "Done. Next:"
cat <<EOF
  Mac     — install WireGuard from the Mac App Store, then
            Import Tunnel(s) from File… and pick:
            $OUT/ghost-mac.conf

  iPhone  — install WireGuard from the App Store, then AirDrop
            $OUT/ghost-iphone.conf
            to your iPhone and open it in WireGuard.

  Check it worked: visit  https://ipleak.net  — it must show your
  server's location, not your home city, and DNS must NOT show your ISP.

  Keep the files in $OUT private. They ARE the keys.
EOF
