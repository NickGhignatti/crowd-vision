import { getTimeRange, getDateRange } from "src/utils/dataHelpers.ts";

describe("getTimeRange()", () => {
  it.each(["1D", "1W", "1M", "custom"] as const)(
    'returns "%s" unchanged when it is a valid TimeRange',
    (range) => {
      expect(getTimeRange(range)).toBe(range);
    },
  );

  it('defaults to "1D" for a null value', () => {
    expect(getTimeRange(null)).toBe("1D");
  });

  it('defaults to "1D" for an undefined value', () => {
    expect(getTimeRange(undefined)).toBe("1D");
  });

  it('defaults to "1D" for an empty string', () => {
    expect(getTimeRange("")).toBe("1D");
  });

  it('defaults to "1D" for an unrecognised string', () => {
    expect(getTimeRange("99Y")).toBe("1D");
  });
});

describe("getDateRange()", () => {
  const MS_PER_HOUR = 60 * 60 * 1000;
  const MS_PER_DAY = 24 * MS_PER_HOUR;

  it('returns a window of approximately 24 hours for "1D"', () => {
    const { start, end } = getDateRange("1D");
    expect(end - start).toBeCloseTo(24 * MS_PER_HOUR, -3);
  });

  it('returns a window of approximately 7 days for "1W"', () => {
    const { start, end } = getDateRange("1W");
    expect(end - start).toBeCloseTo(7 * MS_PER_DAY, -3);
  });

  it('returns a window of approximately 30 days for "1M"', () => {
    const { start, end } = getDateRange("1M");
    expect(end - start).toBeCloseTo(30 * MS_PER_DAY, -3);
  });

  it('uses the provided customStart and customEnd for "custom"', () => {
    const customStart = new Date("2024-01-01T00:00:00Z");
    const customEnd = new Date("2024-06-01T00:00:00Z");

    const { start, end } = getDateRange("custom", customStart, customEnd);

    expect(start).toBe(customStart.getTime());
    expect(end).toBe(customEnd.getTime());
  });

  it('throws when "custom" is used without a customStart', () => {
    expect(() => getDateRange("custom")).toThrow("Custom start date required");
  });
});
