// Package events consumes account.deleted from Redis Streams and reaps the
// account's memberships. This is the replacement for the foreign key that
// can't exist across a service boundary — identity lives in Keycloak, a
// separate deployable with its own database (Postgres-per-service).
//
// At-least-once delivery (a consumer group, not plain pub/sub) is
// deliberate: losing this event permanently orphans a membership row. The
// handler is idempotent (see service.ReapAccount), so redelivery is safe.
package events

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/NickGhignatti/crowd-vision/server/tenancy-service/internal/service"
)

const (
	Stream = "account.deleted"
	Group  = "tenancy-service"
)

type Consumer struct {
	rdb  *redis.Client
	svc  *service.Service
	name string // unique per replica (e.g. hostname); required by consumer groups
}

func NewConsumer(rdb *redis.Client, svc *service.Service, name string) *Consumer {
	return &Consumer{rdb: rdb, svc: svc, name: name}
}

// EnsureGroup creates the consumer group (MKSTREAM so it exists even before
// the first event) and tolerates BUSYGROUP on restart.
func (c *Consumer) EnsureGroup(ctx context.Context) error {
	err := c.rdb.XGroupCreateMkStream(ctx, Stream, Group, "0").Err()
	if err != nil && !isBusyGroup(err) {
		return err
	}
	return nil
}

func isBusyGroup(err error) bool {
	return err != nil && len(err.Error()) >= 9 && err.Error()[:9] == "BUSYGROUP"
}

// Run blocks, reading and acking messages until ctx is cancelled. A message
// is only acked after ProcessMessage succeeds — a failed reap is redelivered
// on the next read rather than silently dropped.
func (c *Consumer) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		res, err := c.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group: Group, Consumer: c.name,
			Streams: []string{Stream, ">"}, Count: 32, Block: 5 * time.Second,
		}).Result()
		if err != nil {
			if err != redis.Nil && ctx.Err() == nil {
				log.Printf("events: read error: %v", err)
				time.Sleep(time.Second)
			}
			continue
		}

		for _, s := range res {
			for _, msg := range s.Messages {
				accountID, _ := msg.Values["accountId"].(string)
				if err := ProcessMessage(ctx, c.svc, accountID); err != nil {
					log.Printf("events: reap failed for %q, will redeliver: %v", accountID, err)
					continue // do NOT ack — redelivered on the next XReadGroup
				}
				c.rdb.XAck(ctx, Stream, Group, msg.ID)
			}
		}
	}
}

// ProcessMessage is the pure, directly-testable core: given an accountID,
// reap its memberships. Idempotent — reaping twice (redelivery) is a no-op.
func ProcessMessage(ctx context.Context, svc *service.Service, accountID string) error {
	if accountID == "" {
		return nil // malformed event; nothing to do, don't retry forever
	}
	return svc.ReapAccount(ctx, accountID)
}
