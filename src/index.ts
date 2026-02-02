#!/usr/bin/env bun
import { Command } from "commander";
import { createRequire } from "module";
import { registerAddCommand } from "./commands/add";
import { registerAuthCommands } from "./commands/login";
import { registerListCommand } from "./commands/list";
import { registerSpikesCommand } from "./commands/spikes";
import { registerViewCommand } from "./commands/view";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("xevol")
  .description("CLI for XEVol — transcribe, analyze, and explore YouTube content")
  .version(version)
  .option("--token <token>", "Override auth token");

registerAuthCommands(program);
registerListCommand(program);
registerAddCommand(program);
registerViewCommand(program);
registerSpikesCommand(program);

await program.parseAsync(process.argv);
