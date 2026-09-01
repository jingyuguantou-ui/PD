# 拼豆图稿生成器

图片 / AI 转拼豆（ fuse bead / 融豆 / Hama / Perler ）图稿的网页工具：自动配色、手动编辑、色卡校验、打印与材料包导出，并支持 **PWA（可安装到手机/平板、可离线）**。

## 功能

- **图片转图稿**：上传图片 → 选品牌珠色（MARD 291 色）→ 自动量化配色、去背景、生成珠格图。
- **AI 生图**：接 ComfyUI / A1111（本地）或 智谱 CogView / 通义万相（云端），一键转为图稿。
- **手动编辑**：画笔 / 擦除 / 取色 / 填充 / 形状 / 选区 / 文字，撤销重做、对称、翻转旋转、批量改色。
- **色卡校验**：按色号 / 十六进制检索 MARD 官方色卡。
- **导出**：预览 PNG（免费·带水印）、逐格像素图 PNG（用于豆画 / 颂拼豆）、材料包 CSV（免费）、完整高清 PNG / 矢量 SVG / 分块打印 PDF / 分板裁切图（Pro）。
- **PWA**：可「添加到主屏幕」当 App 使用，支持离线打开。

## 快速开始

环境要求：Node.js 16+。

```bash
node server.js
# 或双击 start.bat
```

- 普通访问：**http://localhost:8123**
- PWA / 安装到手机平板：用 **https://localhost:8443**（首次会提示证书“不安全”，点“继续前往”即可；证书为本地自签，详见下方）

> 不配置任何 Key 也能完整使用图片转图稿、手动编辑、导出等本地功能；AI 生图默认 `mock` 占位。

## 配置 AI（可选）

复制模板并填入你的密钥（该文件已被 `.gitignore` 忽略，不会上传）：

```bash
cp config.example.js config.js
```

`config.js` 字段：`AI_PROVIDER`（`comfy` / `sd` / `cogview` / `wanx` / `mock`）、`AI_KEY`、`AI_BASE_URL`。Key 仅存于后端，不进前端。

## PWA / HTTPS 说明

- 自签证书在首次启动 `server.js` 时自动生成于 `cert/`（已 gitignore）。
- 桌面浏览器访问 `https://localhost:8443`，遇到证书警告点「高级 → 继续前往」，之后即可「安装」为独立 App。
- **手机/平板安装**：手机与电脑需在同一 Wi-Fi，访问 `https://<电脑局域网IP>:8443`（IP 在启动日志中打印）。
  - Android Chrome：点「继续前往」后即可「添加到主屏幕」。
  - iPhone Safari：需先到 **设置 → 通用 → VPN与设备管理** 安装描述文件，再 **设置 → 关于本机 → 证书信任设置** 开启信任，然后「分享 → 添加到主屏幕」。
- 修改 `js/app.js` / `css/style.css` 后，记得把 `sw.js` 里的 `CACHE = "pindou-v1"` 版本号 +1，否则离线缓存不更新。

## 目录结构

```
.
├── index.html            页面与界面
├── server.js             Node 静态服务 + AI 代理 + HTTPS（自签证书）
├── certgen.js            纯 Node 自签证书生成（无依赖）
├── manifest.webmanifest  PWA 清单
├── sw.js                 Service Worker（离线缓存）
├── start.bat             一键启动（Windows）
├── config.example.js     AI 配置模板
├── css/style.css         样式（含响应式 / 移动端适配）
├── icons/                应用图标（程序生成）
└── js/
    ├── app.js            主逻辑（处理 / 编辑 / 导出 / PWA）
    ├── palette.js        调色板与配色
    └── mard-colors.js    MARD 官方色卡数据
```

## 技术栈

原生 HTML / CSS / JavaScript + 极简 Node.js 后端（无构建步骤、无第三方运行时依赖）。PDF 导出按需从 CDN 加载 jsPDF。

## License

MIT © 拼豆图稿生成器
