Fortune existing public alpha lifecycle verification

Live BSC Testnet stack deployed and invariant-checked on 2026-09-20.
This trigger runs bounded real Standard + Tax Token lifecycle proofs against that exact stack.
No mainnet assets. Chain 97 only.

Retry 1: current scripts compile after GraduationStormSetup metadata update.

Retry 2: split tax launch and creator first buy into separate BSC transactions.

Retry 3: precompute vanity salts via eth_call so launch transactions stay below BSC gas cap.

Release verification rerun: launch-hardening + recovery + full-stack readiness gate.
