import { exec } from "child_process";
import { platform } from "os";
import { existsSync } from "fs";

type ClipboardTool = { cmd: string; args: string[] };

function detectClipboardTool(): ClipboardTool | null {
  const os = platform();

  if (os === "darwin") {
    return { cmd: "pbcopy", args: [] };
  }

  if (os === "win32") {
    return { cmd: "clip.exe", args: [] };
  }

  // Linux: check WSL first, then Wayland, then X11
  if (os === "linux") {
    // WSL detection
    try {
      if (existsSync("/proc/version")) {
        const { readFileSync } = require("fs");
        const procVersion = readFileSync("/proc/version", "utf8");
        if (/microsoft|wsl/i.test(procVersion)) {
          return { cmd: "clip.exe", args: [] };
        }
      }
    } catch {}

    // Wayland
    if (process.env.WAYLAND_DISPLAY) {
      return { cmd: "wl-copy", args: [] };
    }

    // X11
    if (process.env.DISPLAY) {
      return { cmd: "xclip", args: ["-selection", "clipboard"] };
    }
  }

  return null;
}

/** Copy text to the system clipboard. Returns true on success, false on failure. */
export async function copyToClipboard(text: string): Promise<boolean> {
  const tool = detectClipboardTool();
  if (!tool) return false;

  return new Promise((resolve) => {
    const cmd = [tool.cmd, ...tool.args].join(" ");
    const child = exec(cmd, { timeout: 5000 }, (error) => {
      resolve(!error);
    });

    if (child.stdin) {
      child.stdin.write(text);
      child.stdin.end();
    } else {
      resolve(false);
    }
  });
}
