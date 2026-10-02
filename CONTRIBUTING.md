# Contributing

Thanks for wanting to make seedr better. Bug reports, content suggestions for
the registry and code are all welcome.

## Reporting

- **A bug in the CLI or the site:** open an issue with the command you ran, your
  seedr version (`npx @danieldeusing/seedr --version`), your OS and Node version, and the full
  output.
- **Content for the registry:** open an issue that links the skill, agent, hook or
  MCP server and says which AI tools it is for.

## Changing the code

`main` cannot be force-pushed or deleted, and every pull request runs CI.

1. Fork the repository and create a branch.
2. Install and set up the hooks (Node 20+, pnpm):

   ```bash
   pnpm install
   pnpm bootstrap
   ```

3. Make the change. Keep it small and focused on one thing.
4. Run the checks CI runs:

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

5. A change in behaviour comes with a test that fails without it.
6. Open the pull request and describe what changed and why.

## Style

TypeScript, formatted and linted by the repository's ESLint setup. Match the code
around your change: its naming, its comments and its spacing.

By contributing you agree that your work is published under the
[MIT License](LICENSE).
