@twin @building @must @bt-1 @idempotency @qa-p-04
Feature: A redelivered completion event does not create a duplicate twin
  As the platform
  I want a redelivered "building-registration-completed" event to be a no-op
  So that at-least-once broker delivery can never duplicate a twin or corrupt its status

  Scenario: A redelivered "ready" completion event is a no-op
    When I upload a valid building description to organization "test-domain"
    Then the tracking handle eventually reports "ready"
    When the completion event for that upload is redelivered
    Then the tracking handle eventually reports "ready"
    And organization "test-domain" holds exactly one building
