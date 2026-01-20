# ListenHub 播客功能 - 快速配置指南

## 🎯 5分钟快速上手

### 第一步：获取 API Key

1. 访问 ListenHub 官网：https://listenhub.ai/zh/app/home
2. 注册或登录账号
3. 进入 API 设置页面：https://listenhub.ai/zh/app/settings/apikey
4. 点击"创建 API Key"并复制

![获取API Key示例](https://via.placeholder.com/800x400?text=ListenHub+API+Key)

### 第二步：配置环境变量

在项目根目录找到或创建 `.env.local` 文件，添加以下内容：

```bash
# ListenHub 播客配置
LISTENHUB_ENABLED=true
LISTENHUB_API_KEY=你的API_Key
LISTENHUB_BASE_URL=https://api.listenhub.ai
```

**⚠️ 重要提示：**
- 将 `你的API_Key` 替换为第一步复制的实际 API Key
- 不要将 `.env.local` 文件上传到 GitHub
- 保存文件后重启开发服务器

### 第三步：启动项目

```bash
# 安装依赖（如果还没安装）
pnpm install

# 启动开发服务器
pnpm dev
```

### 第四步：访问播客页面

打开浏览器访问：
- 中文版：http://localhost:3000/zh/podcast
- 英文版：http://localhost:3000/en/podcast

## ✨ 功能演示

### 1. 选择播客模式

三种模式可选：
- **速听** (5积分) - 1-2分钟，快速生成
- **深度** (8积分) - 2-4分钟，内容质量高 ⭐推荐
- **辩论** (10积分) - 2-4分钟，双主持人

### 2. 输入内容

三种输入方式：
- **文本输入**：直接粘贴文章或笔记
- **文件上传**：支持 PDF、Word、Markdown 等
- **链接输入**：支持 YouTube、B站、知乎等平台链接

### 3. 配置选项

- **语言**：自动检测或手动选择（中文、英文、日语等）
- **人数**：单人或双人播客
- **音色**：选择喜欢的音色

### 4. 生成播客

点击"开始生成播客"按钮，等待 AI 处理：
1. 提交任务（约1秒）
2. AI 处理中（约30-120秒）
3. 自动轮询查询状态
4. 生成完成，自动播放

## 📊 积分说明

| 模式 | 时长 | 积分消耗 | 适用场景 |
|------|------|----------|----------|
| 速听 | 1-2分钟 | 5积分 | 新闻快报、简短内容 |
| 深度 | 2-4分钟 | 8积分 | 专业知识、深度分析 ⭐ |
| 辩论 | 2-4分钟 | 10积分 | 观点讨论、多角度分析 |

## 🎨 支持的平台

输入链接时，支持以下平台：
- 🎬 YouTube
- 📺 Bilibili（B站）
- 𝕏 Twitter/X
- 📝 Medium
- 🔴 Reddit
- 知 知乎
- 微 微信公众号

## 🔧 常见问题

### Q1: API Key 配置后不生效？
**A:** 重启开发服务器 (`Ctrl+C` 然后重新运行 `pnpm dev`)

### Q2: 提示"积分不足"？
**A:** 前往设置页面充值积分或使用邀请码获取免费积分

### Q3: 文件上传失败？
**A:** 
- 检查文件格式（支持：PDF, TXT, DOCX, EPUB, MD, JPG, PNG, WEBP）
- 确保文件大小不超过 10MB

### Q4: 播客生成失败？
**A:** 
- 检查输入内容的质量和格式
- 确认链接可以正常访问
- 稍后重试

### Q5: 如何下载生成的播客？
**A:** 点击播放器右上角的"下载"按钮

## 📱 使用技巧

### 技巧 1：内容优化
- ✅ 结构化的内容效果更好
- ✅ 建议每次不超过 2000 字
- ✅ 清晰的标题和段落划分

### 技巧 2：模式选择
- 新闻快报 → 速听模式
- 学习笔记 → 深度模式 ⭐
- 观点讨论 → 辩论模式

### 技巧 3：音色搭配
- 单人播客：选择专业或友好的音色
- 双人播客：选择对比明显的音色（如男声+女声）

## 🚀 部署到生产环境

### Vercel 部署

1. 在 Vercel 项目设置中添加环境变量：
   - `LISTENHUB_ENABLED` = `true`
   - `LISTENHUB_API_KEY` = `你的生产环境API Key`
   - `LISTENHUB_BASE_URL` = `https://api.listenhub.ai`

2. 推送代码到 GitHub

3. Vercel 自动部署完成

### 其他平台

在部署平台的环境变量配置中添加上述三个变量即可。

## 📚 更多资源

- 📖 [完整集成指南](./LISTENHUB_INTEGRATION_GUIDE.md)
- 🌐 [ListenHub 官网](https://listenhub.ai)
- 📘 [API 文档](https://blog.listenhub.ai/openapi-docs)

## 💡 示例场景

### 场景 1：学习笔记转播客
```
输入：课堂笔记（文本或PDF）
模式：深度模式
语言：中文
人数：单人
结果：8分钟专业讲解播客
```

### 场景 2：YouTube 视频转播客
```
输入：YouTube 视频链接
模式：速听模式
语言：自动检测
人数：单人
结果：2分钟快速总结播客
```

### 场景 3：观点讨论播客
```
输入：文章或观点文本
模式：辩论模式
语言：中文
人数：双人
结果：4分钟多角度讨论播客
```

## 🎉 开始使用

现在你已经完成配置，可以开始使用播客功能了！

访问：http://localhost:3000/zh/podcast

祝你使用愉快！🎙️

---

**需要帮助？**
- 📧 联系支持：support@studyhacks.ai
- 💬 加入社区：[Discord](https://discord.gg/xxx)
- 🐛 报告问题：[GitHub Issues](https://github.com/xxx/issues)

**最后更新：** 2025-12-31






