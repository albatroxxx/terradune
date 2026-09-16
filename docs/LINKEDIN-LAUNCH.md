# LinkedIn Launch Pack

Prepared for the owner to publish. No LinkedIn post has been submitted.

## Post Copy

Terraform tells me what will change. I also want to see how it connects.

I've been building Terradune, an open-source, local Terraform plan visualizer
for AWS infrastructure reviews.

It gives an initialized workspace three views:

- Resource Map: VPCs, subnets, route tables and gateways in context.
- Plan: a searchable resource register with create, update, replace and destroy states.
- Graph: dependencies, either across the plan or focused on one resource.

You can run it with Docker or Go. Terradune stays local, has no hosted
plan-upload service, and never runs terraform apply. Terraform still uses your
normal providers, credentials and backend.

The screenshots use a synthetic AWS workspace, not a real account.
Coverage is still evolving; this is not a claim of complete Terraform lifecycle
or AWS service parity.

Try it: https://albatroxxx.github.io/terradune/
Source and feedback: https://github.com/albatroxxx/terradune

Which part of reviewing a Terraform plan costs you the most time: understanding
the changes, finding dependencies, or spotting the blast radius?

#Terraform #AWS #OpenSource

## Images And Alt Text

Attach in this order, preserving the actual UI without cropping its navigation:

1. Resource Map: "Terradune Resource Map highlights a synthetic private subnet,
   its VPC, route table, NAT gateway and EC2 instances. Tabs read Resource Map,
   Plan and Graph."
2. Plan: "Terradune Plan lists synthetic AWS resources with service filters,
   action counts and workspace information. Plan is the second tab."
3. Graph: "A focused Terradune Graph connects an API target attachment to an EC2
   instance, its security group and its private subnet. Graph is the third tab."

The local delivery folder is `outputs/linkedin-launch/` in the task workspace.
It includes the three JPEGs and this copy. Re-capture after visible UI changes.

## 60-Second Demo Script

Run from a checkout, not an actual cloud workspace:

```sh
terraform -chdir=examples/platform init
go run . -refresh=false -port 8398 examples/platform
```

Initialization downloads the provider when not cached. The example uses
synthetic state and disabled refresh; no apply or real cloud account is needed.

| Time | Screen | Narration |
| --- | --- | --- |
| 0-8s | Resource Map, full navigation visible | "This is a synthetic AWS workspace. Terradune turns its Terraform plan into three connected views." |
| 8-22s | Pin `platform-private-us-east-1a` | "The map shows the subnet in context, with its route table, NAT gateway and instances. Pin a path to follow the connections." |
| 22-36s | Plan; search `aws_instance.api` | "The Plan register keeps each resource in one place. Search an address and review its action and configuration." |
| 36-50s | Open that row's relationship button | "Graph focuses on the resource and its direct dependencies, so a larger plan is easier to inspect." |
| 50-60s | Return to Resource Map | "Run it locally with Docker or Go. It never applies changes. Installation and current limitations are on the project website." |

Record the actual screen transitions. Do not imply this unchanged synthetic
example demonstrates a destructive plan or a live AWS account. If a recorded
demo has no audio, include this narration as captions or accompanying text.

## Publication Checks

- Recheck installation links and the advertised release immediately before posting.
- Do not advertise OpenTofu/native archives as published until the corresponding artifacts are verified.
- Add the alt text above to each image in LinkedIn.
- Use one authentic post; do not send unsolicited promotional messages.
- Save the eventual post URL here only after the owner publishes it.
