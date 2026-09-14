# terradune

**Terraform, drawn.** One command turns any Terraform codebase into a clear
diagram of what it will create — and what already exists.

[![CI](https://github.com/AsysGupta/terradune/actions/workflows/ci.yml/badge.svg)](https://github.com/AsysGupta/terradune/actions/workflows/ci.yml)
[![Go Reference](https://pkg.go.dev/badge/github.com/AsysGupta/terradune.svg)](https://pkg.go.dev/github.com/AsysGupta/terradune)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Every commit is gated on `gosec`, `staticcheck`, `govulncheck` and `semgrep`,
plus `go vet` and the test suite. See [Security scanning](#security-scanning).

---

## What it does

`terradune <path>` plans every initialized Terraform workspace beneath a path
and serves a live architecture diagram at `localhost:8383`. Edit the Terraform
and the page updates itself.

The main view is a **resource map** modelled on the AWS VPC console: one panel
per VPC, with columns for the VPC, its subnets grouped by availability zone,
route tables, and network connections. Everything else in the VPC is listed
beside it, grouped by resource type.

Load balancers get a map of their own, laid out the way the ELB console lays
one out: the balancer, the listeners, the rules that choose between target
groups, the groups, and what is actually behind them. Listing those five types
side by side cannot say which rule reaches which group, which is the only
question worth asking of a load balancer.

- **Status at a glance.** Each card is coloured by what the plan will do to it:
  green to create, blue already exists, amber to change, orange to replace, red
  to destroy. The status is written on the card too, so it does not depend on
  colour alone.
- **Hover to trace a path.** Pointing at a subnet shows the VPC that holds it,
  the route table it is associated with, and the gateway that route table
  reaches. Pointing at an instance shows its interfaces, volumes, security
  groups and subnet.
- **Click to lock it.** A single click holds the path on screen so it stays put
  while you scroll across it. Click the card again, click the empty map, or
  press Escape to let go.
- **Double-click for the detail.** The full attribute set as the plan sees it,
  with unknown values shown the way Terraform prints them and a before/after
  diff where something changes, plus what attaches to the resource and what it
  depends on.
- **Review mode.** A tally per workspace, a chip per status to filter by, and a
  search across addresses, types, names, CIDRs and zones.

### It draws only what the plan states

Where Terraform does not record which instance a dependency points at,
terradune draws nothing rather than guessing. A drawn arrow reads as a fact, so
it has to be one.

Before anything is applied that is a real limit. A load balancer whose subnets
are chosen inside a `local` does not gain an arrow to every subnet in the VPC,
because the plan genuinely does not know which until apply.

Once infrastructure exists, the limit mostly lifts — and this is the case real
codebases are in. An applied resource carries the ids of the things it is
attached to: a subnet_id whose value is some subnet's id **is** that subnet,
however the configuration routed it there. That source does not care whether
the value passed through a local, a module output, or a variable, and it
answers at the level of the individual instance, which is the level the diagram
draws at.

**terradune never applies anything.** It runs `terraform plan`, `terraform
show` and `terraform graph`, all read-only.

## Install

```sh
go install github.com/AsysGupta/terradune@latest
```

Requires Go 1.27+ and the `terraform` binary on your `PATH`.

## Use

```sh
# one workspace
terradune ./infra

# a directory of them — every initialized workspace beneath it is drawn
terradune ./environments

# a workspace that needs variables
terradune -var-file prod.tfvars -var region=eu-west-2 ./infra
```

Then open the address it prints. The workspace must be initialized: run
`terraform init` first, and make sure credentials are available the same way
Terraform expects them (`AWS_PROFILE`, SSO, environment variables).

### Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `-port` | `8383` | Port for the local server |
| `-var-file` | — | Variable file to pass to Terraform; repeatable |
| `-var` | — | Variable as `name=value`; repeatable |
| `-refresh` | `false` | Refresh state before planning: slower, and reaches the provider |
| `-print` | `false` | Print the inventory and dependency graph once, without serving |
| `-version` | — | Print the version and exit |

## How it works

1. **Plan.** `terraform plan` runs in each workspace and `terraform show -json`
   turns the result into structured data. The plan is the single source for
   what exists, what will change, and every attribute value.
2. **Graph.** `terraform graph -plan` supplies the dependency graph. This
   matters because plan JSON contains no `locals` at all, so any wiring that
   passes through one is invisible to reference resolution — which is most of
   it in modular code.
3. **Resolve.** Dependencies are traced through variables, module inputs and
   outputs, and data sources. An edge is drawn only where the instance is not
   in doubt: the copy inside the same module instance, or a resource that has
   just one.
4. **Read the ids.** For anything that already exists, the attributes settle
   what the configuration could not. Every id and ARN in the plan is matched
   back to the resource that owns it, and any resource carrying one of those
   values is connected to it. This is where most of a real diagram's
   relationships come from.
5. **Serve.** The diagram is a single self-contained binary — layout engine,
   fonts and icons are all embedded, so it works offline. Changes to `.tf`
   files re-plan only the workspace that owns the changed file, and the result
   is pushed to the browser over server-sent events.

Icons are hand-drawn in the AWS category colours rather than Amazon's own icon
set, which keeps the binary self-contained with no redistribution question.

## Security scanning

Open-source tooling only, on every pull request, every merge to `main`, and
weekly so vulnerability databases are re-checked without a commit.

| Tool | What it covers |
| --- | --- |
| [gosec](https://github.com/securego/gosec) | Insecure patterns in Go; results also uploaded as SARIF |
| [staticcheck](https://staticcheck.dev/) | Correctness and misuse the compiler does not catch |
| [govulncheck](https://go.dev/blog/govulncheck) | Known vulnerabilities reachable from this code's call paths |
| [semgrep](https://semgrep.dev/) | Go, JavaScript and secret-detection rulesets, run locally with no account |

Run them yourself:

```sh
go vet ./... && go test -race ./...
gosec ./... && staticcheck ./... && govulncheck ./...
semgrep scan --config p/golang --config p/javascript --config p/secrets --exclude=examples
```

## Examples

| Example | What it is for |
| --- | --- |
| `examples/simple` | A workspace with no AWS in it at all |
| `examples/vpc` | A VPC planned from nothing: every id "known after apply" |
| `examples/ec2` | Instances, volumes and a load balancer |
| `examples/platform` | 35 resources across two AZs, with an ALB — **already applied** |
| `examples/layered` | A network module and an app module wired through a `local` — **already applied** |
| `examples/estate` | Two VPCs and 39 AWS services, 116 resources — **already applied** |

The last three ship with state, so they plan as infrastructure that already
exists. That is the case that matters most and the hardest one to get hold of,
because an apply needs an account. `examples/tools/fakeapply.py` gets there
offline instead: plan, write the result back as state inventing the ids only a
provider could assign, and plan again, until the plan is empty.

```sh
examples/tools/fakeapply.py examples/platform
```

A handful of services cannot be reached this way: CloudFront, Step Functions
and DynamoDB all call AWS while planning a resource that is already in state,
so no invented state will satisfy them. The tool stops when the state stops
changing and names anything the provider insists on replanning.

## Testing

The Go packages are covered by unit tests over real Terraform plan fixtures.
The browser page is covered too: its own script runs headlessly under
JavaScriptCore against those fixtures with a stubbed DOM, so the layout,
path tracing, filtering and pinning are all asserted rather than assumed.
That test skips where no JavaScriptCore shell is available.

```sh
go test ./...
```

## Status and limitations

Working today: AWS VPC topology, multi-workspace scanning, live reload,
resource detail, filtering and search.

Known limitations:

- Before a workspace is applied, wiring through `locals` is only recoverable
  from Terraform's graph, which is transitively reduced and names resources
  rather than instances. Which of several subnets an instance will sit in is
  not knowable then, and is not drawn.
- A resource that exists but is managed elsewhere — a VPC consumed as a data
  source, say — is not a node, so nothing is grouped under it.
- Only AWS networking and load balancing have a bespoke layout. Other
  providers' resources are listed and connected, but not arranged into a
  topology.

Planned: reading applied state so resources can be matched by their real IDs,
and reading the live account to show drift and resources Terraform does not
manage.

## Contributing

Issues and pull requests are welcome. CI must be green, which means the tests,
`go vet`, `gofmt`, and all four scanners above.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
