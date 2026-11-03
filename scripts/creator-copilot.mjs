// Operator-only manual command. No public route, tools, wallet or automatic retry.
import { readCreatorProjectBrief } from "../lib/creator-project-brief.ts";
import { selectCreatorHelp } from "../lib/creator-copilot.ts";
try {
  if (process.argv[2] === "--character-brief") {
    if (process.argv.length !== 6 || process.env.FORTUNE_COPILOT_CHARACTER_BRIEF_ENABLED !== "true" || process.env.FORTUNE_COPILOT_CHARACTER_DISCLOSURE_REVIEWED !== "true") throw Error("Character brief disabled");
    const {readCreatorCharacterBrief}=await import('./creator-character-brief.mjs');
    const {createPublicClient,http}=await import('viem');
    const urls=[process.env.FORTUNE_CANON_READ_RPC_URL,process.env.FORTUNE_CANON_SECONDARY_RPC_URL].map(x=>new URL(x||''));
    if(urls.some(u=>u.protocol!=='https:'||u.username||u.password||u.hash)||urls[0].origin===urls[1].origin)throw Error('Reviewed origins required');
    const readers=urls.map(u=>createPublicClient({transport:http(u.href,{timeout:8000,retryCount:0,fetchOptions:{redirect:'error'}})}));
    console.log(JSON.stringify(await readCreatorCharacterBrief({token:process.argv[3],path:process.argv[4],policyPath:process.argv[5]},readers,{enabled:true,discloseLocalCharacter:true}),null,2));
  } else if (process.argv[2] === "--brief") {
    if (process.argv.length !== 4 || process.env.FORTUNE_COPILOT_PROJECT_BRIEF_ENABLED !== "true") throw Error("Brief disabled or arguments");
    console.log(JSON.stringify(await readCreatorProjectBrief(process.argv[3]), null, 2));
  } else {
  if (process.argv.length !== 2) throw Error("Arguments");
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > 4096) throw Error("Input limit"); chunks.push(chunk); }
  const question = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  const result = await selectCreatorHelp(question, { enabled: process.env.FORTUNE_COPILOT_ENABLED === "true", model: process.env.FORTUNE_COPILOT_MODEL || "",
    credential: process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || "" });
  console.log(JSON.stringify(result, null, 2));
  }
} catch { console.error("Co-pilot unavailable. Check explicit mode enablement, supported project/input and required provider access. No wallet action or release approval was performed."); process.exitCode = 1; }
