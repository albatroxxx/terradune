// Terradune reviews Terraform plans as resources and relationships. One
// command plans every initialized workspace beneath a path and serves the
// result on localhost as three views: Resource Map, Plan, and Graph. It runs
// plan, show, and graph — never apply.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime/debug"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/albatroxxx/terradune/internal/graph"
	"github.com/albatroxxx/terradune/internal/ingest"
	"github.com/albatroxxx/terradune/internal/server"
	"github.com/albatroxxx/terradune/internal/watch"
)

var version = "dev"

func buildVersion() string {
	if version != "dev" {
		return version
	}
	if info, ok := debug.ReadBuildInfo(); ok && info.Main.Version != "" && info.Main.Version != "(devel)" {
		return info.Main.Version
	}
	return version
}

func listenAddress(host string, port int) (string, error) {
	if net.ParseIP(host) == nil && host != "localhost" {
		return "", fmt.Errorf("host must be localhost or an IP address")
	}
	if port < 1 || port > 65535 {
		return "", fmt.Errorf("port must be between 1 and 65535")
	}
	return net.JoinHostPort(host, strconv.Itoa(port)), nil
}

// repeatable collects a flag given more than once, like terraform's own
// -var-file and -var.
type repeatable []string

func (r *repeatable) String() string     { return strings.Join(*r, ",") }
func (r *repeatable) Set(v string) error { *r = append(*r, v); return nil }

// planConcurrency bounds parallel `terraform plan` runs: enough to keep a
// multi-workspace scan quick without thrashing a laptop.
const planConcurrency = 3

func main() {
	showVersion := flag.Bool("version", false, "print version and exit")
	printOnly := flag.Bool("print", false, "print the inventory and graph once, without serving")
	port := flag.Int("port", 8383, "port for the local server")
	hostDefault := os.Getenv("TERRADUNE_HOST")
	if hostDefault == "" {
		hostDefault = "127.0.0.1"
	}
	host := flag.String("host", hostDefault, "listen IP; use 0.0.0.0 inside Docker with a loopback-only published port")
	refresh := flag.Bool("refresh", false, "refresh state before planning (slower, needs live credentials)")
	var varFiles, vars repeatable
	flag.Var(&varFiles, "var-file", "variable file to pass to terraform (repeatable)")
	flag.Var(&vars, "var", "variable as name=value (repeatable)")
	flag.Usage = func() {
		fmt.Fprintf(flag.CommandLine.Output(), "Usage: terradune [flags] <path>\n\n")
		fmt.Fprintf(flag.CommandLine.Output(),
			"<path> may be a Terraform workspace or a directory containing several;\n"+
				"every initialized workspace beneath it is planned and drawn.\n\n")
		flag.PrintDefaults()
	}
	flag.Parse()

	if *showVersion {
		fmt.Println("terradune", buildVersion())
		return
	}

	dir := "."
	if flag.NArg() > 0 {
		dir = flag.Arg(0)
	}

	opts := ingest.Options{VarFiles: varFiles, Vars: vars, Refresh: *refresh}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, dir, *host, *port, *printOnly, opts); err != nil {
		fmt.Fprintln(os.Stderr, "terradune:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, dir, host string, port int, printOnly bool, opts ingest.Options) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	root, err := filepath.Abs(dir)
	if err != nil {
		return err
	}
	workspaces, err := ingest.Discover(root)
	if err != nil {
		return err
	}

	if printOnly {
		var failed bool
		for _, ws := range workspaces {
			fmt.Printf("\n=== %s ===\n", ws.Name)
			inv, err := ingest.Load(ctx, ws.Dir, opts)
			if err != nil {
				fmt.Printf("error: %v\n", err)
				failed = true
				continue
			}
			inv.PrintSummary(os.Stdout)
			graph.BuildWithDOT(inv.Plan, inv.DOT).Print(os.Stdout)
		}
		if failed {
			return fmt.Errorf("one or more workspaces failed to plan")
		}
		return nil
	}

	addr, err := listenAddress(host, port)
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		if errors.Is(err, syscall.EADDRINUSE) {
			return fmt.Errorf("port %d is already in use; choose another port with -port", port)
		}
		return err
	}
	defer ln.Close()
	srv := server.New(root)
	plan := func(ws ingest.Workspace) {
		srv.SetRebuilding(ws.Name, ws.Dir)
		inv, err := ingest.Load(ctx, ws.Dir, opts)
		if err != nil {
			log.Printf("%s: plan failed: %v", ws.Name, err)
			srv.SetError(ws.Name, ws.Dir, err.Error())
			return
		}
		srv.SetGraph(ws.Name, ws.Dir, inv.CLI, inv.TerraformVersion,
			graph.BuildWithDOT(inv.Plan, inv.DOT), graph.BuildDetails(inv.Plan))
		log.Printf("%s: %d resources", ws.Name, len(inv.Resources))
	}

	log.Printf("planning %d workspace(s) under %s", len(workspaces), root)
	plans := newPlanScheduler(ctx, workspaces, plan)
	defer func() { cancel(); plans.Wait() }()

	go func() {
		err := watch.Watch(ctx, root, func(paths []string) {
			hit := map[string]ingest.Workspace{}
			for _, p := range paths {
				if ws, ok := ingest.Owner(workspaces, p); ok {
					hit[ws.Name] = ws
				}
			}
			if len(hit) == 0 { // a shared file outside every workspace
				for _, ws := range workspaces {
					hit[ws.Name] = ws
				}
			}
			for _, ws := range hit {
				log.Printf("%s: change detected", ws.Name)
				plans.Trigger(ws)
			}
		})
		if err != nil && ctx.Err() == nil {
			log.Printf("watcher stopped: %v", err)
		}
	}()

	log.Printf("terradune serving %s", strconv.Quote("http://"+ln.Addr().String()))
	// Timeouts bound how long a stalled client can hold a connection. The
	// write timeout stays open because /events is a long-lived stream.
	server := &http.Server{
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	go func() {
		<-ctx.Done()
		// Closing connections also releases long-lived SSE clients immediately.
		if err := server.Close(); err != nil {
			log.Printf("closing HTTP server: %v", err)
		}
	}()
	err = server.Serve(ln)
	if errors.Is(err, http.ErrServerClosed) && ctx.Err() != nil {
		return nil
	}
	return err
}
