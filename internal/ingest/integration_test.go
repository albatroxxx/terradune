package ingest

import (
	"context"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// CI provides a real CLI. Normal unit tests remain independent of an installed
// CLI, provider downloads, credentials, and cloud accounts.
func TestCLIIntegration(t *testing.T) {
	cliPath := os.Getenv("TERRADUNE_TEST_CLI")
	if cliPath == "" {
		t.Skip("set TERRADUNE_TEST_CLI to a real terraform or tofu executable")
	}
	name := strings.TrimSuffix(filepath.Base(cliPath), ".exe")
	if name != "terraform" && name != "tofu" {
		t.Fatal("TERRADUNE_TEST_CLI must point to terraform or tofu")
	}
	binDir := t.TempDir()
	isolated := filepath.Join(binDir, name)
	if runtime.GOOS == "windows" {
		isolated += ".exe"
	}
	source, err := os.Open(cliPath)
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	destination, err := os.OpenFile(isolated, os.O_CREATE|os.O_WRONLY, 0o700)
	if err != nil {
		t.Fatal(err)
	}
	_, copyErr := io.Copy(destination, source)
	closeErr := destination.Close()
	if copyErr != nil || closeErr != nil {
		t.Fatalf("isolate CLI: copy=%v close=%v", copyErr, closeErr)
	}
	t.Setenv("PATH", binDir)
	t.Setenv("TF_DATA_DIR", ".cli-data")
	t.Setenv("CHECKPOINT_DISABLE", "1")
	t.Setenv("TF_IN_AUTOMATION", "1")
	root := t.TempDir()
	config := `variable "label" { type = string }
resource "terraform_data" "source" { input = var.label }
resource "terraform_data" "dependent" { input = terraform_data.source.output }
output "label" { value = terraform_data.source.input }
`
	if err := os.WriteFile(filepath.Join(root, "main.tf"), []byte(config), 0o600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	init := exec.CommandContext(ctx, isolated, "init", "-input=false", "-no-color")
	init.Dir = root
	if output, err := init.CombinedOutput(); err != nil {
		t.Fatalf("init: %v\n%s", err, output)
	}
	// A built-in-provider-only init may not create a plugin directory.
	if err := os.MkdirAll(DataDir(root), 0o700); err != nil {
		t.Fatal(err)
	}
	vars := filepath.Join(root, "inputs.tfvars")
	if err := os.WriteFile(vars, []byte("label = \"from-file\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	inv, err := Load(ctx, root, Options{VarFiles: []string{vars}, Vars: []string{"label=from-flag"}})
	if err != nil {
		t.Fatal(err)
	}
	if inv.CLI != name || inv.TerraformVersion == "" {
		t.Fatalf("unexpected CLI metadata: %q %q", inv.CLI, inv.TerraformVersion)
	}
	if len(inv.Resources) != 2 {
		t.Fatalf("got %d resources, want 2", len(inv.Resources))
	}
	for _, resource := range inv.Resources {
		if resource.Status != StatusCreate {
			t.Fatalf("%s: got %s, want create", resource.Address, resource.Status)
		}
	}
	if output := inv.Plan.OutputChanges["label"]; output == nil || output.After != "from-flag" {
		t.Fatalf("variable-file/flag precedence lost: %#v", output)
	}
	if !strings.Contains(string(inv.DOT), "terraform_data.source") ||
		!strings.Contains(string(inv.DOT), "terraform_data.dependent") {
		t.Fatalf("missing real CLI dependency graph: %s", inv.DOT)
	}
	if _, err := Load(ctx, root, Options{Vars: []string{"label=ok", "does_not_exist=bad"}}); err == nil {
		t.Fatal("invalid plan inputs must return an error")
	}
	canceled, stop := context.WithCancel(context.Background())
	stop()
	if _, err := Load(canceled, root, Options{Vars: []string{"label=ok"}}); err == nil {
		t.Fatal("canceled planning must return an error")
	}
	if _, err := os.Stat(filepath.Join(root, "terraform.tfstate")); !os.IsNotExist(err) {
		t.Fatalf("plan-only integration must not create applied state: %v", err)
	}
	t.Logf("%s %s: init, plan, show, graph, inputs, failures, cancellation passed", DisplayName(name), inv.TerraformVersion)
}
