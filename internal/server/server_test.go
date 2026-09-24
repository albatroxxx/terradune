package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/albatroxxx/terradune/internal/graph"
	tfjson "github.com/hashicorp/terraform-json"
)

func TestLatestSnapshotReplacesQueuedState(t *testing.T) {
	s := New("/test")
	ch := make(chan []byte, 1)
	s.clients[ch] = true
	s.SetRebuilding("test", "/test")
	s.SetError("test", "/test", "final error")
	var state State
	if err := json.Unmarshal(<-ch, &state); err != nil {
		t.Fatal(err)
	}
	if state.Workspaces[0].Rebuilding || state.Workspaces[0].Error != "final error" {
		t.Fatalf("stale final snapshot: %+v", state.Workspaces[0])
	}
}

func TestHTTPBoundary(t *testing.T) {
	h := New("/test").Handler()
	for _, test := range []struct {
		method, path, host string
		status             int
	}{
		{"GET", "/healthz", "localhost:8383", 200},
		{"GET", "/state", "127.0.0.1:8383", 200},
		{"GET", "/", "[::1]:8383", 200},
		{"GET", "/state", "attacker.example:8383", 403},
		{"POST", "/state", "localhost:8383", 405},
	} {
		r := httptest.NewRequest(test.method, test.path, nil)
		r.Host = test.host
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != test.status {
			t.Errorf("%+v: status %d", test, w.Code)
		}
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Error("missing no-store")
		}
		if test.path == "/state" && w.Code == http.StatusOK && !json.Valid(w.Body.Bytes()) {
			t.Error("initial state is not JSON")
		}
	}
}

func TestSensitiveValuesDoNotReachPublicEndpoints(t *testing.T) {
	var plan tfjson.Plan
	if err := json.Unmarshal([]byte(`{"format_version":"1.2","resource_changes":[{"address":"aws_vpc.main","mode":"managed","type":"aws_vpc","name":"main","change":{"actions":["create"],"after":{"id":"secret-id","cidr_block":"secret-cidr","tags":{"Name":"secret-name"}},"after_sensitive":{"id":true,"cidr_block":true,"tags":{"Name":true}}}}]}`), &plan); err != nil {
		t.Fatal(err)
	}
	s := New("/test")
	s.SetGraph("test", "/test", "terraform", "1.16.2", graph.Build(&plan), graph.BuildDetails(&plan))
	for _, path := range []string{"/state", "/resource?workspace=test&address=aws_vpc.main"} {
		r := httptest.NewRequest("GET", path, nil)
		r.Host = "localhost"
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, r)
		if w.Code != 200 || strings.Contains(w.Body.String(), "secret-") {
			t.Fatalf("%s leaked or failed: %s", path, w.Body.String())
		}
	}
}

func TestAttachedResourcesIncludeSanitizedBeforeValues(t *testing.T) {
	raw, err := os.ReadFile("../graph/testdata/connection_changes_plan.json")
	if err != nil {
		t.Fatal(err)
	}
	var plan tfjson.Plan
	if err := json.Unmarshal(raw, &plan); err != nil {
		t.Fatal(err)
	}
	for _, rc := range plan.ResourceChanges {
		if rc.Address == "aws_route.updated" {
			rc.Change.Before.(map[string]interface{})["description"] = "secret-before"
			rc.Change.BeforeSensitive = map[string]interface{}{"description": true}
		}
	}
	s := New("/test")
	s.SetGraph("test", "/test", "terraform", plan.TerraformVersion, graph.Build(&plan), graph.BuildDetails(&plan))
	r := httptest.NewRequest("GET", "/resource?workspace=test&address=aws_route_table.main", nil)
	r.Host = "localhost"
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusOK || strings.Contains(w.Body.String(), "secret-before") {
		t.Fatalf("attached details leaked or failed: %s", w.Body.String())
	}
	var response resourceResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	attached := map[string]related{}
	for _, resource := range response.Attached {
		attached[resource.Address] = resource
	}
	updated := attached["aws_route.updated"]
	if updated.Before["nat_gateway_id"] != "nat-synthetic" || updated.After["gateway_id"] != "igw-synthetic" {
		t.Fatalf("attached update missing diff: %+v", updated)
	}
	if updated.Before["description"] != "(sensitive value)" {
		t.Fatalf("before value was not redacted: %+v", updated.Before)
	}
	if attached["aws_route.removed"].Before["destination_ipv6_cidr_block"] != "::/0" {
		t.Fatal("deleted attached route missing before values")
	}
}
