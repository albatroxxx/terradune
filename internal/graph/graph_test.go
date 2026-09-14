package graph

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	tfjson "github.com/hashicorp/terraform-json"

	"github.com/AsysGupta/terradune/internal/ingest"
)

func loadFixture(t *testing.T, path string) *tfjson.Plan {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var plan tfjson.Plan
	if err := json.Unmarshal(raw, &plan); err != nil {
		t.Fatal(err)
	}
	return &plan
}

func TestBuildModularPlan(t *testing.T) {
	g := Build(loadFixture(t, "testdata/modular_plan.json"))

	wantNodes := map[string]struct {
		module string
		status ingest.Status
	}{
		"local_file.roster":               {"", ingest.StatusCreate},
		"module.pets.local_file.note":     {"module.pets", ingest.StatusCreate},
		"module.pets.random_pet.these[0]": {"module.pets", ingest.StatusCreate},
		"module.pets.random_pet.these[1]": {"module.pets", ingest.StatusCreate},
	}
	if len(g.Nodes) != len(wantNodes) {
		t.Fatalf("got %d nodes, want %d: %+v", len(g.Nodes), len(wantNodes), g.Nodes)
	}
	for _, n := range g.Nodes {
		want, ok := wantNodes[n.ID]
		if !ok {
			t.Errorf("unexpected node %s", n.ID)
			continue
		}
		if n.Module != want.module || n.Status != want.status {
			t.Errorf("node %s: got (module=%q, status=%s), want (%q, %s)",
				n.ID, n.Module, n.Status, want.module, want.status)
		}
	}

	wantEdges := map[Edge]bool{
		// direct in-module references
		{From: "module.pets.local_file.note", To: "module.pets.random_pet.these[0]"}: true,
		{From: "module.pets.local_file.note", To: "module.pets.random_pet.these[1]"}: true,
		// resolved through the module output "names"
		{From: "local_file.roster", To: "module.pets.random_pet.these[0]"}: true,
		{From: "local_file.roster", To: "module.pets.random_pet.these[1]"}: true,
	}
	if len(g.Edges) != len(wantEdges) {
		t.Fatalf("got %d edges, want %d: %+v", len(g.Edges), len(wantEdges), g.Edges)
	}
	for _, e := range g.Edges {
		if !wantEdges[e] {
			t.Errorf("unexpected edge %s -> %s", e.From, e.To)
		}
	}
}

func TestBuildVPCPlanPairsInstancesByIndex(t *testing.T) {
	g := Build(loadFixture(t, "testdata/vpc_plan.json"))

	if len(g.Nodes) != 21 {
		t.Fatalf("got %d nodes, want 21", len(g.Nodes))
	}

	edges := map[Edge]bool{}
	for _, e := range g.Edges {
		edges[e] = true
	}
	want := []Edge{
		// count.index in the same expression pairs instances by index
		{From: "aws_nat_gateway.main[0]", To: "aws_eip.nat[0]"},
		{From: "aws_nat_gateway.main[1]", To: "aws_eip.nat[1]"},
		{From: "aws_nat_gateway.main[0]", To: "aws_subnet.public[0]"},
		{From: "aws_route.private_nat[1]", To: "aws_nat_gateway.main[1]"},
		{From: "aws_route_table_association.private[0]", To: "aws_subnet.private[0]"},
		// indexed -> single-instance edges are unaffected by pairing
		{From: "aws_route_table_association.public[1]", To: "aws_route_table.public"},
		{From: "aws_subnet.public[0]", To: "aws_vpc.main"},
		// depends_on stays resource-level: every eip depends on the igw
		{From: "aws_eip.nat[0]", To: "aws_internet_gateway.main"},
		{From: "aws_eip.nat[1]", To: "aws_internet_gateway.main"},
	}
	for _, e := range want {
		if !edges[e] {
			t.Errorf("missing edge %s -> %s", e.From, e.To)
		}
	}
	unwanted := []Edge{
		{From: "aws_nat_gateway.main[0]", To: "aws_eip.nat[1]"},
		{From: "aws_nat_gateway.main[1]", To: "aws_subnet.public[0]"},
		{From: "aws_route.private_nat[0]", To: "aws_route_table.private[1]"},
		{From: "aws_route_table_association.private[1]", To: "aws_subnet.private[0]"},
	}
	for _, e := range unwanted {
		if edges[e] {
			t.Errorf("unexpected cross-index edge %s -> %s", e.From, e.To)
		}
	}
	if len(g.Edges) != 29 {
		t.Errorf("got %d edges, want 29", len(g.Edges))
	}
}

