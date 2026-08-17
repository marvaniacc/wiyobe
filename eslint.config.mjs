import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Standard Next.js linting is now ENFORCED — no blanket rule disables.
// TypeScript `any`, unused vars, exhaustive-deps, unreachable code, etc. will
// surface as warnings/errors during `next build` and `npm run lint`.
//
// If existing code triggers new lint failures, fix the code rather than
// re-disabling the rule.
const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  ignores: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "examples/**",
    "skills/**",
    "agent-ctx/**",
    ".zscripts/**",
    "download/**",
    "upload/**",
  ],
}];

export default eslintConfig;
