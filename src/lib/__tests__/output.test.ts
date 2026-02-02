import { describe, expect, test } from "bun:test";
import { formatDuration, formatStatus, divider } from "../output";

describe("formatDuration", () => {
  test("returns dash for null", () => {
    expect(formatDuration(null)).toBe("—");
  });

  test("returns dash for undefined", () => {
    expect(formatDuration(undefined)).toBe("—");
  });

  test("returns dash for empty string", () => {
    expect(formatDuration("")).toBe("—");
  });

  test("returns string values as-is", () => {
    expect(formatDuration("1:23:45")).toBe("1:23:45");
  });

  test("returns dash for NaN", () => {
    expect(formatDuration(NaN)).toBe("—");
  });

  test("returns dash for Infinity", () => {
    expect(formatDuration(Infinity)).toBe("—");
  });

  test("formats zero seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  test("formats seconds only", () => {
    expect(formatDuration(45)).toBe("0:45");
  });

  test("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("2:05");
  });

  test("formats hours, minutes, seconds", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  test("formats exact hour", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
  });

  test("pads minutes when hours present", () => {
    expect(formatDuration(3660)).toBe("1:01:00");
  });

  test("handles negative as zero", () => {
    expect(formatDuration(-10)).toBe("0:00");
  });

  test("floors fractional seconds", () => {
    expect(formatDuration(65.9)).toBe("1:05");
  });
});

describe("formatStatus", () => {
  test("returns dash for null/undefined", () => {
    expect(formatStatus(null)).toBe("—");
    expect(formatStatus(undefined)).toBe("—");
  });

  test("applies green for complete status", () => {
    const result = formatStatus("complete");
    expect(result).toContain("complete");
  });

  test("applies yellow for pending status", () => {
    const result = formatStatus("pending");
    expect(result).toContain("pending");
  });

  test("applies red for error status", () => {
    const result = formatStatus("error");
    expect(result).toContain("error");
  });

  test("returns unknown status unchanged", () => {
    expect(formatStatus("unknown")).toBe("unknown");
  });
});

describe("divider", () => {
  test("returns a string of dashes", () => {
    const result = divider(40);
    expect(result).toBe("─".repeat(40));
  });

  test("has minimum width of 20", () => {
    const result = divider(5);
    expect(result.length).toBe(20);
  });

  test("has maximum width of 100", () => {
    const result = divider(200);
    expect(result.length).toBe(100);
  });
});
