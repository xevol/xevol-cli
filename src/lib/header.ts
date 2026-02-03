import chalk from "chalk";
import { readConfig } from "./config.js";

const LOGO_LINES = [
  "                          ██ ",
  "  ██ ██ ▄█▀█▄ ██ ██ ▄███▄ ██ ",
  "   ███  ██▄█▀ ██▄██ ██ ██ ██ ",
  "  ██ ██ ▀█▄▄▄  ▀█▀  ▀███▀ ██",
];

const GRADIENT = [
  chalk.cyan,
  chalk.cyan,
  chalk.cyanBright,
  chalk.greenBright,
  chalk.green,
  chalk.green,
];

export async function printHeader(version: string): Promise<void> {
  const config = await readConfig();
  const email = config?.email;

  console.log();
  for (let i = 0; i < LOGO_LINES.length; i++) {
    const colorFn = GRADIENT[i % GRADIENT.length];
    console.log(colorFn(LOGO_LINES[i]));
  }

  const info: string[] = [];
  info.push(chalk.dim(`v${version}`));
  if (email) {
    info.push(chalk.dim(email));
  } else {
    info.push(chalk.dim.italic("not logged in"));
  }

  console.log(`  ${info.join(chalk.dim(" · "))}`);
  console.log();
}
