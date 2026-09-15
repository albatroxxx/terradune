package main

import (
	"context"
	"sync"

	"github.com/albatroxxx/terradune/internal/ingest"
)

type planScheduler struct {
	requests map[string]chan struct{}
	wg       sync.WaitGroup
}

func newPlanScheduler(ctx context.Context, workspaces []ingest.Workspace, plan func(ingest.Workspace)) *planScheduler {
	s := &planScheduler{requests: make(map[string]chan struct{}, len(workspaces))}
	sem := make(chan struct{}, planConcurrency)
	for _, ws := range workspaces {
		queue := make(chan struct{}, 1)
		s.requests[ws.Dir] = queue
		queue <- struct{}{}
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case <-queue:
				}
				select {
				case <-ctx.Done():
					return
				case sem <- struct{}{}:
				}
				if ctx.Err() == nil {
					plan(ws)
				}
				<-sem
			}
		}()
	}
	return s
}

// Initial plans and edits share one worker per workspace. A burst during a
// running plan requests at most one follow-up, without blocking the watcher.
func (s *planScheduler) Trigger(ws ingest.Workspace) {
	if queue := s.requests[ws.Dir]; queue != nil {
		select {
		case queue <- struct{}{}:
		default:
		}
	}
}

func (s *planScheduler) Wait() { s.wg.Wait() }
