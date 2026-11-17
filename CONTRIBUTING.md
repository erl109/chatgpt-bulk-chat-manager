# Contributing

Bug reports, documentation improvements, and pull requests are welcome.

For bugs, include the extension version, Chrome version, interface language, account/workspace type, steps to reproduce, and expected/actual behavior. Include sanitized diagnostics when useful. Do not publish private conversation titles, account details, or credentials.

Use Node.js 24, run npm ci, then npm test and npm run check. Keep runtime dependencies and permissions minimal. Read ADAPTER_CONTRACT.md before changing identity or deletion logic. Add regression coverage for behavior changes, especially ambiguous selectors and uncertain deletion outcomes.

Live deletion tests must use only disposable conversations with explicit authorization. Never test with personal conversations. A passing DOM fixture does not prove compatibility with the current live interface; describe separately what was tested locally and in Chrome.

Do not bypass account checks, target chats by title alone, continue after an uncertain deletion, introduce private API calls, or collect telemetry. Contributions are licensed under this project's MIT license.
