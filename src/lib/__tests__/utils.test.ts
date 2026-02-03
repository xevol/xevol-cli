import { describe, expect, test } from "bun:test";
import {
  pickValue,
  pickValueOrDash,
  pickSessionField,
  pickNumberField,
  extractId,
  extractStatus,
} from "../utils";

describe("pickValue", () => {
  test("returns first matching string value", () => {
    expect(pickValue({ a: "hello", b: "world" }, ["a", "b"])).toBe("hello");
  });

  test("skips empty strings", () => {
    expect(pickValue({ a: "", b: "world" }, ["a", "b"])).toBe("world");
  });

  test("returns undefined for no match", () => {
    expect(pickValue({ a: 123 }, ["a", "b"])).toBeUndefined();
  });

  test("returns undefined for empty record", () => {
    expect(pickValue({}, ["a"])).toBeUndefined();
  });

  test("skips non-string values", () => {
    expect(pickValue({ a: null, b: undefined, c: "yes" }, ["a", "b", "c"])).toBe("yes");
  });
});

describe("pickValueOrDash", () => {
  test("returns string value", () => {
    expect(pickValueOrDash({ name: "test" }, ["name"])).toBe("test");
  });

  test("returns number as string", () => {
    expect(pickValueOrDash({ count: 42 }, ["count"])).toBe("42");
  });

  test("returns dash for missing keys", () => {
    expect(pickValueOrDash({}, ["a", "b"])).toBe("—");
  });

  test("returns dash for empty string", () => {
    expect(pickValueOrDash({ a: "" }, ["a"])).toBe("—");
  });
});

describe("pickSessionField", () => {
  test("picks from flat response", () => {
    expect(pickSessionField({ email: "a@b.com" }, "email")).toBe("a@b.com");
  });

  test("picks from nested user", () => {
    expect(pickSessionField({ user: { email: "a@b.com" } }, "email")).toBe("a@b.com");
  });

  test("picks from nested session", () => {
    expect(pickSessionField({ session: { id: "sess123" } }, "id")).toBe("sess123");
  });

  test("prefers direct over nested", () => {
    expect(pickSessionField({ email: "direct", user: { email: "nested" } }, "email")).toBe("direct");
  });

  test("returns undefined when not found", () => {
    expect(pickSessionField({}, "email")).toBeUndefined();
  });

  test("returns undefined for non-string values", () => {
    expect(pickSessionField({ count: 42 }, "count")).toBeUndefined();
  });
});

describe("pickNumberField", () => {
  test("picks number directly", () => {
    expect(pickNumberField({ count: 42 }, "count")).toBe(42);
  });

  test("parses string number", () => {
    expect(pickNumberField({ count: "300" }, "count")).toBe(300);
  });

  test("returns undefined for non-number", () => {
    expect(pickNumberField({ count: "abc" }, "count")).toBeUndefined();
  });

  test("returns undefined for missing key", () => {
    expect(pickNumberField({}, "count")).toBeUndefined();
  });

  test("returns undefined for Infinity", () => {
    expect(pickNumberField({ count: Infinity }, "count")).toBeUndefined();
  });

  test("returns undefined for NaN", () => {
    expect(pickNumberField({ count: NaN }, "count")).toBeUndefined();
  });
});

describe("extractId", () => {
  test("extracts id from flat response", () => {
    expect(extractId({ id: "abc123" })).toBe("abc123");
  });

  test("extracts transcriptionId", () => {
    expect(extractId({ transcriptionId: "t123" })).toBe("t123");
  });

  test("extracts from nested transcription", () => {
    expect(extractId({ transcription: { id: "nested123" } })).toBe("nested123");
  });

  test("extracts from nested data", () => {
    expect(extractId({ data: { id: "data123" } })).toBe("data123");
  });

  test("returns undefined for missing id", () => {
    expect(extractId({})).toBeUndefined();
  });
});

describe("extractStatus", () => {
  test("extracts status", () => {
    expect(extractStatus({ status: "complete" })).toBe("complete");
  });

  test("extracts state", () => {
    expect(extractStatus({ state: "pending" })).toBe("pending");
  });

  test("returns undefined when missing", () => {
    expect(extractStatus({})).toBeUndefined();
  });
});
