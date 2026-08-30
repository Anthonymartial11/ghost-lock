#!/bin/bash
# Shared helpers. Keys are generated HERE, on your machine, with openssl.
# A device's private key never travels anywhere — only its public key is sent
# to the server. That is the whole point of the design.

gen_private() {
  local pem; pem=$(mktemp)
  openssl genpkey -algorithm X25519 -out "$pem" 2>/dev/null
  openssl pkey -in "$pem" -outform DER 2>/dev/null | tail -c 32 | base64
  rm -f "$pem"
}
pub_from_private() {
  local priv="$1" pem; pem=$(mktemp)
  { printf '\x30\x2e\x02\x01\x00\x30\x05\x06\x03\x2b\x65\x6e\x04\x22\x04\x20'
    echo "$priv" | base64 -d; } > "$pem.der"
  openssl pkey -inform DER -in "$pem.der" -pubout -outform DER 2>/dev/null | tail -c 32 | base64
  rm -f "$pem" "$pem.der"
}
gen_psk() { openssl rand -base64 32; }

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }
die()  { printf '\n\033[1mSTOPPED:\033[0m %s\n\n' "$*" >&2; exit 1; }
