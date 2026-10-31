// Explicit read-only operator entry. No wallet, signing or broadcast capability.
import { readRuneIndex } from '../lib/rune-index-observation.ts';
try {
  if(process.env.FORTUNE_RUNE_INDEX_READ_ENABLED!=='true'||process.argv.length!==3) throw Error('disabled');
  console.log(JSON.stringify(await readRuneIndex(process.argv[2]),null,2));
} catch { console.error('Rune index observation unavailable. No wallet or bridge action was authorized.'); process.exitCode=1; }
