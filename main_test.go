package main

import "testing"

func TestListenAddress(t *testing.T) {
	for _, test := range []struct {
		host string
		port int
		want string
	}{
		{"127.0.0.1", 8383, "127.0.0.1:8383"},
		{"0.0.0.0", 8383, "0.0.0.0:8383"},
		{"::1", 8383, "[::1]:8383"},
		{"localhost", 8383, "localhost:8383"},
		{"", 8383, ""}, {"example.com", 8383, ""},
		{"127.0.0.1", 0, ""}, {"127.0.0.1", 65536, ""},
	} {
		got, err := listenAddress(test.host, test.port)
		if got != test.want || (err != nil) != (test.want == "") {
			t.Errorf("listenAddress(%q, %d) = %q, %v", test.host, test.port, got, err)
		}
	}
}

func TestBuildVersionOverride(t *testing.T) {
	old := version
	t.Cleanup(func() { version = old })
	version = "v1.0.0"
	if got := buildVersion(); got != version {
		t.Fatalf("version = %q", got)
	}
}
