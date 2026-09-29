package graph

import (
	"bytes"
	"strings"
	"testing"
)

func TestPrintModulesAndDependencies(t *testing.T) {
	g := &Graph{
		Nodes: []Node{
			{ID: "module.z.aws_instance.app", Module: "module.z", Status: "create"},
			{ID: "aws_vpc.main", Status: "existing"},
			{ID: "module.a.aws_subnet.main", Module: "module.a", Status: "update"},
		},
		Edges: []Edge{{From: "module.a.aws_subnet.main", To: "aws_vpc.main"}},
	}
	var out bytes.Buffer
	g.Print(&out)
	want := "\nroot:\n  existing  aws_vpc.main\n\nmodule.a:\n  update    module.a.aws_subnet.main\n\nmodule.z:\n  create    module.z.aws_instance.app\n\nDependencies (1):\n  module.a.aws_subnet.main -> aws_vpc.main\n"
	if out.String() != want {
		t.Fatalf("got %q want %q", out.String(), want)
	}
	out.Reset()
	g.Edges = nil
	g.Print(&out)
	if strings.Contains(out.String(), "Dependencies") {
		t.Fatal("empty dependency section should be omitted")
	}
	out.Reset()
	(&Graph{}).Print(&out)
	if out.Len() != 0 {
		t.Fatal("empty graph should not print sections")
	}
}
