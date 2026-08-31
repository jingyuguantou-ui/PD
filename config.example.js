// 复制为 config.js 并填入你的密钥；config.js 已在 .gitignore 中，不会提交。
module.exports = {
  // AI 生图 Provider（选一个填）：
  //   mock    — 本地占位，无需 key（默认，用于测试）
  //   comfy   — 本地 ComfyUI（需先启动 ComfyUI，默认端口 8188）
  //   sd      — 本地 Stable Diffusion WebUI / A1111（默认端口 7860）
  //   cogview — 智谱 CogView-3-Plus（云端，有免费额度）
  //   wanx    — 阿里通义万相（云端）
  AI_PROVIDER: "mock",

  // 智谱 / 通义万相的 API Key（comfy 和 sd 不需要）
  AI_KEY: "",

  // comfy 模式：ComfyUI 地址（默认 http://127.0.0.1:8188）
  // sd 模式：A1111 地址（默认 http://127.0.0.1:7860）
  AI_BASE_URL: "",
};
