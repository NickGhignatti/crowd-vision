@twin @building @must @bt-1
Feature: Provision a digital twin from a building description
  As a Domain Administrator
  I want to upload a description of my building and have a digital twin built from it
  So that the twin mirrors the real structure without developer intervention

  @validation
  Scenario: A malformed description is refused before it is ever accepted
    When I upload a building description with an invalid room to organization "test-domain"
    Then the upload is refused without a tracking handle
    And organization "test-domain" holds no buildings
