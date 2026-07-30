@twin @building @must @bt-1
Feature: Provision a digital twin from a building description
  As a Domain Administrator
  I want to upload a description of my building and have a digital twin built from it
  So that the twin mirrors the real structure without developer intervention

  @happy-path
  Scenario: A valid description is accepted immediately
    When I upload a valid building description to organization "test-domain"
    Then the upload is acknowledged with a tracking handle

  @happy-path
  Scenario: An accepted upload becomes a viewable twin
    When I upload a valid building description to organization "test-domain"
    Then the tracking handle eventually reports "ready"
    And the twin is viewable

  @validation
  Scenario: A malformed description is refused before it is ever accepted
    When I upload a building description with an invalid room to organization "test-domain"
    Then the upload is refused without a tracking handle
    And organization "test-domain" holds no buildings
