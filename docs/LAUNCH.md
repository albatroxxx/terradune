# Launch And Discoverability

## Positioning

Terradune is a local Terraform plan visualizer for infrastructure engineers reviewing AWS changes. Docker or Go installation, real resource relationships, and a single resource register are the core story. Do not claim complete AWS/Terraform lifecycle parity, cloud-account discovery, guaranteed savings, or an official AWS/HashiCorp affiliation.

## Implemented SEO Foundation

- Crawlable static HTML on GitHub Pages, with unique titles/descriptions and canonical URLs for the overview, installation guide, and release page.
- A sitemap, meaningful headings, screenshot alternative text, social preview metadata, and factual SoftwareApplication JSON-LD without invented ratings.
- Locally hosted fonts and images, no analytics or tracking scripts, no JavaScript requirement for reading or navigation.
- README/site cross-links and repository description, homepage, and relevant topics.

Target useful queries naturally: "Terraform plan visualizer", "visualize Terraform AWS resources", "Terraform dependency graph", and "Terraform plan Docker UI". Write substantive examples and compatibility documentation instead of keyword-stuffed pages. A project-level `/terradune/robots.txt` would not control the host-root robots policy, so this project does not pretend otherwise.

## Owner Launch Checklist

The owner selected LinkedIn and will publish personally. Use the
[LinkedIn launch pack](LINKEDIN-LAUNCH.md) for copy, image alt text, and the
synthetic demo script. No post has been submitted by the agent.

1. Verify the URL-prefix property `https://albatroxxx.github.io/terradune/` in Google Search Console, then submit `https://albatroxxx.github.io/terradune/sitemap.xml`. Add the verification file or meta tag through a PR if required. No ranking or indexing guarantee is implied.
2. Inspect the social preview using the target platform's preview debugger after the site is live. Use only synthetic screenshots.
3. Publish a short demo of init, map, plan diff, and focused dependencies. Include installation and known boundaries.
4. Post selectively in communities that welcome project launches and disclose authorship. Ask a concrete question about review workflows; avoid repetitive promotion or unsolicited messages.
5. Track useful feedback: installation failures, unsupported lifecycle cases, time to first plan, and repeat usage. GitHub traffic is available to maintainers without adding visitor tracking to the site.

Guidance: [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), and [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## Announcement Draft

**Terradune v1.0.0: a local Terraform plan visualizer for AWS**

I built Terradune because a long `terraform plan` is hard to review spatially. It adds three views to an initialized workspace: Resource Map for AWS network context, Plan for a deduplicated resource register, and Graph for dependencies.

The first stable version runs with Docker or Go. It stays local, never runs apply, and uses Terraform's sensitivity metadata in displayed values. Terraform still needs your normal providers, backend access, and credentials.

Try it: https://albatroxxx.github.io/terradune/
Source and feedback: https://github.com/albatroxxx/terradune

It is not complete Terraform lifecycle parity yet. Imports, moves, data-source inventory, deferred plans, and larger-estate performance are next priorities. Which part of reviewing a plan is hardest in your workflow?

## Short Social Draft

Terradune v1.0.0 turns Terraform plans into an AWS Resource Map, a searchable resource register, and a dependency graph. Run it locally with Docker or Go. No hosted plan upload and no apply button. Installation, screenshots, and current limits: https://albatroxxx.github.io/terradune/

These are drafts, not a record of posts. Publish only after the release, anonymous Docker pull, and live site are verified.
