//go:build integration

// Integration test for the real Redis Streams transport (XAdd/XReadGroup/XAck); business logic
// is covered without Redis in account_deleted_test.go. Run: go test -tags=integration ./internal/events/...
package events_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"

	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/events"
	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/storefake"
)

func newTestRedis(t *testing.T) *redis.Client {
	t.Helper()
	ctx := context.Background()

	container, err := tcredis.Run(ctx, "redis:7-alpine")
	if err != nil {
		t.Fatalf("starting redis container: %v", err)
	}
	t.Cleanup(func() { _ = container.Terminate(ctx) })

	uri, err := container.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}
	opts, err := redis.ParseURL(uri)
	if err != nil {
		t.Fatalf("parsing redis url: %v", err)
	}
	return redis.NewClient(opts)
}

func TestConsumer_ReapsOnDeliveredEvent(t *testing.T) {
	rdb := newTestRedis(t)
	fake := storefake.New()
	svc := service.New(fake)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp"})
	_ = svc.Join(ctx, service.JoinInput{AccountID: "gone", DomainName: "unibo", Role: "standard_customer"})

	consumer := events.NewConsumer(rdb, svc, "test-consumer")
	if err := consumer.EnsureGroup(ctx); err != nil {
		t.Fatalf("ensure group: %v", err)
	}

	runCtx, stopRun := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() {
		consumer.Run(runCtx)
		close(done)
	}()

	if err := rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: events.Stream, Values: map[string]any{"accountId": "gone"},
	}).Err(); err != nil {
		t.Fatalf("publishing event: %v", err)
	}

	deadline := time.After(10 * time.Second)
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()
	for {
		ms, _ := svc.MembershipsFor(ctx, "gone")
		if len(ms) == 0 {
			break
		}
		select {
		case <-deadline:
			t.Fatal("timed out waiting for the consumer to reap the account")
		case <-tick.C:
		}
	}

	stopRun()
	<-done

	// The message must have been acked — nothing left pending in the group.
	pending, err := rdb.XPending(ctx, events.Stream, events.Group).Result()
	if err != nil {
		t.Fatalf("xpending: %v", err)
	}
	if pending.Count != 0 {
		t.Fatalf("got %d pending entries, want 0 (message should be acked)", pending.Count)
	}
}

// The mirror of the test above, and the reason XAck is not deferred: when the reap
// fails the message must stay pending, so Redis redelivers it. Acking regardless
// would drop the deletion silently and leave memberships for an account that no
// longer exists — the one outcome at-least-once delivery exists to prevent.
func TestConsumer_DoesNotAckWhenTheReapFails(t *testing.T) {
	rdb := newTestRedis(t)
	fake := storefake.New()
	svc := service.New(fake)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	fake.FailOn = map[string]error{"DeleteMembershipsForAccount": errors.New("connection refused")}

	consumer := events.NewConsumer(rdb, svc, "test-consumer")
	if err := consumer.EnsureGroup(ctx); err != nil {
		t.Fatalf("ensure group: %v", err)
	}

	runCtx, stopRun := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() {
		consumer.Run(runCtx)
		close(done)
	}()

	if err := rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: events.Stream, Values: map[string]any{"accountId": "gone"},
	}).Err(); err != nil {
		t.Fatalf("publishing event: %v", err)
	}

	// Wait for the consumer to have taken delivery of it at least once.
	deadline := time.After(10 * time.Second)
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()
	for {
		pending, err := rdb.XPending(ctx, events.Stream, events.Group).Result()
		if err == nil && pending.Count > 0 {
			break
		}
		select {
		case <-deadline:
			t.Fatal("timed out waiting for the consumer to read the event")
		case <-tick.C:
		}
	}

	stopRun()
	<-done

	pending, err := rdb.XPending(ctx, events.Stream, events.Group).Result()
	if err != nil {
		t.Fatalf("xpending: %v", err)
	}
	if pending.Count != 1 {
		t.Fatalf("got %d pending entries, want 1 — a failed reap must stay unacked for redelivery", pending.Count)
	}
}
