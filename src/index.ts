#!/usr/bin/env bun
import { Command } from "commander";
import { registerAddCommand } from "./commands/add";
import { registerAuthCommands } from "./commands/login";
import { registerListCommand } from "./commands/list";
import { registerSpikesCommand } from "./commands/spikes";
import { registerViewCommand } from "./commands/view";

const program = new Command();

program
  .name("xevol")
  .description("CLI for XEVol — transcribe, analyze, and explore YouTube content")
  .version("0.0.1")
  .option("--token <token>", "Override auth token");

registerAuthCommands(program);
registerListCommand(program);
registerAddCommand(program);
registerViewCommand(program);
registerSpikesCommand(program);

await program.parseAsync(process.argv);
