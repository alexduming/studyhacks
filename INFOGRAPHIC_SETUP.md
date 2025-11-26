# 信息图生成功能配置指南

## 功能说明

`/infographic` 页面使用 Kie.ai 的 nano-banana-pro 模型来生成学习信息图。该功能支持：
- 上传 PDF、Word、TXT 文件
- 粘贴文本内容
- 自定义宽高比（1:1、2:3、3:2 等）
- 选择分辨率（1K、2K、4K）
- 选择输出格式（PNG、JPG）

## 配置步骤

### 1. 获取 Kie API Key

访问 [https://kie.ai](https://kie.ai) 并注册账号，然后获取 API Key。

### 2. 配置环境变量

在项目根目录创建 `.env.local` 文件（如果还没有的话），添加以下内容：

```env
KIE_NANO_BANANA_PRO_KEY=你的_Kie_API_Key
```

**注意**：
- `.env.local` 文件不会被提交到 Git（已在 .gitignore 中）
- 确保 API Key 保密，不要泄露到公开代码库中
- 重启开发服务器以使环境变量生效

### 3. 重启开发服务器

```bash
# 停止当前的开发服务器（Ctrl+C）

# 重新启动
pnpm dev
```

## API 端点说明

### Generate API
- **路径**: `/api/infographic/generate`
- **方法**: POST
- **功能**: 创建信息图生成任务
- **返回**: `{ success: true, taskId: "..." }`

### Query API
- **路径**: `/api/infographic/query?taskId=xxx`
- **方法**: GET
- **功能**: 查询任务状态和结果
- **返回**: `{ success: true, state: "success", resultUrls: [...] }`

## Kie API 文档

Kie nano-banana-pro API 使用以下端点：

1. **创建任务**: `POST https://api.kie.ai/api/v1/jobs/createTask`
   - Authorization: `Bearer {API_KEY}`
   - Body: 
     ```json
     {
       "model": "nano-banana-pro",
       "input": {
         "prompt": "...",
         "aspect_ratio": "1:1",
         "resolution": "1K",
         "output_format": "png"
       }
     }
     ```

2. **查询任务**: `GET https://api.kie.ai/api/v1/jobs/queryTask?taskId={taskId}`
   - Authorization: `Bearer {API_KEY}`
   - Method: GET
   - 注意：如果返回 404，可能需要使用其他端点（见下方故障排查）

## 故障排查

### 错误：404 Not Found（查询任务失败）

如果查询任务时出现 404 错误，可能的原因：

1. **查询 API 端点不正确**
   - 当前使用: `GET /api/v1/jobs/queryTask?taskId={taskId}`
   - 可能需要尝试其他端点（见下方"备选端点"）

2. **taskId 无效或已过期**
   - 检查生成任务时是否成功返回了 taskId
   - 查看服务器日志确认 createTask 响应

3. **API 版本或路径变更**
   - Kie API 可能更新了端点
   - 需要查阅最新的 Kie API 文档

#### 备选查询端点

如果当前端点返回 404，可以尝试以下端点（需要修改 `src/app/api/infographic/query/route.ts`）：

```javascript
// 选项 1: GET with query parameter (当前使用)
GET /api/v1/jobs/queryTask?taskId={taskId}

// 选项 2: POST with body
POST /api/v1/jobs/queryTask
Body: { "taskId": "..." }

// 选项 3: RESTful style
GET /api/v1/jobs/task/{taskId}

// 选项 4: 使用 generate record-info (用于音乐生成，可能不适用)
GET /api/v1/generate/record-info?taskId={taskId}
```

### 错误：500 Internal Server Error

如果看到这个错误，请检查：

1. **环境变量是否配置**
   - 确认 `.env.local` 文件存在
   - 确认文件中有 `KIE_NANO_BANANA_PRO_KEY=...`
   - 重启开发服务器

2. **查看服务器日志**
   - 打开终端/控制台
   - 查找带有 ❌ 或 ✅ 符号的日志
   - 日志会显示详细的错误信息

3. **验证 API Key**
   - 登录 Kie.ai 控制台
   - 确认 API Key 有效且有足够的配额
   - 确认 API Key 有访问 nano-banana-pro 模型的权限

4. **检查网络连接**
   - 确保服务器可以访问 `https://api.kie.ai`
   - 检查防火墙或代理设置

### 常见日志信息

```
❌ 环境变量 KIE_NANO_BANANA_PRO_KEY 未设置
→ 解决方案: 在 .env.local 中添加 API Key

❌ Kie queryTask 请求失败: 401 Unauthorized
→ 解决方案: 检查 API Key 是否正确

❌ Kie queryTask 请求失败: 404 Not Found
→ 解决方案: taskId 可能无效，或任务已过期

✅ nano-banana-pro createTask 响应: { code: 200, data: { taskId: "..." } }
→ 成功创建任务

✅ Kie queryTask 响应: { code: 200, data: { state: "success", resultJson: "..." } }
→ 任务完成，获取到结果
```

## 开发说明

### 前端轮询机制

前端会每 3 秒查询一次任务状态，最多查询 20 次（约 1 分钟）。如果超时，用户可以到 Kie 控制台查看任务状态。

### 相关文件

- **页面**: `src/app/[locale]/(landing)/infographic/page.tsx`
- **Generate API**: `src/app/api/infographic/generate/route.ts`
- **Query API**: `src/app/api/infographic/query/route.ts`
- **文件读取工具**: `src/shared/lib/file-reader.ts`

## 支持的文件格式

- **PDF**: 使用 `pdfjs-dist` 解析
- **Word (.docx)**: 使用 `mammoth` 解析
- **Text (.txt)**: 直接读取文本内容

最大文件大小和其他限制取决于浏览器和文件读取库的能力。

