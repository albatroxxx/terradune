package server

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	tfjson "github.com/hashicorp/terraform-json"

	"github.com/albatroxxx/terradune/internal/graph"
)

// jscPaths are where JavaScriptCore's shell lives on macOS. The page is
// mostly logic — layout derivation, markup building — so running it headlessly
// catches real errors (a runaway recursion, a broken template) that would
// otherwise only show up in a browser.
var jscPaths = []string{
	"/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc",
	"/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc",
}

func findJSC() string {
	for _, p := range jscPaths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	if p, err := exec.LookPath("jsc"); err == nil {
		return p
	}
	if p, err := exec.LookPath("node"); err == nil {
		return p
	}
	return ""
}

var scriptRe = regexp.MustCompile(`(?s)<script([^>]*)>(.*?)</script>`)

// inlineScript returns the page's own script, skipping the tags that only
// pull in a vendored library.
func inlineScript(page []byte) []byte {
	var last []byte
	for _, m := range scriptRe.FindAllSubmatch(page, -1) {
		if strings.Contains(string(m[1]), "src=") {
			continue
		}
		last = m[2]
	}
	return last
}

// stateFromFixtures builds the same payload the browser receives, from the
// plan fixtures the graph tests already use.
func stateFromFixtures(t *testing.T, names ...string) []byte {
	t.Helper()
	state := State{Root: "/examples"}
	if len(names) == 0 {
		names = []string{"ec2", "estate", "foreach", "layered", "modular", "platform", "vpc"}
	}
	for _, name := range names {
		raw, err := os.ReadFile(filepath.Join("..", "graph", "testdata", name+"_plan.json"))
		if err != nil {
			t.Fatalf("reading fixture %s: %v", name, err)
		}
		var plan tfjson.Plan
		if err := json.Unmarshal(raw, &plan); err != nil {
			t.Fatalf("parsing fixture %s: %v", name, err)
		}
		g := graph.Build(&plan)
		state.Workspaces = append(state.Workspaces, Workspace{
			Name: name, Dir: "/examples/" + name,
			TerraformVersion: plan.TerraformVersion,
			Nodes:            g.Nodes, Edges: g.Edges,
		})
	}
	payload, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	return payload
}

func TestPageRendersHeadlessly(t *testing.T) {
	jsc := findJSC()
	if jsc == "" {
		t.Fatal("page tests require JavaScriptCore or Node.js")
	}
	runPageChecks(t, jsc)
}

func TestPageRendersWithNode(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("Node.js is not installed; the primary page test still requires a JS runtime")
	}
	runPageChecks(t, node)
}

func runPageChecks(t *testing.T, jsc string) {
	t.Helper()

	page, err := static.ReadFile("index.html")
	if err != nil {
		t.Fatal(err)
	}
	script := inlineScript(page)
	if len(script) == 0 {
		t.Fatal("no inline script found in index.html")
	}

	stub, err := os.ReadFile(filepath.Join("testdata", "dom-stub.js"))
	if err != nil {
		t.Fatal(err)
	}
	checks, err := os.ReadFile(filepath.Join("testdata", "checks.js"))
	if err != nil {
		t.Fatal(err)
	}

	var b strings.Builder
	if strings.HasPrefix(filepath.Base(jsc), "node") {
		b.WriteString("var print = console.log;\n")
	}
	b.Write(stub)
	b.WriteString("\nvar STATE = ")
	b.Write(stateFromFixtures(t))
	b.WriteString(";\n")
	b.WriteString("var CONNECTION_STATE = ")
	b.Write(stateFromFixtures(t, "connection_changes"))
	b.WriteString(";\n")
	review, err := static.ReadFile("assets/review.js")
	if err != nil {
		t.Fatal(err)
	}
	b.Write(review)
	b.WriteString("\n")
	b.Write(script)
	b.WriteString("\n")
	b.Write(checks)

	bundle := filepath.Join(t.TempDir(), "page.js")
	if err := os.WriteFile(bundle, []byte(b.String()), 0o600); err != nil {
		t.Fatal(err)
	}

	out, err := exec.Command(jsc, bundle).CombinedOutput()
	t.Logf("headless page checks:\n%s", out)
	if err != nil {
		t.Fatalf("jsc failed: %v", err)
	}
	if !strings.Contains(string(out), "ALL CHECKS PASSED") {
		t.Fatal("headless page checks did not pass")
	}
}

// The legend sits over the map, so it ships folded away behind its own
// button rather than covering the corner of the diagram from the start.
func TestLegendShipsFolded(t *testing.T) {
	page, err := static.ReadFile("index.html")
	if err != nil {
		t.Fatal(err)
	}
	html := string(page)
	if !strings.Contains(html, `<div id="legend" class="closed">`) {
		t.Error("the legend does not ship closed")
	}
	if !strings.Contains(html, `id="legend-btn"`) {
		t.Error("the legend has no button to open it")
	}
	if !strings.Contains(html, `aria-expanded="false"`) {
		t.Error("the legend button does not report its state")
	}
}
