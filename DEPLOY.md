# 部署与分享

## 分享源码或下载包

分享源文件即可。接收者双击 `index.html`，默认使用无需账号的经典模式。请包含 `classic.js`，它是离线玩法必需的文件。

需要 AI 故事时，接收者可以按照 `README.md` 配置自己的 DeepSeek 密钥并运行 `server.py`，或选择 PlayKit 模式自行登录。

不要把 `.env`、账户授权令牌或个人密钥写进网页、公开仓库、下载包。

## GitHub Pages / 其他静态托管

静态入口需要四个文件，放在同一级目录：

```text
index.html
styles.css
game.js
classic.js
```

在 GitHub 仓库设置中启用 Pages，使用目标分支的根目录作为来源。发布后的经典模式无需后端；PlayKit 模式需要外网与玩家账户。

GitHub Pages 不运行 Python，不能提供 DeepSeek 模式的 `/api/chat`。网页会提示使用本机服务，不会将密钥改放到浏览器中。

## DeepSeek 本机服务

运行 `python3 server.py`，或在 Mac 双击 `启动游戏.command`。默认仅监听 `127.0.0.1:8765`，仅接受本机同源 JSON 请求，并只提供游戏所需静态文件，不提供目录列表或 `.env` 下载。

这个服务是个人本机启动器。若要让公众在线共用 DeepSeek AI，需单独设计带身份验证、用量限制和费用控制的公开后端；本仓库默认配置不向公网开放个人余额。
