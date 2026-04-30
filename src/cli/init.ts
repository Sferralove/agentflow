import { Command } from 'commander';
import fs from 'fs';
import path from 'path';

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize agent-flow in the current project')
    .option('--no-skill', 'Skip deploying agent-flow skill to project')
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

      // Deploy skill into project and configure opencode.json
      if (options.skill !== false) {
        const sourceSkill = path.resolve(__dirname, '../../skills/agent-flow/SKILL.md');
        const targetSkill = path.join(configDir, 'SKILL.md');

        if (fs.existsSync(sourceSkill)) {
          // Copy skill into project's .agent-flow/ directory
          fs.copyFileSync(sourceSkill, targetSkill);
          console.log(`✓ Skill deployed to ${targetSkill}`);

          // Configure opencode.json
          const opencodeFile = path.join(process.cwd(), 'opencode.json');
          let opencodeConfig: { instructions?: string[] } & Record<string, unknown> = {};

          if (fs.existsSync(opencodeFile)) {
            try {
              opencodeConfig = JSON.parse(fs.readFileSync(opencodeFile, 'utf-8'));
            } catch {
              console.log('Warning: Could not parse opencode.json');
            }
          }

          const instructions: string[] = Array.isArray(opencodeConfig.instructions)
            ? opencodeConfig.instructions
            : [];

          if (!instructions.includes(targetSkill)) {
            instructions.push(targetSkill);
            opencodeConfig.instructions = instructions;
            // Remove $schema to avoid version-check errors from opencode.ai
            delete opencodeConfig.$schema;
            fs.writeFileSync(opencodeFile, JSON.stringify(opencodeConfig, null, 2));
            console.log(`✓ Skill referenced in ${opencodeFile}`);
          }
        } else {
          console.log(`Warning: Skill source not found at ${sourceSkill}`);
        }
      }

      console.log('');
      console.log('Agent Flow initialized!');
      console.log(`Config: ${configFile}`);
      console.log(`Data: ${dataDir}`);
      console.log(`Dashboard: http://localhost:3000`);
      console.log('');
      console.log('Next steps:');
      console.log('  1. Run: npx agent-flow serve');
      console.log('  2. Open http://localhost:3000 to view the dashboard');
      console.log('  3. Agents auto-log via the deployed skill');
    });
}
