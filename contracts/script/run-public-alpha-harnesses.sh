#!/usr/bin/env bash
set -euo pipefail

# The public-alpha deploy workflow already exports the freshly deployed stack
# into GITHUB_ENV. Reuse the same bounded verifier used for existing stacks so
# every lifecycle stage stays below BSC's per-transaction gas cap.
bash script/verify-existing-public-alpha.sh

cp   /tmp/fortune-existing-public-alpha-lifecycle.env   /tmp/fortune-public-alpha-lifecycle.env
