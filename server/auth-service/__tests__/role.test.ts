import { describe, it, expect } from "@jest/globals";
import { hasRequiredRole, ROLE_WEIGHTS } from "../src/models/role.js";

/**
 * Tests for the role-based access control helpers in role.ts.
 *
 * hasRequiredRole is a pure function: no DB, no I/O.  It compares numeric
 * role weights so that higher-privileged users always satisfy lower-privilege
 * requirements, but not the reverse.
 *
 * Weight table (highest → lowest):
 *   admin            100
 *   business_admin    80
 *   business_staff    60
 *   standard_customer 10
 */

describe("ROLE_WEIGHTS", () => {
  it("assigns the correct numeric weight to every role", () => {
    expect(ROLE_WEIGHTS.admin).toBe(100);
    expect(ROLE_WEIGHTS.business_admin).toBe(80);
    expect(ROLE_WEIGHTS.business_staff).toBe(60);
    expect(ROLE_WEIGHTS.standard_customer).toBe(10);
  });
});

describe("hasRequiredRole", () => {
  // ── admin ─────────────────────────────────────────────────────────────────

  describe("when the user is admin (100)", () => {
    it("satisfies admin requirement (same level)", () => {
      expect(hasRequiredRole("admin", "admin")).toBe(true);
    });

    it("satisfies business_admin requirement (100 ≥ 80)", () => {
      expect(hasRequiredRole("admin", "business_admin")).toBe(true);
    });

    it("satisfies business_staff requirement (100 ≥ 60)", () => {
      expect(hasRequiredRole("admin", "business_staff")).toBe(true);
    });

    it("satisfies standard_customer requirement (100 ≥ 10)", () => {
      expect(hasRequiredRole("admin", "standard_customer")).toBe(true);
    });
  });

  // ── business_admin ────────────────────────────────────────────────────────

  describe("when the user is business_admin (80)", () => {
    it("does NOT satisfy admin requirement (80 < 100)", () => {
      expect(hasRequiredRole("business_admin", "admin")).toBe(false);
    });

    it("satisfies business_admin requirement (same level)", () => {
      expect(hasRequiredRole("business_admin", "business_admin")).toBe(true);
    });

    it("satisfies business_staff requirement (80 ≥ 60)", () => {
      expect(hasRequiredRole("business_admin", "business_staff")).toBe(true);
    });

    it("satisfies standard_customer requirement (80 ≥ 10)", () => {
      expect(hasRequiredRole("business_admin", "standard_customer")).toBe(true);
    });
  });

  // ── business_staff ────────────────────────────────────────────────────────

  describe("when the user is business_staff (60)", () => {
    it("does NOT satisfy admin requirement (60 < 100)", () => {
      expect(hasRequiredRole("business_staff", "admin")).toBe(false);
    });

    it("does NOT satisfy business_admin requirement (60 < 80)", () => {
      expect(hasRequiredRole("business_staff", "business_admin")).toBe(false);
    });

    it("satisfies business_staff requirement (same level)", () => {
      expect(hasRequiredRole("business_staff", "business_staff")).toBe(true);
    });

    it("satisfies standard_customer requirement (60 ≥ 10)", () => {
      expect(hasRequiredRole("business_staff", "standard_customer")).toBe(true);
    });
  });

  // ── standard_customer ─────────────────────────────────────────────────────

  describe("when the user is standard_customer (10)", () => {
    it("does NOT satisfy admin requirement (10 < 100)", () => {
      expect(hasRequiredRole("standard_customer", "admin")).toBe(false);
    });

    it("does NOT satisfy business_admin requirement (10 < 80)", () => {
      expect(hasRequiredRole("standard_customer", "business_admin")).toBe(
        false,
      );
    });

    it("does NOT satisfy business_staff requirement (10 < 60)", () => {
      expect(hasRequiredRole("standard_customer", "business_staff")).toBe(
        false,
      );
    });

    it("satisfies standard_customer requirement (same level)", () => {
      expect(hasRequiredRole("standard_customer", "standard_customer")).toBe(
        true,
      );
    });
  });

  // ── Unknown / invalid roles ───────────────────────────────────────────────

  describe("unknown roles", () => {
    it("returns false when the user role is unknown — weight defaults to 0", () => {
      // 0 (unknown user) < 10 (standard_customer) → false
      expect(hasRequiredRole("unknown_role" as any, "standard_customer")).toBe(
        false,
      );
    });

    it("returns false when the required role is unknown — required weight defaults to Infinity", () => {
      // 100 (admin) < Infinity → false
      expect(hasRequiredRole("admin", "unknown_role" as any)).toBe(false);
    });

    it("returns false when both roles are unknown (0 < Infinity)", () => {
      expect(hasRequiredRole("unknown_user" as any, "unknown_req" as any)).toBe(
        false,
      );
    });
  });
});
