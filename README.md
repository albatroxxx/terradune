<img src="internal/server/assets/logo.svg" alt="Terradune logo" width="64" height="64">

# Terradune

**Review Terraform plans as resources and relationships.**

Terradune turns initialized Terraform workspaces into a local plan review interface. See what will be created, changed, replaced, or destroyed; inspect configuration; and follow the dependencies behind each resource.

[![CI](https://github.com/albatroxxx/terradune/actions/workflows/ci.yml/badge.svg)](https://github.com/albatroxxx/terradune/actions/workflows/ci.yml)
[![Go Reference](https://pkg.go.dev/badge/github.com/albatroxxx/terradune.svg)](https://pkg.go.dev/github.com/albatroxxx/terradune)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

![Terradune expanded Resource Map](docs/review/after-resource-map-expanded.png)

## Start Reviewing

Requires Go 1.27+, Terraform on your `PATH`, and an initialized workspace.

```sh
go install github.com/albatroxxx/terradune@latest
terradune ./infra
```

Open the printed local URL, normally `http://localhost:8383`. Run `terraform init` in the workspace first. Provider credentials and inputs work the same way they do with Terraform, including AWS profiles, SSO, and environment variables.

```sh
# Scan initialized workspaces beneath a directory.
terradune ./environments

# Supply plan inputs.
terradune -var-file prod.tfvars -var region=eu-west-2 ./infra

# Use a different local port.
terradune -port 8484 ./infra
```

Terradune never runs `terraform apply`. It runs `plan`, `show`, and `graph`; planning can contact providers and data sources. Refresh is off by default. The HTTP server binds to localhost.

## Three Views, One Plan

### Resource Map

The default view groups VPCs, subnets, route tables, gateways, and load balancers by their infrastructure roles. Resources can appear in more than one contextual placement here; those placements do not duplicate the Plan inventory.

Pin a resource to keep its path highlighted, or use its details button. Solid green arrows follow the network path; dashed blue lines indicate direct associations. Connections route around card headers and remain visible when columns stack. Pins and paths stay within their workspace. The legend groups resource actions and connection styles.

The **Expand view** control hides the header and filters to give the active map, plan, or graph more room. **Restore view** brings them back without clearing the current filters or pin. Escape closes details, then the legend, then a pinned path, then restores an expanded view.

### Plan

The resource register lists each managed resource once per workspace, including route associations and unfamiliar resource types. Destructive changes sort first. Filter by action, service, workspace, or search; enable **Changes only** to hide unchanged resources.

Open a resource to inspect its configuration, attached resources, and dependencies. Updated and replaced resources show before/after values. Terraform's unknown values remain marked as known after apply. Sensitive detail values are masked using Terraform's sensitivity metadata, including nested objects and lists.

### Graph

Open the relationship action on a resource for its direct dependency neighborhood, or use the full graph. Resource identity includes the workspace, so identical addresses in separate environments remain distinct. Arrowheads point **from the dependent to its prerequisite**; ELK supplies the routed paths.

Zoom and fit controls are available above the graph. Graph nodes can be focused and opened with Enter or Space. With the graph focused, arrow keys pan, `+`/`-` zoom, and `0` fits the graph.

## Coverage

| Area | Current behavior |
| --- | --- |
| Managed resource types | Generic Plan rows and configuration for every type emitted in resource changes; no AWS allowlist |
| AWS services | Service groups and icons where recognized; unknown AWS and AWS Cloud Control types retain a generic fallback |
| Resource instances | Full `count`, `for_each`, and module addresses retained |
| Actions | Create, update, replace, destroy, unchanged |
| Relationships | Configuration references, Terraform DOT dependencies, and matching resolved IDs/ARNs |
| Workspaces | Scan initialized directories, filter scope, and receive live plan updates |
| Network layout | Specialized AWS VPC and load-balancer views |

**Generic type coverage is not complete Terraform feature parity.** Data sources are currently followed as reference paths rather than shown as inventory entries. Imports, moves, output changes, deferred plans, and alias-aware account/region metadata need explicit lifecycle support. The [makeover plan](docs/MAKEOVER.md) defines that compatibility work and its acceptance criteria.

Terradune does not invent an instance-level relationship when a plan cannot identify it. Ambiguous dependencies through locals or multiple instances may remain absent before apply. Resources managed outside the scanned plans are not discovered from the AWS account.

## Flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `-port` | `8383` | Local HTTP port |
| `-var-file` | none | Terraform variable file; repeatable |
| `-var` | none | Terraform `name=value` input; repeatable |
| `-refresh` | `false` | Refresh state before planning |
| `-print` | `false` | Print inventory and dependencies once, without serving |
| `-version` | false | Print the version and exit |

## Architecture

```text
Terraform plan / show / graph
             |
           ingest           workspace discovery and plan execution
             |
           graph            resource identity, dependencies, metadata, details
             |
           server           localhost JSON endpoints and SSE snapshots
             |
    Resource Map / Plan / Graph
```

`internal/watch` observes Terraform source edits. The browser, fonts, logo, service glyphs, and ELK engine are embedded in the Go binary; the UI needs no CDN or JavaScript build step. The new review surface is separated into `assets/review.js` and `assets/review.css`.

Service glyphs are project-authored category icons, not official AWS architecture icons. The Terradune mark combines stacked terrain with connected nodes and is shared by the app, favicon, and this README.

## Development

```sh
git clone https://github.com/albatroxxx/terradune.git
cd terradune
terraform -chdir=examples/platform init
go run . examples/platform
```

| Example | Scenario |
| --- | --- |
| `examples/simple` | Non-AWS resources |
| `examples/vpc` | New VPC resources with unknown IDs |
| `examples/ec2` | Instances, volumes, and load balancing |
| `examples/platform` | 35 resources across two AZs with an ALB |
| `examples/layered` | Network and application modules wired through locals |
| `examples/estate` | A broad, multi-VPC AWS estate |

The last three include **synthetic** applied state generated by `examples/tools/fakeapply.py`; they are not snapshots of a real AWS account. Some providers still contact AWS during planning, even with refresh disabled.

## Testing And Security

```sh
go test ./...
go test -race ./...
go vet ./...
```

Frontend behavior checks execute the real scripts against plan fixtures using JavaScriptCore or Node.js. CI installs Node and fails if no JS runtime is available, so frontend checks are not silently skipped on Linux. Browser verification and before/after screenshots are recorded in the [review report](docs/review/README.md).

CI also runs `gosec`, `staticcheck`, `govulncheck`, and Semgrep. Passing local unit tests is not a substitute for those scans. See [the workflow](.github/workflows/ci.yml).

Plan files may contain sensitive data. The details endpoint masks values marked sensitive by Terraform; unmarked secrets cannot be identified automatically. Display metadata still needs the additional hardening described in the review report. Keep Terradune on localhost and use synthetic plans when publishing screenshots.

## Contributing

Start with the [makeover plan](docs/MAKEOVER.md) and [prioritized review findings](docs/review/README.md). Add fixtures for new Terraform lifecycle behavior and preserve generic rendering for unfamiliar resource types. Changes should pass tests, formatting, and CI scans.

## License

Apache License 2.0. See [LICENSE](LICENSE).
