import type { PluginRuntime } from "openclaw/plugin-sdk/runtime";

let runtime: PluginRuntime | null = null;

export function setDaoyuRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getDaoyuRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Daoyu runtime not initialized");
  }
  return runtime;
}
