# Fortune Launch Shield

Fortune Launch Shield is a protocol-level anti-sniper system applied to the
opening seconds of every Fortune bonding curve.

## Default protection

- Opening buy tax: **99%**
- Tax duration: **5 seconds**
- Early cumulative buy cap: **2% of token supply per wallet**
- Wallet-cap duration: **15 seconds**
- Applies to: **buys only**
- Creator exemption: **none**
- Private whitelist exemption: **none**
- Shield-tax destination: **Fortune liquidity-reinforcement automation vault**

The values above are contract constants in the current FortuneCurve version.
They cannot be extended or re-enabled after expiry for an already-deployed
curve.

## Tax decay

Fortune uses a steep time decay rather than holding buyers at 99% for the full
window.

Approximate schedule:

| Elapsed | Shield tax |
| ---: | ---: |
| 0 sec | 99.00% |
| 1 sec | 24.75% |
| 2 sec | 3.09% |
| 3 sec | 0.38% |
| 4 sec | 0.04% |
| 5+ sec | 0% |

The contract calculates:

```
shift = elapsed * 14 / 5
snipeTaxBps = 9900 >> shift
```

and hard-returns zero once the five-second period ends.

## Accounting

On a protected buy:

```
gross quote
  - Launch Shield tax
  = post-shield quote

post-shield quote
  - normal Fortune trading fee
  = net quote credited to the curve
```

Only the **net quote** moves the canonical bonding curve. This avoids treating
a penalized sniper's gross payment as genuine buy pressure and helps keep the
opening chart sane.

Shield tax is sent directly to the launch's liquidity-reinforcement vault.
It is never paid to the creator.

## Early-wallet cap

For the first 15 seconds, Fortune tracks cumulative tokens bought by each
recipient wallet and limits that total to 2% of supply.

Moving purchased tokens away does not reset the buyer's cumulative counter.

This is not Sybil-proof by itself; bots can use multiple wallets. The cap is
therefore defense-in-depth alongside the opening tax.

## User experience

The public Fortune UI should:

1. show a visible launch countdown;
2. show the exact live shield-tax rate;
3. disable the normal Buy button until the five-second tax reaches zero;
4. require an explicit advanced confirmation to buy during the taxed window;
5. include the tax in transaction previews and minimum-output calculations;
6. never automatically retry an uncertain buy transaction.

The contracts remain the source of truth. A bot bypassing the website still
pays the onchain tax.

## No privileged bundle

Fortune intentionally does not expose a creator/private-wallet exemption to
the Launch Shield. That avoids turning the anti-sniper mechanism into a
privileged bundling system where insiders can buy untaxed while the public
pays 99%.

If Fortune later supports an atomic creator/dev buy, its size and timing must
be encoded in the immutable Launch Manifest and executed before public trading
opens rather than through a hidden exemption.

## Events and indexing

`SnipeTaxCharged` emits:

- buyer;
- quote asset;
- gross quote input;
- tax amount;
- tax basis points.

The indexer should display shield-tax payments separately from:
- ordinary trading fees;
- curve reserve growth;
- creator revenue;
- holder rewards.

This prevents distorted volume/fee analytics.

## Security notes

A 99% opening tax is intentionally punitive, so transparency is mandatory.

Fortune must never:
- hide the tax in the transaction preview;
- allow a creator to extend the window;
- reactivate the tax later;
- route the shield tax to the creator;
- advertise a token as tax-free while the shield is active.

The shield is launch protection, not an investment-quality signal.
