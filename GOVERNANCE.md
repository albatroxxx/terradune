# Governance

Terradune is an open-source project under the [Apache 2.0 licence](LICENSE).
This document says who decides what, how, and what happens if the one person
who can do most of it is unavailable.

## Roles

| Role | Who | Responsibilities |
|---|---|---|
| **Maintainer** | [@albatroxxx](https://github.com/albatroxxx) | Sets direction, the [makeover plan](docs/MAKEOVER.md) and the [follow-through list](docs/V1-FOLLOW-THROUGH.md); reviews and merges pull requests; cuts and publishes releases; triages security reports under [SECURITY.md](SECURITY.md); administers the repository; enforces the [code of conduct](CODE_OF_CONDUCT.md). |
| **Committer** | none yet | Reviews and merges pull requests in the areas they know; triages issues. Cannot change repository settings or publish releases. |
| **Contributor** | anyone | Opens issues and pull requests under [CONTRIBUTING.md](CONTRIBUTING.md). |

Maintainers and committers are listed here by GitHub handle. A change to this
table is a pull request like any other, approved by a maintainer.

## How decisions are made

- **Day-to-day changes** are pull requests. A pull request merges when the
  required `CI result` check is green on an up-to-date branch and a maintainer
  has reviewed it. The maintainer's own pull requests follow the same route
  and the same check; `main` accepts no direct pushes, and that rule applies to
  administrators too.
- **Design changes** (what Terradune draws, how it reads a plan, what the
  server exposes, how releases are made) start as an issue, so the reasoning
  is on the record before the code. The maintainer accepts or declines there,
  and says why.
- **Disagreements** are settled in the pull request or issue. If people still
  disagree, the maintainer decides, and says why in the thread.
- **Security reports** follow [SECURITY.md](SECURITY.md): a private advisory,
  a fix in the next release, credit unless the reporter prefers otherwise.
  The project promises no response time; it is run by volunteers.

## Becoming a committer or maintainer

A contributor with a record of reviewed, merged pull requests can be proposed
as a committer by a maintainer, in a pull request to this file. A committer
who has shown judgement on design and security can be proposed as a
maintainer the same way. Anyone who steps back moves to an emeritus line in
this file and loses write access.

## Continuity

Terradune has **one maintainer**, and the repository lives on that person's
GitHub account. That is a single point, and it is stated here rather than
hidden:

- Repository settings, branch protection, secrets, the GitHub Pages site, the
  OpenSSF Scorecard and Best Practices entries are administered by
  [@albatroxxx](https://github.com/albatroxxx) alone, with two-factor
  authentication on the account.
- Releases are cut from `main` by the Release workflow and need no private
  signing key: a stable version is a Git tag that Go's module proxy and
  checksum database record immutably. A published release keeps installing
  with `go install github.com/albatroxxx/terradune@vX.Y.Z` whether or not
  anyone is maintaining the project, because the proxy serves it, not this
  repository.
- Apache 2.0 lets anyone fork and continue the work under another module path.

A second maintainer would remove the single point. Until there is one, this
section is the honest description of the risk, and the pull-request-only
rule on `main` is what keeps the history reviewable by whoever comes next.

## Code of conduct

Everyone taking part follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
The maintainer enforces it.
