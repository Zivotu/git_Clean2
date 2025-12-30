import { spawn } from "node:child_process";
import { basename } from "node:path";

export async function runScript(
  cmd: string,
  args: string[],
  opts?: {
    cwd?: string;
    allowCmds?: string[];
    timeoutMs?: number;
    allowRequires?: string[];
    maxOutputBytes?: number;
  }
) {
  // 1. Validation: Command Allowlist
  const baseCmd = basename(cmd);
  const isDefaultSafe = cmd === process.execPath;

  const isExplicitlyAllowed =
    opts?.allowCmds &&
    opts.allowCmds.some(
      (allowed) => allowed === cmd || allowed === baseCmd
    );

  if (!isDefaultSafe && !isExplicitlyAllowed) {
    return {
      code: 1,
      stdout: "",
      stderr: `Security Error: Command '${cmd}' is not allowed.`,
    };
  }

  // 2. Validation: Argument Sanitization
  // Block: ; | & > < ` $ \n \r \0
  // ALLOW: ( ) { } [ ]
  const suspiciousChars = /[;|`&<>\$\\\n\r\0]/;

  const blockedArgs = new Set([
    "-c", "/c", "bash", "sh", "powershell", "cmd.exe",
    "-e", "--eval", "-p", "--print", "--inspect", "--inspect-brk"
  ]);

  const allowedRequires = new Set(opts?.allowRequires ?? ["ts-node/register"]);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (suspiciousChars.test(arg)) {
      return {
        code: 1,
        stdout: "",
        stderr: `Security Error: Argument contains forbidden characters.`,
      };
    }

    if (blockedArgs.has(arg)) {
      return {
        code: 1,
        stdout: "",
        stderr: `Security Error: Argument '${arg}' is blocked.`,
      };
    }

    // Validate -r / --require
    if (arg === "-r" || arg === "--require") {
      const nextArg = args[i + 1];
      if (!nextArg || !allowedRequires.has(nextArg)) {
        return {
          code: 1,
          stdout: "",
          stderr: `Security Error: Requirement '${nextArg}' is not allowed.`,
        };
      }
      i++; // Skip next iteration
      continue;
    }

    // Handle --require=value
    if (arg.startsWith("--require=")) {
      const val = arg.split("=")[1];
      if (!allowedRequires.has(val)) {
        return {
          code: 1,
          stdout: "",
          stderr: `Security Error: Requirement '${val}' is not allowed.`,
        };
      }
    }
  }

  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      // 3. Execution: spawn with shell: false
      const child = spawn(cmd, args, {
        stdio: "pipe",
        shell: false,
        windowsHide: true,
        cwd: opts?.cwd,
      });

      let out = "";
      let err = "";
      let killedByTimeout = false;
      let truncated = false;
      let currentBytes = 0;

      const maxBytes = opts?.maxOutputBytes ?? 1024 * 1024; // 1MB Limit
      let truncationMarker = "\n...[Output Truncated]";
      let markerBytes = Buffer.byteLength(truncationMarker);

      if (markerBytes > maxBytes) {
        truncationMarker = "";
        markerBytes = 0;
      }
      const contentLimit = maxBytes - markerBytes;

      const append = (acc: string, chunk: any) => {
        if (truncated) return acc;

        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        const chunkLen = buf.length;
        const remaining = contentLimit - currentBytes;

        if (chunkLen > remaining) {
          truncated = true;
          // Slice bytes to fit exactly
          // Use Math.max(0, remaining) just to be super safe
          const slice = buf.subarray(0, Math.max(0, remaining)).toString();
          return acc + slice + truncationMarker;
        }

        currentBytes += chunkLen;
        return acc + buf.toString();
      };

      child.stdout.on("data", (chunk) => {
        out = append(out, chunk);
      });

      child.stderr.on("data", (chunk) => {
        err = append(err, chunk);
      });

      // 4. Timeout Mechanism
      const timeoutMs = opts?.timeoutMs ?? 30000; // Default 30s
      let killTimer: ReturnType<typeof setTimeout> | undefined;

      const timer = setTimeout(() => {
        killedByTimeout = true;

        try {
          child.kill("SIGTERM");
        } catch (e) {
          try { child.kill(); } catch { }
        }

        killTimer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch (e) {
            try { child.kill(); } catch { }
          }
        }, 2000);
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
      };

      child.on("error", (error) => {
        cleanup();
        resolve({ code: 1, stdout: out, stderr: String(error) });
      });

      child.on("close", (code) => {
        cleanup();
        if (killedByTimeout) {
          resolve({
            code: code ?? 1,
            stdout: out,
            stderr: err || "Error: Script execution timed out.",
          });
        } else {
          resolve({ code: code ?? 0, stdout: out, stderr: err });
        }
      });
    }
  );
}
