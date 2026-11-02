# Receipt stores require literal disk paths

The actual `ArbitrageFillJournal`, `ReceiptObservationQueue` and
`StrategyNativeGasBudget` constructors reject strings beginning with `file:`
(case insensitive), in addition to the existing empty/path-type/`:memory:`
rejections. This happens before policy work and opening SQLite, for both writable
and read-only modes. Ordinary absolute and relative filesystem paths remain
unchanged; no URI decoding, filename normalization or fallback is performed.

SQLite accepts URI options such as `file:lost?mode=memory`. Previously these
constructors could accept that string as a durable store even though the database
was only in memory. Restarting such a connection loses its journal/queue/budget
state. The new constructor guard fails closed instead. Tests use actual child
processes and SQLite: all three reject URI memory/shared-memory/disk forms before
file creation, while literal relative disk paths reopen normally (including queue
jobs and gas reservations). All three groups failed unchanged main by accepting
the first URI-memory path. They do not certify power-loss durability or a host.

Operators with any URI-form configuration must stop and review its exact prior
SQLite target/mode and history. Do not silently strip `file:`, initialize a new
empty database, erase holds/quarantine, reset consumed IDs or treat missing
history as unused capital. In-memory history cannot be recovered by this guard.
There is no migration, recovery or automatic retry in this change. A literal
filename containing a colon may be supplied explicitly as a filesystem path,
such as `./file:literal.sqlite`; that is not a SQLite URI.

Schemas/WAL/FULL/busy timeouts, read-only behavior, policies, clocks, reservations,
permanent deduplication, quarantine/holds and journal-before-charge-before-queue
ordering are unchanged. Paths/host storage remain trusted; this is not symlink or
privileged path-swap protection, a general filesystem deadline, independent
provider/finality/capital/custody evidence, global atomic settlement or readiness.
No signer/service/configuration, contract, root dependency/Standard pin, economics,
authority or release gate changes. Full M01/M07/M08 remains unfinished.
