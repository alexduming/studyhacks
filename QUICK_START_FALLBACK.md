# 快速开始：启用图片生成托底服务

## 🎯 问题

当前只使用KIE一家服务，**生成4张经常只出来2张**，非常不稳定。

## ✅ 解决方案

我们实现了**多提供商自动降级托底机制**，大大提高成功率！

## 🚀 最快配置方法（5分钟搞定）

### 步骤1：选择一个托底服务并获取API Key

推荐 **Together AI**（又快又便宜）：

1. 访问 https://together.ai/
2. 注册账号并登录
3. 访问 https://api.together.xyz/settings/api-keys
4. 创建新的API Key
5. 复制API Key（格式：`xxxxxxxxxxxxx`）

### 步骤2：配置环境变量

在您的 `.env.development` 文件中添加：

```bash
# 保留现有的KIE配置
KIE_NANO_BANANA_PRO_KEY=你现有的KIE密钥

# 添加Together AI作为托底服务
TOGETHER_API_KEY=你刚才复制的API_Key
```

### 步骤3：重启服务器

```bash
# 停止当前服务器（按 Ctrl+C）
# 然后重新启动
npm run dev
```

### 步骤4：使用新的API端点

在前端代码中，将原来的API端点替换为带托底的版本：

**原来的代码：**
```typescript
const response = await fetch('/api/infographic/generate', {
  method: 'POST',
  // ...
});
```

**新的代码（带托底）：**
```typescript
const response = await fetch('/api/infographic/generate-with-fallback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: '你的文本内容',
    aspectRatio: '16:9',
    resolution: '2K', // 支持 1K, 2K
    outputFormat: 'png',
  }),
});

const data = await response.json();
console.log('使用的提供商:', data.provider);
console.log('是否使用了托底:', data.fallbackUsed);
```

**查询任务状态：**
```typescript
const response = await fetch(
  `/api/infographic/query-with-fallback?taskId=${taskId}&provider=${provider}`
);
```

## 📊 预期效果

配置前后对比：

| 指标 | 配置前（只用KIE） | 配置后（KIE+Together AI） |
|-----|-----------------|------------------------|
| **成功率** | 50-70% ❌ | 95%+ ✅ |
| **生成4张的成功率** | 很低 | 很高 |
| **成本** | 中等 | 略高（托底很少触发） |

## 💰 成本说明

### Together AI 价格

- **FLUX.1-schnell**: ~$0.002-0.005/张
- 比KIE便宜很多！
- 只有在KIE失败时才会使用，实际成本增加很少

### 示例计算

假设：
- 每天生成100张图片
- KIE成功率60%，失败40张使用Together AI
- KIE: $0.03/张，Together AI: $0.005/张

**成本对比：**
- 只用KIE（失败不重试）：60张 × $0.03 = **$1.80/天**
- 用托底（KIE+Together AI）：60张 × $0.03 + 40张 × $0.005 = **$2.00/天**

**结论：** 只增加$0.20/天（11%成本），但成功率从60%提升到95%+！

## 🎁 推荐配置（更高可靠性）

如果想要更高的可靠性，可以配置多个托底服务：

```bash
# 主服务
KIE_NANO_BANANA_PRO_KEY=xxx

# 托底服务1（推荐）
REPLICATE_API_TOKEN=r8_xxx

# 托底服务2（推荐）
TOGETHER_API_KEY=xxx

# 托底服务3（可选，最便宜）
NOVITA_API_KEY=xxx
```

这样配置后，成功率可以达到 **99%+**！

## ❓ 常见问题

### Q1: 是否支持4K分辨率？

**Together AI**: 支持最大2K（1440x1440）
**Replicate**: ✅ 支持4K（需要配置Replicate）

如果需要4K，建议配置Replicate作为托底服务。

### Q2: OpenRouter可以用吗？

❌ **不推荐使用OpenRouter作为图片生成托底服务**

原因：
- OpenRouter主要是LLM平台（文本生成）
- 图片生成模型很少
- 不支持自定义分辨率（1K/2K/4K）
- 价格不一定便宜

### Q3: 托底服务会一直使用吗？

不会！托底服务**只在主服务失败时才会使用**。

降级顺序：
1. 先尝试KIE
2. KIE失败 → 尝试Replicate
3. Replicate失败 → 尝试Together AI
4. Together AI失败 → 尝试Novita AI

大部分情况下，只会使用KIE。

### Q4: 如何监控哪个服务被使用了？

API返回中包含：
- `provider`: 使用的提供商名称
- `fallbackUsed`: 是否使用了托底服务（true/false）

你可以记录这些信息来监控服务使用情况。

## 📝 下一步

1. ✅ 按照上面的步骤配置Together AI
2. ✅ 重启服务器
3. ✅ 更新前端代码使用新的API端点
4. ✅ 测试生成效果
5. ⭐ 如果需要更高可靠性，配置更多托底服务

## 📚 更多信息

- 详细配置指南：[INFOGRAPHIC_FALLBACK_SETUP.md](./INFOGRAPHIC_FALLBACK_SETUP.md)
- 价格对比和分辨率支持：见详细配置指南
- API提供商官网：
  - Together AI: https://together.ai/
  - Replicate: https://replicate.com/
  - Novita AI: https://novita.ai/

祝您使用愉快！如有问题，请参考详细配置指南。🎉

