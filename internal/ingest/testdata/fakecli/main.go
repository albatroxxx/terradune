// This process fixture exercises terraform-exec without providers or credentials.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	if len(os.Args) < 2 {
		os.Exit(1)
	}
	command := os.Args[1]
	mode, _ := os.ReadFile(".test-cli-mode")
	cwd, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	entry := struct {
		Args         []string
		Dir, DataDir string
	}{os.Args[1:], cwd, os.Getenv("TF_DATA_DIR")}
	f, err := os.OpenFile(".test-cli-log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		panic(err)
	}
	if err := json.NewEncoder(f).Encode(entry); err != nil {
		panic(err)
	}
	if err := f.Close(); err != nil {
		panic(err)
	}
	if string(mode) == command+"-error" {
		fmt.Fprintln(os.Stderr, "synthetic "+command+" failure")
		os.Exit(1)
	}
	switch command {
	case "version":
		fmt.Println(`{"terraform_version":"1.16.2"}`)
	case "plan":
		if string(mode) == "block" {
			time.Sleep(time.Minute)
			os.Exit(1)
		}
		for _, arg := range os.Args[2:] {
			if path, ok := strings.CutPrefix(arg, "-out="); ok {
				checkPlanFile(path, true)
			}
		}
		os.Exit(2) // Terraform's detailed exit code for a plan with changes.
	case "show":
		if string(mode) == "invalid-json" {
			fmt.Println("invalid plan")
			return
		}
		checkPlanFile(os.Args[len(os.Args)-1], false)
		fmt.Println(`{"format_version":"1.2","terraform_version":"1.16.2","resource_changes":[{"address":"terraform_data.sample","mode":"managed","type":"terraform_data","name":"sample","provider_name":"terraform.io/builtin/terraform","change":{"actions":["create"],"before":null,"after":{"input":"example"}}}]}`)
	case "graph":
		fmt.Println(`digraph { "[root] terraform_data.sample (expand)"; }`)
	default:
		fmt.Fprintln(os.Stderr, "unexpected command: "+command)
		os.Exit(1)
	}
}

// Even a test executable must not write to arbitrary command-line paths.
func checkPlanFile(path string, create bool) {
	root, err := os.OpenRoot(os.TempDir())
	if err != nil {
		panic(err)
	}
	defer root.Close()
	relative, err := filepath.Rel(os.TempDir(), path)
	if err != nil {
		panic(err)
	}
	parts := strings.Split(filepath.ToSlash(relative), "/")
	if len(parts) != 2 || !strings.HasPrefix(parts[0], "terradune-plan-") || parts[1] != "tfplan" {
		panic("unexpected temporary plan path")
	}
	flags := os.O_RDONLY
	if create {
		flags = os.O_CREATE | os.O_WRONLY | os.O_TRUNC
	}
	f, err := root.OpenFile(relative, flags, 0o600)
	if err != nil {
		panic(err)
	}
	if err := f.Close(); err != nil {
		panic(err)
	}
}
