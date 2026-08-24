// 复制为 config.js 并填入你的密钥；config.js 已在 .gitignore 中，不会提交。
module.exports = {
  // 可选：mock（本地占位，无需 key）| cogview（智谱，国产免费额度）| wanx（通义万相）| sd（本地 Stable Diffusion）
  AI_PROVIDER: "mock",
  AI_KEY: "",
  // 仅 sd 模式需要：本地 A1111 地址
  AI_BASE_URL: "http://127.0.0.1:7860",
};
