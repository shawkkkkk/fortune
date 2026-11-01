import { createHash } from 'node:crypto';
import { projectToken } from '@/lib/project-canon';
import { PUBLIC_TESTNET } from '@/lib/public-testnet';
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Export object');
  return v as Record<string, unknown>;
};
const keys = (v: Record<string, unknown>, names: string[]) => {
  if (Object.keys(v).sort().join(',') !== [...names].sort().join(',')) throw Error('Export schema');
};
const decimal = (v: unknown) => {
  if (typeof v !== 'string' || !/^(0|[1-9][0-9]{0,77})(\.[0-9]{1,18})?$/.test(v)) throw Error('Export decimal');
  const [whole, fraction = ''] = v.split('.');
  if (BigInt(whole + fraction.padEnd(18,'0')) > (1n << 256n)-1n) throw Error('Export overflow');
  return v;
};
/** Historical local byte/schema inspection, never source authentication or current authority. */
export function inspectProjectDataExport(value: unknown, expectedToken: string, now = Date.now()) {
  const token = projectToken(expectedToken), e = object(value);
  if (!Number.isSafeInteger(now) || now < 0) throw Error('Export clock');
  keys(e,['schemaVersion','kind','encoding','digestAlgorithm','payloadUtf8','sha256','sourceAuthenticated','independentRpcVerified','finalityVerified','currentAuthorization','executionAuthorized','integrityScope']);
  if (e.schemaVersion !== 1 || e.kind !== 'fortune-project-data-export' || e.encoding !== 'UTF-8' || e.digestAlgorithm !== 'SHA-256'
    || typeof e.payloadUtf8 !== 'string' || Buffer.byteLength(e.payloadUtf8,'utf8') > 16384
    || Buffer.from(e.payloadUtf8,'utf8').toString('utf8') !== e.payloadUtf8
    || typeof e.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(e.sha256)
    || createHash('sha256').update(e.payloadUtf8,'utf8').digest('hex') !== e.sha256
    || typeof e.integrityScope !== 'string' || e.integrityScope.length > 2048) throw Error('Export integrity');
  for (const k of ['sourceAuthenticated','independentRpcVerified','finalityVerified','executionAuthorized']) if (e[k] !== false) throw Error('Export authority');
  if (e.currentAuthorization !== null) throw Error('Export authority');
  const p=object(JSON.parse(e.payloadUtf8)), m=object(p.market), b=object(m.provenance), a=object(m.curveAccounting);
  keys(p,['schemaVersion','source','sourceUrl','apiTimestamp','market','treasuryBalance','limitations']);
  keys(m,['curve','phase','status','totalSupply','tokenDecimals','curveAccounting','marketCapUsd','volume24hUsd','holderCount','tradeQuote','provenance']);
  keys(b,['chainId','token','factory','creator','blockNumber','blockHash']);
  keys(a,['referencePriceUsd','reserveUsd','graduationTargetUsd']);
  const sourceUrl=`https://fortunepad.fun/api/public/v1/tokens/${token}/project`;
  const apiTime=typeof p.apiTimestamp==='string' ? Date.parse(p.apiTimestamp) : NaN;
  if (p.schemaVersion!==1 || p.source!=='Fortune public project API attestation' || p.sourceUrl!==sourceUrl
    || !Number.isSafeInteger(apiTime) || apiTime<0 || apiTime>now+5000
    || p.treasuryBalance!==null || !Array.isArray(p.limitations) || p.limitations.length>32
    || p.limitations.some(x=>typeof x!=='string'||x.length>2048)) throw Error('Export payload');
  if (b.chainId!==97 || projectToken(b.token)!==token || projectToken(b.factory)!==PUBLIC_TESTNET.contracts.factory.toLowerCase()
    || typeof b.blockNumber!=='string' || !/^(0|[1-9][0-9]{0,19})$/.test(b.blockNumber) || BigInt(b.blockNumber)>(1n<<64n)-1n
    || typeof b.blockHash!=='string' || !/^0x[0-9a-f]{64}$/.test(b.blockHash) || /^0x0{64}$/.test(b.blockHash)) throw Error('Export binding');
  if (typeof m.phase!=='number'||!Number.isInteger(m.phase)||m.phase<0||m.phase>3
    || m.status!==['Curve','GraduationReady','Pancake','Rescued'][m.phase] || m.tokenDecimals!==18) throw Error('Export phase');
  for (const k of ['marketCapUsd','volume24hUsd','holderCount','tradeQuote']) if(m[k]!==null) throw Error('Export unknown');
  const referencePriceUsd=m.phase<2 ? decimal(a.referencePriceUsd) : null;
  if(m.phase>=2 && a.referencePriceUsd!==null) throw Error('Export retired price');
  return {schemaVersion:1,source:'local-untrusted-project-export-inspection',checksumMatches:true,sha256:e.sha256,
    sourceUrl,storedApiTimestamp:p.apiTimestamp,inspectedAtMs:now,apiResponseAgeMs:now-apiTime,
    market:{curve:projectToken(m.curve),phase:m.phase,status:m.status,totalSupply:decimal(m.totalSupply),tokenDecimals:18,
      curveAccounting:{referencePriceUsd,reserveUsd:decimal(a.reserveUsd),graduationTargetUsd:decimal(a.graduationTargetUsd)},
      marketCapUsd:null,volume24hUsd:null,holderCount:null,tradeQuote:null,
      provenance:{chainId:97,token,factory:projectToken(b.factory),creator:projectToken(b.creator),blockNumber:b.blockNumber,blockHash:b.blockHash}},
    treasuryBalance:null,currentAuthorization:null,sourceAuthenticated:false,independentRpcVerified:false,finalityVerified:false,
    currentCanonicalityVerified:false,executionAuthorized:false,fullApiReadiness:false,
    limitations:['Checksum matches supplied UTF-8 bytes only; anyone can rewrite and recompute it.',
      'Stored API time and block are claims. Historical inspection does not refresh the observation or prove block age, chain canonicality, source identity or finality.',
      'Input prose is not emitted or followed; no links are fetched. Unknown analytics remain null. No wallet or financial authority.']};
}
