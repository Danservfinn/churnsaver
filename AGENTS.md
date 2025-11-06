# Agents Handbook: pnpm + Turbo Monorepo with Vite, TypeScript, ESLint, Vitest

## Overview
This handbook is for engineers working in a pnpm + Turbo monorepo using Vite, TypeScript, ESLint, and Vitest. It covers how to navigate packages, run tasks fast with filters, add or modify packages, keep CI green, and follow repository conventions.

- Monorepo orchestration: Turbo tasks and caching via [turbo.json](turbo.json)
- Workspace management: pnpm filters and linking via [pnpm-workspace.yaml](pnpm-workspace.yaml)
- Type/ESLint config sharing: tsconfig and linting bases via [tsconfig.base.json](tsconfig.base.json)
- CI plans: workflows in [.github/workflows](.github/workflows)

Note: If a referenced file doesn’t exist in this repo, treat the example as guidance. In this repository, an existing package is [apps/web](apps/web). Example package names below use web, api, and shared-ui.


## Quick start
Prerequisites
- Node 18+ (LTS recommended)
- pnpm 8+
- Optional: Redis/Postgres/etc. if your package needs them

Install
```bash
# From repo root
pnpm install
```

Run your first task
```bash
# Discover a package location fast
pnpm dlx turbo run where web

# Run tests across all packages
pnpm turbo run test

# Run tests for one package
pnpm turbo run test --filter web
```

Key files to know
- Workspace: [pnpm-workspace.yaml](pnpm-workspace.yaml)
- Turbo pipeline: [turbo.json](turbo.json)
- Base TS config: [tsconfig.base.json](tsconfig.base.json)
- CI plans: [.github/workflows](.github/workflows)
- Example package manifest: [apps/web/package.json](apps/web/package.json)


## Repository map (navigate with Turbo)
Use Turbo to jump directly to a package instead of scanning directories.

Examples
```bash
# Print the path of a package named "web"
pnpm dlx turbo run where web

# Another package (example)
pnpm dlx turbo run where api
```

Example output
```
web -> apps/web
api -> apps/api
shared-ui -> packages/shared-ui
```

Where to look for configuration
- Turbo pipeline and tasks: [turbo.json](turbo.json)
- Workspace globs and membership: [pnpm-workspace.yaml](pnpm-workspace.yaml)
- Base TypeScript config: [tsconfig.base.json](tsconfig.base.json)
- CI definitions: [.github/workflows](.github/workflows)


## Dev environment tips
- Jump to a package path quickly:
  ```bash
  pnpm dlx turbo run where web
  ```
