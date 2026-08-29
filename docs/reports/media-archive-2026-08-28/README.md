# Project media archive review — 2026-08-28

This archive records the reviewed cleanup of `attached_assets/`, `screenshots/`,
`tmp-dist/`, and the ignored root-level site-audit exports.

## Review policy

| Decision | Rule |
| --- | --- |
| Keep | Preserve every Git-tracked asset, all Play Store media, every explicit web build/provenance input, generated imagery, source-search inputs, and conservatively identified design/compliance evidence. |
| Archive | Move historical visual QA captures, named attached QA/provenance/compliance evidence, and the July 2026 site-audit exports under this directory so the evidence remains reviewable but is no longer loose in runtime-adjacent locations. |
| Delete | Remove only ignored and unreferenced generic conversation captures/pasted prompts, recreated `tmp-dist/` output, and two duplicate service-account JSON uploads that contained private-key fields. |

The per-file decision, original path, retained path, byte size, and SHA-256 are
recorded in `manifest.csv`. Aggregate counts and byte totals are in
`summary.json`.

## Protected launch inputs

- The tracked `attached_assets/play-store/` tree is unchanged.
- All nine attached assets named by `scripts/build-artifact-provenance.mjs` are
  unchanged.
- The matching asset globs in the Android, iOS App Store, iOS TestFlight, and
  SEO regression workflows are unchanged.
- Runtime assets under `artifacts/` are outside the cleanup set and unchanged.
- Generated imagery and image-search provenance inputs remain in
  `attached_assets/`.

The manifest is a point-in-time record of the pre-cleanup inventory. It is
intentionally retained as evidence rather than regenerated from the smaller
post-cleanup workspace.