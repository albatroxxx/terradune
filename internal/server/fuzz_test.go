package server

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/albatroxxx/terradune/internal/graph"
)

// The Host header is the one thing a page on another origin can aim at this
// server through DNS rebinding. Whatever it carries, only "localhost" or an IP
// literal is answered, and nothing in it can crash the handler.
func FuzzHostHeader(f *testing.F) {
	for _, seed := range []string{
		"localhost:8383", "127.0.0.1:8383", "[::1]:8383", "attacker.example:8383",
		"localhost.attacker.example", "", "127.0.0.1", "::1", "[::1]", "LOCALHOST:8383",
		"127.0.0.1:8383:1", "localhost:", "10.0.0.1", "[", "]:80", "0x7f000001", "127.1",
	} {
		f.Add(seed)
	}
	h := New("/test").Handler()
	f.Fuzz(func(t *testing.T, host string) {
		r := httptest.NewRequest(http.MethodGet, "/healthz", nil)
		r.Host = host
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		name := host
		if h, _, err := net.SplitHostPort(host); err == nil {
			name = h
		}
		name = strings.Trim(name, "[]")
		trusted := name == "localhost" || net.ParseIP(name) != nil
		switch {
		case w.Code == http.StatusOK && !trusted:
			t.Errorf("host %q was served", host)
		case w.Code == http.StatusForbidden && trusted:
			t.Errorf("host %q was refused", host)
		case w.Code != http.StatusOK && w.Code != http.StatusForbidden:
			t.Errorf("host %q: status %d", host, w.Code)
		}
	})
}

// A resource lookup takes two query parameters straight from the URL. An
// unknown pair is a 404, a known pair is JSON, and nothing else happens.
func FuzzResourceQuery(f *testing.F) {
	s := New("/test")
	s.SetGraph("ws", "/ws", "terraform", "1.0",
		&graph.Graph{Edges: []graph.Edge{{From: "aws_instance.a", To: "aws_subnet.b"}}},
		map[string]*graph.Detail{
			"aws_instance.a": {Address: "aws_instance.a", Type: "aws_instance"},
			"aws_subnet.b":   {Address: "aws_subnet.b", Type: "aws_subnet"},
		})
	h := s.Handler()
	for _, seed := range [][2]string{
		{"ws", "aws_instance.a"}, {"ws", "aws_subnet.b"}, {"missing", "aws_instance.a"},
		{"ws", "missing"}, {"ws", ""}, {"", ""}, {"ws", "aws_instance.a\x00"}, {"ws", "%"},
		{"ws", strings.Repeat("a", 5000)}, {"ws\n", "aws_instance.a"},
	} {
		f.Add(seed[0], seed[1])
	}
	f.Fuzz(func(t *testing.T, workspace, address string) {
		q := url.Values{"workspace": {workspace}, "address": {address}}
		r := httptest.NewRequest(http.MethodGet, "/resource?"+q.Encode(), nil)
		r.Host = "localhost"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		known := workspace == "ws" && (address == "aws_instance.a" || address == "aws_subnet.b")
		switch w.Code {
		case http.StatusOK:
			if !known {
				t.Errorf("served %q in %q", address, workspace)
			}
			if !json.Valid(w.Body.Bytes()) {
				t.Error("resource response is not JSON")
			}
		case http.StatusNotFound:
			if known {
				t.Errorf("refused %q in %q", address, workspace)
			}
		default:
			t.Errorf("%q in %q: status %d", address, workspace, w.Code)
		}
	})
}
