# Infographic 参考图功能最终修复

## 🎯 问题根源

根据 [FAL官方文档](https://fal.ai/models/fal-ai/nano-banana-pro/edit/api)，我们之前的实现有**致命错误**：

### ❌ 错误做法（之前）
```typescript
// 错误1: 使用了错误的模型
const modelName = 'fal-ai/nano-banana-pro'; // 文生图模型

// 错误2: 使用了错误的参数名
input.image_input = [referenceImageUrl]; // 这是用于多图融合，不是风格参考
```

### ✅ 正确做法（官方）
```typescript
// 正确1: 使用专用的图生图模型
const modelName = 'fal-ai/nano-banana-pro/edit';

// 正确2: 使用正确的参数名
input.image_urls = [referenceImageUrl]; // 注意是复数 image_urls
```

## 📚 官方文档说明

根据 FAL 官方文档：

### `fal-ai/nano-banana-pro`（文生图）
- **用途**: 纯文本生成图片
- **参数**: `prompt`, `num_images`, `aspect_ratio` 等
- **不支持**: 参考图输入

### `fal-ai/nano-banana-pro/edit`（图生图）
- **用途**: 基于参考图生成/编辑图片
- **参数**: 包含所有文生图参数 + `image_urls`
- **关键参数**: `image_urls: string[]` - 用于图像编辑或风格参考的图片URLs

### 官方示例代码
```javascript
const result = await fal.subscribe("fal-ai/nano-banana-pro/edit", {
  input: {
    prompt: "make a photo of the man driving the car down the california coastline",
    image_urls: ["https://storage.googleapis.com/..."] // ✅ 正确参数名
  }
});
```

## 🔧 修复内容

### 1. 修复生成API (`generate-with-fallback/route.ts`)

**修改点1: 动态选择模型**
```typescript
// ✅ 根据是否有参考图选择模型
const hasReferenceImage = !!params.referenceImageUrl;
const modelName = hasReferenceImage 
  ? 'fal-ai/nano-banana-pro/edit'  // 有参考图 → 图生图模型
  : 'fal-ai/nano-banana-pro';      // 无参考图 → 文生图模型
```

**修改点2: 使用正确的参数名**
```typescript
const input: any = {
  prompt,
  num_images: 1,
  aspect_ratio: falAspectRatio,
  output_format: 'png',
  resolution: params.resolution || '2K',
};

// ✅ 关键修复：使用 image_urls 参数（复数）
if (hasReferenceImage) {
  input.image_urls = [params.referenceImageUrl]; // ✅ 正确！
  console.log('[FAL] 🎨 使用 edit 模型，image_urls:', input.image_urls);
}
```

### 2. 修复查询API (`query-with-fallback/route.ts`)

**修改点: 支持两种模型查询**
```typescript
// ✅ 尝试两种模型：先尝试 edit 模型，失败后尝试普通模型
const modelNames = ['fal-ai/nano-banana-pro/edit', 'fal-ai/nano-banana-pro'];
let status: any = null;
let usedModel = '';

for (const modelName of modelNames) {
  try {
    status = await fal.queue.status(modelName, {
      requestId,
      logs: false,
    });
    usedModel = modelName;
    console.log(`[FAL Query] 使用模型 ${modelName} 查询成功`);
    break;
  } catch (error: any) {
    // 如果是422错误（模型不匹配），尝试下一个模型
    if (error.status === 422) {
      console.log(`[FAL Query] 模型 ${modelName} 不匹配，尝试下一个模型...`);
      continue;
    }
    throw error;
  }
}
```

## 🎨 工作原理

### 无参考图模式（文生图）
1. 用户输入文本/上传文档
2. 系统使用 `fal-ai/nano-banana-pro` 模型
3. 纯文本生成信息图

### 有参考图模式（图生图）
1. 用户上传参考图 + 输入文本/上传文档
2. 系统自动切换到 `fal-ai/nano-banana-pro/edit` 模型
3. 参数中包含 `image_urls: [参考图URL]`
4. AI会参考图片的视觉风格生成信息图

## 📊 参数对比

| 参数名 | 用途 | 模型 | 格式 |
|--------|------|------|------|
| `image_input` | 多图融合（已弃用） | `nano-banana-pro` | `string[]` |
| `image_urls` | **风格参考/图像编辑** | `nano-banana-pro/edit` | `string[]` |

## ✅ 预期效果

修复后，当用户上传参考图时：
1. ✅ 系统自动切换到 `edit` 模型
2. ✅ 使用正确的 `image_urls` 参数
3. ✅ AI 生成的信息图会**严格遵循参考图的视觉风格**
4. ✅ 包括配色、布局、字体、图标风格等

## 🚀 测试建议

1. **测试无参考图生成**（确保不影响原有功能）
   - 仅输入文本
   - 应使用 `nano-banana-pro` 模型

2. **测试有参考图生成**（验证修复效果）
   - 上传参考图 + 输入文本
   - 应使用 `nano-banana-pro/edit` 模型
   - 生成的图片应遵循参考图风格

3. **检查控制台日志**
   ```
   ✅ 无参考图: [FAL] 使用模型 nano-banana-pro
   ✅ 有参考图: [FAL] 🎨 使用 edit 模型，image_urls: [...]
   ```

## 📝 关键教训

1. **必须查阅官方文档** - 之前参考 slides 的实现是错误的，因为 slides 用的是多图融合，不是风格参考
2. **参数名很重要** - `image_input` vs `image_urls` 虽然看似相似，但完全不同的功能
3. **模型选择决定功能** - `edit` 模型专门用于图生图，不能用普通模型代替

## 🔗 参考资料

- [FAL nano-banana-pro/edit 官方文档](https://fal.ai/models/fal-ai/nano-banana-pro/edit/api)
- [FAL nano-banana-pro 官方文档](https://fal.ai/models/fal-ai/nano-banana-pro/api)

---

**修复时间**: 2026-01-23
**修复人员**: AI Assistant based on user feedback
**状态**: ✅ 已修复，待测试验证


