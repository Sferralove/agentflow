// dashboard/src/data/mock.ts
import type { AgentEvent, AgentNode, AgentEdge, SessionGraph } from '../types'

let ts = 1715000000000
const t = (offset = 0) => ts += offset || 1000

export const MOCK_EVENTS: AgentEvent[] = [
  // ── PARENT SESSION: builder ──
  { type: 'session.created', id: 'p01', sessionId: 'session-builder', timestamp: t(0), agent: 'builder' },
  { type: 'tool.start', id: 'p02', sessionId: 'session-builder', timestamp: t(), agent: 'builder', tool: 'task', input: { subagent_type: 'frontend-dev', description: 'Build landing page with hero section' } },
  { type: 'tool.start', id: 'p03', sessionId: 'session-builder', timestamp: t(), agent: 'builder', tool: 'task', input: { subagent_type: 'backend-dev', description: 'Create REST API for user auth' } },
  { type: 'tool.start', id: 'p04', sessionId: 'session-builder', timestamp: t(), agent: 'builder', tool: 'task', input: { subagent_type: 'tester', description: 'Write E2E tests for login flow' } },
  { type: 'tool.start', id: 'p05', sessionId: 'session-builder', timestamp: t(), agent: 'builder', tool: 'task', input: { subagent_type: 'devops', description: 'Setup Docker + CI/CD pipeline' } },
  { type: 'tool.start', id: 'p06', sessionId: 'session-builder', timestamp: t(), agent: 'builder', tool: 'write', input: { filePath: 'README.md', description: 'Project documentation' } },
  { type: 'tool.end', id: 'p07', sessionId: 'session-builder', timestamp: t(), agent: 'builder', tool: 'write', duration: 200, output: 'README updated' },
  { type: 'tool.end', id: 'p08', sessionId: 'session-builder', timestamp: t(), agent: 'builder', tool: 'task', duration: 1100, output: 'frontend-dev assigned' },
  { type: 'tool.end', id: 'p09', sessionId: 'session-builder', timestamp: t(), agent: 'builder', tool: 'task', duration: 900, output: 'backend-dev assigned' },
  { type: 'tool.end', id: 'p10', sessionId: 'session-builder', timestamp: t(), agent: 'builder', tool: 'task', duration: 800, output: 'tester assigned' },
  { type: 'tool.end', id: 'p11', sessionId: 'session-builder', timestamp: t(), agent: 'builder', tool: 'task', duration: 700, output: 'devops assigned' },

  // ── CHILD 1: frontend-dev ──
  { type: 'session.created', id: 'f01', sessionId: 'session-frontend', timestamp: t(500), agent: 'frontend-dev' },
  { type: 'tool.start', id: 'f02', sessionId: 'session-frontend', timestamp: t(), agent: 'frontend-dev', tool: 'write', input: { filePath: 'src/pages/Landing.tsx', description: 'Landing page component' } },
  { type: 'tool.end', id: 'f03', sessionId: 'session-frontend', timestamp: t(), agent: 'frontend-dev', tool: 'write', duration: 350, output: 'Landing page created' },
  { type: 'tool.start', id: 'f04', sessionId: 'session-frontend', timestamp: t(), agent: 'frontend-dev', tool: 'edit', input: { filePath: 'src/pages/Landing.tsx', description: 'Add hero section with CTA' } },
  { type: 'tool.end', id: 'f05', sessionId: 'session-frontend', timestamp: t(), agent: 'frontend-dev', tool: 'edit', duration: 150, output: 'Hero section added' },
  { type: 'tool.start', id: 'f06', sessionId: 'session-frontend', timestamp: t(), agent: 'frontend-dev', tool: 'write', input: { filePath: 'src/components/Navbar.tsx', description: 'Responsive navbar' } },
  { type: 'tool.end', id: 'f07', sessionId: 'session-frontend', timestamp: t(), agent: 'frontend-dev', tool: 'write', duration: 250, output: 'Navbar component done' },
  { type: 'tool.start', id: 'f08', sessionId: 'session-frontend', timestamp: t(), agent: 'frontend-dev', tool: 'bash', input: { command: 'npm run build' } },
  { type: 'tool.end', id: 'f09', sessionId: 'session-frontend', timestamp: t(), agent: 'frontend-dev', tool: 'bash', duration: 1200, error: 'Build failed: Tailwind config missing' },
  { type: 'tool.start', id: 'f10', sessionId: 'session-frontend', timestamp: t(), agent: 'frontend-dev', tool: 'bash', input: { command: 'npx tailwindcss init && npm run build' } },
  { type: 'tool.end', id: 'f11', sessionId: 'session-frontend', timestamp: t(), agent: 'frontend-dev', tool: 'bash', duration: 800, output: 'Build succeeded' },

  // ── CHILD 2: backend-dev ──
  { type: 'session.created', id: 'b01', sessionId: 'session-backend', timestamp: t(300), agent: 'backend-dev' },
  { type: 'tool.start', id: 'b02', sessionId: 'session-backend', timestamp: t(), agent: 'backend-dev', tool: 'write', input: { filePath: 'src/routes/auth.ts', description: 'Auth routes: login, register, refresh' } },
  { type: 'tool.end', id: 'b03', sessionId: 'session-backend', timestamp: t(), agent: 'backend-dev', tool: 'write', duration: 500, output: 'Auth routes defined' },
  { type: 'tool.start', id: 'b04', sessionId: 'session-backend', timestamp: t(), agent: 'backend-dev', tool: 'write', input: { filePath: 'src/models/User.ts', description: 'User model with bcrypt' } },
  { type: 'tool.end', id: 'b05', sessionId: 'session-backend', timestamp: t(), agent: 'backend-dev', tool: 'write', duration: 300, output: 'User model created' },
  { type: 'tool.start', id: 'b06', sessionId: 'session-backend', timestamp: t(), agent: 'backend-dev', tool: 'edit', input: { filePath: 'src/middleware/auth.ts', description: 'Add JWT validation' } },
  { type: 'tool.end', id: 'b07', sessionId: 'session-backend', timestamp: t(), agent: 'backend-dev', tool: 'edit', duration: 200, output: 'JWT middleware added' },
  { type: 'tool.start', id: 'b08', sessionId: 'session-backend', timestamp: t(), agent: 'backend-dev', tool: 'bash', input: { command: 'npm test -- --coverage' } },
  { type: 'tool.end', id: 'b09', sessionId: 'session-backend', timestamp: t(), agent: 'backend-dev', tool: 'bash', duration: 600, output: 'Tests: 12/12 passing, coverage: 87%' },

  // ── CHILD 3: tester ──
  { type: 'session.created', id: 't01', sessionId: 'session-tester', timestamp: t(200), agent: 'tester' },
  { type: 'tool.start', id: 't02', sessionId: 'session-tester', timestamp: t(), agent: 'tester', tool: 'write', input: { filePath: 'test/e2e/login.test.ts', description: 'E2E login flow tests' } },
  { type: 'tool.end', id: 't03', sessionId: 'session-tester', timestamp: t(), agent: 'tester', tool: 'write', duration: 450, output: '5 test scenarios written' },
  { type: 'tool.start', id: 't04', sessionId: 'session-tester', timestamp: t(), agent: 'tester', tool: 'bash', input: { command: 'npx playwright test' } },
  { type: 'tool.end', id: 't05', sessionId: 'session-tester', timestamp: t(), agent: 'tester', tool: 'bash', duration: 3000, output: '3/5 passing, 2 flaky' },
  { type: 'tool.start', id: 't06', sessionId: 'session-tester', timestamp: t(), agent: 'tester', tool: 'edit', input: { filePath: 'test/e2e/login.test.ts', description: 'Fix flaky tests with retry' } },
  { type: 'tool.end', id: 't07', sessionId: 'session-tester', timestamp: t(), agent: 'tester', tool: 'edit', duration: 200, output: 'Added retries' },
  { type: 'tool.start', id: 't08', sessionId: 'session-tester', timestamp: t(), agent: 'tester', tool: 'bash', input: { command: 'npx playwright test --retries=2' } },
  { type: 'tool.end', id: 't09', sessionId: 'session-tester', timestamp: t(), agent: 'tester', tool: 'bash', duration: 2500, output: '5/5 passing' },

  // ── CHILD 4: devops ──
  { type: 'session.created', id: 'd01', sessionId: 'session-devops', timestamp: t(400), agent: 'devops' },
  { type: 'tool.start', id: 'd02', sessionId: 'session-devops', timestamp: t(), agent: 'devops', tool: 'write', input: { filePath: 'Dockerfile', description: 'Multi-stage Docker build' } },
  { type: 'tool.end', id: 'd03', sessionId: 'session-devops', timestamp: t(), agent: 'devops', tool: 'write', duration: 350, output: 'Dockerfile created' },
  { type: 'tool.start', id: 'd04', sessionId: 'session-devops', timestamp: t(), agent: 'devops', tool: 'write', input: { filePath: '.github/workflows/deploy.yml', description: 'CI/CD pipeline' } },
  { type: 'tool.end', id: 'd05', sessionId: 'session-devops', timestamp: t(), agent: 'devops', tool: 'write', duration: 300, output: 'GitHub Actions workflow ready' },
  { type: 'tool.start', id: 'd06', sessionId: 'session-devops', timestamp: t(), agent: 'devops', tool: 'bash', input: { command: 'docker build -t app:latest .' } },
  { type: 'tool.end', id: 'd07', sessionId: 'session-devops', timestamp: t(), agent: 'devops', tool: 'bash', duration: 4500, output: 'Image built: app:latest (234MB)' },
]

