# Test coverage and acceptance status

## Executed

- Native ChatGPT Personal-account UI inspected on 2026-11-16: account settings public unique username, selected Personal account marker, exact UUID row attribute, per-row menu ownership and native deletion dialog.
- A disposable test chat created and deleted via browser controls after separate explicit permission. File deletion was disabled. Other loaded chats remained.
- Automated tests: core manager, DOM-backed adapter, serialized background broker, manifest/syntax/forbidden API checks. Run `npm.cmd test` for the current exact test count.

The native test did not run the extension content script. On 2026-11-17 the project owner reported the installed extension working correctly after the 1.0.8 fix. This user report does not verify every scenario below; detailed acceptance checks remain pending where marked.

| Requested scenario | Automated coverage | Chrome acceptance |
|---|---|---|
| Single/multiple selection | Minimal-field persistence, deduplication | Pending |
| Individual deselection / Deselect All | Correct remaining IDs and empty storage | Pending |
| Select All Visible | Clipping and visible-ID input | Pending |
| Refresh / Chrome restart / restore | New manager and persisted mock storage, scoped witness | Pending |
| Navigation / dynamic rows / scroll | Fresh DOM discovery, href/row validation | Pending |
| Dry Run | Shared verification, zero removals and writes | Pending |
| Cancel confirmation | Missing/changed authorization rejected | Dialog keyboard acceptance pending |
| Deletion errors | Wrong title, wrong proof, account switch, unknown outcome, cancellation | Native success inspected; failures pending |
| Successful deletion / storage cleanup | Actual adapter executes native DOM fixture flow; core cleans IDs | Native single-chat flow inspected; addon batch pending |
| Unselected protection | Only authorized UUIDs targeted; unaffected fixture IDs retained | Other loaded native chats retained in one test |
| Account/workspace change | Scope isolation, profile mismatch, current-account checks | Only Personal account inspected |
| Identical titles | Separate UUIDs processed in sequence | Pending |
| Unexpected UI structure | Missing/duplicate row, unknown dialog, malformed UUID rejected | Pending |
| Multiple tabs / worker restart | Ownership, serialization, stale-document rejection, close handling | Pending |

## User acceptance after reloading extension

1. Reload the extension at chrome://extensions, then refresh ChatGPT.
2. Connect while using the English interface and Personal account. Account settings should briefly open and return. Confirm selectable checkboxes.
3. Select disposable chats; run Dry Run; check cancellation, selection count, deselection and scrolling.
4. Refresh, then close/reopen Chrome with automatic reconnect enabled. Verify saved selections return after identity verification. Load a saved UUID into the sidebar if restoration asks for a witness.
5. Verify a second tab cannot take ownership; disconnect/close the first, then connect the second.
6. Test only explicitly authorized disposable chats for live deletion. Review every title and UUID. Never use personal conversations for testing.
7. Check stopped/uncertain operations manually before retrying. Do not switch accounts in another tab during a batch.
8. Test Disconnect separately from Log out. Finish any native logout confirmation. Verify the next open requires native login if ChatGPT ended the session.
