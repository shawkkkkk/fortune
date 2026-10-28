import { boundedText, byteLength } from "@/lib/creator-metadata";

export const CHARACTER_FIELDS = {
  name: ["Project name", 64], symbol: ["Ticker", 16], description: ["Project description", 4096],
  look: ["Character appearance", 2048], voice: ["Voice", 1024], objective: ["Objective", 2048],
  backstory: ["Backstory", 4096], identityPrompt: ["Identity prompt", 4096],
  hardLimits: ["Content boundaries", 2048], license: ["License / permissions statement", 2048],
} as const;
export type CharacterFields = Record<keyof typeof CHARACTER_FIELDS, string>;
export const emptyCharacter = Object.fromEntries(Object.keys(CHARACTER_FIELDS).map(k => [k, ""])) as CharacterFields;
export function characterKey(token: string) {
  if (!/^0x[0-9a-f]{40}$/i.test(token) || /^0x0{40}$/i.test(token)) throw Error("Enter a nonzero BSC Testnet project address.");
  return `fortune:character:v1:97:${token.toLowerCase()}`;
}
function checkedFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Character fields must be an object.");
  const fields = {} as CharacterFields;
  for (const key of Object.keys(CHARACTER_FIELDS) as (keyof CharacterFields)[]) {
    fields[key] = boundedText(CHARACTER_FIELDS[key][0], (input as CharacterFields)[key], CHARACTER_FIELDS[key][1]);
  }
  return fields;
}
export function characterDraft(token: string, input: unknown) {
  characterKey(token);
  const draft = { version: 1 as const, chainId: 97 as const, token: token.toLowerCase(), provenance: "local-unverified-draft" as const, fields: checkedFields(input) };
  if (byteLength(JSON.stringify(draft)) > 32768) throw Error("Combined draft exceeds 32 KiB.");
  return draft;
}
export function restoreCharacter(raw: string, token: string) {
  if (byteLength(raw) > 32768) throw Error("Draft exceeds 32 KiB.");
  const value = JSON.parse(raw);
  if (value?.version !== 1 || value.chainId !== 97 || value.token?.toLowerCase() !== token.toLowerCase()) throw Error("Draft version, chain or project does not match.");
  // Ignore imported claims of ownership, review, signatures, keys or authority.
  return characterDraft(token, value.fields);
}
export function announcementDraft(input: CharacterFields) {
  const fields = checkedFields(input);
  if (!fields.name || !fields.description) throw Error("Add a project name and description to prepare an announcement.");
  return `${fields.name}${fields.symbol ? ` (${fields.symbol})` : ""}\n\n${fields.description}`;
}
