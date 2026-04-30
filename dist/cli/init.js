"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCommand = initCommand;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function initCommand(program) {
    program
        .command('init')
        .description('Initialize agent-flow in the current project')
        .option('--no-skill', 'Skip deploying agent-flow skill to project')
        .action(async (options) => {
        const configDir = path_1.default.join(process.cwd(), '.agent-flow');
        const configFile = path_1.default.join(configDir, 'config.json');
        if (!fs_1.default.existsSync(configDir)) {
            fs_1.default.mkdirSync(configDir, { recursive: true });
        }
        const config = {
            version: '0.1.0',
            dataDir: '.agent-flow/data',
            wsPort: 3001,
            createdAt: new Date().toISOString(),
        };
        fs_1.default.writeFileSync(configFile, JSON.stringify(config, null, 2));
        // Create data directory
        const dataDir = path_1.default.join(process.cwd(), config.dataDir);
        if (!fs_1.default.existsSync(dataDir)) {
            fs_1.default.mkdirSync(dataDir, { recursive: true });
        }
        // Deploy skill into project's .opencode/skills/ (auto-discovered by OpenCode)
        if (options.skill !== false) {
            const sourceSkill = path_1.default.resolve(__dirname, '../../skills/agent-flow/SKILL.md');
            const skillsDir = path_1.default.join(process.cwd(), '.opencode', 'skills', 'agent-flow');
            const targetSkill = path_1.default.join(skillsDir, 'SKILL.md');
            if (fs_1.default.existsSync(sourceSkill)) {
                fs_1.default.mkdirSync(skillsDir, { recursive: true });
                fs_1.default.copyFileSync(sourceSkill, targetSkill);
                console.log(`✓ Skill deployed to ${targetSkill}`);
            }
            else {
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
//# sourceMappingURL=init.js.map