# 部署指南 - GitHub Pages

## 快速部署步骤

### 方法一：通过 GitHub 网页操作（推荐，最简单）

1. **创建 GitHub 仓库**
   - 访问 https://github.com/new
   - 仓库名称：`reincarnation-simulator`（或任意名称）
   - 设置为 Public（公开）
   - 点击 "Create repository"

2. **上传文件**
   - 在新创建的仓库页面，点击 "uploading an existing file"
   - 将以下文件拖拽上传：
     - `index.html`
     - `styles.css`
     - `game.js`
   - 填写提交信息：`Initial commit`
   - 点击 "Commit changes"

3. **启用 GitHub Pages**
   - 进入仓库的 Settings（设置）
   - 左侧菜单找到 "Pages"
   - Source 选择：`Deploy from a branch`
   - Branch 选择：`main` 分支，目录选择 `/ (root)`
   - 点击 "Save"

4. **获取链接**
   - 等待 1-2 分钟
   - 刷新页面，会看到：
     ```
     Your site is live at https://你的用户名.github.io/reincarnation-simulator/
     ```
   - 复制这个链接即可分享！

---

### 方法二：使用 Git 命令行

如果你熟悉 Git，可以使用命令行：

```bash
# 1. 初始化 Git 仓库
git init

# 2. 添加文件
git add index.html styles.css game.js

# 3. 提交
git commit -m "Initial commit"

# 4. 关联远程仓库（替换为你的仓库地址）
git remote add origin https://github.com/你的用户名/reincarnation-simulator.git

# 5. 推送到 GitHub
git branch -M main
git push -u origin main
```

然后按照方法一的第 3、4 步启用 GitHub Pages。

---

## 重要说明

### ✅ 已完成的生产环境配置

- **开发者令牌已移除**：游戏现在会要求用户登录 PlayKit 账号
- **用户需要自己充值 Spark**：每个玩家使用自己的积分
- **无需服务器**：纯静态网页，GitHub Pages 免费托管

### 🎮 用户使用流程

1. 访问你的游戏链接
2. 点击"开始游戏"
3. 首次使用会弹出 PlayKit 登录窗口
4. 用户登录/注册后即可开始游戏
5. 使用自己的 Spark 积分进行游戏

### 💰 关于 Spark 积分

- 用户需要在 https://playkit.ai 充值 Spark
- 每次 AI 调用会消耗用户的积分
- 你作为开发者不需要承担任何费用

---

## 其他部署选项

如果不想用 GitHub Pages，还可以使用：

1. **Vercel**（推荐）
   - 访问 https://vercel.com
   - 导入 GitHub 仓库
   - 自动部署，速度更快

2. **Netlify**
   - 访问 https://netlify.com
   - 拖拽文件夹即可部署

3. **Cloudflare Pages**
   - 访问 https://pages.cloudflare.com
   - 连接 GitHub 仓库自动部署

---

## 故障排查

### 问题：页面显示 404
- 等待 2-5 分钟，GitHub Pages 需要时间构建
- 检查 Settings > Pages 是否正确配置

### 问题：游戏无法加载
- 打开浏览器控制台（F12）查看错误
- 确认 `game.js` 中的 `GAME_ID` 正确

### 问题：用户无法登录
- 确认 `DEVELOPER_TOKEN` 已设置为空字符串 `''`
- 检查 PlayKit SDK 是否正确加载

---

## 下一步

部署成功后，你可以：

1. 分享链接给朋友测试
2. 在社交媒体推广
3. 收集用户反馈
4. 持续优化游戏体验

祝你的游戏大受欢迎！🎉