func TestBuildEC2PlanPinsLiteralIndexes(t *testing.T) {
	g := Build(loadFixture(t, "testdata/ec2_plan.json"))

	edges := map[Edge]bool{}
	for _, e := range g.Edges {
		edges[e] = true
	}
	// bastion references aws_subnet.web[0] literally, so it must reach that
	// one subnet and not fan out across every instance of aws_subnet.web.
	if !edges[Edge{From: "aws_instance.bastion", To: "aws_subnet.web[0]"}] {
		t.Error("missing pinned edge aws_instance.bastion -> aws_subnet.web[0]")
	}
	if edges[Edge{From: "aws_instance.bastion", To: "aws_subnet.web[1]"}] {
		t.Error("unexpected fan-out edge aws_instance.bastion -> aws_subnet.web[1]")
	}
	// count.index pairing still holds alongside pinning
	if !edges[Edge{From: "aws_instance.app[1]", To: "aws_subnet.app[1]"}] {
		t.Error("missing paired edge aws_instance.app[1] -> aws_subnet.app[1]")
	}
	if edges[Edge{From: "aws_instance.app[0]", To: "aws_subnet.app[1]"}] {
		t.Error("unexpected cross-index edge aws_instance.app[0] -> aws_subnet.app[1]")
	}
	// a resource spanning several subnets keeps every edge
	for _, i := range []string{"0", "1"} {
		e := Edge{From: "aws_lb.app", To: "aws_subnet.web[" + i + "]"}
		if !edges[e] {
			t.Errorf("missing edge %s -> %s", e.From, e.To)
		}
	}
}

func TestStripIndexes(t *testing.T) {
	cases := map[string]string{
		`module.x["a"].aws_foo.bar[0]`: "module.x.aws_foo.bar",
		`aws_foo.bar`:                  "aws_foo.bar",
		`module.x[1].module.y.a.b[2]`:  "module.x.module.y.a.b",
	}
	for in, want := range cases {
		if got := stripIndexes(in); got != want {
			t.Errorf("stripIndexes(%q) = %q, want %q", in, got, want)
		}
	}
}

// The platform fixture is infrastructure that already exists: every id in it
// is a real value rather than "known after apply". That is the case the other
// fixtures cannot cover, and the one real codebases are always in.
func TestBuildPlatformPlanReadsExistingInfrastructure(t *testing.T) {
	g := Build(loadFixture(t, "testdata/platform_plan.json"))

	if len(g.Nodes) != 35 {
		t.Errorf("got %d nodes, want 35", len(g.Nodes))
	}
	for _, n := range g.Nodes {
		if n.Status != ingest.StatusExisting {
			t.Errorf("%s has status %q, want existing", n.ID, n.Status)
		}
	}
	// A NAT gateway sits in a subnet, and the plan says which one.
	edges := map[Edge]bool{}
	for _, e := range g.Edges {
		edges[e] = true
	}
	if !edges[Edge{From: "aws_nat_gateway.main[0]", To: "aws_subnet.public[0]"}] {
		t.Error("nat gateway is not connected to the subnet holding it")
	}
	if !edges[Edge{From: "aws_lb_listener.http", To: "aws_lb_target_group.web"}] {
		t.Error("listener is not connected to its default target group")
	}
}

// Wiring a codebase through locals hides it from plan JSON, and Terraform's
// own graph is transitively reduced, so neither can be relied on alone. Once
// infrastructure exists the attributes say what is connected to what, in ids
// that do not care how the configuration was written. Dropping the entire
// configuration is the strongest form of that test: whatever survives came
// from the resources themselves.
func TestIDsRecoverEdgesWithoutConfiguration(t *testing.T) {
	plan := loadFixture(t, "testdata/platform_plan.json")
	plan.Config = nil
	g := Build(plan)

	edges := map[Edge]bool{}
	for _, e := range g.Edges {
		edges[e] = true
	}
	for _, want := range []Edge{
		{From: "aws_route_table_association.public[0]", To: "aws_subnet.public[0]"},
		{From: "aws_route_table_association.public[0]", To: "aws_route_table.public"},
		{From: "aws_route_table_association.private[1]", To: "aws_route_table.private[1]"},
		{From: "aws_nat_gateway.main[0]", To: "aws_subnet.public[0]"},
		{From: "aws_nat_gateway.main[0]", To: "aws_eip.nat[0]"},
		{From: "aws_route.private_nat[0]", To: "aws_nat_gateway.main[0]"},
		{From: "aws_instance.web[0]", To: "aws_subnet.private[0]"},
		{From: "aws_instance.web[0]", To: "aws_security_group.app"},
		{From: "aws_lb.app", To: "aws_subnet.public[0]"},
		{From: "aws_lb_listener.http", To: "aws_lb.app"},
		{From: "aws_lb_target_group_attachment.web[0]", To: "aws_instance.web[0]"},
	} {
		if !edges[want] {
			t.Errorf("edge not recovered from ids: %s -> %s", want.From, want.To)
		}
	}
	// Matching must not invent relationships: an IAM role shares no id with
	// anything in the network.
	for _, e := range g.Edges {
		if e.From == "aws_iam_role.app" || e.To == "aws_iam_role.app" {
			t.Errorf("unexpected edge touching the iam role: %s -> %s", e.From, e.To)
		}
	}
}

