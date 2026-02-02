import { Command } from "commander";
import chalk from "chalk";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

const CONFIG_DIR = path.join(os.homedir(), ".xevol");
const USER_CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

/** Allowed config keys and their descriptions */
const ALLOWED_KEYS: Record<string, string> = {
  "apiUrl": "Base API URL",
  "default.lang": "Default output language for transcriptions",
  "default.limit": "Default page size for list command",
  "api.timeout": "API request timeout in milliseconds",
};

interface UserConfig {
  apiUrl?: string;
  default?: {
    lang?: string;
    limit?: number;
  };
  api?: {
    timeout?: number;
  };
  [key: string]: unknown;
}

async function readUserConfig(): Promise<UserConfig> {
  try {
    const raw = await fs.readFile(USER_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed as UserConfig;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return {};
    }
    if (error instanceof SyntaxError) {
      console.error(chalk.yellow("Warning:") + " config.json is corrupt, starting fresh.");
      return {};
    }
    throw error;
  }
}

async function writeUserConfig(config: UserConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const payload = JSON.stringify(config, null, 2) + "\n";
  await fs.writeFile(USER_CONFIG_PATH, payload, { encoding: "utf8", mode: 0o600 });
}

function getNestedValue(obj: UserConfig, dotKey: string): unknown {
  const parts = dotKey.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(obj: UserConfig, dotKey: string, value: unknown): void {
  const parts = dotKey.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command("config")
    .description("Manage local CLI configuration");

  configCmd
    .command("get")
    .description("Get a config value")
    .argument("<key>", `Config key (${Object.keys(ALLOWED_KEYS).join(", ")})`)
    .action(async (key: string) => {
      try {
        if (!(key in ALLOWED_KEYS)) {
          console.error(chalk.red("Error:") + ` Unknown config key: ${key}`);
          console.error(`Allowed keys: ${Object.keys(ALLOWED_KEYS).join(", ")}`);
          process.exitCode = 1;
          return;
        }

        const config = await readUserConfig();
        const value = getNestedValue(config, key);

        if (value === undefined) {
          console.log(chalk.dim("(not set)"));
        } else {
          console.log(String(value));
        }
      } catch (error) {
        console.error(chalk.red("Error:") + " " + (error as Error).message);
        process.exitCode = 1;
      }
    });

  configCmd
    .command("set")
    .description("Set a config value")
    .argument("<key>", `Config key (${Object.keys(ALLOWED_KEYS).join(", ")})`)
    .argument("<value>", "Value to set")
    .action(async (key: string, value: string) => {
      try {
        if (!(key in ALLOWED_KEYS)) {
          console.error(chalk.red("Error:") + ` Unknown config key: ${key}`);
          console.error(`Allowed keys: ${Object.keys(ALLOWED_KEYS).join(", ")}`);
          process.exitCode = 1;
          return;
        }

        const config = await readUserConfig();

        // Parse numeric values for numeric keys
        let parsedValue: unknown = value;
        if (key === "default.limit" || key === "api.timeout") {
          const num = Number(value);
          if (!Number.isFinite(num) || num <= 0) {
            console.error(chalk.red("Error:") + ` ${key} must be a positive number`);
            process.exitCode = 1;
            return;
          }
          parsedValue = num;
        }

        setNestedValue(config, key, parsedValue);
        await writeUserConfig(config);
        console.log(`${chalk.green("✔")} ${key} = ${value}`);
      } catch (error) {
        console.error(chalk.red("Error:") + " " + (error as Error).message);
        process.exitCode = 1;
      }
    });

  configCmd
    .command("list")
    .description("List all config values")
    .action(async () => {
      try {
        const config = await readUserConfig();
        let hasValues = false;
        for (const key of Object.keys(ALLOWED_KEYS)) {
          const value = getNestedValue(config, key);
          if (value !== undefined) {
            console.log(`${chalk.dim(key)} = ${value}`);
            hasValues = true;
          }
        }
        if (!hasValues) {
          console.log(chalk.dim("No config values set."));
        }
      } catch (error) {
        console.error(chalk.red("Error:") + " " + (error as Error).message);
        process.exitCode = 1;
      }
    });
}
