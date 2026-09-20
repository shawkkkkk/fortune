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
: "${PANCAKE_V3_FACTORY:?PANCAKE_V3_FACTORY is required}"
: "${PANCAKE_V3_POSITION_MANAGER:?PANCAKE_V3_POSITION_MANAGER is required}"

RPC="$BSC_TESTNET_RPC_URL"
DEPLOYER="$(cast wallet address --private-key "$PRIVATE_KEY")"
GAS_PRICE=1000000000
MAX_GAS=16000000

pending_nonce() {
  cast nonce "$DEPLOYER" --block pending --rpc-url "$RPC"
}

extract_deployed() {
  sed -nE 's/.*Deployed to:[[:space:]]*(0x[a-fA-F0-9]{40}).*/\1/p' | tail -1
}

send_tx() {
  local label="$1"
  local to="$2"
  local sig="$3"
  local gas_limit="$4"
  shift 4

  echo "==> $label" >&2

  local attempt
  local nonce
  local output
  local exit_code

  for attempt in 1 2 3 4 5; do
    nonce="$(pending_nonce)"
    echo "Using pending nonce $nonce (attempt $attempt)" >&2

    set +e
    output="$(
      cast send "$to" "$sig" "$@" \
        --rpc-url "$RPC" \
        --private-key "$PRIVATE_KEY" \
        --legacy \
        --gas-price "$GAS_PRICE" \
        --gas-limit "$gas_limit" \
        --nonce "$nonce" 2>&1
    )"
    exit_code=$?
    set -e

    printf '%s\n' "$output"

    if [ "$exit_code" -eq 0 ]; then
      if printf '%s\n' "$output" | grep -qE 'status[[:space:]]+0([[:space:]]|$)'; then
        echo "$label reverted onchain" >&2
        exit 1
      fi
      return 0
    fi

    if printf '%s\n' "$output" | grep -qiE 'nonce too low|already known|replacement transaction underpriced'; then
      sleep $((attempt * 2))
      continue
    fi

    echo "$label failed" >&2
    exit "$exit_code"
  done

  echo "$label failed after nonce retries" >&2
  exit 1
}

echo "==> Deploying bounded lifecycle operator" >&2
OPERATOR_OUTPUT=""
for attempt in 1 2 3 4 5; do
  NONCE="$(pending_nonce)"
  echo "Using pending nonce $NONCE (attempt $attempt)" >&2

  set +e
  OPERATOR_OUTPUT="$(
    forge create \
      "src/test/PublicLifecycleOperator.sol:FortunePublicLifecycleOperator" \
      --rpc-url "$RPC" \
      --private-key "$PRIVATE_KEY" \
      --broadcast \
      --legacy \
      --gas-price "$GAS_PRICE" \
      --gas-limit "$MAX_GAS" \
      --nonce "$NONCE" \
      --constructor-args \
        "$FORTUNE_FACTORY" \
        "$FORTUNE_TAX_FACTORY" \
        "$FORTUNE_MOCK_QUOTE" \
        "$FORTUNE_POOL_REGISTRY" \
        "$FORTUNE_V3_LOCKER" \
        "$FORTUNE_V3_ADAPTER" \
        "$FORTUNE_V2_LOCKER" \
        "$FORTUNE_V2_TAX_ADAPTER" \
        "$PANCAKE_V3_POSITION_MANAGER" \
        "$PANCAKE_V2_ROUTER" 2>&1
  )"
  EXIT_CODE=$?
  set -e

  printf '%s\n' "$OPERATOR_OUTPUT" >&2

  if [ "$EXIT_CODE" -eq 0 ]; then
    OPERATOR="$(printf '%s\n' "$OPERATOR_OUTPUT" | extract_deployed)"
    if [ -n "$OPERATOR" ]; then
      break
    fi
  fi

  if printf '%s\n' "$OPERATOR_OUTPUT" | grep -qiE 'nonce too low|already known|replacement transaction underpriced'; then
    sleep $((attempt * 2))
    continue
  fi

  echo "Lifecycle operator deployment failed" >&2
  exit "$EXIT_CODE"
done

test -n "${OPERATOR:-}" || {
  echo "Could not parse lifecycle operator address" >&2
  exit 1
}

CODE="$(cast code "$OPERATOR" --rpc-url "$RPC")"
test "$CODE" != "0x" || {
  echo "Lifecycle operator has no runtime code" >&2
  exit 1
}

