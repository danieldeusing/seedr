---
paths:
  - packages/cli/**/*.ts
---

# CLI Package Conventions

## Command Structure

Commands live in `src/commands/`, each exporting a function that registers with Commander:

```typescript
// src/commands/add.ts
import { Command } from 'commander'

export function registerAddCommand(program: Command) {
  program
    .command('add <name>')
    .description('Add a skill, agent, or hook')
    .option('-t, --type <type>', 'Content type')
    .action(async (name, options) => {
      // Implementation
    })
}
```

## Entry Point

`src/cli.ts` is the CLI entry point:

```typescript
#!/usr/bin/env node
import { program } from 'commander'
import { registerAddCommand } from './commands/add'

program.name('seedr').version('0.1.0')
registerAddCommand(program)
program.parse()
```

## Handler Pattern

Content-type-specific logic lives in `src/handlers/`:

```typescript
// src/handlers/skill.ts
export async function installSkill(name: string, targetPath: string) {
  // Download/copy skill file
  // Write to target location
}
```

## User Feedback

Use consistent patterns for CLI output:

```typescript
import chalk from 'chalk'
import ora from 'ora'

// Progress spinners
const spinner = ora('Installing skill...').start()
spinner.succeed('Skill installed')
spinner.fail('Failed to install')

// Status messages
console.log(chalk.green('✓'), 'Added skill:', name)
console.log(chalk.red('✗'), 'Error:', message)
console.log(chalk.dim('Hint:'), 'Try running with --verbose')
```

## Error Handling

```typescript
try {
  await installSkill(name, path)
} catch (error) {
  if (error instanceof SkillNotFoundError) {
    console.error(chalk.red('Skill not found:'), name)
    process.exit(1)
  }
  throw error  // Re-throw unexpected errors
}
```

## Testing Commands Locally

```bash
# From packages/cli/
tsx src/cli.ts add my-skill
tsx src/cli.ts list --type skills
tsx src/cli.ts init
```
