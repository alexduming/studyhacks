# ⚠️ Infographic 参考图功能 BUG 修复

## 🐛 问题描述

使用参考图生成信息图时，出现以下错误：

```
[FAL Query] 错误: Error [ValidationError]: Unprocessable Entity
status: 422
field required
```

## 🔍 根本原因

**参数名错误！** FAL的 `nano-banana-pro/edit` 模型要求的参数名是：
- ✅ **`reference_image_url`** （正确）
- ❌ **`image_url`** （错误 - 我们之前使用的）

### 错误的代码（已修复）
```typescript
// ❌ 错误：使用了 image_url
if (hasReferenceImage) {
  input.image_url = params.referenceImageUrl;  // 错误的参数名
}
```

### 正确的代码
```typescript
// ✅ 正确：使用 reference_image_url
if (hasReferenceImage) {
  input.reference_image_url = params.referenceImageUrl;  // 正确的参数名
}
```

## ✅ 修复内容

**修改文件：** `src/app/api/infographic/generate-with-fallback/route.ts`

**修改位置：** 第115行

**修改说明：**
- 将参数名从 `image_url` 改为 `reference_image_url`
- 添加注释说明参数名的重要性

## 📋 完整的修复代码

```typescript
// 构建输入参数
const input: any = {
  prompt,
  num_images: 1,
  aspect_ratio: falAspectRatio,
  output_format: 'png',
  resolution: params.resolution || '2K', // 支持 1K, 2K, 4K
};

// 如果是图生图模式，添加参考图URL
// 注意：nano-banana-pro/edit 模型使用 reference_image_url 参数
if (hasReferenceImage) {
  input.reference_image_url = params.referenceImageUrl;  // ✅ 正确的参数名
  console.log('[FAL] 图生图模式，参考图:', params.referenceImageUrl);
}
```

## 🧪 验证方法

### 1. 重启开发服务器
```powershell
# 清除缓存
Remove-Item -Path ".next" -Recurse -Force

# 启动服务器
pnpm dev
```

### 2. 测试步骤
1. 访问 http://localhost:3000/zh/infographic
2. 上传参考图
3. 输入内容
4. 点击"生成信息图"

### 3. 预期日志（成功）
```
🔄 尝试使用 FAL (fal-ai/nano-banana-pro/edit) 异步生成... [图生图模式]
[FAL] 图生图模式，参考图: https://...
[FAL] 任务创建成功, request_id: xxx
[FAL Query] 使用模型 fal-ai/nano-banana-pro/edit 查询成功
[FAL Query] 任务状态: COMPLETED
[FAL Query] 获取结果成功
✅ 图片URL返回成功
```

### 4. API请求参数（正确格式）
```json
{
  "prompt": "...",
  "num_images": 1,
  "aspect_ratio": "9:16",
  "output_format": "png",
  "resolution": "2K",
  "reference_image_url": "https://cdn.studyhacks.ai/uploads/..." ✅
}
```

## 📊 修复前后对比

| 修复前（错误） | 修复后（正确） |
|--------------|--------------|
| `image_url` ❌ | `reference_image_url` ✅ |
| 422 错误 | 生成成功 |
| field required | 正常运行 |

## 🎯 FAL API 参数对照表

| 模型 | 参数名 | 用途 |
|------|--------|------|
| `fal-ai/nano-banana-pro` | - | 文生图，无需图片URL |
| `fal-ai/nano-banana-pro/edit` | `reference_image_url` | 图生图，需要参考图 |

## 💡 经验教训

1. **查看官方文档**：不同模型的参数名可能不同
2. **422错误通常表示参数问题**：缺少必需参数或参数名错误
3. **测试时要验证完整流程**：从任务创建到结果获取

## 🚀 现在可以测试了！

修复已完成，重启服务器后即可正常使用参考图功能。

---

**修复时间：** 2026-01-23  
**修复状态：** ✅ 完成  
**测试状态：** ⏳ 待测试