send_tx \
  "Standard launch + atomic creator first buy" \
  "$OPERATOR" \
  "runStandardLaunch()(address,address)" \
  "$MAX_GAS"

STANDARD_TOKEN="$(cast call "$OPERATOR" "standardToken()(address)" --rpc-url "$RPC")"
STANDARD_CURVE="$(cast call "$OPERATOR" "standardCurve()(address)" --rpc-url "$RPC")"
STANDARD_READY="$(cast call "$OPERATOR" "standardLaunchPassed()(bool)" --rpc-url "$RPC")"
test "$STANDARD_READY" = "true" || {
  echo "Standard launch proof flag is false" >&2
  exit 1
}

send_tx \
  "Standard Pancake V3 graduation + permanent LP lock" \
  "$OPERATOR" \
  "runStandardGraduation()(uint256)" \
  "$MAX_GAS"

STANDARD_GRAD="$(cast call "$OPERATOR" "standardGraduationPassed()(bool)" --rpc-url "$RPC")"
STANDARD_LP_TOKEN_ID="$(cast call "$OPERATOR" "standardLpTokenId()(uint256)" --rpc-url "$RPC")"
STANDARD_ANCHOR="$(cast call "$OPERATOR" "standardAnchor()(uint256)" --rpc-url "$RPC")"
test "$STANDARD_GRAD" = "true" || {
  echo "Standard graduation proof flag is false" >&2
  exit 1
}

STANDARD_POOL="$(cast call "$PANCAKE_V3_FACTORY" \
  "getPool(address,address,uint24)(address)" \
  "$STANDARD_TOKEN" "$FORTUNE_MOCK_QUOTE" 500 \
  --rpc-url "$RPC")"
test "$STANDARD_POOL" != "0x0000000000000000000000000000000000000000" || {
  echo "Standard Pancake V3 pool missing" >&2
  exit 1
}

echo "STANDARD_ONCHAIN_EXECUTION_COMPLETE_AND_SUCCESSFUL"
echo "LifecycleOperator=$OPERATOR"
echo "LaunchToken=$STANDARD_TOKEN"
echo "FortuneCurve=$STANDARD_CURVE"
echo "OfficialPancakeV3Pool=$STANDARD_POOL"
echo "LPPositionTokenId=$STANDARD_LP_TOKEN_ID"
echo "GraduationAnchorUsd1e18=$STANDARD_ANCHOR"

send_tx \
  "Tax-token launch" \
  "$OPERATOR" \
  "runTaxLaunch()(address,address)" \
  "$MAX_GAS"

TAX_TOKEN="$(cast call "$OPERATOR" "taxToken()(address)" --rpc-url "$RPC")"
TAX_CURVE="$(cast call "$OPERATOR" "taxCurve()(address)" --rpc-url "$RPC")"
TAX_PROCESSOR="$(cast call "$OPERATOR" "taxProcessor()(address)" --rpc-url "$RPC")"
TAX_DIVIDEND_VAULT="$(cast call "$OPERATOR" "taxDividendVault()(address)" --rpc-url "$RPC")"
TAX_READY="$(cast call "$OPERATOR" "taxLaunchPassed()(bool)" --rpc-url "$RPC")"
test "$TAX_READY" = "true" || {
  echo "Tax launch proof flag is false" >&2
  exit 1
}

send_tx \
  "Tax-token creator first buy" \
  "$OPERATOR" \
  "runTaxFirstBuy()(uint256)" \
  "5000000"

TAX_FIRST_BUY="$(cast call "$OPERATOR" "taxFirstBuyPassed()(bool)" --rpc-url "$RPC")"
test "$TAX_FIRST_BUY" = "true" || {
  echo "Tax first-buy proof flag is false" >&2
  exit 1
}

send_tx \
  "Tax-token Pancake V2 graduation + permanent LP lock" \
  "$OPERATOR" \
  "runTaxGraduation()(address)" \
  "$MAX_GAS"

TAX_POOL="$(cast call "$OPERATOR" "taxPool()(address)" --rpc-url "$RPC")"
TAX_LOCKED_LP="$(cast call "$OPERATOR" "taxLockedLp()(uint256)" --rpc-url "$RPC")"
TAX_GRAD="$(cast call "$OPERATOR" "taxGraduationPassed()(bool)" --rpc-url "$RPC")"
test "$TAX_GRAD" = "true" || {
  echo "Tax graduation proof flag is false" >&2
  exit 1
}

