#!/usr/bin/env bash
set -euo pipefail

: "${PRIVATE_KEY:?PRIVATE_KEY is required}"
: "${BSC_TESTNET_RPC_URL:?BSC_TESTNET_RPC_URL is required}"
: "${FORTUNE_FACTORY:?FORTUNE_FACTORY is required}"
: "${FORTUNE_TAX_FACTORY:?FORTUNE_TAX_FACTORY is required}"
: "${FORTUNE_POOL_REGISTRY:?FORTUNE_POOL_REGISTRY is required}"
: "${FORTUNE_V3_ADAPTER:?FORTUNE_V3_ADAPTER is required}"
: "${FORTUNE_V3_LOCKER:?FORTUNE_V3_LOCKER is required}"
: "${FORTUNE_V2_TAX_ADAPTER:?FORTUNE_V2_TAX_ADAPTER is required}"
: "${FORTUNE_V2_LOCKER:?FORTUNE_V2_LOCKER is required}"
: "${FORTUNE_MOCK_QUOTE:?FORTUNE_MOCK_QUOTE is required}"
: "${PANCAKE_V2_ROUTER:?PANCAKE_V2_ROUTER is required}"
: "${PANCAKE_V3_POSITION_MANAGER:?PANCAKE_V3_POSITION_MANAGER is required}"

RPC="$BSC_TESTNET_RPC_URL"
GAS_PRICE=1000000000
DEPLOYER="$(cast wallet address --private-key "$PRIVATE_KEY")"

pending_nonce() {
  cast nonce "$DEPLOYER" --block pending --rpc-url "$RPC"
}

extract_deployed() {
  sed -nE 's/.*Deployed to:[[:space:]]*(0x[a-fA-F0-9]{40}).*/\1/p' | tail -1
}

deploy_harness() {
  local label="$1"
  local contract="$2"
  local gas_limit="$3"
  shift 3

  echo "==> Deploying $label"

  local output=""
  local address=""
  local attempt
  local nonce

  for attempt in 1 2 3 4 5; do
    nonce="$(pending_nonce)"
    echo "Using pending nonce $nonce (attempt $attempt)" >&2

    set +e
    output="$(
      forge create "$contract" \
        --rpc-url "$RPC" \
        --private-key "$PRIVATE_KEY" \
        --broadcast \
        --legacy \
        --gas-price "$GAS_PRICE" \
        --gas-limit "$gas_limit" \
        --nonce "$nonce" \
        --constructor-args "$@" 2>&1
    )"
    local exit_code=$?
    set -e

    printf '%s\n' "$output" >&2

    if [ "$exit_code" -eq 0 ]; then
      address="$(printf '%s\n' "$output" | extract_deployed)"
      if [ -n "$address" ]; then
        break
      fi
    fi

    if printf '%s\n' "$output" | grep -qiE 'nonce too low|already known|replacement transaction underpriced'; then
      sleep $((attempt * 2))
      continue
    fi

    echo "$label deployment failed" >&2
    exit "$exit_code"
  done

  test -n "$address" || {
    echo "Could not parse $label deployment address after nonce retries" >&2
    exit 1
  }

  local code=""
  for attempt in 1 2 3 4 5; do
    code="$(cast code "$address" --rpc-url "$RPC")"
    if [ "$code" != "0x" ]; then
      break
    fi
    sleep 2
  done

  test "$code" != "0x" || {
    echo "$label has no deployed runtime bytecode" >&2
    exit 1
  }

  local passed
  passed="$(cast call "$address" "passed()(bool)" --rpc-url "$RPC")"
  test "$passed" = "true" || {
    echo "$label did not report passed=true" >&2
    exit 1
  }

  printf '%s\n' "$address"
}

STANDARD_HARNESS="$(
  deploy_harness     "FortuneStandardLifecycleHarness"     "src/test/PublicLifecycleHarnesses.sol:FortuneStandardLifecycleHarness"     "16000000"     "$FORTUNE_FACTORY"     "$FORTUNE_MOCK_QUOTE"     "$FORTUNE_V3_LOCKER"     "$FORTUNE_V3_ADAPTER"     "$PANCAKE_V3_POSITION_MANAGER"
)"

STANDARD_TOKEN="$(
  cast call "$STANDARD_HARNESS" "launchToken()(address)" --rpc-url "$RPC"
)"
STANDARD_CURVE="$(
  cast call "$STANDARD_HARNESS" "curve()(address)" --rpc-url "$RPC"
)"
STANDARD_LP_TOKEN_ID="$(
  cast call "$STANDARD_HARNESS" "lpTokenId()(uint256)" --rpc-url "$RPC"
)"
STANDARD_ANCHOR="$(
  cast call "$STANDARD_HARNESS" "graduationAnchorUsd1e18()(uint256)" --rpc-url "$RPC"
)"

