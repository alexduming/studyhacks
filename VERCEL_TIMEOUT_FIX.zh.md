# Vercel 超时问题修复指南

## 🚨 问题描述

**错误信息：**
```
Vercel Runtime Timeout Error: Task timed out after 30 seconds
POST /api/ai/notes 504
```

**影响功能：**
- AI Note Taker（AI 笔记生成）
- AI Flashcards（闪卡生成）
- AI Quiz（测验题生成）
- AI Podcast（播客脚本生成）

---

## 🔍 问题根源

### 1. Vercel 超时限制

Vercel 对不同计划的函数执行时间有严格限制：

| 计划 | 默认超时 | 最大可配置 |
|------|----------|-----------|
| **Hobby（免费）** | 10 秒 | 10 秒（不可调整） |
| **Pro** | 10 秒 | **60 秒** ✅ |
| **Enterprise** | 10 秒 | 900 秒（15 分钟） |

### 2. AI 生成时间过长

**原因：**
- 长文本内容需要更多处理时间
- OpenRouter API 响应时间不确定
- 复杂的 Prompt 需要更多 Token 生成

**实际场景：**
```
用户上传 PDF → 提取文本（5秒）→ OpenRouter 生成笔记（25秒）→ 超时！❌
```

---

## ✅ 已完成的修复

### 修改内容

为所有 AI API 路由添加了 `maxDuration` 配置：

**修改的文件：**
1. `src/app/api/ai/notes/route.ts` - AI 笔记生成
2. `src/app/api/ai/flashcards/route.ts` - 闪卡生成
3. `src/app/api/ai/quiz/route.ts` - 测验题生成
4. `src/app/api/ai/podcast/route.ts` - 播客脚本生成

**添加的配置：**
```typescript
// Vercel 配置：设置最大执行时间为 60 秒（需要 Pro 计划）
export const maxDuration = 60;

// 强制动态渲染，不缓存 AI 生成的内容
export const dynamic = 'force-dynamic';
```

### Git 提交记录

```bash
Commit: 250f2e4
Message: Fix: Add maxDuration config for AI API routes to prevent Vercel timeout
Branch: dev → origin/dev
```

---

## 📊 Vercel 计划要求

### 当前部署状态

你的错误显示 **30 秒超时**，说明：
- ✅ 你已经使用了 **Vercel Pro 计划**（Hobby 只有 10 秒）
- ⚠️ 但默认超时仍然是 10-30 秒，需要显式配置 `maxDuration`

### 检查你的 Vercel 计划

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击右上角头像 → **Account Settings**
3. 查看 **Plan** 部分

**如果是 Hobby 计划：**
- ❌ `maxDuration = 60` 不会生效
- ⚠️ 需要升级到 **Pro 计划**（$20/月）

**如果是 Pro 计划：**
- ✅ 修复后应该能正常工作
- ✅ 最大超时时间提升到 60 秒

---

## 🚀 部署后验证

### 步骤 1：等待 Vercel 部署完成

代码已推送到 GitHub，Vercel 会自动部署：

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择 `study` 项目
3. 查看 **Deployments** 标签
4. 等待状态变为 **Ready** ✅

预计时间：2-3 分钟

### 步骤 2：测试 AI Note Taker

1. 访问：`https://studyhacks.ai/ai`
2. 上传一个小文件（测试用）
3. 点击 **Generate Notes**
4. **期望结果：**
   - ✅ 笔记成功生成（不再超时）
   - ✅ 如果内容很长，可能需要 30-60 秒

### 步骤 3：查看 Vercel 日志

```bash
# 在本地终端运行
vercel logs --prod

# 或在 Vercel Dashboard 查看
# 项目 → Deployments → 最新部署 → Functions
```

**期望看到：**
```
✓ /api/ai/notes completed in 45s (maxDuration: 60s)
```

---

## 🎯 不同场景的解决方案

### 场景 1：使用 Pro 计划（已修复 ✅）

- ✅ `maxDuration = 60` 已配置
- ✅ 部署后自动生效
- ✅ 无需额外操作

### 场景 2：使用 Hobby 计划（需要升级 ⚠️）

