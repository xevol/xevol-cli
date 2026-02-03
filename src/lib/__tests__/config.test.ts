import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { XevolConfig } from "../config";
import { DEFAULT_API_URL, resolveApiUrl, resolveToken } from "../config";

describe("resolveToken", () => {
  const originalEnv = process.env.XEVOL_TOKEN;

  beforeEach(() => {
    delete process.env.XEVOL_TOKEN;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.XEVOL_TOKEN = originalEnv;
    } else {
      delete process.env.XEVOL_TOKEN;
    }
  });

  test("returns undefined when no token available", () => {
    const result = resolveToken();
    expect(result.token).toBeUndefined();
    expect(result.expired).toBe(false);
  });

  test("returns token from config", () => {
    const config: XevolConfig = { token: "config_token" };
    const result = resolveToken(config);
    expect(result.token).toBe("config_token");
    expect(result.expired).toBe(false);
  });

  test("override takes precedence over config", () => {
    const config: XevolConfig = { token: "config_token" };
    const result = resolveToken(config, "override_token");
    expect(result.token).toBe("override_token");
  });

  test("env takes precedence over config", () => {
    process.env.XEVOL_TOKEN = "env_token";
    const config: XevolConfig = { token: "config_token" };
    const result = resolveToken(config);
    expect(result.token).toBe("env_token");
  });

  test("override takes precedence over env", () => {
    process.env.XEVOL_TOKEN = "env_token";
    const config: XevolConfig = { token: "config_token" };
    const result = resolveToken(config, "override_token");
    expect(result.token).toBe("override_token");
  });

  test("detects expired token from config", () => {
    const config: XevolConfig = {
      token: "expired_token",
      expiresAt: new Date(Date.now() - 60000).toISOString(),
    };
    const result = resolveToken(config);
    expect(result.token).toBeUndefined();
    expect(result.expired).toBe(true);
  });

  test("does not check expiry for override tokens", () => {
    const config: XevolConfig = {
      token: "expired_token",
      expiresAt: new Date(Date.now() - 60000).toISOString(),
    };
    const result = resolveToken(config, "override_token");
    expect(result.token).toBe("override_token");
    expect(result.expired).toBe(false);
  });

  test("does not check expiry for env tokens", () => {
    process.env.XEVOL_TOKEN = "env_token";
    const config: XevolConfig = {
      token: "expired_token",
      expiresAt: new Date(Date.now() - 60000).toISOString(),
    };
    const result = resolveToken(config);
    expect(result.token).toBe("env_token");
  });

  test("non-expired token is returned normally", () => {
    const config: XevolConfig = {
      token: "valid_token",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
    const result = resolveToken(config);
    expect(result.token).toBe("valid_token");
    expect(result.expired).toBe(false);
  });
});

describe("resolveApiUrl", () => {
  const originalEnv = process.env.XEVOL_API_URL;

  beforeEach(() => {
    delete process.env.XEVOL_API_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.XEVOL_API_URL = originalEnv;
    } else {
      delete process.env.XEVOL_API_URL;
    }
  });

  test("returns default URL when no config", () => {
    expect(resolveApiUrl()).toBe(DEFAULT_API_URL);
  });

  test("returns config URL", () => {
    expect(resolveApiUrl({ apiUrl: "https://custom.api.com" })).toBe("https://custom.api.com");
  });

  test("env takes precedence over config", () => {
    process.env.XEVOL_API_URL = "https://env.api.com";
    expect(resolveApiUrl({ apiUrl: "https://custom.api.com" })).toBe("https://env.api.com");
  });
});
