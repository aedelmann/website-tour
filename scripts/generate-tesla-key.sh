#!/usr/bin/env bash
# Generate an EC secp256r1 (prime256v1) keypair for Tesla Fleet API app registration.
# Writes ONLY the public key into the Hugo-mounted well-known path.
# Never commit the private key — put it in Netlify env TESLA_PRIVATE_KEY.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/well-known/appspecific"
PUB_OUT="$OUT_DIR/com.tesla.3p.public-key.pem"
TMP_DIR="$(mktemp -d)"
PRIV_TMP="$TMP_DIR/private-key.pem"
PUB_TMP="$TMP_DIR/public-key.pem"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

mkdir -p "$OUT_DIR"

openssl ecparam -name prime256v1 -genkey -noout -out "$PRIV_TMP"
openssl ec -in "$PRIV_TMP" -pubout -out "$PUB_TMP" 2>/dev/null
cp "$PUB_TMP" "$PUB_OUT"

echo "Public key written to:"
echo "  $PUB_OUT"
echo
echo "Hugo mounts well-known/ → static/.well-known/ so Tesla can fetch:"
echo "  https://silentwanderers.com/.well-known/appspecific/com.tesla.3p.public-key.pem"
echo
echo "PRIVATE KEY (do not commit). Add to Netlify env as TESLA_PRIVATE_KEY:"
echo "------------------------------------------------------------"
cat "$PRIV_TMP"
echo "------------------------------------------------------------"
echo
echo "Verify after deploy (must be HTTP 200, no redirect):"
echo "  curl -sI https://silentwanderers.com/.well-known/appspecific/com.tesla.3p.public-key.pem"
echo "  curl -s  https://silentwanderers.com/.well-known/appspecific/com.tesla.3p.public-key.pem"
