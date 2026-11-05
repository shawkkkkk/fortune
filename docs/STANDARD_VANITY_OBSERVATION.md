# Standard testnet vanity observation (P17)

This opt-in library call has no route, wallet action, signer, transaction
builder, address reservation, or automatic provider selection. The existing
Standard launch flow and its frozen Solidity source are unchanged.

- `prepareStandardVanity` takes the exact BSC Testnet factory context, a creator,
  creator launch nonce, literal launch parameters, and creation bytecode
  with its independently reviewed Keccak-256 pin. Use the **creation** bytecode
  from the exact reviewed FortuneToken compiler artifact, not runtime bytecode.
  The pin only checks byte equality. It does not establish artifact provenance.
- The engine reconstructs the frozen flattened manifest ABI and hashes the
  token's creation code plus constructor arguments. It searches the first 4,096
  creator/manifest/index salts in order for the required final byte `0xfe`.
  CREATE2 uses the separate token deployer as its sender. This is a calculation,
  not a launch validity check; eligibility and preflight remain separate.
- `observeStandardVanity` additionally requires a block number and hash and
  reviewed factory/deployer runtime pins. At that height it checks chain,
  runtime code, factory-to-deployer binding, creator nonce, the whole factory
  preview, the deployer's direct prediction, and the predicted account's code
  and nonce. It checks the chain and block header again before returning. The
  original first suffix candidate is preserved even if it is occupied.
- Nonempty code or nonzero account nonce at the observed height means occupied.
  Empty code with zero account nonce is only a point-in-time observation, not
  availability at inclusion or a successful deployment guarantee. A balance
  alone is not used as a collision predicate. See [CREATE2](https://eips.ethereum.org/EIPS/eip-1014)
  and its [collision rule](https://eips.ethereum.org/EIPS/eip-684).

The read budget is 20 seconds across the observation. An expired request may
continue in the supplied client; no further reads are started after expiry.
The library uses one supplied client and height-based reads, not block-hash RPC
selectors, independent providers, finality, or a reservation. Read the exact
launch fields only through a provider approved to receive them; factory
preview sends the entire proposed metadata in call data. The offline path sends
nothing. No candidate is a platform token address or proof of ownership,
authorization, release readiness, or audit approval.

The loopback tests exercise actual viem HTTP and ABI encoding with synthetic
bytecode and responses. Compiled factory/deployer differential evidence,
reviewed artifact provenance, and actual testnet route evidence are separate
and are not claimed here.
