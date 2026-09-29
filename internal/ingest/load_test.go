package ingest

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"strings"
	"testing"
	"time"

	tfjson "github.com/hashicorp/terraform-json"
)

func TestLoadProcess(t *testing.T) {
	bin := t.TempDir()
	name := "terraform"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	build := exec.Command("go", "build", "-o", filepath.Join(bin, name), "./testdata/fakecli")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build fixture: %v\n%s", err, out)
	}
	t.Setenv("PATH", bin)
	t.Setenv("TF_DATA_DIR", ".test-data")
	for _, mode := range []string{"success", "plan-error", "show-error", "invalid-json", "graph-error", "block"} {
		t.Run(mode, func(t *testing.T) {
			root := t.TempDir()
			if err := os.Mkdir(DataDir(root), 0o700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(root, ".test-cli-mode"), []byte(mode), 0o600); err != nil {
				t.Fatal(err)
			}
			vars := filepath.Join(root, "with spaces.tfvars")
			if err := os.WriteFile(vars, []byte("label = \"test\""), 0o600); err != nil {
				t.Fatal(err)
			}
			secondVars := filepath.Join(root, "overrides.tfvars")
			if err := os.WriteFile(secondVars, []byte("count = 2"), 0o600); err != nil {
				t.Fatal(err)
			}
			t.Chdir(root)
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			// Cancel only once the child has entered plan, not during process startup.
			var cancelDone chan struct{}
			if mode == "block" {
				cancelDone = make(chan struct{})
				go func() {
					defer close(cancelDone)
					for ctx.Err() == nil {
						log, _ := os.ReadFile(filepath.Join(root, ".test-cli-log"))
						if bytes.Contains(log, []byte(`"plan"`)) {
							cancel()
							return
						}
						time.Sleep(10 * time.Millisecond)
					}
				}()
			}
			inputs := []string{"label=hello world; $(not-a-shell)", "count=2"}
			inv, err := Load(ctx, root, Options{VarFiles: []string{filepath.Base(vars), secondVars}, Vars: inputs, Refresh: mode == "success"})
			if cancelDone != nil {
				<-cancelDone
			}
			success := mode == "success" || mode == "graph-error"
			if success {
				if err != nil {
					t.Fatal(err)
				}
				if inv.CLI != "terraform" || inv.TerraformVersion != "1.16.2" || len(inv.Resources) != 1 || inv.Resources[0].Status != StatusCreate {
					t.Fatalf("unexpected inventory: %+v", inv)
				}
				if (len(inv.DOT) > 0) != (mode == "success") {
					t.Fatalf("unexpected DOT: %s", inv.DOT)
				}
			} else {
				want := "terraform plan failed"
				if mode == "show-error" || mode == "invalid-json" {
					want = "terraform show failed"
				}
				if err == nil || !strings.Contains(err.Error(), want) || inv != nil {
					t.Fatalf("inventory=%v error=%v, want %s", inv, err, want)
				}
			}
			log, err := os.Open(filepath.Join(root, ".test-cli-log"))
			if err != nil {
				t.Fatal(err)
			}
			defer log.Close()
			decoder := json.NewDecoder(log)
			var commands []string
			var planPath string
			for {
				var entry struct {
					Args         []string
					Dir, DataDir string
				}
				err := decoder.Decode(&entry)
				if err == io.EOF {
					break
				}
				if err != nil {
					t.Fatal(err)
				}
				commands = append(commands, entry.Args[0])
				actualDir, dirErr := os.Stat(entry.Dir)
				wantDir, rootErr := os.Stat(root)
				if dirErr != nil || rootErr != nil || !os.SameFile(actualDir, wantDir) || entry.DataDir != ".test-data" {
					t.Fatalf("wrong process environment: %+v", entry)
				}
				if entry.Args[0] == "plan" {
					resolvedVars, err := filepath.Abs(filepath.Base(vars))
					if err != nil {
						t.Fatal(err)
					}
					for _, want := range []string{"-input=false", "-lock-timeout=30s", "-var-file=" + resolvedVars, "-var-file=" + secondVars, inputs[0], inputs[1]} {
						if !slices.Contains(entry.Args, want) {
							t.Errorf("missing intact argument %q in %q", want, entry.Args)
						}
					}
					if slices.Index(entry.Args, "-var-file="+resolvedVars) >= slices.Index(entry.Args, "-var-file="+secondVars) {
						t.Error("variable-file precedence was reordered")
					}
					refresh := "-refresh=false"
					if mode == "success" {
						refresh = "-refresh=true"
					}
					if !slices.Contains(entry.Args, refresh) {
						t.Errorf("missing %s", refresh)
					}
					for _, arg := range entry.Args {
						if path, ok := strings.CutPrefix(arg, "-out="); ok {
							planPath = path
						}
					}
				}
			}
			wantCommands := []string{"plan"}
			if mode != "plan-error" && mode != "block" {
				wantCommands = append(wantCommands, "version", "show")
			}
			if success {
				wantCommands = append(wantCommands, "graph")
			}
			if !reflect.DeepEqual(commands, wantCommands) {
				t.Errorf("commands=%v want=%v", commands, wantCommands)
			}
			if planPath == "" {
				t.Fatal("missing output plan argument")
			}
			if _, err := os.Stat(filepath.Dir(planPath)); !os.IsNotExist(err) {
				t.Errorf("temporary plan directory not removed: %v", err)
			}
		})
	}
	t.Run("invalid inputs", func(t *testing.T) {
		root := t.TempDir()
		for _, tc := range []struct {
			dir  string
			opts Options
			want string
		}{
			{filepath.Join(root, "missing"), Options{}, "not a directory"},
			{root, Options{}, "not initialized"},
		} {
			if _, err := Load(context.Background(), tc.dir, tc.opts); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("got %v want %s", err, tc.want)
			}
		}
		if err := os.Mkdir(DataDir(root), 0o700); err != nil {
			t.Fatal(err)
		}
		if _, err := Load(context.Background(), root, Options{VarFiles: []string{"missing.tfvars"}}); err == nil || !strings.Contains(err.Error(), "var file") {
			t.Fatalf("missing var file: %v", err)
		}
		t.Setenv("PATH", t.TempDir())
		if _, err := Load(context.Background(), root, Options{}); err == nil || !strings.Contains(err.Error(), "no terraform or tofu") {
			t.Fatalf("missing CLI: %v", err)
		}
	})
}

