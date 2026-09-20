Fortune public alpha deployment authorization

Purpose: one-time BSC Testnet deployment trigger for the unified Standard + Tax stack.
Requested by project owner in chat on 2026-09-20.
Network: BSC Testnet (chainId 97) only.
Assets: valueless test assets only.
Workflow safety: chain-id, bytecode, balance, full contract suite, simulation, and lifecycle checks run before/around broadcast.

Retry 1: push-trigger defaults fixed for Pancake addresses.

Retry 2: direct broadcast with skip-simulation and live invariant verification.
