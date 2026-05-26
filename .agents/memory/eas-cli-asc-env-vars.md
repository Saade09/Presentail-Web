---
name: EAS CLI ASC API Key env var names
description: Exact env var names EAS CLI (v19+) reads for Apple ASC credentials in non-interactive / CI mode
---

# EAS CLI ASC API Key — correct env var names

EAS CLI v19+ reads these specific names. The GitHub Actions `expo/expo-github-action` docs sometimes show different names — trust these instead.

**Required env vars for non-interactive `eas build`:**

| Purpose | Correct env var name |
|---|---|
| ASC key ID | `EXPO_ASC_KEY_ID` |
| ASC issuer ID | `EXPO_ASC_ISSUER_ID` |
| Path to .p8 key file | `EXPO_ASC_API_KEY_PATH` |
| Apple team ID | `EXPO_APPLE_TEAM_ID` |
| Apple team type | `EXPO_APPLE_TEAM_TYPE` |

**Team type value for a company:** `COMPANY_OR_ORGANIZATION`
**Team ID:** `4DR9CS3387` (Presentail LTD)

**Why:** `EXPO_ASC_API_KEY_ID` and `EXPO_ASC_API_KEY_ISSUER_ID` (the GitHub Actions secret names) are NOT the env var names EAS CLI reads. Using them causes a non-interactive prompt failure. Discovered by reading `resolveCredentials.js` in the EAS CLI build output.

**How to apply:** Any script or CI step running `eas build --non-interactive` must use the `EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID` names. The iOS TestFlight GitHub workflow was updated to match.

**Admin ASC key required for profile creation:** The ASC API key must have Admin or App Manager role to create/regenerate provisioning profiles. A Developer-role key gets a 403 from Apple. Current admin key ID: `88VMN93STX` (same issuer as previous key).
