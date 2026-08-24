// 复制为 config.js 并填入你的密钥；config.js 已在 .gitignore 中，不会提交。
module.exports = {
  // 可选：mock（本地占位，无需 key）| comfy（本地 ComfyUI）| sd（本地 A1111）| cogview（智谱）| wanx（通义万相）
  AI_PROVIDER: "comfy",
  AI_KEY: "",
  // 本地 ComfyUI 默认 8188；本地 A1111 默认 7860
  AI_BASE_URL: "http://127.0.0.1:8188",
};
