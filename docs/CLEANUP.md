# Cleanup record

## Hostinger production cleanup (12 October 2026)

Removed `render.yaml` and the unreferenced `SystemHealthView.jsx` (its functionality lives in Superadmin). Updated optional Docker configuration to Groq. Kept root `server.js`, test compatibility entry, Docker tooling, tests and docs because they have defined uses.

Removed the six legacy history JSON files from Git tracking and added ignore rules. Their local copies and the SQLite database were preserved. Existing Git history may still contain those records; untracking does not erase previous commits. Generated assets, credentials and backups remain excluded from deployment images.

The active application is the React/Vite frontend in `frontend/` and the Express API in `server/`. The root Python application and its utilities had no imports, scripts, or deployment entry points in the active Node app, so this cleanup removed `server.py`, `lead_finder_test.py`, `mail_autoresponder.py`, `test_limits.py`, and `requirements.txt`.

The frontend uses JavaScript and JSX. No source file imports `frontend/src/types.ts`, and no configured script runs TypeScript. This cleanup removed that unused type file and `tsconfig.json`, then removed `typescript`, `@types/react`, and `@types/react-dom` from the development dependencies and lockfile. This is a dependency cleanup, not a TypeScript conversion.

The root `server.js` remains as a hosting-compatible entry point. The `server/test/test_endpoints.js` compatibility entry remains because it runs the isolated workflow suite. All frontend components, deployment files, six legacy JSON datasets, local SQLite files, and `.env` remain in place. Generated `dist/` is still produced by `npm run build` and served by Express in production.

Verification before and after cleanup: `npm.cmd test` passed all 8 isolated tests, and `npm.cmd run build` succeeded. External provider behavior is outside these checks.
