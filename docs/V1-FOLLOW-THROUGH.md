# V1 Follow-Through

Follow-through priorities for the v1 release series. Current version: 1.0.5.

## Release Record

The original v1.0.0 was published on 2026-09-15 at source commit
`f23b8f77cb23f5fed50223081da7387a388cd624`.
Subsequent fixes were published as v1.0.1 and v1.0.2. Starting with v1.0.3,
Go is the sole supported installation method. Published tags and Go module
checksums remain immutable; future changes receive new versions.

## Ordered Work

1. Release validation: run real Terraform/OpenTofu plans without cloud access
   or apply; verify Go installation across supported operating systems and
   check the released module version after publication.
2. Discovery: a reproducible synthetic demo, current launch copy, Search
   Console verification/sitemap submission, and owner-selected community posts.
   Mark account-dependent work separately from repository changes.
3. Browser/accessibility automation: exercise the actual embedded app with
   Chromium, Firefox and WebKit; keyboard navigation, live-update focus,
   resource details, responsive layouts, and automated accessibility checks.
4. Lifecycle correctness: fixtures and explicit representations for data
   reads, import/move/forget, outputs, deferred plans, provider aliases and
   account/region uncertainty. No unsupported case should silently look unchanged.
5. Runtime/performance: filesystem-event bursts and cancellation, deterministic
   synthetic 1k/10k-resource benchmarks, and measured rendering limits before
   choosing virtualization or more specialized layouts.

Each workstream records the exact checks and remaining gaps in its PR. Passing
synthetic tests is not a claim of complete AWS/Terraform lifecycle parity.
