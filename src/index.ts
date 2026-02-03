#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { createRequire } from "module";
import { registerAddCommand } from "./commands/add";
import { registerAuthCommands } from "./commands/login";
import { registerListCommand } from "./commands/list";
import { registerAnalyzeCommand } from "./commands/analyze";
import { registerViewCommand } from "./commands/view";
import { registerPromptsCommand } from "./commands/prompts";
import { registerStreamCommand } from "./commands/stream";
import { registerResumeCommand } from "./commands/resume";
import { registerConfigCommand } from "./commands/config";
import { registerUsageCommand } from "./commands/usage";
import { registerExportCommand } from "./commands/export";
import { printHeader } from "./lib/header";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const SKIP_HEADER_COMMANDS = new Set(["login", "config", "export"]);

function shouldShowHeader(): boolean {
  const args = process.argv.slice(2);
  // Skip for help, version, or json flags
  if (args.some((a) => a === "--help" || a === "-h" || a === "--version" || a === "-V" || a === "--json")) {
    return false;
  }
  // Skip for specific commands
  const cmd = args.find((a) => !a.startsWith("-"));
  if (cmd && SKIP_HEADER_COMMANDS.has(cmd)) {
    return false;
  }
  return true;
}

const program = new Command();

program
  .name("xevol")
  .description("Xevol is a tool to consume, remix, make, publish, and offer systems, products, and workflows.")
  .version(version)
  .option("--token <token>", "Override auth token")
  .option("--no-color", "Disable colored output")
  .hook("preAction", async () => {
    const opts = program.opts();
    if (opts.color === false) {
      chalk.level = 0;
    }
    if (shouldShowHeader()) {
      await printHeader(version);
    }
  });

registerAuthCommands(program);
registerListCommand(program);
registerAddCommand(program);
registerViewCommand(program);
registerAnalyzeCommand(program);
registerPromptsCommand(program);
registerStreamCommand(program);
registerResumeCommand(program);
registerConfigCommand(program);
registerUsageCommand(program);
registerExportCommand(program);

// Show header + help when invoked with no arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  await printHeader(version);
  program.help();
} else {
  await program.parseAsync(process.argv);
}
