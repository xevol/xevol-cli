import { Command } from "commander";
import chalk from "chalk";
import { exec } from "child_process";

function getOpenCommand(url: string): string {
  if (process.platform === "darwin") {
    return `open "${url}"`;
  }
  if (process.platform === "win32") {
    return `start "" "${url}"`;
  }
  return `xdg-open "${url}"`;
}

export function registerOpenCommand(program: Command): void {
  program
    .command("open")
    .description("Open a transcription in the browser")
    .argument("<id>", "Transcription ID")
    .action((id: string) => {
      const url = `https://xevol.com/t/${id}`;
      console.error(url);

      const openCommand = getOpenCommand(url);
      exec(openCommand, (error) => {
        if (error) {
          console.error(chalk.red("Error:") + " " + error.message);
          process.exitCode = 1;
        }
      });
    });
}
