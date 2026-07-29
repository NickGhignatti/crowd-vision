package events_test

import (
	"context"
	"testing"

	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/events"
	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/service"
	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/storefake"
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
