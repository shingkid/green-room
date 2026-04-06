# Green Room

Green Room is a lightweight Vite + React service catalog and dependency explorer built for small teams. It pairs a browser-first UI with a JSON Schema for the registry so you can validate service metadata, upstream links, and data flows without the ops overhead of a bigger platform.

## What’s in this repo

- `public/service_registry.yaml`: optional registry data loaded when present
- `service_registry.schema.json`: draft-2020-12 JSON Schema for the registry format
- `src`: typed Vite + React app with split domains/features/shared modules
- `src/main.tsx`: Vite entrypoint

## Registry model

Top-level sections you can edit in `service_registry.yaml`:

- `metadata`: team display name (`metadata.team`), canonical identifier (`metadata.team_id`), maintainers, and last-updated date
- `business_flows`: named journeys, used for tagging services and data flows
- `data_flows`: ordered stage pipelines with `service`, `action`, `format`, and optional `notes`
- `services`: definitions with `type`, `status`, optional `owner`, `upstream` dependencies, and business-flow tags

Schema constraints:

- keys use `snake_case`, enums match the supported sets (`type`, `status`, `action`, `criticality`, etc.)
- services may declare extra fields, but required fields must exist
- `metadata.team_id` is used everywhere to tell whether a service is team-owned
- downstream references are validated in-app (see below)

## Validation and references

Validation happens in two tiers:

1. JSON Schema checks structural correctness and primitive enums.
2. `src/domain/registry.ts` runs `validateCrossReferences(...)` to ensure every `business_flow` reference (in service tags or `data_flows`) exists in `business_flows`, every upstream `service` exists, and every `data_flow` stage references a known service.

When runtime registry data is missing or invalid, the app opens the editor pane that runs this validation live and keeps the draft in `localStorage`.

## Development

Install dependencies and start the Vite dev server:

```bash
npm install
npm run dev
```

Create production build:

```bash
npm run build
```

## Project structure & design notes

- `src/App.tsx` is the composition root; it keeps theme/local-storage state, loads the registry via `loadInitialRegistrySource()`, saves drafts, and switches between the editor and catalog views.
- `src/domain/` contains the pure registry/catalog logic (types, schema validation, graph helpers, Mermaid export helpers) so the views stay focused on presentation.
- `src/features/` holds screen modules (`catalog`, `editor`). Each feature imports its own CSS Module.
- `src/shared/` exposes reusable UI helpers (`SearchableSelect`, `Badge`, `Tag`) plus browser utilities (`downloadTextFile`).
- Theme tokens and resets live in `src/styles/{tokens,base}.css`; other styles are CSS Modules colocated with the consuming component to prevent global breakage.

### Guidance for contributors

- For UI tweaks, edit the relevant component under `src/features` or `src/shared/components` and adjust its CSS Module.
- For new registry validation/browser logic, update `src/domain/registry.ts` so the rules stay testable and reusable.
- Keep shared tokens in `src/styles/tokens.css` and base layout in `src/styles/base.css`; avoid touching global CSS as much as possible.
- Run `npm run build` before merging to ensure the typed modules and CSS Modules compile.

## Schema usage

Use the JSON Schema for editor or CI validation:

1. Load `public/service_registry.yaml` if present (or paste your own registry into the editor during development).
2. Run it through `service_registry.schema.json`.
3. If the schema passes, the UI still checks cross references via `validateCrossReferences(...)` in `src/domain/registry.ts`.

The schema is ready for integration into CI—even though there’s no dedicated script in this repo yet, you can point tools such as `ajv` or editor extensions to `service_registry.schema.json`.
