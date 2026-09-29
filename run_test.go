package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/albatroxxx/terradune/internal/ingest"
	"github.com/albatroxxx/terradune/internal/server"
)

func captureOutput(t *testing.T, f func()) string {
	t.Helper()
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	old := os.Stdout
	os.Stdout = w
	var out bytes.Buffer
	done := make(chan error, 1)
	go func() { _, err := io.Copy(&out, r); done <- err }()
	func() {
		defer func() {
			os.Stdout = old
			w.Close()
			if err := <-done; err != nil {
				t.Error(err)
			}
			r.Close()
		}()
		f()
	}()
	return out.String()
}

func TestRunAndCLI(t *testing.T) {
	bin := t.TempDir()
	name := "terraform"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	build := exec.Command("go", "build", "-o", filepath.Join(bin, name), "./internal/ingest/testdata/fakecli")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build fixture: %v\n%s", err, out)
	}
	t.Setenv("PATH", bin)
	t.Setenv("TF_DATA_DIR", ".test-data")
	workspace := func(t *testing.T, root, name, mode string) string {
		t.Helper()
		dir := filepath.Join(root, name)
		if err := os.MkdirAll(ingest.DataDir(dir), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, ".test-cli-mode"), []byte(mode), 0o600); err != nil {
			t.Fatal(err)
		}
		return dir
	}
	t.Run("print continues after a failed workspace", func(t *testing.T) {
		root := t.TempDir()
		workspace(t, root, "a-broken", "plan-error")
		workspace(t, root, "z-good", "success")
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		out := captureOutput(t, func() {
			err := run(ctx, root, "invalid-host", 0, true, ingest.Options{})
			if err == nil || !strings.Contains(err.Error(), "one or more workspaces failed") {
				t.Errorf("got %v", err)
			}
		})
		for _, want := range []string{"=== a-broken ===", "error:", "=== z-good ===", "Will be created (1)", "terraform_data.sample"} {
			if !strings.Contains(out, want) {
				t.Errorf("missing %q: %s", want, out)
			}
		}
	})
	t.Run("main flags and print", func(t *testing.T) {
		root := workspace(t, t.TempDir(), "app", "success")
		oldFlags, oldArgs, oldUsage := flag.CommandLine, os.Args, flag.Usage
		t.Cleanup(func() { flag.CommandLine, os.Args, flag.Usage = oldFlags, oldArgs, oldUsage })
		for _, args := range [][]string{{"-version"}, {"-print", "-refresh", "-var", "label=hello world", "-var", "count=2", root}} {
			flag.CommandLine = flag.NewFlagSet("terradune", flag.ContinueOnError)
			var usage bytes.Buffer
			flag.CommandLine.SetOutput(&usage)
			os.Args = append([]string{"terradune"}, args...)
			out := captureOutput(t, main)
			if args[0] == "-version" && !strings.Contains(out, "terradune ") {
				t.Fatal(out)
			}
			if args[0] == "-print" && !strings.Contains(out, "Will be created (1)") {
				t.Fatal(out)
			}
			flag.Usage()
			if !strings.Contains(usage.String(), "Usage: terradune") || !strings.Contains(usage.String(), "-var-file") {
				t.Fatal(usage.String())
			}
		}
	})
	t.Run("startup errors", func(t *testing.T) {
		root := workspace(t, t.TempDir(), "app", "success")
		for _, tc := range []struct {
			dir, host string
			port      int
			want      string
		}{
			{filepath.Join(root, "missing"), "localhost", 8383, "not a directory"},
			{root, "not-an-IP", 8383, "host must"},
			{root, "localhost", 0, "port must"},
		} {
			if err := run(context.Background(), tc.dir, tc.host, tc.port, false, ingest.Options{}); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("got %v want %s", err, tc.want)
			}
		}
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer ln.Close()
		if err := run(context.Background(), root, "127.0.0.1", ln.Addr().(*net.TCPAddr).Port, false, ingest.Options{}); err == nil || !strings.Contains(err.Error(), "already in use") {
			t.Fatalf("occupied port: %v", err)
		}
	})
	for _, mode := range []string{"success", "plan-error"} {
		t.Run("server "+mode, func(t *testing.T) {
			root := workspace(t, t.TempDir(), "app", mode)
			ln, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			port := ln.Addr().(*net.TCPAddr).Port
			addr := ln.Addr().String()
			ln.Close()
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			done := make(chan error, 1)
			go func() { done <- run(ctx, root, "127.0.0.1", port, false, ingest.Options{}) }()
			defer func() {
				cancel()
				select {
				case err := <-done:
					if err != nil {
						t.Errorf("server shutdown: %v", err)
					}
				case <-time.After(5 * time.Second):
					t.Error("server did not stop")
				}
			}()
			client := &http.Client{Timeout: time.Second}
			defer client.CloseIdleConnections()
			for ctx.Err() == nil {
				resp, err := client.Get("http://" + addr + "/state")
				if err == nil {
					var state server.State
					err = json.NewDecoder(resp.Body).Decode(&state)
					resp.Body.Close()
					if err != nil {
						t.Fatal(err)
					}
					if len(state.Workspaces) == 1 && !state.Workspaces[0].Rebuilding {
						ws := state.Workspaces[0]
						if mode == "success" && (ws.Error != "" || len(ws.Nodes) != 1 || ws.CLI != "terraform") {
							t.Fatalf("bad state: %+v", ws)
						}
						if mode == "plan-error" && !strings.Contains(ws.Error, "plan failed") {
							t.Fatalf("missing plan error: %+v", ws)
						}
						return
					}
				}
				time.Sleep(20 * time.Millisecond)
			}
			t.Fatal("server never published completed plan state")
		})
	}
}

func TestRepeatableFlags(t *testing.T) {
	var values repeatable
	if values.String() != "" {
		t.Fatal(values.String())
	}
	for _, value := range []string{"a=hello world", "b=2"} {
		if err := values.Set(value); err != nil {
			t.Fatal(err)
		}
	}
	if values.String() != "a=hello world,b=2" {
		t.Fatal(values.String())
	}
}
