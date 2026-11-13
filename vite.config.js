import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const glmTarget = (env.GLM_BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
  const glmProxy = {
    target: glmTarget,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/glm/, "/v1"),
  };
  const ttsTarget = (env.PARALLAX_TTS_BASE_URL || "http://127.0.0.1:7861").replace(/\/$/, "");
  const ttsProxy = {
    target: ttsTarget,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/tts/, ""),
  };

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 4174,
      strictPort: true,
      proxy: { "/api/glm": glmProxy, "/api/tts": ttsProxy },
    },
    preview: {
      host: "127.0.0.1",
      port: 4174,
      strictPort: true,
      proxy: { "/api/glm": glmProxy },
    },
  };
});
