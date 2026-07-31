@twin @building @must @bt-1 @performance @qa-7
Feature: Acceptance is interactive and completion is prompt
  As a Domain Administrator
  I want my upload acknowledged quickly and my twin available soon after
  So that provisioning never feels like it stalled

  Scenario Outline: Acceptance is interactive and completion is prompt
    When 100 Domain Administrators each upload a valid description of a <rooms>-room building to organization "test-domain"
    Then the 99th percentile of the request-to-acknowledgement time is at most 1 second
    And every twin eventually becomes available for viewing and editing
    And the 99th percentile of the acknowledgement-to-available time is at most 10 seconds

    Examples: Building sizes inside the stated envelope
      | rooms |
      | 20    |
      | 200   |
