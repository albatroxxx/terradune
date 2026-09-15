package main

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/albatroxxx/terradune/internal/ingest"
)

func awaitCall(t *testing.T, calls <-chan struct{}) {
	t.Helper()
	select {
	case <-calls:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for plan")
	}
}

func TestSchedulerCoalescesDuringInitialPlan(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ws := ingest.Workspace{Name: "test", Dir: "/test"}
	started, release := make(chan struct{}, 10), make(chan struct{}, 10)
	var active atomic.Int32
	s := newPlanScheduler(ctx, []ingest.Workspace{ws}, func(ingest.Workspace) {
		if active.Add(1) != 1 {
			t.Error("same workspace planned concurrently")
		}
		started <- struct{}{}
		select {
		case <-release:
		case <-ctx.Done():
		}
		active.Add(-1)
	})
	awaitCall(t, started)
	for range 1000 {
		s.Trigger(ws)
	}
	release <- struct{}{}
	awaitCall(t, started)
	cancel()
	s.Wait()
	if len(started) != 0 {
		t.Fatal("edit burst produced more than one follow-up")
	}
}

func TestSchedulerBoundsConcurrencyAndCancels(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var workspaces []ingest.Workspace
	for i := range 8 {
		workspaces = append(workspaces, ingest.Workspace{Name: fmt.Sprint(i), Dir: fmt.Sprint(i)})
	}
	started := make(chan struct{}, 8)
	var active, peak atomic.Int32
	s := newPlanScheduler(ctx, workspaces, func(ingest.Workspace) {
		n := active.Add(1)
		for old := peak.Load(); n > old && !peak.CompareAndSwap(old, n); old = peak.Load() {
		}
		started <- struct{}{}
		<-ctx.Done()
		active.Add(-1)
	})
	for range planConcurrency {
		awaitCall(t, started)
	}
	cancel()
	s.Wait()
	if peak.Load() > planConcurrency || active.Load() != 0 {
		t.Fatalf("peak=%d active=%d", peak.Load(), active.Load())
	}
}
