@twin @building @must @bt-1 @tenancy
Feature: A twin is visible only to the organization it is scoped to
  As a Domain Administrator
  I want buildings scoped to my organization only
  So that another organization can never see or list my twin

  Scenario: A twin is visible only to the organization it is scoped to
    Given a twin has been provisioned in organization "test-domain"
    When a member of organization "other-domain" lists its buildings
    Then no building is listed
