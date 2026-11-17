# Adapter compatibility contract

The implementation targets the English Personal-account UI inspected on 2026-11-16. The initial universal safety lock has been replaced with runtime evidence checks. Unknown interfaces still fail closed.

## Identity evidence

Read only the public `@username` beside `button[aria-label="Edit username"]` in native Account settings. Return via the native Back to app link. In the profile account submenu require exactly one current item, named Personal account and marked `aria-current="true"`. Corroborate the username against the persistent profile marker. Never read account email, cookies, tokens, session responses, React internals, or bootstrap scripts.

The username is unique but mutable. Keys use `handle:@username` and `personal`, not a claimed immutable server ID. Fresh restoration therefore additionally requires a selected UUID already present in the active sidebar. No automatic migration after username changes. No team-workspace fallback.

## Target evidence

Require an exact conversation UUID in both the sidebar row attribute and its one conversation link. Require one Chat actions button in that same row. Require the native menu to be contained in that row and labelled by the specific action button. Reject active working chats, duplicate IDs, unknown paths and missing rows.

## Confirmation

Require the observed native Delete chat? dialog, its heading linkage, exact per-chat confirmation sentence, one known file-deletion checkbox and a Delete chat submit button. Uncheck file deletion. Recheck identity, ownership, selected membership, original row/link/button identity and cancellation before clicking. User input outside the addon is temporarily blocked during this sequence.

## Outcome

Wait for the native disabled pending row for this operation to appear and then disappear, with no remaining target UUID/dialog and no missing unrelated loaded IDs. This is conservative UI-based evidence, not a server receipt. Unknown outcomes stop the batch and preserve the selection. No automatic retry.

## Concurrency and lifecycle

Only one Chrome tab/document may own the addon at a time. The service worker serializes claim/read/write/release requests. Ownership is in `chrome.storage.session`, so worker suspension does not release it. Closing the owner tab releases it; reloading the same tab replaces the old document owner. Old documents cannot keep writing. No lease automatically expires while a native destructive action could still be pending.

## Remaining verification

The native single-chat deletion was inspected with explicit authorization. The installed extension batch, real Chrome restart, native logout and automatic reconnect have not yet been validated end to end. Update fixtures and run acceptance tests whenever ChatGPT changes the UI. Never claim compatibility based solely on matching a title or finding a generic Delete button.
