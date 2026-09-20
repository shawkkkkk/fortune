#!/usr/bin/env bash
set -euo pipefail

: "${PRIVATE_KEY:?PRIVATE_KEY is required}"
: "${BSC_TESTNET_RPC_URL:?BSC_TESTNET_RPC_URL is required}"
: "${PANCAKE_V3_FACTORY:?PANCAKE_V3_FACTORY is required}"
: "${PANCAKE_V3_POSITION_MANAGER:?PANCAKE_V3_POSITION_MANAGER is required}"
: "${PANCAKE_V2_ROUTER:?PANCAKE_V2_ROUTER is required}"
: "${PANCAKE_V2_FACTORY:?PANCAKE_V2_FACTORY is required}"

RPC="$BSC_TESTNET_RPC_URL"
DEPLOYER="$(cast wallet address --private-key "$PRIVATE_KEY")"
GAS_PRICE=1000000000

log() {
  printf '\n==> %s\n' "$*"
}

extract_deployed() {
  sed -nE 's/.*Deployed to:[[:space:]]*(0x[a-fA-F0-9]{40}).*/\1/p' | tail -1
}

deploy() {
  local label="$1"
  local contract="$2"
  shift 2

  log "Deploying $label"

  local output
  if [ "$#" -gt 0 ]; then
    output="$(
      forge create "$contract" \
        --rpc-url "$RPC" \
        --private-key "$PRIVATE_KEY" \
        --broadcast \
        --legacy \
        --gas-price "$GAS_PRICE" \
        --gas-limit 20000000 \
        --constructor-args "$@" 2>&1
    )"
  else
    output="$(
      forge create "$contract" \
        --rpc-url "$RPC" \
        --private-key "$PRIVATE_KEY" \
        --broadcast \
        --legacy \
        --gas-price "$GAS_PRICE" \
        --gas-limit 20000000 2>&1
    )"
  fi

  printf '%s\n' "$output" >&2

  local address
  address="$(printf '%s\n' "$output" | extract_deployed)"

  if [ -z "$address" ]; then
    echo "Could not parse deployed address for $label" >&2
    exit 1
  fi

  local code
  code="$(cast code "$address" --rpc-url "$RPC")"
  if [ "$code" = "0x" ]; then
    echo "$label deployed without runtime bytecode: $address" >&2
    exit 1
  fi

  printf '%s\n' "$address"
}

send_tx() {
  local label="$1"
  local to="$2"
  local sig="$3"
  shift 3

  log "$label"

  cast send "$to" "$sig" "$@" \
    --rpc-url "$RPC" \
    --private-key "$PRIVATE_KEY" \
    --legacy \
    --gas-price "$GAS_PRICE" \
    --gas-limit 5000000 >/tmp/fortune-last-send.json

  cat /tmp/fortune-last-send.json
}

log "Direct BSC Testnet deployment"
echo "Deployer: $DEPLOYER"

ORACLE="$(
  deploy "MockUsdOracle"     "src/test/MockUsdOracle.sol:MockUsdOracle"     "$DEPLOYER"
)"

MOCK_QUOTE="$(
  deploy "MockQuoteToken"     "src/test/MockQuoteToken.sol:MockQuoteToken"     "Fortune Public Test USD"     "fUSD"     "18"
)"

REGISTRY="$(
  deploy "FortuneAssetRegistry"     "src/FortuneAssetRegistry.sol:FortuneAssetRegistry"     "$DEPLOYER"
)"

AUTOMATION_REGISTRY="$(
  deploy "FortuneAutomationRegistry"     "src/FortuneAutomationRegistry.sol:FortuneAutomationRegistry"     "$DEPLOYER"
)"

METADATA_REGISTRY="$(
  deploy "FortuneMetadataRegistry"     "src/FortuneMetadataRegistry.sol:FortuneMetadataRegistry"     "$DEPLOYER"
)"

POOL_REGISTRY="$(
  deploy "FortunePoolRegistry"     "src/FortunePoolRegistry.sol:FortunePoolRegistry"     "$DEPLOYER"
)"

TOKEN_DEPLOYER="$(
  deploy "FortuneTokenDeployer"     "src/deployers/FortuneTokenDeployer.sol:FortuneTokenDeployer"
)"

VAULT_DEPLOYER="$(
  deploy "FortuneVaultDeployer"     "src/deployers/FortuneVaultDeployer.sol:FortuneVaultDeployer"
)"

FEE_ROUTER_DEPLOYER="$(
  deploy "FortuneFeeRouterDeployer"     "src/deployers/FortuneFeeRouterDeployer.sol:FortuneFeeRouterDeployer"
)"

CURVE_DEPLOYER="$(
  deploy "FortuneCurveDeployer"     "src/deployers/FortuneCurveDeployer.sol:FortuneCurveDeployer"
)"

send_tx   "Configure fUSD registry asset"   "$REGISTRY"   "configureAsset(address,(address,uint32,bool,bool,bool,bool,string))"   "$MOCK_QUOTE"   "($ORACLE,4294967295,true,true,true,true,\"Fortune Public Testnet\")"

send_tx   "Set fUSD mock oracle price"   "$ORACLE"   "setPrice(address,uint256)"   "$MOCK_QUOTE"   "1000000000000000000"