send_tx \
  "Tax-token official-pool sell + DEX tax capture" \
  "$OPERATOR" \
  "runTaxOfficialPoolSell()(uint256)" \
  "5000000"

TAX_SELL="$(cast call "$OPERATOR" "taxSellPassed()(bool)" --rpc-url "$RPC")"
test "$TAX_SELL" = "true" || {
  echo "Tax DEX sell proof flag is false" >&2
  exit 1
}

DEADLINE="$(( $(date +%s) + 1200 ))"

send_tx \
  "Process queued curve buyback + burn" \
  "$TAX_PROCESSOR" \
  "processQueuedMarketBurn(uint256,uint256)" \
  "5000000" \
  "0" \
  "$DEADLINE"

send_tx \
  "Process post-graduation DEX tax tokens" \
  "$TAX_PROCESSOR" \
  "processDexTaxTokens(uint256,uint256)" \
  "5000000" \
  "0" \
  "$DEADLINE"

send_tx \
  "Dispatch creator, dividends, liquidity, treasury and protocol buckets" \
  "$TAX_PROCESSOR" \
  "dispatchNonMarket()" \
  "3000000"

VERIFY="$(cast call "$OPERATOR" \
  "verifyTaxProcessing()(uint256,uint256,uint256,uint256)" \
  --rpc-url "$RPC")"
printf '%s\n' "$VERIFY"

CURVE_TAX="$(cast call "$TAX_PROCESSOR" "totalCurveTaxRecorded()(uint256)" --rpc-url "$RPC")"
DEX_PROCESSED="$(cast call "$TAX_PROCESSOR" "totalDexTaxTokensProcessed()(uint256)" --rpc-url "$RPC")"
TOKENS_BURNED="$(cast call "$TAX_PROCESSOR" "totalTokensBurned()(uint256)" --rpc-url "$RPC")"
DIVIDEND_EPOCHS="$(cast call "$TAX_DIVIDEND_VAULT" "epochCount()(uint256)" --rpc-url "$RPC")"

test "$CURVE_TAX" -gt 0
test "$DEX_PROCESSED" -gt 0
test "$TOKENS_BURNED" -gt 0
test "$DIVIDEND_EPOCHS" -gt 0

echo "TAX_ONCHAIN_EXECUTION_COMPLETE_AND_SUCCESSFUL"
echo "TaxToken=$TAX_TOKEN"
echo "TaxCurve=$TAX_CURVE"
echo "TaxProcessor=$TAX_PROCESSOR"
echo "DividendVault=$TAX_DIVIDEND_VAULT"
echo "OfficialPancakeV2Pool=$TAX_POOL"
echo "LockedLpAmount=$TAX_LOCKED_LP"
echo "CurveTaxRecorded=$CURVE_TAX"
echo "DexTaxTokensProcessed=$DEX_PROCESSED"
echo "TokensBurned=$TOKENS_BURNED"
echo "DividendEpochs=$DIVIDEND_EPOCHS"

cat > /tmp/fortune-existing-public-alpha-lifecycle.env <<EOF
LIFECYCLE_OPERATOR=$OPERATOR
STANDARD_TOKEN=$STANDARD_TOKEN
STANDARD_CURVE=$STANDARD_CURVE
STANDARD_POOL=$STANDARD_POOL
STANDARD_LP_TOKEN_ID=$STANDARD_LP_TOKEN_ID
STANDARD_ANCHOR=$STANDARD_ANCHOR
TAX_TOKEN=$TAX_TOKEN
TAX_CURVE=$TAX_CURVE
TAX_POOL=$TAX_POOL
TAX_PROCESSOR=$TAX_PROCESSOR
TAX_DIVIDEND_VAULT=$TAX_DIVIDEND_VAULT
TAX_LOCKED_LP=$TAX_LOCKED_LP
TAX_CURVE_TAX=$CURVE_TAX
TAX_DEX_PROCESSED=$DEX_PROCESSED
TAX_BURNED=$TOKENS_BURNED
TAX_DIVIDEND_EPOCHS=$DIVIDEND_EPOCHS
EOF

if [ -n "${GITHUB_ENV:-}" ]; then
  cat /tmp/fortune-existing-public-alpha-lifecycle.env >> "$GITHUB_ENV"
fi
