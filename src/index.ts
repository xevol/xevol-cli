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

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("xevol")
  .description("XEVol — your info manager. Transcribe, analyze, and explore YouTube content from the terminal.")
  .version(version)
  .option("--token <token>", "Override auth token")
  .option("--no-color", "Disable colored output")
  .hook("preAction", () => {
    const opts = program.opts();
    if (opts.color === false) {
      chalk.level = 0;
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

await program.parseAsync(process.argv);
