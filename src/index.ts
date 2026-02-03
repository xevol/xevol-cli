#!/usr/bin/env node
import chalk from "chalk";
import { Command } from "commander";
import { registerAddCommand } from "./commands/add";
import { registerAnalyzeCommand } from "./commands/analyze";
import { registerConfigCommand } from "./commands/config";
import { registerDeleteCommand } from "./commands/delete";
import { registerExportCommand } from "./commands/export";
import { registerListCommand } from "./commands/list";
import { registerAuthCommands } from "./commands/login";
import { registerOpenCommand } from "./commands/open";
import { registerPromptsCommand } from "./commands/prompts";
import { registerResumeCommand } from "./commands/resume";
import { registerStreamCommand } from "./commands/stream";
import { registerUsageCommand } from "./commands/usage";
import { registerViewCommand } from "./commands/view";
import { registerWorkspaceCommand } from "./commands/workspace";
import { printHeader } from "./lib/header";
import { launchTUI } from "./tui/app";
import { version } from "./version";

const SKIP_HEADER_COMMANDS = new Set(["login", "config", "export", "delete", "open", "workspace", "tui"]);

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
registerDeleteCommand(program);
registerOpenCommand(program);
registerWorkspaceCommand(program);

program
  .command("tui")
  .description("Launch the interactive TUI")
  .action(() => {
    if (!process.stdout.isTTY) {
      program.help();
    } else {
      launchTUI(version);
    }
  });

// Show header + help when invoked with no arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  if (!process.stdout.isTTY) {
    program.help();
  } else {
    launchTUI(version);
  }
} else {
  await program.parseAsync(process.argv);
}