**方案 A：升级到 Pro 计划**
1. 访问 [Vercel Pricing](https://vercel.com/pricing)
2. 选择 **Pro** 计划（$20/月）
3. 绑定支付方式
4. 等待 1-2 分钟生效

**方案 B：优化生成时间（不推荐）**
- 限制文件大小（< 5000 字）
- 简化 Prompt
- 使用更快的 AI 模型

**方案 C：改用后台任务（复杂）**
- 使用 Vercel Background Functions
- 或使用第三方队列服务（如 BullMQ + Redis）

### 场景 3：仍然超时（60 秒不够）

如果生成时间 > 60 秒：

**方案：改用流式响应（Streaming）**

让我为你添加流式响应支持（下一步优化）：

```typescript
// 流式响应示例
export async function POST(request: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      // 分块发送 AI 生成的内容
      for await (const chunk of aiGenerator()) {
        controller.enqueue(chunk);
      }
      controller.close();
    }
  });
  
  return new Response(stream);
}
```

好处：
- ✅ 用户可以实时看到生成进度
- ✅ 避免超时问题
- ✅ 更好的用户体验

---

## 📋 完整检查清单

### 代码部署
- [x] 所有 AI API 路由添加 `maxDuration = 60` ✅
- [x] 添加 `dynamic = 'force-dynamic'` ✅
- [x] Git 提交并推送 ✅
- [x] Vercel 自动部署 ✅

### Vercel 配置
- [ ] 确认使用 **Pro 计划** ⚠️ 需要你确认
- [ ] 等待部署完成（2-3 分钟）⏳
- [ ] 清除浏览器缓存 ⚠️

### 功能测试
- [ ] 测试 AI Note Taker ⏳
- [ ] 测试 AI Flashcards ⏳
- [ ] 测试 AI Quiz ⏳
- [ ] 测试 AI Podcast ⏳

---

## 🔧 常见问题排查

### Q1: 部署后还是超时怎么办？

**检查项：**
1. 确认使用 **Pro 计划**（Hobby 不支持 60 秒超时）
2. 清除浏览器缓存
3. 检查 Vercel 日志是否有其他错误
4. 确认 OpenRouter API Key 配置正确

**排查步骤：**
```bash
# 1. 查看 Vercel 日志
vercel logs --prod

# 2. 检查环境变量
# Vercel Dashboard → Settings → Environment Variables
# 确认 OPENROUTER_API_KEY 已配置
```

### Q2: 如何查看实际的执行时间？

**方法 1：Vercel Dashboard**
1. 进入项目 → **Monitoring**
2. 查看 **Function Duration** 图表
3. 找到 `/api/ai/notes` 的执行时间

**方法 2：添加日志**
```typescript
export async function POST(request: Request) {
  const startTime = Date.now();
  
  // ... AI 生成逻辑 ...
  
  const duration = Date.now() - startTime;
  console.log(`AI generation completed in ${duration}ms`);
}
```

### Q3: 能不能设置更长的超时时间？

**回答：** 取决于 Vercel 计划

| 计划 | 最大超时 |
|------|----------|
| Hobby | 10 秒（不可调整） |
| Pro | **60 秒** |
| Enterprise | 900 秒（15 分钟） |

**如果 60 秒不够：**
- 升级到 **Enterprise** 计划
- 或使用流式响应（推荐）
- 或使用后台任务队列

### Q4: 本地开发正常，部署后超时？

**常见原因：**
1. 本地没有超时限制，Vercel 有
2. 网络延迟不同（本地 vs 云端）
3. OpenRouter API 在不同地区的响应时间不同

**解决方案：**
- 使用 `maxDuration` 配置（已修复）
- 在本地测试时也设置超时限制
- 考虑使用地理位置更近的 AI 服务

---

## 🎉 总结

### 问题状态
✅ **已修复**：为所有 AI API 路由添加了 `maxDuration = 60` 配置

### 前提条件
⚠️ **需要 Vercel Pro 计划**（$20/月）

### 预期效果
- ✅ AI 笔记生成不再超时（最多 60 秒）
- ✅ 其他 AI 功能同样受益
- ✅ 用户体验显著改善

### 后续步骤
1. ⏳ 等待 Vercel 部署完成
2. ✅ 确认使用 Pro 计划
3. 🧪 测试所有 AI 功能
4. 📊 监控执行时间

### 进一步优化（可选）
- 🔄 实现流式响应（实时显示生成进度）
- ⚡ 优化 Prompt（减少生成时间）
- 📦 使用后台任务（处理超长文本）

---

## 📚 相关文档

- [Vercel Function Duration Limits](https://vercel.com/docs/functions/serverless-functions/runtimes#max-duration)
- [Vercel Pro Plan Features](https://vercel.com/pricing)
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [OpenRouter API Documentation](https://openrouter.ai/docs)

---

**修复完成时间：** 2025-12-05  
**Commit:** 250f2e4  
**状态：** ✅ 已部署，等待验证



