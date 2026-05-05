#!/usr/bin/env bun
// src/cli.ts — AgentFlow v2 CLI

import { startServer, stopServer } from './server.js'
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PID_FILE = '.agentflow/pid'
const PLUGIN_SRC = resolve(__dirname, 'plugin.ts')
const PLUGIN_DEST = '.opencode/plugins/agentflow.ts'

const cmd = process.argv[2]
const port = parseInt(process.argv[3] || process.argv[4] || '3001', 10)

function isRunning(): boolean {
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10)
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  switch (cmd) {
    case 'serve': {
      if (isRunning()) {
        console.log('[agentflow] Server already running')
        return
      }
      startServer(port)
      await new Promise(() => {})
      break
    }

    case 'stop': {
      if (!isRunning()) {
        console.log('[agentflow] No server running')
        return
      }
      try {
        const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10)
        process.kill(pid, 'SIGTERM')
        console.log('[agentflow] Server stopped')
      } catch (e) {
        console.error('[agentflow] Failed to stop server:', e)
      }
      break
    }

    case 'status': {
      console.log(isRunning() ? 'running' : 'stopped')
      break
    }

    case 'init': {
      mkdirSync('.agentflow/sessions', { recursive: true })
      mkdirSync('.opencode/plugins', { recursive: true })

      if (existsSync(PLUGIN_SRC)) {
        copyFileSync(PLUGIN_SRC, PLUGIN_DEST)
        console.log('[agentflow] Plugin installed to .opencode/plugins/agentflow.ts')
      } else {
        const pluginContent = `// AgentFlow v2 plugin — see https://github.com/Sferralove/agentflow
export { AgentFlowPlugin } from '@agentflow/plugin'`
        writeFileSync(PLUGIN_DEST, pluginContent)
        console.log('[agentflow] Plugin stub installed. Add @agentflow/plugin to .opencode/package.json dependencies.')
      }

      const gitignore = '.gitignore'
      const entry = '.agentflow/'
      if (existsSync(gitignore)) {
        const content = readFileSync(gitignore, 'utf-8')
        if (!content.includes(entry)) {
          writeFileSync(gitignore, (content.trimEnd() + '\n' + entry + '\n'))
        }
      } else {
        writeFileSync(gitignore, entry + '\n')
      }

      console.log('[agentflow] Initialized. Run `agentflow serve` to start.')
      break
    }

    default: {
      console.log(`AgentFlow v2
Usage:
  agentflow init              Initialize project
  agentflow serve [port]      Start server (default :3001)
  agentflow stop              Stop server
  agentflow status            Check if server is running`)
      break
    }
  }
}

main().catch(console.error)
