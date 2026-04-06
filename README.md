# Service Catalog

Service Catalog is a lightweight Vite + React app for exploring a service dependency registry stored in YAML. The repository has two distinct outputs:

- a browser UI for graphing services, blast radius, upstream causes, and data flows
- a machine-readable schema for validating the registry format

## Files

- [`public/service_registry.yaml`](./public/service_registry.yaml): runtime-loaded registry data when present
- [`service_registry.schema.json`](./service_registry.schema.json): JSON Schema for the YAML registry
- [`src/App.tsx`](./src/App.tsx): typed React application
- [`src/main.tsx`](./src/main.tsx): Vite entrypoint

## Registry Model

The registry has four top-level sections:

- `metadata`: team ownership and maintainers
- `business_flows`: named business journeys such as `research_search`
- `data_flows`: ordered stage pipelines that show how data moves between services
- `services`: service definitions with upstream dependencies and ownership metadata

### Schema

- registry keys must use `snake_case`
- service `type` is one of `frontend`, `backend`, `datastore`, or `infrastructure`
- service `status` is one of `active`, `deprecated`, or `migrating`
- dependency `criticality` is `hard` or `soft`
- data-flow `action` is one of `produces`, `transforms`, `stores`, `indexes`, `enriches`, `caches`, `serves`, or `consumes`
- `last_updated` is an ISO date string

## Local Development

Install dependencies and start the Vite app:

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
```

The app entrypoint is [`index.html`](./index.html), which loads [`src/main.tsx`](./src/main.tsx). The UI imports the YAML registry directly through Vite's YAML plugin.

## Schema Usage

The repository includes a JSON Schema artifact for `service_registry.yaml`. Any schema-aware editor or CI validator that supports JSON Schema draft 2020-12 can use it.

Typical validation flow:

1. Load [`public/service_registry.yaml`](./public/service_registry.yaml) when present
2. Validate it against [`service_registry.schema.json`](./service_registry.schema.json)
3. Fail changes that introduce unsupported enum values, missing required fields, or invalid key shapes

This repo does not yet include a dedicated validation script, but the schema is ready to be used by CI or editor tooling.

## Notes

- The frontend is fully rewired to TypeScript.
- The app now tries to fetch `service_registry.yaml` at runtime. If it is missing or invalid, the browser UI opens an editor with live validation feedback.
- The schema is strict by design: unknown fields are rejected inside typed objects.
- Cross-reference integrity such as “every `business_flow` value must exist in `business_flows`” is documented by convention, but not enforced by plain JSON Schema in this version.
