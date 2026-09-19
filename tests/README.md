# Tests

Plain Node, no test framework and nothing to install:

```bash
node tests/merge.test.js    # how two devices' copies are reconciled
node tests/sync.test.js     # two devices against a fake GitHub API
node tests/parse.test.js    # natural-language entry parsing
node tests/plan.test.js     # plan generation for a given competition date
```

`merge` and `sync` exit non-zero on failure, so they work in CI as-is.
`parse` and `plan` print their output for reading.

`sync.test.js` stands up a fake GitHub Contents API and drives two independent
"devices", each with its own localStorage, through the cases that actually bite:
both editing offline, a write landing between another device's read and write
(a real 409), deletions propagating without resurrecting, and a queued offline
write flushing later. It also asserts the token never reaches the published file.