- Add a package to the workspace context (ensure pnpm sees it and installs its graph):
  ```bash
  pnpm install --filter web
  ```
  Tip: Make sure your new package directory matches globs in [pnpm-workspace.yaml](pnpm-workspace.yaml) (e.g., apps/*, packages/*).
- Scaffold a new React + Vite + TypeScript package with TypeScript checks ready:
  ```bash
  pnpm create vite@latest web -- --template react-ts
  ```
- Confirm the package name is correct inside its package manifest. Check name in the package’s [package.json](apps/web/package.json) (example link), and skip editing the top‑level [package.json](package.json) if present.
- CI plan lives under [.github/workflows](.github/workflows).
- Run every check defined for a package:
  ```bash
  pnpm turbo run test --filter api
  ```
- From a package root, you can call:
  ```bash
  pnpm test
  ```
- Focus on one failing test:
  ```bash
  pnpm vitest run -t "adds two numbers"
  ```
- Fix tests and type errors until the entire suite is green.
- After moving files or changing imports, re‑lint with a filter to catch ESLint + TS issues:
  ```bash
  pnpm lint --filter shared-ui
  ```
- Add or update tests for any code you change, even if nobody asked.
- PR title format: [web] Improve routing
- Always run:
  ```bash
  pnpm lint
  pnpm test
  ```
  before committing.


## Testing
Global test runs
```bash
# All packages according to turbo pipeline
pnpm turbo run test
```

Single package
```bash
pnpm turbo run test --filter web
```

Single file (from repo root, pass args through to Vitest)
```bash
pnpm turbo run test --filter web -- --run apps/web/test/webhooks.test.js
```

Single test by name (pattern)
```bash
pnpm vitest run -t "adds two numbers"
```

From a package directory
```bash
cd apps/web
pnpm test
```

Keep it green
- Fix any test or type errors until the suite passes.
- If snapshots are used, update explicit snapshots only when intentional (see FAQ).


## Linting and typechecking
ESLint (auto‑fix where safe)
```bash
# All packages that define the lint task
pnpm turbo run lint

# One package
pnpm lint --filter web

# Try auto-fix (if your lint script supports --fix)
pnpm lint --filter web -- --fix
```

TypeScript typecheck
```bash
# If you have a "typecheck" task in turbo.json or package scripts
pnpm turbo run typecheck

# One package
pnpm turbo run typecheck --filter shared-ui

# Direct tsc usage from a package
cd packages/shared-ui
pnpm exec tsc --noEmit
```

Pro tips
- After refactors (file moves, import changes), run both lint and typecheck with filters to catch path mapping issues quickly.
- Ensure base config is extended correctly from [tsconfig.base.json](tsconfig.base.json).


## Continuous Integration (CI)
Where
- Workflows live in [.github/workflows](.github/workflows). For example: [.github/workflows/prd-deploy-migration.yml](.github/workflows/prd-deploy-migration.yml).

What CI runs (typical)
- Install with pnpm
- Build (if defined)
- Lint (ESLint)
- Typecheck (tsc)
- Test (Vitest)
- Optional: affected‑only runs with Turbo, cache restore/save

Reproduce CI locally
```bash
# Run the same task graph locally
pnpm turbo run lint typecheck test

# Or for just the package you touched
pnpm turbo run lint typecheck test --filter web
```

Caching (high level)
- Turbo’s pipeline caching: configured in [turbo.json](turbo.json). Restores artifacts across tasks to avoid rework.
- pnpm store caching: deduplicated content‑addressable store. Inspect with:
  ```bash
  pnpm store path
  pnpm store prune
  ```
- If you suspect stale cache:
  ```bash
  # Turbo cache reset (local)
  rm -rf .turbo

  # pnpm reinstall
  rm -rf node_modules && pnpm install
  ```


## Commands reference
Common, copy‑pasteable commands

Navigation and discovery
```bash
pnpm dlx turbo run where web
pnpm dlx turbo run where api
pnpm dlx turbo run where shared-ui
```

Install and workspace linking
```bash
pnpm install
pnpm install --filter web
```

Testing
```bash
pnpm turbo run test
pnpm turbo run test --filter api
pnpm vitest run -t "adds two numbers"
# From a package directory
pnpm test
```

Linting and types
```bash
pnpm turbo run lint
pnpm lint --filter shared-ui
pnpm turbo run typecheck --filter web
```

Scaffold a new package
```bash
pnpm create vite@latest web -- --template react-ts
```

One‑off examples
```bash
# Run only a single test file through Turbo
pnpm turbo run test --filter web -- --run apps/web/test/webhooks.test.js

# See package path, then cd
pnpm dlx turbo run where web
cd apps/web
```


## Adding or modifying packages
Goal: scaffold a new React + Vite + TypeScript package and wire it into the workspace.

1) Create the package
```bash
# Creates a new React + Vite + TypeScript app
pnpm create vite@latest web -- --template react-ts
```

2) Ensure workspace membership
- Place the new folder under a path matched by [pnpm-workspace.yaml](pnpm-workspace.yaml) (e.g., apps/* or packages/*).
- If needed, update [pnpm-workspace.yaml](pnpm-workspace.yaml) globs to include your folder.

3) Set the package name
- Open the package’s [package.json](apps/web/package.json) (example link) and set a clear, unique "name" (e.g., "web"). Skip editing the top‑level [package.json](package.json) if it exists.

4) Install in the workspace
```bash
# Make sure pnpm recognizes and installs the package graph
pnpm install --filter web
```

5) Wire scripts (recommended in the package’s package.json)
- Add scripts like:
  - "dev": "vite"
  - "build": "vite build"
  - "preview": "vite preview"
  - "lint": "eslint ."
  - "test": "vitest run"
  - "typecheck": "tsc --noEmit"

6) Link internal dependencies (workspace protocol)
```bash
# From the consumer package root (example: web)
pnpm add @acme/shared-ui@workspace:*    # Use your actual scope/name
```

7) Verify setup
```bash
# From repo root with Turbo
pnpm turbo run lint typecheck test --filter web

# Or from the package directory
cd apps/web
pnpm dev
pnpm lint
pnpm test
pnpm build
```

8) Ensure Vite/ESLint/TS see it
```bash
# Run a filtered install to ensure the package graph is materialized
pnpm install --filter web
```

9) Commit only when clean
```bash
pnpm lint && pnpm test
```


## Environment variables
Where to put them
- Use .env files colocated at the package or repo root:
  - .env, .env.local, .env.development, .env.test, .env.production
- Never commit real secrets. Use example templates and local overrides.
- If present, consult repo‑specific templates (e.g., [apps/web/production/env.production.template](apps/web/production/env.production.template)).

Vite prefix rule
- Vite only exposes variables prefixed with VITE_ to the client.
- Example:
  - In .env:
    ```
    VITE_API_BASE_URL=https://api.example.com
    ```
  - In your client code, read it via import.meta.env.VITE_API_BASE_URL.

Security
- Do not log secrets or tokens.
- Prefer environment‑specific .env files and a template committed to the repo for onboarding (without actual secrets).


## Conventions
Package naming
- Use short, lowercase names like web, api, shared-ui.
- For scopes, follow @org/package patterns consistently.

Files and imports
- Use kebab‑case for file and directory names.
- Keep import ordering: external deps, internal workspace deps, absolute aliases, then relative paths.
- Avoid deep relative paths; prefer path aliases configured via [tsconfig.base.json](tsconfig.base.json).

Tests
- Co-locate tests under a package test/ directory or next to the module with .test.ts(x).
- Prefer descriptive test names and small, focused files.

Code style
- Follow ESLint and Prettier rules as configured by the repo.
- Keep modules focused and small; avoid cyclic dependencies.
- Add or update tests for any code you change.


## Pull Request instructions
Branch names
- feature/web-improve-routing
- fix/api-retry-headers
- chore/shared-ui-storybook

Commit best practices
- Small, focused commits with imperative subjects: "fix: handle 429 retry-after"
- Keep commits lint- and test‑clean locally.

PR titles
- Format: [package] Title
- Example: [web] Improve routing

Required checks to merge
- CI green (lint/typecheck/test/build as applicable)
- PR includes tests for changed behavior
- No remaining ESLint or TypeScript errors

Local pre‑commit routine
```bash
pnpm lint
pnpm test
```

PR scope
- Include a short summary of changes and any migration or env var notes.
- Link to impacted packages via Turbo where output if helpful.


## Troubleshooting
Missing workspace membership
- Symptom: package not found by Turbo or pnpm.
- Fix:
  - Ensure the path matches globs in [pnpm-workspace.yaml](pnpm-workspace.yaml).
  - Run: pnpm install --filter <your-package>.

pnpm filter surprises
- Symptom: commands run against more or fewer packages than expected.
- Fix:
  - Use explicit names: --filter web
  - Or scoped patterns: --filter ./apps/web
  - Verify with: pnpm dlx turbo run where web

TypeScript path mapping errors
- Symptom: "Cannot find module" after refactors.
- Fix:
  - Ensure base paths/aliases in [tsconfig.base.json](tsconfig.base.json) are correct.
  - Re-run: pnpm turbo run typecheck --filter <pkg>
  - Clear build artifacts if needed.

Turbo cache confusion
- Symptom: stale results or tasks not re-running.
- Fix:
  ```bash
  rm -rf .turbo
  pnpm install
  pnpm turbo run test --filter <pkg>
  ```

Port conflicts
- Symptom: Vite dev server won’t start due to EADDRINUSE.
- Fix:
  - Kill the process holding the port or change Vite port via env (e.g., VITE_PORT=5174).

Failed to produce response
- Symptom: Failed to parse apply_diff XML: Failed to parse XML
- Fix:
    - Break down the current task into smaller steps


## Checklists
Before you push
- [ ] Run pnpm lint
- [ ] Run pnpm test (or pnpm turbo run test --filter <pkg>)
- [ ] Update or add tests for your changes
- [ ] Ensure env vars are not leaked or committed

Before you merge
- [ ] PR title format: [package] Title (e.g., [web] Improve routing)
- [ ] CI green (lint/typecheck/test/build)
- [ ] Reviewed by a teammate when required
- [ ] No TODOs that block shipping


## FAQ
How do I run only affected packages?
```bash
# If your turbo.json defines an affected pipeline, you can filter by changed
pnpm turbo run test --filter ...[HEAD^]
```
Tip: Adjust the filter strategy to your team’s conventions.

How do I run all checks for just one package?
```bash
pnpm turbo run lint typecheck test --filter web
```

How do I skip snapshot updates?
```bash
# Run tests normally (no snapshot updates)
pnpm vitest run
```
To update snapshots intentionally:
```bash
pnpm vitest -u
```

How do I add a dependency to a single package?
```bash
# From repo root or the package directory
pnpm add <dep>@<version> --filter web
```

How do I confirm the right package name?
- Open the package’s [package.json](apps/web/package.json) (example link) and check the "name" field. Skip the top‑level [package.json](package.json).

Where is the CI plan?
- In [.github/workflows](.github/workflows). For an example workflow, see [.github/workflows/prd-deploy-migration.yml](.github/workflows/prd-deploy-migration.yml).