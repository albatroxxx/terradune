//go:build e2e

// Command e2eserver serves the real embedded UI with a synthetic plan. It is
// excluded from production builds and never invokes Terraform or cloud APIs.
package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"net/netip"
	"os"
	"time"

	"github.com/albatroxxx/terradune/internal/graph"
	"github.com/albatroxxx/terradune/internal/server"
	tfjson "github.com/hashicorp/terraform-json"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:18393", "loopback listen address")
	flag.Parse()
	listen, err := netip.ParseAddrPort(*addr)
	if err != nil || !listen.Addr().IsLoopback() {
		log.Fatal("the test server requires a loopback IP address")
	}
	data, err := os.ReadFile("internal/graph/testdata/platform_plan.json")
	if err != nil {
		log.Fatal(err)
	}
	var plan tfjson.Plan
	if err := json.Unmarshal(data, &plan); err != nil {
		log.Fatal(err)
	}
	s := server.New("synthetic fixtures")
	g, details := graph.Build(&plan), graph.BuildDetails(&plan)
	refresh := func() { s.SetGraph("platform", "examples/platform", "terraform", plan.TerraformVersion, g, details) }
	refresh()
	mux := http.NewServeMux()
	// This test-only control exercises the real SSE stream and rendering path.
	mux.HandleFunc("POST /__test/refresh", func(w http.ResponseWriter, r *http.Request) {
		refresh()
		w.WriteHeader(http.StatusNoContent)
	})
	mux.Handle("/", s.Handler())
	srv := &http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Fatal(srv.ListenAndServe())
}