send_tx   "Authorize Pancake V2 factory"   "$POOL_REGISTRY"   "configureFactory(address,uint8,bool)"   "$PANCAKE_V2_FACTORY"   "1"   "true"

send_tx   "Authorize Pancake V3 factory"   "$POOL_REGISTRY"   "configureFactory(address,uint8,bool)"   "$PANCAKE_V3_FACTORY"   "2"   "true"

FACTORY="$(
  deploy "FortuneFactory"     "src/FortuneFactory.sol:FortuneFactory"     "$DEPLOYER"     "$REGISTRY"     "$AUTOMATION_REGISTRY"     "$METADATA_REGISTRY"     "$TOKEN_DEPLOYER"     "$VAULT_DEPLOYER"     "$FEE_ROUTER_DEPLOYER"     "$CURVE_DEPLOYER"     "$DEPLOYER"     "$DEPLOYER"
)"

send_tx   "Bind metadata registry to standard factory"   "$METADATA_REGISTRY"   "bindFactory(address)"   "$FACTORY"

V3_LOCKER="$(
  deploy "FortunePermanentLiquidityLocker"     "src/FortunePermanentLiquidityLocker.sol:FortunePermanentLiquidityLocker"     "$FACTORY"     "$PANCAKE_V3_POSITION_MANAGER"
)"

V3_ADAPTER="$(
  deploy "FortunePancakeV3GraduationAdapter"     "src/FortunePancakeV3GraduationAdapter.sol:FortunePancakeV3GraduationAdapter"     "$FACTORY"     "$REGISTRY"     "$PANCAKE_V3_FACTORY"     "$PANCAKE_V3_POSITION_MANAGER"     "$V3_LOCKER"
)"

send_tx   "Approve V3 graduation adapter as permanent-lock depositor"   "$FACTORY"   "setLiquidityLockerDepositor(address,address,bool)"   "$V3_LOCKER"   "$V3_ADAPTER"   "true"

send_tx   "Install V3 graduation adapter"   "$FACTORY"   "setGraduationAdapter(address)"   "$V3_ADAPTER"

TAX_FACTORY="$(
  deploy "FortuneTaxFactory"     "src/FortuneTaxFactory.sol:FortuneTaxFactory"     "$DEPLOYER"     "$REGISTRY"     "$AUTOMATION_REGISTRY"     "$POOL_REGISTRY"     "$TOKEN_DEPLOYER"     "$VAULT_DEPLOYER"     "$FEE_ROUTER_DEPLOYER"     "$CURVE_DEPLOYER"     "$DEPLOYER"     "$DEPLOYER"
)"

V2_LOCKER="$(
  deploy "FortunePermanentV2LiquidityLocker"     "src/FortunePermanentV2LiquidityLocker.sol:FortunePermanentV2LiquidityLocker"     "$TAX_FACTORY"
)"

V2_ADAPTER="$(
  deploy "FortunePancakeV2TaxGraduationAdapter"     "src/FortunePancakeV2TaxGraduationAdapter.sol:FortunePancakeV2TaxGraduationAdapter"     "$TAX_FACTORY"     "$PANCAKE_V2_FACTORY"     "$PANCAKE_V2_ROUTER"     "$V2_LOCKER"     "$POOL_REGISTRY"
)"

send_tx   "Approve V2 tax graduation adapter as permanent-lock depositor"   "$TAX_FACTORY"   "setLiquidityLockerDepositor(address,address,bool)"   "$V2_LOCKER"   "$V2_ADAPTER"   "true"

send_tx   "Install V2 tax graduation adapter"   "$TAX_FACTORY"   "setGraduationAdapter(address)"   "$V2_ADAPTER"

send_tx   "Open tax-token public launches"   "$TAX_FACTORY"   "setLaunchesPaused(bool)"   "false"

cat > /tmp/fortune-public-alpha-addresses.env <<EOF
FORTUNE_FACTORY=$FACTORY
FORTUNE_TAX_FACTORY=$TAX_FACTORY
FORTUNE_REGISTRY=$REGISTRY
FORTUNE_AUTOMATION_REGISTRY=$AUTOMATION_REGISTRY
FORTUNE_METADATA_REGISTRY=$METADATA_REGISTRY
FORTUNE_POOL_REGISTRY=$POOL_REGISTRY
FORTUNE_TOKEN_DEPLOYER=$TOKEN_DEPLOYER
FORTUNE_VAULT_DEPLOYER=$VAULT_DEPLOYER
FORTUNE_FEE_ROUTER_DEPLOYER=$FEE_ROUTER_DEPLOYER
FORTUNE_CURVE_DEPLOYER=$CURVE_DEPLOYER
FORTUNE_V3_ADAPTER=$V3_ADAPTER
FORTUNE_V3_LOCKER=$V3_LOCKER
FORTUNE_V2_TAX_ADAPTER=$V2_ADAPTER
FORTUNE_V2_LOCKER=$V2_LOCKER
FORTUNE_MOCK_QUOTE=$MOCK_QUOTE
FORTUNE_MOCK_ORACLE=$ORACLE
EOF

cat /tmp/fortune-public-alpha-addresses.env

if [ -n "${GITHUB_ENV:-}" ]; then
  cat /tmp/fortune-public-alpha-addresses.env >> "$GITHUB_ENV"
fi

log "Direct public alpha stack deployment complete"
