package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"testing/synctest"
	"time"

	"github.com/albatroxxx/terradune/internal/graph"
)

type eventWriter struct {
	*httptest.ResponseRecorder
	mu                      sync.Mutex
	writes, failAt, flushes int
}

func (w *eventWriter) Write(b []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.writes++
	if w.writes == w.failAt {
		return 0, errors.New("client disconnected")
	}
	return w.ResponseRecorder.Write(b)
}

func (w *eventWriter) Flush() {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.flushes++
	w.ResponseRecorder.Flush()
}

func (w *eventWriter) body() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.Body.String()
}

func TestEventsLifecycle(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		s := New("/workspaces")
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		w := &eventWriter{ResponseRecorder: httptest.NewRecorder()}
		go s.Handler().ServeHTTP(w, httptest.NewRequest("GET", "http://localhost/events", nil).WithContext(ctx))
		synctest.Wait()
		if w.Header().Get("Content-Type") != "text/event-stream" || w.Header().Get("Cache-Control") != "no-cache" || w.flushes != 1 || len(s.clients) != 1 {
			t.Fatalf("stream not initialized: %+v", w)
		}
		s.SetGraph("app", "/app", "tofu", "1.12.6", &graph.Graph{Nodes: []graph.Node{{ID: "terraform_data.sample"}}}, nil)
		synctest.Wait()
		s.SetRebuilding("app", "/app")
		synctest.Wait()
		s.SetError("app", "/app", "plan failed")
		synctest.Wait()
		frames := strings.Split(strings.TrimSuffix(w.body(), "\n\n"), "\n\n")
		if len(frames) != 4 {
			t.Fatalf("frames=%q", frames)
		}
		var states []State
		for _, frame := range frames {
			payload, ok := strings.CutPrefix(frame, "data: ")
			if !ok {
				t.Fatalf("bad SSE framing: %q", frame)
			}
			var state State
			if err := json.Unmarshal([]byte(payload), &state); err != nil {
				t.Fatal(err)
			}
			states = append(states, state)
		}
		if states[0].Root != "/workspaces" || len(states[0].Workspaces) != 0 {
			t.Fatal("initial snapshot lost")
		}
		if states[1].Workspaces[0].CLI != "tofu" || !states[2].Workspaces[0].Rebuilding {
			t.Fatal("live metadata/rebuilding state lost")
		}
		last := states[3].Workspaces[0]
		if last.Rebuilding || last.Error != "plan failed" || len(last.Nodes) != 1 {
			t.Fatalf("failed replan discarded good graph: %+v", last)
		}
		time.Sleep(25 * time.Second)
		synctest.Wait()
		if !strings.HasSuffix(w.body(), ": ping\n\n") || w.flushes != 5 {
			t.Fatal("missing flushed heartbeat")
		}
		cancel()
		synctest.Wait()
		if len(s.clients) != 0 {
			t.Fatal("canceled client still registered")
		}
	})
}

func TestEventsDisconnects(t *testing.T) {
	// Each SSE chunk can fail independently, including the keepalive.
	for failAt := 1; failAt <= 7; failAt++ {
		t.Run(fmt.Sprint(failAt), func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				s := New("/workspaces")
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				w := &eventWriter{ResponseRecorder: httptest.NewRecorder(), failAt: failAt}
				go s.handleEvents(w, httptest.NewRequest("GET", "/events", nil).WithContext(ctx))
				synctest.Wait()
				if failAt > 3 {
					s.SetRebuilding("app", "/app")
					synctest.Wait()
				}
				if failAt == 7 {
					time.Sleep(25 * time.Second)
					synctest.Wait()
				}
				if w.writes != failAt || len(s.clients) != 0 {
					t.Fatalf("failed write %d: writes=%d clients=%d", failAt, w.writes, len(s.clients))
				}
			})
		})
	}
}

func TestEventsRequireFlusher(t *testing.T) {
	w := httptest.NewRecorder()
	New("/").handleEvents(struct{ http.ResponseWriter }{w}, httptest.NewRequest("GET", "/events", nil))
	if w.Code != http.StatusInternalServerError || !strings.Contains(w.Body.String(), "streaming unsupported") {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
	}
}

func TestFailedResponseWrite(t *testing.T) {
	w := &eventWriter{ResponseRecorder: httptest.NewRecorder(), failAt: 1}
	New("/").Handler().ServeHTTP(w, httptest.NewRequest("GET", "http://localhost/healthz", nil))
	if w.writes != 1 || w.Body.Len() != 0 {
		t.Fatal("failed response write was retried")
	}
}
