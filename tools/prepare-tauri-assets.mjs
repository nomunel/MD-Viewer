import { copyFileSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
copyFileSync(resolve(root, "viewer.html"), resolve(dist, "viewer.html"));
cpSync(resolve(root, "src"), resolve(dist, "src"), { recursive: true });
