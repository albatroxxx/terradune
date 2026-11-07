package graph

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"

	tfjson "github.com/hashicorp/terraform-json"
)

// Terraform wrote the plan and the graph this package reads, but a file on
// disk is still input: a truncated plan, a graph from another version, or a
// hand-edited fixture must be refused or rendered, never crash the review.
// `go test` runs the seeds; scripts/fuzz.py mutates them.

func FuzzDependenciesFromDOT(f *testing.F) {
	dot, err := os.ReadFile(filepath.Join("testdata", "layered_graph.dot"))
	if err != nil {
		f.Fatal(err)
	}
	for _, seed := range [][]byte{
		dot,
		[]byte(`digraph { "a" -> "b" }`),
		[]byte("digraph G {\n\t\"[root] aws_vpc.main (expand)\" -> \"[root] provider[\\\"registry.terraform.io/hashicorp/aws\\\"]\"\n}"),
		[]byte(`"module.net.aws_subnet.a (expand)" -> "module.net.var.cidr (expand)"`),
		[]byte(`-> -> "" ""`),
		[]byte(""),
	} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, data []byte) {
		everything := DependenciesFromDOT(data, func(string) bool { return true })
		for from, tos := range everything {
			if from == "" {
				t.Error("a dependency was recorded for an empty address")
			}
			for to := range tos {
				if to == "" {
					t.Errorf("%s depends on an empty address", from)
				}
			}
		}
		if nothing := DependenciesFromDOT(data, func(string) bool { return false }); len(nothing) != 0 {
			t.Errorf("no address is a resource, yet %d dependencies were found", len(nothing))
		}
	})
}

func FuzzBuildFromPlan(f *testing.F) {
	fixtures, err := filepath.Glob(filepath.Join("testdata", "*_plan.json"))
	if err != nil || len(fixtures) == 0 {
		f.Fatalf("plan fixtures: %v (%d found)", err, len(fixtures))
	}
	for _, name := range fixtures {
		data, err := os.ReadFile(name)
		if err != nil {
			f.Fatal(err)
		}
		f.Add(data)
	}
	f.Add([]byte(`{"format_version":"1.2","resource_changes":[{"address":"aws_vpc.a","mode":"managed","type":"aws_vpc","name":"a","change":{"actions":["create"],"after":{"cidr_block":"10.0.0.0/16"}}}]}`))
	f.Add([]byte(`{"format_version":"1.2"}`))
	f.Add([]byte(`{}`))
	dot, err := os.ReadFile(filepath.Join("testdata", "layered_graph.dot"))
	if err != nil {
		f.Fatal(err)
	}
	f.Fuzz(func(t *testing.T, data []byte) {
		var plan tfjson.Plan
		if err := json.Unmarshal(data, &plan); err != nil {
			return // not a plan; the CLI layer reports that before we are reached
		}
		g := BuildWithDOT(&plan, dot)
		ids := make(map[string]bool, len(g.Nodes))
		for _, n := range g.Nodes {
			if n.ID == "" {
				t.Error("a node has no address")
			}
			ids[n.ID] = true
		}
		for _, e := range g.Edges {
			if e.From == "" || e.To == "" {
				t.Errorf("edge with an empty end: %+v", e)
			}
		}
		g.Print(io.Discard)
		for addr, d := range BuildDetails(&plan) {
			if addr == "" || d == nil {
				t.Errorf("detail %q is %v", addr, d)
			}
		}
	})
}
