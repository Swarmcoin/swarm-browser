/**
 * Shared by the SWARM Start test suites. Importing it cuts the network off
 * for the whole test process, like swarm/tests/update/helpers.mjs: the pure
 * modules under test must never reach for it.
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import path from "node:path";
import { fileURLToPath } from "node:url";

function refuse(name) {
  return () => {
    throw new Error(`${name}: the SWARM Start unit tests must not use the network`);
  };
}

globalThis.fetch = refuse("fetch");
for (const [module, names] of [
  [net, ["connect", "createConnection"]],
  [tls, ["connect"]],
  [http, ["request", "get"]],
  [https, ["request", "get"]],
  [dns, ["lookup", "resolve", "resolve4", "resolve6"]],
]) {
  for (const name of names) module[name] = refuse(`${module === dns ? "dns" : "net"}.${name}`);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
export const START_DIR = path.join(REPO_ROOT, "swarm", "extensions", "start");
export const EXTENSIONS_DIR = path.join(REPO_ROOT, "swarm", "extensions");
export const PATCHES_DIR = path.join(REPO_ROOT, "swarm", "patches", "swarm");
