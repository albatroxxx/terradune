package main

import (
	"net"
	"strconv"
	"testing"
)

// The listen address comes from a flag and an environment variable. Whatever
// they hold, terradune either refuses it or binds exactly what was asked:
// a loopback name or an IP literal, and a port in range.
func FuzzListenAddress(f *testing.F) {
	for _, seed := range []struct {
		host string
		port int
	}{
		{"127.0.0.1", 8383}, {"localhost", 1}, {"::1", 65535}, {"0.0.0.0", 80},
		{"example.com", 8383}, {"", 8383}, {"127.0.0.1", 0}, {"127.0.0.1", 70000},
		{"[::1]", 8383}, {"127.0.0.1\n", 8383}, {"localhost:8383", 8383}, {"fe80::1%lo0", 8383},
	} {
		f.Add(seed.host, seed.port)
	}
	f.Fuzz(func(t *testing.T, host string, port int) {
		addr, err := listenAddress(host, port)
		if err != nil {
			if addr != "" {
				t.Errorf("an error came with an address: %q", addr)
			}
			return
		}
		if port < 1 || port > 65535 {
			t.Errorf("port %d was accepted", port)
		}
		gotHost, gotPort, splitErr := net.SplitHostPort(addr)
		if splitErr != nil {
			t.Fatalf("%q cannot be split again: %v", addr, splitErr)
		}
		if gotPort != strconv.Itoa(port) {
			t.Errorf("port %d became %q", port, gotPort)
		}
		if gotHost != "localhost" && net.ParseIP(gotHost) == nil {
			t.Errorf("host %q was accepted as %q", host, gotHost)
		}
	})
}
