package ingest

import (
	"path/filepath"
	"strings"
	"testing"
)

// Owner decides which workspace a filesystem event replans. The watcher hands
// it whatever path the OS reports, so the rule it keeps is checked against
// arbitrary strings: a path is owned by the deepest workspace that contains
// it, and by nothing when none does.
func FuzzOwner(f *testing.F) {
	root := filepath.Join(string(filepath.Separator), "scan")
	workspaces := []Workspace{
		{Name: "dev", Dir: filepath.Join(root, "dev")},
		{Name: "dev/modules/net", Dir: filepath.Join(root, "dev", "modules", "net")},
		{Name: "development", Dir: filepath.Join(root, "development")},
		{Name: "prod", Dir: filepath.Join(root, "prod")},
	}
	for _, seed := range []string{
		filepath.Join(root, "dev", "main.tf"),
		filepath.Join(root, "development", "main.tf"),
		filepath.Join(root, "dev", "modules", "net", "vpc.tf"),
		filepath.Join(root, "dev", "modules"),
		filepath.Join(root, "shared.tf"),
		filepath.Join(root, "prod"),
		root, "", "dev", "/", "..",
	} {
		f.Add(seed)
	}
	contains := func(ws Workspace, path string) bool {
		return path == ws.Dir || strings.HasPrefix(path, ws.Dir+string(filepath.Separator))
	}
	f.Fuzz(func(t *testing.T, path string) {
		ws, ok := Owner(workspaces, path)
		if !ok {
			for _, w := range workspaces {
				if contains(w, path) {
					t.Errorf("%q lies inside %s but has no owner", path, w.Name)
				}
			}
			return
		}
		if !contains(ws, path) {
			t.Errorf("%q is owned by %s, which does not contain it", path, ws.Name)
		}
		for _, w := range workspaces {
			if len(w.Dir) > len(ws.Dir) && contains(w, path) {
				t.Errorf("%q belongs to the deeper workspace %s, not %s", path, w.Name, ws.Name)
			}
		}
	})
}
