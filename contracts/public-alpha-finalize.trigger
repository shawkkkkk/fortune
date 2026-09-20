Fortune final public alpha verification

The corrected BSC Testnet stack and both Standard/Tax real lifecycle transactions have already completed successfully.
The prior workflow stopped only because Foundry annotated numeric cast output (for example "206185... [2.061e16]") and bash integer parsing rejected the annotation.
This trigger performs read-only final verification of that completed onchain state and publishes the verified addresses to the website configuration.
