package events_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/events"
	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/tenancy/internal/storefake"
)

func TestProcessMessage_ReapsMemberships(t *testing.T) {
	fake := storefake.New()
	svc := service.New(fake)
	ctx := context.Background()

	_, _ = svc.CreateDomain(ctx, service.CreateDomainInput{Name: "unibo", DisplayName: "UniBO", JoinPolicy: "open-via-idp"})
	_ = svc.Join(ctx, service.JoinInput{AccountID: "gone", DomainName: "unibo", Role: "standard_customer"})

	if err := events.ProcessMessage(ctx, svc, "gone"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	ms, _ := svc.MembershipsFor(ctx, "gone")
	if len(ms) != 0 {
		t.Fatalf("got %d memberships, want 0 after reap", len(ms))
	}
}

func TestProcessMessage_RedeliveryIsSafe(t *testing.T) {
	fake := storefake.New()
	svc := service.New(fake)
	ctx := context.Background()

	// Simulates an at-least-once redelivery: memberships are already gone, so
	// processing again must still succeed rather than retrying forever.
	if err := events.ProcessMessage(ctx, svc, "already-reaped"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := events.ProcessMessage(ctx, svc, "already-reaped"); err != nil {
		t.Fatalf("second delivery should also succeed: %v", err)
	}
}

func TestProcessMessage_IgnoresMalformedEvent(t *testing.T) {
	fake := storefake.New()
	svc := service.New(fake)
	if err := events.ProcessMessage(context.Background(), svc, ""); err != nil {
		t.Fatalf("an empty accountId must not error (and must not retry forever): %v", err)
	}
}

// EnsureGroup tolerates BUSYGROUP so a restarting replica does not fail to boot
// against a group that already exists. The check reads the first nine bytes of
// the message, so the cases that matter are the short ones — a shorter error must
// not panic, and a merely similar prefix must not be swallowed as "already fine".
func TestEnsureGroup_BusyGroupDetection(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"real redis reply", errors.New("BUSYGROUP Consumer Group name already exists"), true},
		{"exactly the prefix", errors.New("BUSYGROUP"), true},
		{"nil error", nil, false},
		{"shorter than the prefix", errors.New("BUSY"), false},
		{"empty message", errors.New(""), false},
		{"different error of the same length", errors.New("NOGROUP N"), false},
		{"lowercase is a different error", errors.New("busygroup ..."), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := events.IsBusyGroup(tc.err); got != tc.want {
				t.Fatalf("IsBusyGroup(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

// A group-creation failure that is NOT BUSYGROUP must stop startup: booting a
// consumer whose group does not exist means the reaper reads nothing and account
// deletions pile up unprocessed, silently.
func TestEnsureGroup_ReturnsRealRedisFailures(t *testing.T) {
	// Port 1 is reserved and never listening, so this fails to connect rather
	// than returning BUSYGROUP — no container needed.
	rdb := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1", DialTimeout: time.Second})
	defer func() { _ = rdb.Close() }()

	consumer := events.NewConsumer(rdb, service.New(storefake.New()), "test-replica")

	if err := consumer.EnsureGroup(context.Background()); err == nil {
		t.Fatal("got nil, want the dial failure to be reported")
	}
}
