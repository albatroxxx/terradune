package watch

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"
)

func TestWatchJSONVariableChange(t *testing.T) {
	// macOS may report the resolved /private/... path rather than /var/....
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	changes := make(chan []string, 16)
	done := make(chan error, 1)
	go func() { done <- Watch(ctx, root, func(paths []string) { changes <- paths }) }()
	t.Cleanup(func() {
		cancel()
		if err := <-done; !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			t.Errorf("watch stopped unexpectedly: %v", err)
		}
	})
	write := func(path, body string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	// Establish readiness through real file events rather than a startup sleep.
	marker := filepath.Join(root, "ready.tf")
	ticker := time.NewTicker(750 * time.Millisecond)
	defer ticker.Stop()
	write(marker, "# ready\n")
ready:
	for {
		select {
		case paths := <-changes:
			if slices.Contains(paths, marker) {
				break ready
			}
		case <-ticker.C:
			write(marker, "# ready\n")
		case <-ctx.Done():
			t.Fatal("watcher did not observe readiness marker")
		}
	}
	ticker.Stop()
	variables := filepath.Join(root, "prod.auto.tfvars.json")
	write(variables, `{"instance_count": 2}`)
	for {
		select {
		case paths := <-changes:
			if slices.Contains(paths, variables) {
				return
			}
		case <-ctx.Done():
			t.Fatal("JSON variable edit did not trigger a refresh")
		}
	}
}

func TestRelevantTerraformFiles(t *testing.T) {
	for _, test := range []struct {
		path string
		want bool
	}{
		{"main.tf", true},
		{"main.tf.json", true},
		{"terraform.tfvars", true},
		{"terraform.tfvars.json", true},
		{"env/prod.auto.tfvars.json", true},
		{"prod.tfvars.json", true},
		{"terraform.tfstate", false},
		{"plan.json", false},
		{"main.tf.json.bak", false},
		{"prod.tfvars.json.bak", false},
		{"README.md", false},
	} {
		t.Run(test.path, func(t *testing.T) {
			if got := isRelevant(test.path); got != test.want {
				t.Fatalf("isRelevant(%q) = %v, want %v", test.path, got, test.want)
			}
		})
	}
}

func TestSkippedDirectories(t *testing.T) {
	t.Setenv("TF_DATA_DIR", "cache/tf-data")
	for _, name := range []string{".git", ".terraform", ".terradune", "tf-data"} {
		if !skipDir(name) {
			t.Errorf("should skip %q", name)
		}
	}
	if skipDir("modules") {
		t.Error("module sources must remain watched")
	}
}
