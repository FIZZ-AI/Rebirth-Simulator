# 共享 AI 部署

## 访客免配置

GitHub Pages 网页和下载版默认连接作者提供的共享 DeepSeek 服务；访客不需要账号、密钥或本机 Python 服务。`service-config.js` 保存公开接口地址，不保存任何凭据。

游戏网页：`https://fizz-ai.github.io/Rebirth-Simulator/`。

共享接口：`https://rebirth-simulator.1764294465.workers.dev`。

## Cloudflare Workers

1. 在自己的 Cloudflare 账户登录 Wrangler。
2. 运行 `node scripts/build-shared.mjs`。只会把五个游戏静态文件复制到 `dist/`，不会复制 `.env`、Git 历史或服务端源码。
3. 首次部署前，在 `wrangler.jsonc` 中确认 Worker 名称及 Cloudflare 账户。默认使用账户的 workers.dev 地址，无需配置新域名。
4. 将 `DEEPSEEK_API_KEY` 或 `DEEPSEEK_ACCOUNT_TOKEN` 配置为 Worker 运行时 Secret。初次发布可使用 Wrangler 的 `deploy --secrets-file` 一次上传代码与 Secret；该参数只用于维护者本机的被忽略凭据文件，不进入公开代码或静态文件。
5. 使用 Wrangler 4.92.0 或更新版本部署；主入口为 `cloudflare/worker.mjs`，全局额度绑定为 `DAILY_QUOTA`；这个 Worker 只提供 `/api/status` 和 `/api/chat`，网页由 GitHub Pages 提供。示例：`npx wrangler@4.92.0 deploy --secrets-file .env`。
6. 核验 `/api/status`、真实故事生成、提问、结算和浏览器跨域请求后再分享。

默认模型 `deepseek-flash`，线上全部访客合计每天最多 100 次请求，按北京时间零点重置；每次请求生成最多 2048 tokens。额度在单个全局 Durable Object 中原子计数，重启或切换服务实例不会重置当天计数。请求在调用上游前计数，失败不退还次数。单个访客每分钟最多 12 次尝试。

达到额度、维护者余额不足或上游故障时，页面保留游戏进度并提示可重试或返回经典模式。模型凭据只在服务端使用，不通过接口、静态资源或错误详情暴露。

## 分享下载版 / GitHub Pages

保留同一目录下的 `index.html`、`styles.css`、`game.js`、`classic.js`、`service-config.js`。共享服务允许原项目的 GitHub Pages 来源、本机静态服务及直接打开文件的来源；默认接口地址与公开接口一致，因此使用同一份每日额度。

经典模式完全在浏览器中运行。共享站点没有保存访客的人生记录，页面刷新会丢失本局进度。

## 本机开发

`python3 server.py` 只监听 `127.0.0.1:8765`，读取本机 `.env` 或环境变量。个人本机服务不占线上全局额度；没有配置个人凭据时，页面自动连接作者的共享服务。

本项目的 Worker 独立于个人主页，不复用或覆盖主页的构建产物、路由与静态文件。
