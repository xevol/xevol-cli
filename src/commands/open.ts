import { Command } from "commander";
import chalk from "chalk";
import { spawn } from "child_process";

function openUrl(url: string): void {
  let cmd: string;
  let args: string[];

  if (process.platform === "darwin") {
    cmd = "open";
    args = [url];
  } else if (process.platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", url];
  } else {
    cmd = "xdg-open";
    args = [url];
  }

  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.on("error", (error) => {
    console.error(chalk.red("Error:") + " " + error.message);
    process.exitCode = 1;
  });
  child.unref();
}

export function registerOpenCommand(program: Command): void {
  program
    .command("open")
    .description("Open a transcription in the browser")
    .argument("<id>", "Transcription ID")
    .action((id: string) => {
      const url = `https://xevol.com/t/${encodeURIComponent(id)}`;
      console.error(url);
      openUrl(url);
    });
}
