# Contributing

## Setup

```bash
git clone <repo>
cd agent-flow-plugin
npm install
```

## Development

Build: `npm run build`
Test: `npm test`
Lint: `npm run lint`

Tests use `node:test` + `tsx` — no test framework dependency.

## Project structure

```
src/
├── index.ts              # Plugin factory (AgentFlowPlugin)
├── types.ts              # Shared types + Logger interface
├── plugin-container.ts   # Instance-level mutable state
├── util/
│   ├── id.ts             # generateId()
│   └── guards.ts         # Runtime type guards
├── hooks/
│   ├── session.ts        # session.created/idle/error
│   ├── tool.ts           # tool.execute.before/after
│   └── message.ts        # message.updated
├── store/
│   └── index.ts          # PluginStore (atomic JSON I/O)
└── tools/
    └── index.ts          # agentflow_events/sessions/stats
```

## Making changes

1. Write the failing test first (TDD)
2. Implement the minimal change
3. Run `npm test` — all 39 must pass
4. Run `npm run lint` — zero errors
5. Run `npm run build` — clean compile
6. Commit with Conventional Commits format

## Code standards

- TypeScript strict mode
- No `any` (use `unknown` + type guards)
- No bare `as` casts (use type guards from `src/util/guards.ts`)
- No module-level mutable state (use `PluginContainer`)
- Node 18+ compatibility

## Publishing

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Tag: `git tag v<version> && git push origin v<version>`
4. CI publishes automatically via GitHub Actions
