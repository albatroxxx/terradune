package ingest

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDiscoverTerraformDataDir(t *testing.T) {
	for _, data := range []string{"", ".terradune", "custom-data"} {
		t.Run(data, func(t *testing.T) {
			t.Setenv("TF_DATA_DIR", data)
			root := t.TempDir()
			for _, name := range []string{"dev", "prod"} {
				if err := os.MkdirAll(DataDir(filepath.Join(root, name)), 0700); err != nil {
					t.Fatal(err)
				}
			}
			workspaces, err := Discover(root)
			if err != nil || len(workspaces) != 2 || workspaces[0].Name != "dev" || workspaces[1].Name != "prod" {
				t.Fatalf("workspaces=%v error=%v", workspaces, err)
			}
		})
	}
}

func TestAbsoluteDataDirIsSingleWorkspace(t *testing.T) {
	t.Setenv("TF_DATA_DIR", t.TempDir())
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "module"), 0700); err != nil {
		t.Fatal(err)
	}
	workspaces, err := Discover(root)
	if err != nil || len(workspaces) != 1 || workspaces[0].Dir != root {
		t.Fatalf("workspaces=%v error=%v", workspaces, err)
	}
}
