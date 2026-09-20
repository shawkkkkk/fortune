# Fortune security model

Fortune is pre-audit research software.

## Default invariants

Fortune-created tokens are designed to have:

- fixed supply;
- no post-launch mint function;
- no arbitrary blacklist;
- no mutable transfer tax;
- no creator withdrawal function for curve reserves;
- launch manifest hash embedded in the token;
- per-launch fee routing fixed at creation.

## High-risk areas before mainnet

### Oracle manipulation
A multi-asset curve is only as strong as its normalization layer. Each quote asset needs an appropriate, liquid, manipulation-resistant feed with a strict freshness bound.

### Fee-on-transfer / rebasing / non-standard tokens
The prototype assumes ordinary ERC-20 accounting. Production must detect or reject tokens whose observed balance changes differ from requested transfers.

### Cross-reserve sells
A user may buy through one reserve and sell into another. This is a feature, but it creates reserve-drain and oracle-arbitrage surfaces that need quantitative limits and simulations.

### Graduation
The production DEX adapter will temporarily control all remaining curve reserves. It needs a dedicated audit and should have no generalized arbitrary-call surface.

### Automation vaults
Reward/buyback/liquidity vaults must:
- enforce approved swap routers;
- cap slippage;
- avoid unbounded approvals;
- expose failures;
- be pausable independently of curve trading where possible.

### Tokenized securities / RWAs
Technical compatibility is not sufficient. Availability may depend on issuer restrictions, jurisdiction, transfer permissions and legal/compliance requirements.

## Launch safety UI

The launch manifest should expose:

- supply;
- dev buy;
- accepted quote assets;
- primary market;
- graduation mode and weights;
- total fee and each route;
- reward asset;
- admin powers that exist/do not exist;
- oracle sources;
- adapter version.

No "verified" badge should imply investment quality.


### Editable metadata

Fortune display metadata may be creator-editable when that policy is selected at launch. This authority is intentionally limited to presentation fields stored in `FortuneMetadataRegistry`.

Metadata authority cannot change:
- ERC-20 supply;
- token contract name/symbol;
- curve economics;
- quote assets;
- fee routing;
- graduation;
- automation vaults.

Every metadata edit increments an onchain revision. Creators may permanently freeze the record. Fortune clients should visibly distinguish editable from frozen metadata so users are not surprised by later branding changes.


### Launch Shield

The current FortuneCurve version enforces a buy-only launch shield: the opening
tax starts at 99% and reaches zero after five seconds, while cumulative buys by
one wallet are capped at 2% of supply for the first 15 seconds.

The shield has no creator/private-wallet exemption and its tax goes to the
liquidity-reinforcement vault. Only net post-shield quote value advances the
curve.

Because the opening tax is intentionally severe, production clients must show
the exact current tax before signing and should default to waiting until it
expires. The tax window is fixed by the deployed contract and cannot be
extended or reactivated.
