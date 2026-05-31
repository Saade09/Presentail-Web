/**
 * @workspace/eslint-plugin-presentail
 *
 * Custom ESLint rules for Presentail translation key validation.
 *
 * Rules:
 *   presentail/no-unknown-t-member  — mobile: flags t.key where key is not in EN translations
 *   presentail/no-unknown-t-call    — web:    flags t("key") where key is not in web STRINGS
 */

import noUnknownTMember from "./rules/no-unknown-t-member.js";
import noUnknownTCall from "./rules/no-unknown-t-call.js";

const plugin = {
  meta: {
    name: "@workspace/eslint-plugin-presentail",
    version: "0.0.0",
  },
  rules: {
    "no-unknown-t-member": noUnknownTMember,
    "no-unknown-t-call": noUnknownTCall,
  },
};

export default plugin;
