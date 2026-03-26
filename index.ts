import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/core";
import { daoyuPlugin } from "./src/channel.js";
import { setDaoyuRuntime } from "./src/runtime.js";

const plugin = {
  id: "daoyu",
  name: "Daoyu",
  description: "Daoyu channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setDaoyuRuntime(api.runtime);
    api.registerChannel({ plugin: daoyuPlugin });
  },
};

export default plugin;
export { daoyuPlugin } from "./src/channel.js";
