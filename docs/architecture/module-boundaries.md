# Module dependency boundaries

The application follows an inward dependency direction:

```text
routes / UI -> server composition -> infrastructure -> application -> domain
                                      |                 |
                                      +------ shared ---+
```

- `domain/` contains business rules and has no provider or framework dependencies.
- `application/` contains use cases and ports. It may depend on its own domain and on public, provider-neutral shared APIs. Configuration is injected; application services never read `process.env` or `import.meta.env`.
- `infrastructure/` implements application ports and may use provider SDKs. It may depend inward on application/domain code.
- Routes and UI are delivery adapters. Routes call services exposed by server composition; they do not construct provider SDK clients.
- A module exposes browser-safe contracts from `src/modules/<module>/index.ts` and server-only adapters from `src/modules/<module>/server.ts`.
- Consumers must import another module through one of those public entry points. Deep imports into another module's `application/`, `domain/`, or `infrastructure/` folders are forbidden.
- Client-capable files must not import `*.server.*` files or a module's `/server` entry point. API route files are server-capable delivery adapters.
- Client-capable files must not directly import server-only packages such as Firebase Admin, Node built-ins, Nodemailer, or LangChain/OpenAI server integrations.
- API route files must not import provider/orchestration packages or Node DNS directly; those dependencies belong in server composition or infrastructure adapters.

Run `npm run architecture:check` locally. The command prints every violation as
`path:line [rule] explanation (import: specifier)` and exits non-zero. Fixture tests
for deliberate violations run with `npm run test:architecture`. Both commands run
in CI.
