package main

import (
	"path/filepath"
	"reflect"
	"testing"

	"github.com/albatroxxx/terradune/internal/ingest"
)

func TestWorkspacesForChanges(t *testing.T) {
	root := t.TempDir()
	a := ingest.Workspace{Name: "a", Dir: filepath.Join(root, "a")}
	b := ingest.Workspace{Name: "b", Dir: filepath.Join(root, "b")}
	nested := ingest.Workspace{Name: "a/nested", Dir: filepath.Join(a.Dir, "nested")}
	workspaces := []ingest.Workspace{a, nested, b}
	owned := filepath.Join(a.Dir, "main.tf")
	shared := filepath.Join(root, "shared", "variables.tf")
	for _, test := range []struct {
		name  string
		paths []string
		want  []ingest.Workspace
	}{
		{"owned", []string{owned}, []ingest.Workspace{a}},
		{"duplicate edits", []string{owned, owned}, []ingest.Workspace{a}},
		{"shared", []string{shared}, workspaces},
		{"owned then shared", []string{owned, shared}, workspaces},
		{"shared then owned", []string{shared, owned}, workspaces},
		{"nested owner", []string{filepath.Join(nested.Dir, "main.tf")}, []ingest.Workspace{nested}},
		{"stable order", []string{filepath.Join(b.Dir, "main.tf"), owned}, []ingest.Workspace{a, b}},
		{"empty batch", nil, nil},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := workspacesForChanges(workspaces, test.paths); !reflect.DeepEqual(got, test.want) {
				t.Fatalf("got %v, want %v", got, test.want)
			}
		})
	}
}

func TestListenAddress(t *testing.T) {
	for _, test := range []struct {
		host string
		port int
		want string
	}{
		{"127.0.0.1", 8383, "127.0.0.1:8383"},
		{"0.0.0.0", 8383, "0.0.0.0:8383"},
		{"::1", 8383, "[::1]:8383"},
		{"localhost", 8383, "localhost:8383"},
		{"", 8383, ""}, {"example.com", 8383, ""},
		{"127.0.0.1", 0, ""}, {"127.0.0.1", 65536, ""},
	} {
		got, err := listenAddress(test.host, test.port)
		if got != test.want || (err != nil) != (test.want == "") {
			t.Errorf("listenAddress(%q, %d) = %q, %v", test.host, test.port, got, err)
		}
	}
}

func TestBuildVersionOverride(t *testing.T) {
	old := version
	t.Cleanup(func() { version = old })
	version = "v1.0.0"
	if got := buildVersion(); got != version {
		t.Fatalf("version = %q", got)
	}
}
