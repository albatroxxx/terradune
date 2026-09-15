package ingest

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// fakeCLI puts an executable called name on disk in dir. Windows resolves a
// bare command through PATHEXT rather than an executable bit, so the file has
// to be spelled the way that platform expects or LookPath will not see it.
func fakeCLI(t *testing.T, dir, name string) {
	t.Helper()
	path, body := filepath.Join(dir, name), "#!/bin/sh\nexit 0\n"
	if runtime.GOOS == "windows" {
		path, body = path+".bat", "@echo off\r\n"
	}
	if err := os.WriteFile(path, []byte(body), 0o755); err != nil {
		t.Fatal(err)
	}
}

func TestFindCLIPrefersTerraform(t *testing.T) {
	dir := t.TempDir()
	fakeCLI(t, dir, "terraform")
	fakeCLI(t, dir, "tofu")
	t.Setenv("PATH", dir)

	path, name, err := FindCLI()
	if err != nil {
		t.Fatal(err)
	}
	// A workspace someone initialized with Terraform should be planned by it.
	if name != "terraform" {
		t.Errorf("chose %q, want terraform when both are installed", name)
	}
	if !strings.HasPrefix(path, dir) {
		t.Errorf("resolved %q, which is outside the test PATH", path)
	}
}

func TestFindCLIFallsBackToTofu(t *testing.T) {
	dir := t.TempDir()
	fakeCLI(t, dir, "tofu")
	t.Setenv("PATH", dir)

	path, name, err := FindCLI()
	if err != nil {
		t.Fatal(err)
	}
	if name != "tofu" {
		t.Errorf("chose %q, want tofu when it is the only one installed", name)
	}
	if !strings.HasPrefix(path, dir) {
		t.Errorf("resolved %q, which is outside the test PATH", path)
	}
}

func TestFindCLIWithoutEitherNamesBoth(t *testing.T) {
	t.Setenv("PATH", t.TempDir())

	if _, _, err := FindCLI(); err == nil {
		t.Fatal("expected an error when neither CLI is installed")
	} else {
		// Naming only one of them sends the reader after the wrong install.
		for _, want := range cliNames {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("error %q does not mention %s", err, want)
			}
		}
	}
}

func TestDisplayName(t *testing.T) {
	for cli, want := range map[string]string{
		"tofu":      "OpenTofu",
		"terraform": "Terraform",
		"":          "Terraform", // recorded before terradune knew which ran
	} {
		if got := DisplayName(cli); got != want {
			t.Errorf("DisplayName(%q) = %q, want %q", cli, got, want)
		}
	}
}
