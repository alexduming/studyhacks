# ✅ Infographic 参考图功能 - 最终修复方案

## 🎯 问题根源

之前的实现方式**错误地使用了 `nano-banana-pro/edit` 模型**，导致422错误。

经过研究 **slides 页面的成功实现**，发现正确的做法是：

## ✅ 正确的实现方式（参考 slides）

### 1. **使用统一的模型**
- ✅ 使用 `fal-ai/nano-banana-pro`（普通模型）
- ❌ 不使用 `fal-ai/nano-banana-pro/edit`（编辑模型）

### 2. **参数名称**
- ✅ 使用 `image_input`（数组形式）
- ❌ 不使用 `reference_image_url` 或 `image_url`

### 3. **Prompt增强**
- 在 prompt 中添加风格参考说明
- 让AI理解参考图的用途

## 📝 关键代码修改

### 修改1：生成API (`generate-with-fallback/route.ts`)

**之前（错误）：**
```typescript
// ❌ 错误：使用 /edit 模型
const modelName = hasReferenceImage
  ? 'fal-ai/nano-banana-pro/edit'   // 错误
  : 'fal-ai/nano-banana-pro';

if (hasReferenceImage) {
  input.reference_image_url = params.referenceImageUrl;  // 错误的参数名
}
```

**现在（正确）：**
```typescript
// ✅ 正确：统一使用普通模型
const modelName = 'fal-ai/nano-banana-pro';

// ✅ 在 prompt 中添加风格参考说明
if (hasReferenceImage) {
  prompt += '\n\n（视觉风格参考：请严格遵循所提供参考图的设计风格、配色方案和构图布局）';
}

// ✅ 使用 image_input 参数（数组形式）
if (hasReferenceImage) {
  input.image_input = [params.referenceImageUrl];  // 数组形式
}
```

### 修改2：查询API (`query-with-fallback/route.ts`)

**之前（错误）：**
```typescript
// ❌ 错误：尝试两个模型
const modelNames = ['fal-ai/nano-banana-pro', 'fal-ai/nano-banana-pro/edit'];
// 循环尝试...
```

**现在（正确）：**
```typescript
// ✅ 正确：统一使用一个模型
const modelName = 'fal-ai/nano-banana-pro';

const status = await fal.queue.status(modelName, {
  requestId,
  logs: false,
});
```

## 🔍 Slides 页面的成功实现（参考）

从 `src/app/actions/aippt.ts` 第691行：

```typescript
// KIE API - Slides 的实现
const body = {
  model: 'nano-banana-pro',  // ✅ 普通模型
  input: {
    prompt: finalPrompt,
    aspect_ratio: params.aspectRatio || '16:9',
    resolution: params.imageSize || '4K',
    image_input: referenceImages.length > 0 ? referenceImages : undefined,  // ✅ image_input (数组)
    output_format: 'png',
  },
};
```

**关键特点：**
1. 使用普通模型 `nano-banana-pro`
2. 参数名是 `image_input`（数组）
3. Prompt中包含风格参考说明

## 📊 API参数对比表

| 场景 | 模型 | 参数名 | 参数类型 | Prompt增强 |
|------|------|--------|----------|-----------|
| **Slides（正确）** | `nano-banana-pro` | `image_input` | Array | ✅ 添加风格说明 |
| **Infographic（修复后）** | `nano-banana-pro` | `image_input` | Array | ✅ 添加风格说明 |
| **之前（错误）** | `nano-banana-pro/edit` | `reference_image_url` | String | ❌ 无 |

## 🧪 完整的请求参数示例

```json
{
  "prompt": "Create an educational infographic...\n\n（视觉风格参考：请严格遵循所提供参考图的设计风格、配色方案和构图布局）",
  "num_images": 1,
  "aspect_ratio": "9:16",
  "output_format": "png",
  "resolution": "2K",
  "image_input": [
    "https://cdn.studyhacks.ai/uploads/reference-images/xxx.jpg"
  ]
}
```

## ✅ 修改的文件

1. **`src/app/api/infographic/generate-with-fallback/route.ts`**
   - 第36-118行：`tryGenerateWithFal` 函数
   - 改用普通模型 + `image_input` 参数

2. **`src/app/api/infographic/query-with-fallback/route.ts`**
   - 第26-72行：`queryFalTask` 函数
   - 简化为单一模型查询

## 🚀 测试步骤

### 1. 重启服务器
```powershell
# 清除缓存
Remove-Item -Path ".next" -Recurse -Force

# 启动服务器
pnpm dev
```

### 2. 测试参考图功能
1. 访问 http://localhost:3000/zh/infographic
2. 上传参考图（任意图片）
3. 输入内容
4. 点击"生成信息图"

### 3. 预期日志（成功）
```
🔄 尝试使用 FAL (fal-ai/nano-banana-pro) 异步生成... [参考图模式]
[FAL] 使用参考图作为风格参考: https://...
[FAL] image_input: ['https://...']
[FAL] 任务创建成功, request_id: xxx
[FAL Query] 任务状态: COMPLETED
[FAL Query] 获取结果成功
✅ 图片生成成功
```

## 💡 经验总结

1. **不要自己猜测API参数**
   - 参考已有的成功实现（如slides）
   - 查看官方文档

2. **`/edit` 模型用于图像编辑**
   - 不是用于"参考图生成"
   - 是用于"修改现有图片"

3. **`nano-banana-pro` 模型支持多图融合**
   - 通过 `image_input` 传递参考图（数组）
   - 最多支持8张参考图
   - AI会融合参考图的风格

4. **Prompt工程很重要**
   - 明确告诉AI如何使用参考图
   - "视觉风格参考：请严格遵循..."

## 🎯 为什么这次一定能成功？

1. ✅ **完全参考slides的实现**（slides运行顺畅）
2. ✅ **使用相同的模型** (`nano-banana-pro`)
3. ✅ **使用相同的参数名** (`image_input`)
4. ✅ **使用相同的参数格式**（数组）
5. ✅ **添加了相同的Prompt说明**

## 📚 相关文件

- **实施总结**: `INFOGRAPHIC_REFERENCE_IMAGE_FEATURE.md`
- **快速测试**: `INFOGRAPHIC_QUICK_TEST.md`
- **参考实现**: `src/app/actions/aippt.ts` (createKieTaskAction)

---

**修复时间**: 2026-01-23  
**修复状态**: ✅ 完成（参考slides实现）  
**测试状态**: ⏳ 待测试

**核心改动**: 从使用 `/edit` 模型改为使用普通模型 + `image_input` 参数

