# Privacy

This extension runs locally in Chrome on chatgpt.com. It has no developer-operated server, advertising, analytics, tracking, or remote code loading.

## Data used locally

- Public ChatGPT username and Personal workspace marker to scope and verify a connection.
- Selected conversation UUIDs and titles in Chrome local extension storage.
- Reconnect preferences and session/tab ownership state.
- Native page structure and UI state to find, verify, and operate the selected conversation controls.

The extension does not collect conversation messages, email addresses, passwords, cookies, API keys, or authentication tokens. It does not use Chrome Sync storage or transmit stored selections to the project maintainer. Native actions on ChatGPT still communicate with ChatGPT under that service's own policies.

Deselect All clears the current account's saved selection. Disconnect disables reconnect but does not erase saved selections. Removing the extension removes its Chrome-managed extension storage.

## Permissions

- storage: retain local selections and connection/session state.
- https://chatgpt.com/*: inject controls and communicate with ChatGPT tabs.

No all-sites, cookies, webRequest, or debugger permission is requested.

## Diagnostics and reports

Show diagnostics reports interface counts and state flags. Review anything before posting publicly. Screenshots can reveal account details and conversation titles: crop or redact them. Never post cookies, tokens, credentials, or private chat content.
