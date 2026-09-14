#!/usr/bin/env python3
"""Give a Terraform example a state file, without ever touching a cloud.

terradune's hard case is infrastructure that already exists: every id is a
real value, so relationships can be read straight out of the attributes. A
plan of an empty workspace never looks like that -- everything is "known after
apply" -- which is why examples need state to be worth testing against.

Applying for real needs an account. Instead this walks to the same place:

  1. plan the workspace against whatever state exists so far,
  2. write the planned result back as state, inventing the ids that only a
     provider could have assigned,
  3. plan again -- references that pointed at an unknown id now resolve to the
     invented one, so the next round knows strictly more,

repeating until the plan is empty. That fixpoint is a state file Terraform
itself agrees is already applied.

Usage: examples/tools/fakeapply.py <workspace-dir> [--rounds N]
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile

# How the ids of each resource type are spelled. Getting the shape right
# matters: terradune matches a subnet_id against a subnet's id, so "subnet-..."
# has to look like a subnet everywhere it appears.
ID_PREFIX = {
    "aws_vpc": "vpc",
    "aws_subnet": "subnet",
    "aws_internet_gateway": "igw",
    "aws_egress_only_internet_gateway": "eigw",
    "aws_nat_gateway": "nat",
    "aws_eip": "eipalloc",
    "aws_route_table": "rtb",
    "aws_route_table_association": "rtbassoc",
    "aws_security_group": "sg",
    "aws_network_interface": "eni",
    "aws_instance": "i",
    "aws_vpc_endpoint": "vpce",
    "aws_vpc_peering_connection": "pcx",
    "aws_ec2_transit_gateway": "tgw",
    "aws_ec2_transit_gateway_vpc_attachment": "tgw-attach",
    "aws_network_acl": "acl",
    "aws_vpn_gateway": "vgw",
    "aws_customer_gateway": "cgw",
    "aws_ebs_volume": "vol",
    "aws_ami": "ami",
}

# Resources whose id is their ARN, which is how the ELB v2 API identifies them.
ARN_AS_ID = {
    "aws_lb": ("elasticloadbalancing", "loadbalancer/app"),
    "aws_lb_target_group": ("elasticloadbalancing", "targetgroup"),
    "aws_lb_listener": ("elasticloadbalancing", "listener/app"),
    "aws_lb_listener_rule": ("elasticloadbalancing", "listener-rule/app"),
}

ACCOUNT = "123456789012"


def digest(address, width=17):
    """A stable pseudo-random suffix, so re-running produces the same state."""
    return hashlib.sha256(address.encode()).hexdigest()[:width]


def fake_id(address, rtype, region):
    if rtype in ARN_AS_ID:
        service, kind = ARN_AS_ID[rtype]
        return f"arn:aws:{service}:{region}:{ACCOUNT}:{kind}/{digest(address, 8)}"
    if rtype in ID_PREFIX:
        return f"{ID_PREFIX[rtype]}-0{digest(address, 16)}"
    return digest(address, 20)


def fake_arn(address, rtype, region, resource_id):
    if rtype in ARN_AS_ID:
        return resource_id
    service = rtype.split("_")[1] if rtype.startswith("aws_") else "aws"
    kind = rtype[4:] if rtype.startswith("aws_") else rtype
    return f"arn:aws:{service}:{region}:{ACCOUNT}:{kind}/{resource_id}"


def unknown_keys(after_unknown):
    """Top-level attributes the provider has not computed yet."""
    if not isinstance(after_unknown, dict):
        return set()
    return {k for k, v in after_unknown.items() if v is True}


def index_key(address):
    """0 from aws_subnet.public[0], "a" from aws_subnet.public["a"]."""
    if not address.endswith("]"):
        return None
    raw = address[address.rfind("[") + 1:-1]
    if raw.startswith('"'):
        return raw.strip('"')
    try:
        return int(raw)
    except ValueError:
        return raw


def run(cmd, cwd):
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} failed:\n{proc.stdout}\n{proc.stderr}")
    return proc.stdout


def load_schemas(workdir):
    """Per resource type: its state version, and the type of every attribute.

    The types matter. A computed attribute left null in state reads as "not
    known yet", so Terraform plans a change to compute it -- and where the
    attribute forces replacement, the resource is destroyed and recreated and
    its id goes unknown again, which is exactly the fixpoint never closing.
    Writing the empty value of the right type instead says "computed, and
    there is nothing there", which is both true and settled.
    """
    raw = json.loads(run(["terraform", "providers", "schema", "-json"], workdir))
    schemas = {}
    for provider in (raw.get("provider_schemas") or {}).values():
        for rtype, schema in (provider.get("resource_schemas") or {}).items():
            block = schema.get("block") or {}
            schemas[rtype] = {
                "version": schema.get("version", 0),
                "attributes": {
                    name: spec.get("type")
                    for name, spec in (block.get("attributes") or {}).items()
                },
                "blocks": set(block.get("block_types") or {}),
            }
    return schemas


def zero_value(attr_type):
    """The empty value of a Terraform type, or None where there is no sane one."""
    if attr_type == "string":
        return ""
    if attr_type == "number":
        return 0
    if attr_type == "bool":
        return False
    if isinstance(attr_type, list) and attr_type:
        kind = attr_type[0]
        if kind in ("list", "set", "tuple"):
            return []
        if kind in ("map", "object"):
            return {}
    return None


def plan(workdir):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "tfplan")
        run(["terraform", "plan", "-refresh=false", "-input=false", "-out", out], workdir)
        return json.loads(run(["terraform", "show", "-json", out], workdir))


def region_of(plan_json):
    for change in plan_json.get("resource_changes") or []:
        after = change["change"].get("after") or {}
        if after.get("region"):
            return after["region"]
    return "us-east-1"


def build_state(plan_json, schemas, previous):
    """Turn a plan into the state that plan would produce if applied."""
    region = region_of(plan_json)
    # Keep ids already invented in an earlier round, so they stay stable as
    # later rounds resolve more of the graph.
    known = {}
    for res in (previous or {}).get("resources", []):
        for inst in res["instances"]:
            known[inst["_address"]] = inst["attributes"]

    grouped = {}
    for change in plan_json.get("resource_changes") or []:
        if change.get("mode") != "managed":
            continue
        if change["change"]["actions"] == ["delete"]:
            continue
        address = change["address"]
        attrs = dict(change["change"].get("after") or {})
        pending = unknown_keys(change["change"].get("after_unknown"))

        carried = known.get(address, {})
        schema = schemas.get(change["type"], {})
        for key in pending:
            if carried.get(key) is not None:
                attrs[key] = carried[key]      # invented in an earlier round
            elif key == "id":
                attrs[key] = fake_id(address, change["type"], region)
            elif key == "arn":
                attrs[key] = None              # filled below, once id is settled
            elif key == "tags_all":
                attrs[key] = attrs.get("tags") or {}
            elif key in schema.get("blocks", ()):
                attrs[key] = []                # a nested block nobody configured
            else:
                attrs[key] = zero_value(schema.get("attributes", {}).get(key))

        if not attrs.get("id"):
            attrs["id"] = carried.get("id") or fake_id(address, change["type"], region)
        if "arn" in attrs and not attrs["arn"]:
            attrs["arn"] = carried.get("arn") or fake_arn(address, change["type"], region, attrs["id"])
        # An Elastic IP's allocation id is its id, and is what a NAT gateway
        # refers to; leaving it null would break that link.
        if change["type"] == "aws_eip" and not attrs.get("allocation_id"):
            attrs["allocation_id"] = attrs["id"]

        key = (change.get("module_address", ""), change["type"], change["name"])
        grouped.setdefault(key, []).append((address, attrs, change))

    resources = []
    for (module, rtype, name), instances in sorted(grouped.items()):
        provider = instances[0][2]["provider_name"]
        entry = {
            "mode": "managed",
            "type": rtype,
            "name": name,
            "provider": f'provider["{provider}"]',
            "instances": [],
        }
        if module:
            entry["module"] = module
        keyed = [index_key(addr) for addr, _, _ in instances]
        if any(k is not None for k in keyed):
            entry["each"] = "map" if any(isinstance(k, str) for k in keyed) else "list"
        for (address, attrs, _), key in zip(instances, keyed):
            inst = {
                "schema_version": schemas.get(rtype, {}).get("version", 0),
                "attributes": attrs,
                "sensitive_attributes": [],
                "_address": address,
            }
            if key is not None:
                inst["index_key"] = key
            entry["instances"].append(inst)
        resources.append(entry)

    return {
        "version": 4,
        "terraform_version": plan_json.get("terraform_version", "1.14.4"),
        "serial": 1,
        "lineage": "00000000-0000-4000-8000-000000000000",
        "outputs": {},
        "resources": resources,
    }


def strip_internal(state):
    """_address is bookkeeping for the next round, not part of the format."""
    clean = json.loads(json.dumps(state))
    for res in clean["resources"]:
        for inst in res["instances"]:
            inst.pop("_address", None)
    return clean


def pending_changes(plan_json):
    return [c["address"] for c in (plan_json.get("resource_changes") or [])
            if c.get("mode") == "managed" and c["change"]["actions"] != ["no-op"]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workdir")
    ap.add_argument("--rounds", type=int, default=6)
    args = ap.parse_args()

    workdir = os.path.abspath(args.workdir)
    state_path = os.path.join(workdir, "terraform.tfstate")
    schemas = load_schemas(workdir)
    carried = None

    for round_no in range(1, args.rounds + 1):
        current = plan(workdir)
        outstanding = pending_changes(current)
        print(f"round {round_no}: {len(outstanding)} resources not yet settled")
        if not outstanding:
            print(f"converged: {state_path} is a fully applied state")
            return 0
        carried = build_state(current, schemas, carried)
        with open(state_path, "w") as fh:
            json.dump(strip_internal(carried), fh, indent=2)
            fh.write("\n")

    final = plan(workdir)
    outstanding = pending_changes(final)
    if outstanding:
        print(f"did not converge after {args.rounds} rounds; still pending:", file=sys.stderr)
        for address in outstanding[:20]:
            print(f"  {address}", file=sys.stderr)
        return 1
    print(f"converged: {state_path} is a fully applied state")
    return 0


if __name__ == "__main__":
    sys.exit(main())
