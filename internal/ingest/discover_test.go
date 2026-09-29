package ingest

import (
	"os"
	"path/filepath"
	"strings"
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

func TestDiscoverBoundaries(t *testing.T) {
	t.Setenv("TF_DATA_DIR", "")
	root := t.TempDir()
	for _, tc := range []struct{ path, want string }{
		{filepath.Join(root, "missing"), "not a directory"},
		{root, "no initialized Terraform workspace"},
	} {
		if _, err := Discover(tc.path); err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Fatalf("got %v want %s", err, tc.want)
		}
	}
	for _, path := range []string{".terraform", "nested/.terraform", ".git/ignored/.terraform", ".terradune/ignored/.terraform", ".terraform/ignored/.terraform"} {
		if err := os.MkdirAll(filepath.Join(root, filepath.FromSlash(path)), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "main.tf"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	workspaces, err := Discover(root)
	if err != nil || len(workspaces) != 2 {
		t.Fatalf("workspaces=%v err=%v", workspaces, err)
	}
	for _, tc := range []struct{ path, owner string }{
		{root, root},
		{filepath.Join(root, "main.tf"), root},
		{filepath.Join(root, "nested", "main.tf"), filepath.Join(root, "nested")},
		{root + "-not-a-child", ""},
	} {
		got, found := Owner(workspaces, tc.path)
		if found != (tc.owner != "") || got.Dir != tc.owner {
			t.Fatalf("Owner(%s)=%+v, %v", tc.path, got, found)
		}
	}
	t.Setenv("TF_DATA_DIR", filepath.Join(root, "uninitialized"))
	if _, err := Discover(root); err == nil || !strings.Contains(err.Error(), "TF_DATA_DIR is not initialized") {
		t.Fatalf("got %v", err)
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
