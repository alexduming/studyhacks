# R2 持久化存储配置指南

## 📋 概述

本项目已实现将 AI 生成的内容（Infographic 和 Slides/PPT）自动保存到 Cloudflare R2 存储桶，确保生成的作品永久可访问。

## 🎯 功能特性

### 1. **Infographic 持久化**
- 生成完成后自动保存到 R2 的 `infographic/` 文件夹
- 存储路径：`infographic/{用户ID}/{时间戳}_{随机ID}_{索引}.png`
- 自动更新 `ai_task` 表中的 `taskResult` 字段

### 2. **Slides/PPT 持久化**
- 每张幻灯片生成完成后自动保存到 R2 的 `slides/` 文件夹
- 存储路径：`slides/{用户ID}/{时间戳}_{随机ID}_{索引}.png`
- 自动保存到 `presentation` 表中的 `content` 字段

### 3. **智能降级**
- 如果 R2 未配置或保存失败，系统会自动使用原始临时 URL
- 不影响用户正常使用，只在后台打印日志

## 🔧 配置步骤

### 第一步：获取 R2 凭证

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **R2** 页面
3. 创建或选择你的存储桶（例如：`studyhacks-ppt`）
4. 进入 **R2 API Tokens** 创建新的 API Token
5. 记录以下信息：
   - Account ID（账户ID）
   - Access Key ID（访问密钥ID）
   - Secret Access Key（密钥）
   - Bucket Name（桶名称）

### 第二步：配置环境变量

在 `.env.local` 文件中添加以下配置：

```env
# R2 存储配置
R2_ACCOUNT_ID=你的账户ID
R2_ACCESS_KEY=你的访问密钥ID
R2_SECRET_KEY=你的密钥
R2_BUCKET_NAME=studyhacks-ppt

# 可选：自定义 R2 访问域名（如果配置了自定义域名）
R2_DOMAIN=https://cdn.yourdomain.com
```

### 第三步：或者在管理后台配置

1. 登录管理后台
2. 进入 **Settings** > **Storage** 标签
3. 找到 **R2 Storage** 配置组
4. 填写以下字段：
   - **Account ID**: 你的 R2 账户ID
   - **Access Key**: 访问密钥ID
   - **Secret Key**: 密钥
   - **Bucket Name**: 桶名称（例如：`studyhacks-ppt`）
   - **Domain**（可选）: 自定义访问域名

## 📁 存储结构

```
studyhacks-ppt (R2 Bucket)
├── infographic/
│   └── {用户ID}/
│       ├── 1703001234567_abc12345_0.png
│       ├── 1703001234567_abc12345_1.png
│       └── ...
└── slides/
    └── {用户ID}/
        ├── 1703001234567_xyz67890_0.png
        ├── 1703001234567_xyz67890_1.png
        └── ...
```

## 🔍 技术实现

### API 端点

#### 1. `/api/storage/save-ai-image`（内部 API）
- **功能**: 下载临时图片并上传到 R2
- **参数**:
  - `imageUrl`: 临时图片 URL
  - `type`: `'infographic'` 或 `'slide'`
  - `metadata`: 元数据（可选）

#### 2. Infographic 自动保存
- **位置**: `src/app/api/infographic/query-with-fallback/route.ts`
- **触发时机**: 查询任务状态返回成功时
- **行为**: 
  1. 自动下载生成的图片
  2. 上传到 R2 `infographic/{用户ID}/` 文件夹
  3. 更新 `ai_task` 表的 `taskResult` 字段
  4. 返回 R2 永久 URL

#### 3. Slides 自动保存
- **位置**: `src/app/actions/aippt.ts` - `queryKieTaskWithFallbackAction`
- **触发时机**: 查询任务状态返回成功时
- **行为**:
  1. 自动下载生成的图片
  2. 上传到 R2 `slides/{用户ID}/` 文件夹
  3. 返回 R2 永久 URL
  4. 前端自动保存到 `presentation` 表

## 🎨 用户体验

### 对用户来说：
- ✅ **无感知**: 整个保存过程在后台自动完成
- ✅ **永久保存**: 生成的作品永久保存，不会失效
- ✅ **历史记录**: 可在生成历史中查看所有作品
- ✅ **容错性**: 即使 R2 保存失败，也能看到临时图片

### 对管理员来说：
- 📊 **统计分析**: 可以统计用户生成的作品数量
- 🗄️ **数据管理**: 集中管理所有生成的图片
- 💰 **成本控制**: Cloudflare R2 存储成本极低

## 🔒 安全性

- ✅ 用户只能访问自己的作品
- ✅ 所有上传都需要用户认证
- ✅ R2 凭证通过环境变量或数据库加密存储
- ✅ 支持自定义域名和 CDN 加速

## 📈 监控与日志

所有保存操作都会产生详细的日志：

```log
[Infographic] 开始保存 1 张图片到 R2
[Infographic] 保存图片 1: infographic/user123/1703001234567_abc12345_0.png
[Infographic] ✅ 图片 1 保存成功: https://r2.example.com/...
[Infographic] 保存完成，成功 1/1 张
[Infographic] ✅ 已更新 ai_task 记录: task-id-123
```

## ❓ 常见问题

### Q: 如果 R2 未配置会怎样？
A: 系统会自动降级，使用原始临时 URL，不影响正常使用。

### Q: 临时 URL 会失效吗？
A: 是的，AI 提供商（如 Replicate、KIE）的临时 URL 通常会在几小时或几天后失效。使用 R2 可以永久保存。

### Q: R2 存储费用如何？
A: Cloudflare R2 的存储费用极低：
- 前 10GB/月 **免费**
- 超出部分 $0.015/GB/月
- 无流量费用

### Q: 可以使用其他存储服务吗？
A: 是的，项目已支持 S3 兼容的存储服务，你可以在 `src/extensions/storage/` 中查看或添加其他提供商。

### Q: 如何迁移现有的临时 URL？
A: 目前系统只会保存新生成的图片。如果需要迁移历史数据，可以编写脚本批量下载并上传。

## 🚀 下一步

1. ✅ 配置 R2 凭证
2. ✅ 测试 Infographic 生成和保存
3. ✅ 测试 Slides/PPT 生成和保存
4. ✅ 检查生成历史页面是否正常显示
5. ✅ 监控 R2 存储使用情况

## 📞 支持

如有问题，请查看：
- Cloudflare R2 文档: https://developers.cloudflare.com/r2/
- 项目代码: `src/extensions/storage/r2.ts`
- 相关 API: `src/app/api/storage/` 和 `src/app/api/infographic/`

