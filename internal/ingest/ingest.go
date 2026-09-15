// Package ingest runs `terraform plan` against a workspace and turns the
// plan JSON into terradune's view of the world: what already exists and
// what the plan will create, change, or destroy.
package ingest

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/hashicorp/terraform-exec/tfexec"
	tfjson "github.com/hashicorp/terraform-json"
)

// Status describes what the plan intends for a single resource.
type Status string

const (
	StatusExisting Status = "existing" // in state, no changes
	StatusCreate   Status = "create"
	StatusUpdate   Status = "update"
	StatusDestroy  Status = "destroy"
	StatusReplace  Status = "replace"
)

// Resource is one resource instance from the plan.
type Resource struct {
	Address      string // full address, e.g. module.vpc.aws_subnet.private[0]
	Type         string // e.g. aws_subnet
	Name         string
	ProviderName string
	Status       Status
}

// Inventory is everything terradune knows after one plan.
type Inventory struct {
	// CLI is the binary that produced this plan: "terraform" or "tofu".
	CLI              string
	TerraformVersion string
	Resources        []Resource
	Plan             *tfjson.Plan // the raw plan, for graph building
	// DOT is Terraform's own dependency graph for this plan. It resolves
	// wiring that runs through locals, which plan JSON omits entirely.
	DOT []byte
}

// Options are the plan inputs a real workspace usually needs: most are not
// runnable without variables.
type Options struct {
	VarFiles []string // paths passed to terraform as -var-file
	Vars     []string // "name=value" pairs passed as -var
	Refresh  bool     // refresh state before planning
}

// cliNames are the binaries terradune can drive, in the order it looks for
// them. OpenTofu is a fork of Terraform and takes the same plan, show and
// graph commands — the only three terradune runs — so either one satisfies it.
//
// The order is for people; the fallback is for packaging. A workspace someone
// initialized with Terraform should be planned by Terraform, so it wins when
// both are installed. But Terraform is BUSL-licensed and no Linux distribution
// ships it, while OpenTofu is Apache-2.0 and most do — accepting it is what
// lets a .rpm or .deb declare a dependency the distribution can satisfy.
var cliNames = []string{"terraform", "tofu"}

// FindCLI returns the path of the first CLI terradune can drive, and the name
// it was found under so the interface can say which one produced a plan.
func FindCLI() (path, name string, err error) {
	for _, name := range cliNames {
		if path, err := exec.LookPath(name); err == nil {
			return path, name, nil
		}
	}
	return "", "", fmt.Errorf("no %s binary found in PATH",
		strings.Join(cliNames, " or "))
}

// DisplayName is how a CLI is written for a reader. An empty name predates
// knowing which one ran, and Terraform is the safe thing to call it then.
func DisplayName(cli string) string {
	if cli == "tofu" {
		return "OpenTofu"
	}
	return "Terraform"
}

// Load runs plan+show in dir and returns the parsed inventory.
func Load(ctx context.Context, dir string, opts Options) (*Inventory, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	if info, err := os.Stat(abs); err != nil || !info.IsDir() {
		return nil, fmt.Errorf("%s is not a directory", abs)
	}
	// Look for the CLI before checking initialization: without one, no advice
	// about how to initialize is worth giving.
	execPath, cli, err := FindCLI()
	if err != nil {
		return nil, err
	}
	if !initialized(abs) {
		return nil, fmt.Errorf("workspace %s is not initialized — run `%s init` there first", abs, cli)
	}

	tf, err := tfexec.NewTerraform(abs, execPath)
	if err != nil {
		return nil, err
	}

	tmp, err := os.MkdirTemp("", "terradune-plan-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp)
	planFile := filepath.Join(tmp, "tfplan")

	planOpts := []tfexec.PlanOption{tfexec.Out(planFile), tfexec.Refresh(opts.Refresh), tfexec.LockTimeout("30s")}
	for _, vf := range opts.VarFiles {
		abs, err := filepath.Abs(vf)
		if err != nil {
			return nil, err
		}
		if _, err := os.Stat(abs); err != nil {
			return nil, fmt.Errorf("var file %s: %w", vf, err)
		}
		planOpts = append(planOpts, tfexec.VarFile(abs))
	}
	for _, v := range opts.Vars {
		planOpts = append(planOpts, tfexec.Var(v))
	}

	if _, err := tf.Plan(ctx, planOpts...); err != nil {
		return nil, fmt.Errorf("%s plan failed: %w", cli, err)
	}

	plan, err := tf.ShowPlanFile(ctx, planFile)
	if err != nil {
		return nil, fmt.Errorf("%s show failed: %w", cli, err)
	}

	inv := fromPlan(plan)
	inv.CLI = cli
	// Best effort: the diagram is still useful without it, so a failure here
	// is not worth failing the whole load for.
	if dot, err := tf.Graph(ctx, tfexec.GraphPlan(planFile)); err == nil {
		inv.DOT = []byte(dot)
	}
	return inv, nil
}

func fromPlan(plan *tfjson.Plan) *Inventory {
	inv := &Inventory{TerraformVersion: plan.TerraformVersion, Plan: plan}
	for _, rc := range plan.ResourceChanges {
		if rc.Mode != tfjson.ManagedResourceMode {
			continue // skip data sources for now
		}
		inv.Resources = append(inv.Resources, Resource{
			Address:      rc.Address,
			Type:         rc.Type,
			Name:         rc.Name,
			ProviderName: rc.ProviderName,
			Status:       statusOf(rc.Change.Actions),
		})
	}
	sort.Slice(inv.Resources, func(i, j int) bool {
		return inv.Resources[i].Address < inv.Resources[j].Address
	})
	return inv
}

func statusOf(actions tfjson.Actions) Status {
	switch {
	case actions.Replace():
		return StatusReplace
	case actions.Create():
		return StatusCreate
	case actions.Delete():
		return StatusDestroy
	case actions.Update():
		return StatusUpdate
	default:
		return StatusExisting
	}
}

// PrintSummary writes a human-readable inventory, grouped by status.
func (inv *Inventory) PrintSummary(w io.Writer) {
	groups := []struct {
		status Status
		title  string
	}{
		{StatusExisting, "Already exists (unchanged)"},
		{StatusUpdate, "Will change"},
		{StatusReplace, "Will be replaced"},
		{StatusCreate, "Will be created"},
		{StatusDestroy, "Will be destroyed"},
	}
	fmt.Fprintf(w, "%s %s — %d resources\n", DisplayName(inv.CLI), inv.TerraformVersion, len(inv.Resources))
	for _, g := range groups {
		var members []Resource
		for _, r := range inv.Resources {
			if r.Status == g.status {
				members = append(members, r)
			}
		}
		if len(members) == 0 {
			continue
		}
		fmt.Fprintf(w, "\n%s (%d):\n", g.title, len(members))
		for _, r := range members {
			fmt.Fprintf(w, "  %s\n", r.Address)
		}
	}
}
