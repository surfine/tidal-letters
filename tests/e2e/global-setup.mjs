// One build for the whole browser run, and one served tree beside the demo pack.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SERVE } from "./serve.mjs";

export default function globalSetup() {
  execFileSync("npm", ["run", "build"], { cwd: process.cwd(), stdio: "pipe" });
  rmSync(SERVE, { recursive: true, force: true });
  mkdirSync(SERVE, { recursive: true });
  cpSync(join(process.cwd(), "dist"), SERVE, { recursive: true });
  cpSync(join(process.cwd(), "demo"), join(SERVE, "demo"), { recursive: true });
}
