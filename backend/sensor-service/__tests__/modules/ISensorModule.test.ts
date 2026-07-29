import { ValidationResult } from "src/modules/ISensorModule.ts";

describe("ValidationResult.ok()", () => {
  it("sets isValid to true", () => {
    expect(ValidationResult.ok().isValid).toBe(true);
  });

  it("returns an empty errors array", () => {
    expect(ValidationResult.ok().errors).toHaveLength(0);
  });

  it("returns a frozen result object", () => {
    expect(Object.isFrozen(ValidationResult.ok())).toBe(true);
  });

  it("returns a frozen errors array", () => {
    expect(Object.isFrozen(ValidationResult.ok().errors)).toBe(true);
  });
});

describe("ValidationResult.fail()", () => {
  it("sets isValid to false", () => {
    expect(ValidationResult.fail(["error"]).isValid).toBe(false);
  });

  it("populates errors with the provided messages", () => {
    const result = ValidationResult.fail([
      "field A is required",
      "field B is invalid",
    ]);
    expect(result.errors).toEqual([
      "field A is required",
      "field B is invalid",
    ]);
  });

  it("returns a frozen result object", () => {
    expect(Object.isFrozen(ValidationResult.fail(["error"]))).toBe(true);
  });

  it("returns a frozen errors array", () => {
    expect(Object.isFrozen(ValidationResult.fail(["error"]).errors)).toBe(true);
  });

  it("snapshots the errors array, so later mutations to the original do not affect it", () => {
    const originalErrors = ["first error"];
    const result = ValidationResult.fail(originalErrors);
    originalErrors.push("second error");
    expect(result.errors).toHaveLength(1);
  });
});
