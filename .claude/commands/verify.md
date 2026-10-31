---
description: Run every check for Replywise (lint, types, unit tests, i18n, Swift and Kotlin core tests, database and Edge Function tests) and report results
---

Run these in order and keep going even if one fails. Skip a step only if its tooling isn't set up yet, and say so.

1. `npm run lint`
2. `npm run typecheck`
3. `npm test -- --ci`
4. `npm run i18n:check`
5. `swift test --package-path targets/keyboard` (macOS only)
6. `(cd modules/replywise-ime/android && ./gradlew testDebugUnitTest)`
7. `supabase test db` (needs `supabase start` running)
8. `deno test --no-lock --allow-env --allow-net=127.0.0.1 supabase/functions`
9. `npm run check:reply-api` (docs/reply-api.json matches the zod schemas)
10. `grep -rnE "console\.(log|info|debug)\(.*(text|body|draft|clipboard)" supabase/functions targets modules src` must return nothing (no message text in logs)

Then report as a table: step · result (pass / fail / skipped) · first failure in one line. If anything failed, propose the smallest fix but don't apply it unless I say so. $ARGUMENTS
