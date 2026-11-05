# Community release readiness

The common repository must use the same fictional newsletter example in its README, optional installer sample and empty-workspace action. New installations remain empty. Preserve all existing user data and the legacy setup option when upgrading. Personal hosting/client configuration is outside this task.

1. Reproduce installer and HTTP failures for the newsletter example and for a previously created, edited legacy sample.
2. Replace the studio-specific runtime fixture with the validated newsletter export. Keep legacy entry points as compatibility aliases; do not reset existing samples or their mutation history.
3. Update browser fixtures, contributor/install documentation and deployment ignores. Preserve public MCP/export contracts.
4. Run typecheck, lint, all local tests, production build/privacy and the production browser suite. Check a real previous-version upgrade using the existing acceptance command.
5. Obtain one fresh read-only review of this change, address Important findings, publish the patch, and verify GitHub CI. Report supported scope and unverified platforms/clients explicitly.
