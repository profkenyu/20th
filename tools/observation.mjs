import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Match the production WebGPU module mapping without starting a renderer.
const result = await build({
  entryPoints: [fileURLToPath(new URL("./observation.test.mjs", import.meta.url))],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  alias: { "three/tsl": "three/tsl", "three/webgpu": "three/webgpu", three: "three/webgpu" }
});
await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
