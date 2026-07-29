export type TimeRange = "1D" | "1W" | "1M" | "custom";

/**
 * The four aggregation modes the dashboard supports.
 * Validated server-side so an invalid query param safely falls back to 'avg'.
 */
export type AggMode = "avg" | "sum" | "min" | "max";

/** Coerce an arbitrary query-string value to a valid AggMode, defaulting to 'avg'. */
export const getAggMode = (input: string | null | undefined): AggMode => {
  const valid: AggMode[] = ["avg", "sum", "min", "max"];
  return input && valid.includes(input as AggMode) ? (input as AggMode) : "avg";
};

/**
 * Returns the time-bucket size in milliseconds for a given TimeRange.
 *   1D → 1-hour buckets  (3 600 000 ms)
 *   1W / 1M → 1-day buckets (86 400 000 ms)
 */
export const getBucketMs = (range: TimeRange): number =>
  range === "1D" ? 3_600_000 : 86_400_000;

/**
 * Returns a type-safe MongoDB accumulator expression for use inside a $group stage.
 *
 * A switch is required because Mongoose's `AccumulatorOperator` is a strict
 * discriminated union. A computed key like `{ [\`$${mode}\`]: field }` produces
 * `{ [x: string]: string }` at compile time, which TypeScript cannot verify
 * satisfies any member of the union.
 */
export const buildAccumulator = (mode: AggMode, field: string) => {
  switch (mode) {
    case "sum":
      return { $sum: field };
    case "min":
      return { $min: field };
    case "max":
      return { $max: field };
    default:
      return { $avg: field };
  }
};

export const getTimeRange = (input: string | null | undefined): TimeRange => {
  const validRanges: TimeRange[] = ["1D", "1W", "1M", "custom"];

  if (input && validRanges.includes(input as TimeRange)) {
    return input as TimeRange;
  }

  return "1D";
};

export const getDateRange = (
  range: TimeRange,
  customStart?: Date,
  customEnd: Date = new Date(),
) => {
  const end = customEnd;
  let start = new Date();

  switch (range) {
    case "1D":
      start.setHours(end.getHours() - 24);
      break;
    case "1W":
      start.setDate(end.getDate() - 7);
      break;
    case "1M":
      start.setDate(end.getDate() - 30);
      break;
    case "custom":
      if (!customStart) throw new Error("Custom start date required");
      start = customStart;
      break;
    default:
      start.setHours(end.getHours() - 24);
  }

  return { start: start.getTime(), end: end.getTime() };
};
