# V1 Follow-Through

Implementation order requested by the owner; VERSION remains 1.0.0.

## Release Record

The original v1.0.0 was published on 2026-09-15 at source commit
`f23b8f77cb23f5fed50223081da7387a388cd624`.
Its public multi-platform Docker digest is
`sha256:d66184d4de139873d3a78fe72cb2829c9797f13181f4594d5d6ad2283fd6ce5e`.

The owner requested replacement after being informed that it is public.
Replacement must not be represented as a new immutable Go module version:
the public Go proxy/checksum database cannot be rewritten by this repository.
Record source commits, image digests, archive checksums, and the distribution
decision before any replacement. Never disable checksum verification to hide
a version collision.

## Ordered Work

1. Release validation: run real Terraform/OpenTofu plans without cloud access
   or apply; build, inspect, verify and execute native archives; test signing
   and installation before publication.
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
