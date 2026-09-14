# Terradune Makeover Plan

## Product Direction

Terradune is a local review workspace for AWS Terraform plans. The first screen must answer: what changes, which resources are affected, and what those resources depend on? An inventory provides complete resource coverage; topology is an alternate lens, not the only way to find an asset.

The core workflow is: choose workspaces, review action counts, narrow by service or search, inspect configuration, and follow dependencies. Every resource has one canonical inventory entry identified by workspace plus Terraform address. Specialized network views may show a resource in context, but must not inflate inventory counts.

## Experience And Visual System

- **Plan:** a compact action summary, service navigation, workspace scope, changes-only filter, and a sortable resource register. Destructive actions sort first. Each entry exposes its address, service, action, and workspace without opening a panel.
- **Relationships:** a workspace-qualified dependency graph using ELK's routed edge sections. Arrowheads point from a dependent to its prerequisite. Selected resources expose a direct-neighbor view and a textual relationship list. Zoom and fit have keyboard-operable controls.
- **Network:** retain the existing specialized VPC/ELB map as a secondary view. The primary inventory must include glue resources, unknown AWS types, and resources that cannot be placed in a VPC.
- **Details:** one accessible inspector with configuration and relationships; current selection wins over delayed requests. Sensitive values are masked before they reach the browser. Unknown values remain distinct from empty values.
- **Identity:** a scalable Terradune mark built from layered terrain and connected nodes, paired with a readable wordmark. White and cool neutral surfaces, a deep green accent, and distinct status colors support long review sessions. Use the same mark for favicon, app header, and README.
- **Responsive behavior:** a compact service selector and resource rows on phones, a service rail and table on desktop, and a full-width inspector on narrow screens. No tiny scaled-down desktop diagrams as the default mobile experience.

## Architecture

Keep Go, embedded HTML/CSS/JavaScript, SSE, and the bundled ELK engine. Extract the new review surface and styles into embedded assets. Keep graph derivation pure and testable; keep filtering and selection explicit. Do not require a frontend build system merely to edit the interface.

Use a stable resource key `(workspace, address)` across views and a canonical inventory independent of display placement. Treat the Terraform plan as authoritative for actions and values. Type-specific adapters may enrich icons and summaries, but unknown types must still render, search, filter, and expose their full configuration and dependencies.

The server should ultimately provide a versioned plan envelope containing plan completeness, workspace state, action counts, provider identities, resource changes, outputs, diagnostics, and relationship provenance. All public endpoints must serialize sanitized data. Initial plans and live rebuilds should share one bounded scheduler with per-workspace coalescing.

## AWS And Terraform Coverage

"All AWS" must mean that new resource types do not require UI code changes. It must not imply that every service has a hand-crafted architecture diagram or that ambiguous dependencies can be invented.

| Capability | Delivery |
| --- | --- |
| Any managed resource type present in plan changes, including unrecognized types | Generic inventory and configuration inspector in this PR |
| AWS service classification | Optional presentation enrichment with a generic fallback |
| `count`, `for_each`, module addresses, multiple workspaces | Preserve full addresses; isolate workspace identity |
| Create, update, replace, destroy, unchanged | First-class review filters and ordering |
| Unknown and sensitive values | Preserve unknown markers; recursively mask sensitive detail values |
| Configuration and resolved-ID dependencies | Reuse current backend evidence; consume ELK routes without inventing graph edges |
| Provider aliases and multiple AWS regions/accounts | Dedicated metadata validation milestone; never assume the first provider configuration represents every resource |
| Data sources, read actions, imports, moved addresses, forgotten resources | Extend plan envelope and resource lifecycle model in the compatibility milestone |
| Output changes, checks, deferred/incomplete plans, drift | Extend plan envelope with explicit completeness and diagnostics before claiming feature parity |
| AWS Cloud Control (`awscc`) and future provider types | Generic inventory works by type; service scope/layout adapters require separate fixture coverage |

Terraform/provider versions and credentials still determine whether a plan can run. Terradune does not implement AWS APIs or apply plans. Full Terraform feature parity is an acceptance target for the compatibility milestone, not a claim based on rendering unknown resource types.

## Delivery Sequence

1. **Review foundation and identity, this PR.** Replace the default wall of nested cards with the canonical resource register; add service/workspace scope and changes-only filtering; preserve existing views; improve routed arrows and graph controls; sanitize details; add logo and rewrite README; migrate module and repository references to `albatroxxx`.
2. **Plan compatibility.** Introduce a versioned plan envelope and test fixtures for all lifecycle cases in the coverage table. Include data-source context, output changes, diagnostics, alias-aware metadata, and incomplete plan warnings. Publish a tested Terraform/AWS provider version matrix.
3. **Relationship trust and scale.** Label edge provenance, isolate all legacy map highlighting by workspace, coalesce SSE updates, serialize rebuilds, preserve selections through live updates, and add graph budgets and progressive expansion for large estates.
4. **Production quality.** Cross-platform browser CI, screen-reader checks, contrast audits, realistic 1k/10k-resource performance fixtures, API contract tests, cancellation/load tests, and release packaging for supported systems.

## Acceptance And Validation

- Every input managed resource appears exactly once in Plan, even when the type is unknown or the same address occurs in another workspace. Map-specific glue hiding must never affect Plan.
- Status, workspace, service, search, and changes-only filters compose predictably. Clearing filters restores the inventory. Destructive changes lead the default ordering.
- Keyboard users can navigate views, select a resource, open and close details, filter the list, and use graph zoom/fit. All icon-only actions have accessible names and tooltips.
- Dependency arrows use the layout engine's paths and terminate at prerequisites. Filtering does not create edges to absent resources. A delayed layout cannot replace a newer view.
- Sensitive values are redacted for the selected resource and related resources. Nested maps/lists and before/after changes are covered by tests.
- Screenshots at desktop/tablet/phone sizes show readable text and no unintended horizontal overflow. Capture baseline and updated Plan/Relationships views.
- Run Go tests, JavaScript behavior checks, `go vet`, and whitespace checks; record which security/browser checks ran and which remain in CI.
- The README includes the logo, installation and usage, accurate coverage boundaries, architecture, contribution/testing guidance, and no old account references.

## Risks And Tradeoffs

Generic coverage is more durable than an exhaustive list of bespoke AWS layouts, but service classification is presentation metadata and may need refinement. A large graph can be technically complete and visually useless; the inventory and a focused neighborhood must remain usable without laying out the entire estate. Terraform plans can contain secrets and incomplete knowledge, so redaction and explicit unknown states are part of correctness, not optional visual polish.
