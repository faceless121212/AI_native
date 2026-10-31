# AGENTS.md

This project's rules for AI coding tools live in `CLAUDE.md`. Read it first; it applies to every tool (Claude Code, Cursor, Codex, Copilot).

Key files:
- `CLAUDE.md`: non-negotiable rules, commands, code style, definition of done
- `docs/product-spec.md`: what the app and keyboards do
- `docs/architecture.md`: how it works (App Group, keyboard auth, reply pipeline)
- `inventory.md`: approved libraries and services
- `.claude/agents/`: specialist roles (tests, review, keyboard extension, prompts, backend, i18n, privacy, accessibility, release). Tools that don't support sub-agents can read these files as checklists.

The two keyboards are native code (Swift in `targets/keyboard/`, Kotlin in `modules/replywise-ime/`). Never put React Native or JavaScript inside them.
