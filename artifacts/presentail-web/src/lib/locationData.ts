// TypeScript facade for locationData.mjs — provides types for the TypeScript
// consumer (checkNapConsistency.ts, React components) while the actual data
// lives in the sibling .mjs module so that seo-inject.mjs (plain ESM, no
// TypeScript) can import the same values at runtime without compilation.

export type { CountryLocationData } from "./locationData.mjs";
export { LOCATION_DATA } from "./locationData.mjs";