echo "STANDARD_ONCHAIN_EXECUTION_COMPLETE_AND_SUCCESSFUL"
echo "StandardHarness=$STANDARD_HARNESS"
echo "LaunchToken=$STANDARD_TOKEN"
echo "FortuneCurve=$STANDARD_CURVE"
echo "LPPositionTokenId=$STANDARD_LP_TOKEN_ID"
echo "GraduationAnchorUsd1e18=$STANDARD_ANCHOR"

TAX_HARNESS="$(
  deploy_harness     "FortuneTaxLifecycleHarness"     "src/test/PublicLifecycleHarnesses.sol:FortuneTaxLifecycleHarness"     "16000000"     "$FORTUNE_TAX_FACTORY"     "$FORTUNE_MOCK_QUOTE"     "$FORTUNE_POOL_REGISTRY"     "$FORTUNE_V2_LOCKER"     "$FORTUNE_V2_TAX_ADAPTER"     "$PANCAKE_V2_ROUTER"
)"

TAX_TOKEN="$(
  cast call "$TAX_HARNESS" "launchToken()(address)" --rpc-url "$RPC"
)"
TAX_CURVE="$(
  cast call "$TAX_HARNESS" "curve()(address)" --rpc-url "$RPC"
)"
TAX_POOL="$(
  cast call "$TAX_HARNESS" "officialPool()(address)" --rpc-url "$RPC"
)"
TAX_PROCESSOR="$(
  cast call "$TAX_HARNESS" "taxProcessor()(address)" --rpc-url "$RPC"
)"
TAX_DIVIDEND_VAULT="$(
  cast call "$TAX_HARNESS" "dividendVault()(address)" --rpc-url "$RPC"
)"
TAX_LOCKED_LP="$(
  cast call "$TAX_HARNESS" "lockedLpAmount()(uint256)" --rpc-url "$RPC"
)"
TAX_CURVE_TAX="$(
  cast call "$TAX_HARNESS" "curveTaxRecorded()(uint256)" --rpc-url "$RPC"
)"
TAX_DEX_PROCESSED="$(
  cast call "$TAX_HARNESS" "dexTaxTokensProcessed()(uint256)" --rpc-url "$RPC"
)"
TAX_BURNED="$(
  cast call "$TAX_HARNESS" "tokensBurned()(uint256)" --rpc-url "$RPC"
)"

echo "TAX_ONCHAIN_EXECUTION_COMPLETE_AND_SUCCESSFUL"
echo "TaxHarness=$TAX_HARNESS"
echo "LaunchToken=$TAX_TOKEN"
echo "FortuneCurve=$TAX_CURVE"
echo "TaxProcessor=$TAX_PROCESSOR"
echo "DividendVault=$TAX_DIVIDEND_VAULT"
echo "OfficialPancakeV2Pool=$TAX_POOL"
echo "LockedLpAmount=$TAX_LOCKED_LP"
echo "CurveTaxRecorded=$TAX_CURVE_TAX"
echo "DexTaxTokensProcessed=$TAX_DEX_PROCESSED"
echo "TokensBurned=$TAX_BURNED"

cat > /tmp/fortune-public-alpha-lifecycle.env <<EOF
STANDARD_HARNESS=$STANDARD_HARNESS
STANDARD_TOKEN=$STANDARD_TOKEN
STANDARD_CURVE=$STANDARD_CURVE
STANDARD_LP_TOKEN_ID=$STANDARD_LP_TOKEN_ID
STANDARD_ANCHOR=$STANDARD_ANCHOR
TAX_HARNESS=$TAX_HARNESS
TAX_TOKEN=$TAX_TOKEN
TAX_CURVE=$TAX_CURVE
TAX_POOL=$TAX_POOL
TAX_PROCESSOR=$TAX_PROCESSOR
TAX_DIVIDEND_VAULT=$TAX_DIVIDEND_VAULT
TAX_LOCKED_LP=$TAX_LOCKED_LP
TAX_CURVE_TAX=$TAX_CURVE_TAX
TAX_DEX_PROCESSED=$TAX_DEX_PROCESSED
TAX_BURNED=$TAX_BURNED
EOF

if [ -n "${GITHUB_ENV:-}" ]; then
  cat /tmp/fortune-public-alpha-lifecycle.env >> "$GITHUB_ENV"
fi
