# Conventional commits

Write every commit subject as `<type>(<scope>): <summary>`, where `type` is one of
`feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `perf` or `chore`, and
`scope` names the package or area touched. Keep the summary in the imperative mood
and under 72 characters, with no trailing full stop.

Explain *why* in the body, not *what* — the diff already says what changed. Wrap the
body at 72 columns and separate it from the subject with a blank line.

Mark a breaking change with `!` after the scope (`feat(api)!: drop v1 endpoints`) and
repeat it as a `BREAKING CHANGE:` footer explaining the migration.

Never mix unrelated changes in one commit. If the summary needs the word "and", it is
probably two commits.