func TestInventoryLifecycleAndSummary(t *testing.T) {
	plan := &tfjson.Plan{TerraformVersion: "1.16.2"}
	for _, tc := range []struct {
		name    string
		actions tfjson.Actions
		status  Status
	}{
		{"unchanged", tfjson.Actions{tfjson.ActionNoop}, StatusExisting},
		{"read", tfjson.Actions{tfjson.ActionRead}, StatusExisting},
		{"create", tfjson.Actions{tfjson.ActionCreate}, StatusCreate},
		{"update", tfjson.Actions{tfjson.ActionUpdate}, StatusUpdate},
		{"destroy", tfjson.Actions{tfjson.ActionDelete}, StatusDestroy},
		{"replace", tfjson.Actions{tfjson.ActionDelete, tfjson.ActionCreate}, StatusReplace},
		{"create_before_destroy", tfjson.Actions{tfjson.ActionCreate, tfjson.ActionDelete}, StatusReplace},
	} {
		if got := statusOf(tc.actions); got != tc.status {
			t.Errorf("%s: %s want %s", tc.name, got, tc.status)
		}
		plan.ResourceChanges = append(plan.ResourceChanges, &tfjson.ResourceChange{Address: "aws_instance." + tc.name, Mode: tfjson.ManagedResourceMode, Type: "aws_instance", Name: tc.name, ProviderName: "aws", Change: &tfjson.Change{Actions: tc.actions}})
	}
	plan.ResourceChanges = append(plan.ResourceChanges, &tfjson.ResourceChange{Mode: tfjson.DataResourceMode})
	inv := fromPlan(plan)
	if inv.Plan != plan || len(inv.Resources) != 7 {
		t.Fatalf("bad inventory: %+v", inv)
	}
	if !slices.IsSortedFunc(inv.Resources, func(a, b Resource) int { return strings.Compare(a.Address, b.Address) }) {
		t.Fatal("resources not sorted")
	}
	for _, r := range inv.Resources {
		if r.Type != "aws_instance" || r.ProviderName != "aws" || r.Address != "aws_instance."+r.Name {
			t.Fatalf("metadata lost: %+v", r)
		}
	}
	for _, cli := range []string{"terraform", "tofu"} {
		inv.CLI = cli
		var out bytes.Buffer
		inv.PrintSummary(&out)
		if !strings.HasPrefix(out.String(), DisplayName(cli)+" 1.16.2") {
			t.Fatal(out.String())
		}
		last := -1
		for _, heading := range []string{"Already exists (unchanged) (2)", "Will change (1)", "Will be replaced (2)", "Will be created (1)", "Will be destroyed (1)"} {
			at := strings.Index(out.String(), heading)
			if at <= last {
				t.Fatalf("summary missing/out of order %q: %s", heading, out.String())
			}
			last = at
		}
		for _, r := range inv.Resources {
			if strings.Count(out.String(), "  "+r.Address+"\n") != 1 {
				t.Errorf("missing/duplicate %s", r.Address)
			}
		}
	}
	var empty bytes.Buffer
	(&Inventory{}).PrintSummary(&empty)
	if strings.Contains(empty.String(), "Will ") || !strings.Contains(empty.String(), "0 resources") {
		t.Fatal(empty.String())
	}
}
