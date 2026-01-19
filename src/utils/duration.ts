import ms, { type StringValue } from "ms";

export const parseDuration = (value: string): number => {
  const parsed = ms(value as StringValue);
  if (typeof parsed !== "number" || Number.isNaN(parsed)) {
    throw new Error(`invalid duration: ${value}`);
  }
  return parsed;
};

export const formatDuration = (durationMs: number): string => {
  if (durationMs === 0) {
    return "0s";
  }

  const negative = durationMs < 0;
  let remaining = Math.abs(durationMs);

  const hours = Math.floor(remaining / 3_600_000);
  remaining -= hours * 3_600_000;
  const minutes = Math.floor(remaining / 60_000);
  remaining -= minutes * 60_000;
  const seconds = Math.floor(remaining / 1000);
  remaining -= seconds * 1000;

  let result = "";
  if (hours > 0) {
    result += `${hours}h`;
  }
  if (minutes > 0 || hours > 0) {
    result += `${minutes}m`;
  }

  if (seconds > 0 || minutes > 0 || hours > 0) {
    if (remaining > 0) {
      const fractional = (seconds + remaining / 1000)
        .toFixed(3)
        .replace(/\.0+$/, "")
        .replace(/\.$/, "");
      result += `${fractional}s`;
    } else {
      result += `${seconds}s`;
    }
  } else if (remaining > 0) {
    result += `${remaining}ms`;
  }

  return negative ? `-${result}` : result;
};