// Verify count
console.assert(MOCK_EVENTS.length >= 40, `Expected >=40 events, got ${MOCK_EVENTS.length}`)

export const MOCK_GRAPH: SessionGraph = {
  nodes: [
    { id: 'builder', name: 'Builder', type: 'main', status: 'completed', sessionId: 'session-builder', startedAt: 1715000000000, completedAt: 1715000200000, tasksCompleted: 5, tasksFailed: 0 },
    { id: 'frontend-dev', name: 'Frontend Dev', type: 'subagent', parentId: 'builder', status: 'completed', sessionId: 'session-frontend', startedAt: 1715000020000, completedAt: 1715000100000, tasksCompleted: 4, tasksFailed: 1 },
    { id: 'backend-dev', name: 'Backend Dev', type: 'subagent', parentId: 'builder', status: 'completed', sessionId: 'session-backend', startedAt: 1715000030000, completedAt: 1715000090000, tasksCompleted: 4, tasksFailed: 0 },
    { id: 'tester', name: 'Tester', type: 'subagent', parentId: 'builder', status: 'completed', sessionId: 'session-tester', startedAt: 1715000040000, completedAt: 1715000120000, tasksCompleted: 4, tasksFailed: 0 },
    { id: 'devops', name: 'DevOps', type: 'subagent', parentId: 'builder', status: 'completed', sessionId: 'session-devops', startedAt: 1715000050000, completedAt: 1715000150000, tasksCompleted: 3, tasksFailed: 0 },
  ],
  edges: [
    { id: 'edge_01', source: 'builder', target: 'frontend-dev', description: 'Build landing page' },
    { id: 'edge_02', source: 'builder', target: 'backend-dev', description: 'Create auth API' },
    { id: 'edge_03', source: 'builder', target: 'tester', description: 'E2E test suite' },
    { id: 'edge_04', source: 'builder', target: 'devops', description: 'Docker + CI/CD' },
  ],
}
