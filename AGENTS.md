# Repository Guidelines

## Project Structure & Module Organization

This is a Node.js CommonJS project for the `cyberboss` personal agent bridge. Runtime source lives in `src/`: core orchestration is in `src/core`, channel adapters in `src/adapters/channel`, runtime adapters in `src/adapters/runtime`, services in `src/services`, app usage support in `src/appUsage`, and tool/MCP helpers in `src/tools`. The CLI entry point is `bin/cyberboss.js`. Tests are in `test/*.test.js`. Operational scripts are in `scripts`, user-facing docs in `docs`, reusable prompt/config templates in `templates`, and packaged media assets in `assets` and `templates/stickers`.

## Build, Test, and Development Commands

- `npm run check`: runs `node --check` across source and script files for syntax validation.
- `node --test`: runs the full built-in Node test suite in `test/`.
- `node --test test/codex-rpc-client.test.js`: runs one focused test file.
- `npm start`: starts the CLI via `node ./bin/cyberboss.js start`.
- `npm run start:checkin`: starts with system check-in polling enabled.
- `npm run login`, `npm run accounts`, `npm run doctor`: manage Weixin login/accounts and inspect runtime setup.
- `npm run shared:start`, `npm run shared:open`, `npm run shared:status`: operate shared terminal/app workflows.

Use Node `>=22`, matching `package.json`.

## Coding Style & Naming Conventions

Use CommonJS (`require`, `module.exports`) and keep files ASCII unless existing content requires otherwise. Follow the existing two-space indentation, semicolon-free JavaScript style, double quotes for strings, and `kebab-case` filenames such as `memory-service.js`. Export focused functions/classes from modules, and keep side effects near CLI/runtime entry points. Prefer small services and stores that match the current `src/core`, `src/services`, and adapter boundaries.

## Testing Guidelines

Tests use `node:test` with `node:assert/strict`. Name files `*.test.js` and place them under `test`. Keep tests focused on externally visible behavior, with small fakes or in-memory stores where possible. Run `node --test` before submitting behavioral changes and `npm run check` before any PR.

## Commit & Pull Request Guidelines

Recent commits use short, imperative or descriptive summaries, often sentence-case and concise, for example `Refine Weixin chunk splitting and preserve punctuation runs` or `remind func`. Keep commits scoped to one change. Pull requests should include a short description, testing performed (`node --test`, `npm run check`), linked issues when relevant, and screenshots or terminal output for user-facing CLI, Weixin, or timeline behavior changes.

## Security & Configuration Tips

Do not commit `.env`, local account state, generated runtime data, or secrets from `~/.cyberboss`. Configuration may be read from the repository `.env` or `~/.cyberboss/.env`; document new environment variables in the relevant README or docs file.
