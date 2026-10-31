# Project canon reader and MCP

The subsequent [project snapshot extension](PROJECT_SNAPSHOT.md) adds a second
read-only tool/resource for same-block metadata and curve accounting. The original
canon behavior and setup below remain supported; the original one-tool scope is
historical. Full analytics, treasury/notebook/thoughts and wallet authority are not
added by that extension.

This implements the first executable P02/P03/P04 slice in MEME_OS_PARITY.md.
It is a local, read-only MCP stdio server for one BSC Testnet Standard project.
It is not a complete project agent, hosted MCP service or full character editor.
The existing launch form, metadata registry, signing paths and contracts are unchanged.

## Connect a project

Use Node 22.15+ and the repository's exact installed dependencies. An MCP client
launches this process; replace the absolute paths and token below. The token is
a project address on chain97, not an official Fortune mainnet CA.

```json
{
  "mcpServers": {
    "fortune-project": {
      "command": "node",
      "args": [
        "--import", "/absolute/path/to/fortune/scripts/register-ts.mjs",
        "/absolute/path/to/fortune/scripts/project-mcp.mjs"
      ],
      "env": {
        "FORTUNE_PROJECT_MCP_ENABLED": "true",
        "FORTUNE_PROJECT_TOKEN": "<BSC-Testnet-Standard-token-address>"
      }
    }
  }
}
```

The process does not start without explicit enablement and a nonzero token.
It has no HTTP listener, login, API key, model call or signing interface. Normal
local process/file permissions are the access boundary. Do not give it secrets.
Client setup varies; this configuration is a conventional MCP subprocess entry,
not evidence of a named desktop product installation.

## Implemented protocol and data

- MCP protocol version 2025-06-18: initialize, initialized notification, ping,
  tools/list, tools/call, resources/list and resources/read. An unsupported client
  version receives the supported version and must disconnect if incompatible.
- Exactly one tool, `get_project_canon`, with an empty argument object. Exactly
  one resource, `fortune://97/<lowercase-token>/canon`, returns the same projection.
  Token selection is process configuration; tool arguments cannot switch projects.
- The reader issues only GET to the fixed origin `https://fortunepad.fun` and
  `/api/public/v1/tokens/<token>/metadata`. No redirects, cookies, custom origin,
  external artwork, creator links, metadataURI fetch or additional tool calls.
- The API's existing Standard reader binds creator, registry and factory at a
  stated block. This consumer requires chain 97, the configured token and the
  repository's reviewed public-testnet factory; checks shape, address/hash/integer
  bounds, text/URI limits, API v1 and timestamp (at most 60 seconds old/5 seconds ahead).
  It copies only allowed fields. API data remains a server attestation, not a new
  independent client RPC/code-pin verification. Timestamp limits API response age,
  not reported block age, chain finality or current canonicality.
- Identity includes creator-supplied name/symbol/description/image/site/social
  references plus block/hash, registry, creator, editability, frozen and revision.
  Empty fields become null. Look, voice, objective, backstory, identity prompt,
  hard limits and license remain null because the current registry does not store
  them. Public accessibility does not grant a license or social-account ownership.
- Creator text/links are explicitly untrusted data, never system instructions.
  Text is returned as JSON data, with trust limitations. The server cannot enforce
  how a consuming model obeys instructions; host applications must keep retrieved
  data separate from tool permissions and review any actions in other integrations.
  There are no treasury, notebook, thought, live-market, transfer, buyback, trading,
  signing or mutation tools. Unsupported data are not fabricated or advertised.

Requests are serial and backpressured, max 8192 bytes per newline-delimited message
and 256 messages per process (including notifications). Tool and resource reads share
four attempts per local 60 second window; restart resets this local quota. Backwards
clocks fail closed. Upstream fetch/body reads have a 10 second abort deadline, 32 KiB
body ceiling, JSON/UTF-8 checks and no retries or cached fallback. Public HTTP quota
and durable multi-client quotas are not provided by this subprocess limit.
Only JSON-RPC appears on stdout; startup/frame errors use fixed private-safe stderr.
Malformed tool arguments are protocol errors; dependency/read-limit failures are
tool `isError:true` or resource errors, without upstream exception text.

## Verification and remaining work

`tests/web/project-mcp.test.mjs` exercises projection/injection boundaries,
wrong provenance/timestamps/text/links, bounded transport, lifecycle, read quotas,
framing/pipelining, actual CLI enablement and actual child-process stdio through
a local HTTP fixture into the canon response. Fixture provider data are not live
chain or independent-provider evidence. Normal Fortune CI includes these tests.
The `/developers` page now includes the actual subprocess setup.

On October 27, the actual enabled CLI initialized over stdio and successfully
called `get_project_canon` through the public HTTPS API for the repository's
reference Standard testnet token `0xF2A934B924C50566eCAB90ea8D5644378237D9fE`.
It returned frozen revision 1, registry `0x2Bc777Da067118C25b349976E7A8157Af87D3000`,
at block 139344467/hash `0xaae65fdf4cd20b62f92ac9c05c0b876cabdd9eadc967ecb890266cf4543bc4c3`.
Empty character fields stayed null. A separate connector read also returned 200.
An isolated official TypeScript SDK client (`@modelcontextprotocol/sdk@1.32.2`,
installed outside the frozen root manifests) also connected to the actual CLI,
listed the tool/resource and successfully read both through the live API at
block 139344761/hash `0xa424f81829f95eeac35a37b05bbd973e0b5fc2004883fc504f93c7afb7739a5e`.
Only the execution host's existing proxy/CA settings were passed alongside the
two public MCP configuration values; no provider credential/model/wallet was used.
This is SDK subprocess interoperability, not a tested Claude/ChatGPT desktop
installation, independent RPC verification, ongoing availability or audit.

Remaining P02/P03/P04 work includes creator-authenticated canon editing and
permissions/license schema, market/treasury/notebook/thought adapters with honest
coverage, named end-user client installation checks, hosted transport/auth/durable
quotas if exposed publicly, broader model/skill integrations and a live playground.
No root dependency, frozen Standard fingerprint, release gate, custody or engine
readiness is changed by this reader. See TESTNET_IMPLEMENTATION.md for the larger scope.

Protocol references (primary specification, read October 27):
[stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports),
[lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle),
[tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).

## Public read lifetime

The actual canon and project-snapshot HTTP readers share a bounded streaming
reader with their unchanged 10/30-second budgets, 32KiB limit, fixed official
URLs, no redirects/retries/credentials and strict JSON/UTF-8 projection. A real
wall timer rejects even a fetch/body implementation that ignores abort. Each
awaited response/chunk is fenced before and after; late completions cannot read
another chunk or project a result. Every outcome ends the lifetime, clears the
timer and requests abort/cancellation without waiting for a stuck cancellation.
Cancellation is best effort: already in-flight work may continue and JavaScript
timer scheduling depends on the host event loop. This does not certify transport
termination, independent providers, block finality or any execution authority.
Nonnegative safe host clocks must not move backwards between checks. Existing
API timestamp freshness, schemas, quotas and privacy boundaries remain unchanged.
The generic metadata-upload reader and other network paths are not changed.
