# ChatGPT Bulk Chat Manager

A free, open-source Chrome extension for selecting and deleting ChatGPT conversations through the native ChatGPT interface. Built for community use: no ads, subscriptions, analytics, or hosted backend.

**Independent community project. Not affiliated with or endorsed by OpenAI.**

## Install

1. Download this repository using **Code → Download ZIP**, then extract it.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Open or refresh [ChatGPT](https://chatgpt.com) and sign in normally.
5. Click **Connect** in the addon panel. Keep the tab active while account verification runs. If automatic connection cannot open the profile menu, use **Connect manually** and follow the panel prompts.

No build step, API key, Node.js, or paid addon subscription is needed to use it. When updating, replace the files, reload the extension at `chrome://extensions`, then refresh ChatGPT.

## Select and delete

- Use the checkboxes beside sidebar conversations. Selected rows have a checked box, colored background, and side marker.
- Review selected titles in the panel; use **×** to remove an individual selection.
- **Select All Visible** selects only rows visible in the sidebar viewport. **Deselect All** clears the current account's selections.
- Run **Dry Run** first to check the selected conversations without deleting anything.
- Click **Delete Selected**, review the titles and IDs, acknowledge permanent deletion, and confirm.
- Deletion runs one conversation at a time. **Stop** or Escape prevents further actions but cannot undo a submitted deletion.

**Deletion is permanent.** If the result is uncertain, the addon stops and retains the selection. Check ChatGPT before retrying: the conversation may already have been deleted. The addon turns off the native optional file-deletion checkbox before confirming a chat deletion.

## Connection and saved selections

Login stays on ChatGPT. **Reconnect addon automatically** remembers permission to verify the account again; it cannot keep an expired ChatGPT session alive. **Disconnect addon** disables automatic reconnect without signing out of ChatGPT. **Log out of ChatGPT** requests native logout; complete any confirmation shown by ChatGPT.

Selections are stored locally by public username and Personal workspace. Restoring them requires a saved conversation to be loaded in the sidebar as an additional account check. If prompted, scroll history to load one and reconnect. Changing your username creates a separate selection scope.

Only one tab controls the addon at a time. Close or disconnect it before using another tab. Do not switch ChatGPT accounts in another tab while a deletion batch runs.

## Compatibility and limitations

Version **1.0.8** targets the English ChatGPT **Personal account** interface inspected in November 2026. Other languages, Business/Enterprise/Edu workspaces, and different layouts are not verified. ChatGPT interface updates may break compatibility; ambiguous or unsupported states stop operations.

The addon checks exact conversation IDs, row/menu ownership, native confirmation dialogs, and observed deletion transitions. These are UI checks, not an independent server-side audit. Conversations must be loaded in the sidebar to be verified.

The project owner reported the installed extension working on 17 November 2026. Automated tests cover the adapter, selection engine, storage broker, and failure cases; this is not a claim of broad browser compatibility. See [TESTING.md](TESTING.md) for coverage and remaining acceptance checks.

## Privacy

No chat messages, passwords, cookies, API keys, or authentication tokens are collected. The addon stores selected conversation IDs/titles and account scope locally, plus connection preferences. It sends no data to the developer and uses no private ChatGPT API. See [PRIVACY.md](PRIVACY.md).

Permissions are restricted to `storage` and `https://chatgpt.com/*`. Runtime code is packaged JavaScript, CSS, and HTML; there are no runtime npm dependencies.

## Development

Use Node.js 24 (tested):

```sh
npm ci
npm test
npm run check
```

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

- `src/core.js`: selection persistence and sequential operations.
- `src/adapter.js`: native account, menu, and dialog verification.
- `background.js` and `src/client.js`: storage broker and tab ownership.
- `content.js`, `src/ui.js`, and `styles.css`: page controls and lifecycle.
- `popup.*`: extension popup.

Contributions and bug reports are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [ADAPTER_CONTRACT.md](ADAPTER_CONTRACT.md). Do not include private chat content or account details in public issues.

## License

[MIT](LICENSE). Free to use, modify, and share. This project has no monetization; the MIT license also allows others to reuse it commercially.
