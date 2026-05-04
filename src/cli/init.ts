import { Command } from 'commander';
import fs from 'fs';
import path from 'path';

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize agent-flow in the current project')
    .option('--no-skill', 'Skip deploying agent-flow skill to project')
    .option('--no-mcp', 'Skip adding MCP server config to opencode.json')
    .action(async (options) => {
      const configDir = path.join(process.cwd(), '.agent-flow');
      const configFile = path.join(configDir, 'config.json');

      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const config = {
        version: '0.1.0',
        dataDir: '.agent-flow/data',
        wsPort: 3001,
        createdAt: new Date().toISOString(),
      };

      fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

      // Create data directory
      const dataDir = path.join(process.cwd(), config.dataDir);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Deploy skill into .opencode/skills/agent-flow/ (auto-discovered by OpenCode)
      if (options.skill !== false) {
        const sourceSkill = path.resolve(__dirname, '../../skills/agent-flow/SKILL.md');
        const skillsDir = path.join(process.cwd(), '.opencode', 'skills', 'agent-flow');
        const targetSkill = path.join(skillsDir, 'SKILL.md');

        if (fs.existsSync(sourceSkill)) {
          fs.mkdirSync(skillsDir, { recursive: true });
          fs.copyFileSync(sourceSkill, targetSkill);
          console.log(`✓ Skill deployed to ${targetSkill}`);

          // Add permission to opencode.json
          const opencodeFile = path.join(process.cwd(), 'opencode.json');
          let opencodeConfig: Record<string, unknown> = {};

          if (fs.existsSync(opencodeFile)) {
            try {
              opencodeConfig = JSON.parse(fs.readFileSync(opencodeFile, 'utf-8'));
            } catch {
              console.log('Warning: Could not parse opencode.json');
            }
          }

          // Ensure permission.skill["agent-flow"] = "allow"
          const permission = (opencodeConfig.permission || {}) as Record<string, unknown>;
          const skillPerms = (permission.skill || {}) as Record<string, string>;
          if (skillPerms['agent-flow'] !== 'allow') {
            skillPerms['agent-flow'] = 'allow';
            permission.skill = skillPerms;
            opencodeConfig.permission = permission;
            delete opencodeConfig.$schema;
            fs.writeFileSync(opencodeFile, JSON.stringify(opencodeConfig, null, 2));
            console.log(`✓ Skill permission added to ${opencodeFile}`);
          }

          // Add startup instruction so Builder auto-loads the skill
          const instructionsDir = path.join(process.cwd(), '.opencode', 'instructions');
          const startupFile = path.join(instructionsDir, 'agent-flow.md');
          fs.mkdirSync(instructionsDir, { recursive: true });
          fs.writeFileSync(startupFile,
            'IMPORTANT: At the start of every session, load the agent-flow skill:\n' +
            '```\nskill({ name: "agent-flow" })\n```\n' +
            'This enables real-time monitoring of all agent activity in the dashboard.\n');
          console.log(`✓ Startup instruction created at ${startupFile}`);

          // Add instruction to opencode.json if not already present
          const instructions = Array.isArray(opencodeConfig.instructions) ? opencodeConfig.instructions as string[] : [];
          if (!instructions.includes(startupFile)) {
            instructions.push(startupFile);
            opencodeConfig.instructions = instructions;
            delete opencodeConfig.$schema;
            fs.writeFileSync(opencodeFile, JSON.stringify(opencodeConfig, null, 2));
            console.log(`✓ Startup instruction referenced in ${opencodeFile}`);
          }
        } else {
          console.log(`Warning: Skill source not found at ${sourceSkill}`);
        }
      }

      // Add MCP server config to opencode.json
      if (options.mcp !== false) {
        const opencodeFile = path.join(process.cwd(), 'opencode.json');
        let opencodeConfig: Record<string, unknown> = {};

        if (fs.existsSync(opencodeFile)) {
          try {
            opencodeConfig = JSON.parse(fs.readFileSync(opencodeFile, 'utf-8'));
          } catch {
            console.log('Warning: Could not parse opencode.json');
          }
        }

        // Add MCP server config
        const mcp = (opencodeConfig.mcp || {}) as Record<string, unknown>;
        if (!mcp['agent-flow']) {
          mcp['agent-flow'] = {
            type: 'local',
            command: ['npx', 'agent-flow-mcp'],
            enabled: true,
          };
          opencodeConfig.mcp = mcp;
          delete opencodeConfig.$schema;
          fs.writeFileSync(opencodeFile, JSON.stringify(opencodeConfig, null, 2));
          console.log(`✓ MCP server config added to ${opencodeFile}`);
        } else {
          console.log('MCP server already configured');
        }
      }

      console.log('');
      console.log('Agent Flow initialized!');
      console.log(`Config: ${configFile}`);
      console.log(`Data: ${dataDir}`);
      console.log(`Dashboard: http://localhost:3001`);
      console.log('');
      console.log('Next steps:');
      console.log('  1. Run: npx agent-flow serve');
      console.log('  2. Open http://localhost:3001 to view the dashboard');
      console.log('  3. Agents auto-log via the deployed skill');
    });
}