// The layered fixture is wired the way most real Terraform is: a network
// module, an application module, and the values between them passed through a
// local. This pins down exactly what each source of truth can and cannot say
// about that, because the three disagree.
func TestLocalsHideWiringThatIDsRecover(t *testing.T) {
	dot, err := os.ReadFile("testdata/layered_graph.dot")
	if err != nil {
		t.Fatal(err)
	}
	// Which subnet an instance is in. Two subnets, two instances, paired.
	perInstance := []Edge{
		{From: "module.app.aws_instance.this[0]", To: "module.network.aws_subnet.private[0]"},
		{From: "module.app.aws_instance.this[1]", To: "module.network.aws_subnet.private[1]"},
	}
	// Which VPC the security group is in. One of each, so no pairing needed.
	wholeResource := Edge{
		From: "module.app.aws_security_group.this", To: "module.network.aws_vpc.this",
	}

	plan := loadFixture(t, "testdata/layered_plan.json")
	have := map[Edge]bool{}
	for _, e := range BuildWithDOT(plan, dot).Edges {
		have[e] = true
	}
	for _, want := range append(perInstance, wholeResource) {
		if !have[want] {
			t.Errorf("link across the local not drawn: %s -> %s", want.From, want.To)
		}
	}

	// Now take the attribute values away, which is the position a workspace
	// that has never been applied is in.
	blind := loadFixture(t, "testdata/layered_plan.json")
	for _, rc := range blind.ResourceChanges {
		rc.Change.After, rc.Change.Before = nil, nil
	}
	without := map[Edge]bool{}
	for _, e := range BuildWithDOT(blind, dot).Edges {
		without[e] = true
	}
	// Terraform's own graph does carry the chain through the local, so a
	// target with a single instance is still reached.
	if !without[wholeResource] {
		t.Errorf("terraform's graph should still reach %s -> %s",
			wholeResource.From, wholeResource.To)
	}
	// But that graph names resources, not instances. Which of two subnets an
	// instance sits in is not something it can answer, so nothing is drawn —
	// and an arrow drawn on a guess would read as a fact.
	for _, want := range perInstance {
		if without[want] {
			t.Errorf("%s -> %s cannot be known without the attribute values; "+
				"drawing it would be a guess", want.From, want.To)
		}
	}
}

// The estate fixture is deliberately broad: two VPCs joined by a transit
// gateway, load balancers, databases, queues, keys and DNS. It is the only
// fixture wide enough to catch a rule that happens to hold for one VPC, or for
// the handful of services a small example reaches.
func TestBuildEstateSpansManyServices(t *testing.T) {
	g := Build(loadFixture(t, "testdata/estate_plan.json"))

	services, types := map[string]bool{}, map[string]bool{}
	for _, n := range g.Nodes {
		types[n.Type] = true
		// aws_lb_target_group -> lb, aws_ec2_transit_gateway -> ec2.
		parts := strings.SplitN(strings.TrimPrefix(n.Type, "aws_"), "_", 2)
		services[parts[0]] = true
	}
	if len(services) < 30 {
		t.Errorf("the estate covers %d AWS services, want at least 30", len(services))
	}
	if len(types) < 45 {
		t.Errorf("the estate covers %d resource types, want at least 45", len(types))
	}

	var vpcs int
	for _, n := range g.Nodes {
		if n.Type == "aws_vpc" {
			vpcs++
		}
	}
	if vpcs != 2 {
		t.Errorf("got %d VPCs, want 2", vpcs)
	}

	// Both VPCs reach the transit gateway that joins them, and each subnet
	// belongs to exactly one of them. Both come from the ids alone.
	edges := map[Edge]bool{}
	for _, e := range g.Edges {
		edges[e] = true
	}
	for _, want := range []Edge{
		{From: "aws_ec2_transit_gateway_vpc_attachment.app", To: "aws_vpc.app"},
		{From: "aws_ec2_transit_gateway_vpc_attachment.data", To: "aws_vpc.data"},
		{From: "aws_subnet.app_private[0]", To: "aws_vpc.app"},
		{From: "aws_subnet.data_private[0]", To: "aws_vpc.data"},
	} {
		if !edges[want] {
			t.Errorf("missing edge %s -> %s", want.From, want.To)
		}
	}
	if edges[Edge{From: "aws_subnet.data_private[0]", To: "aws_vpc.app"}] {
		t.Error("a data subnet is wired to the app VPC")
	}
}
