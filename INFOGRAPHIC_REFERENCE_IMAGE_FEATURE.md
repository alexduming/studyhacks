# Infographic 参考图功能实施总结

## 📋 需求回顾

1. **确认当前使用的模型**：Infographic 目前使用 `fal-ai/nano-banana-pro`（文生图）模型
2. **新功能**：添加"上传参考图"模式，支持用户通过参考图自定义生成的信息图风格
3. **技术要求**：当有参考图时，切换到 `fal-ai/nano-banana-pro/edit`（图生图）模型

## ✅ 实施完成的修改

### 1. 国际化文案添加

**文件：**
- `src/config/locale/messages/zh/infographic.json`
- `src/config/locale/messages/en/infographic.json`

**新增字段：**
```json
{
  "upload": {
    "button_label_reference": "上传参考图 / Upload Reference Image",
    "hint_reference": "上传一张图片作为风格参考（可选）",
    "reference_image_uploaded": "参考图：{fileName}",
    "upload_failed": "上传失败：{error}"
  },
  "errors": {
    "reference_image_too_large": "参考图文件过大，请选择小于10MB的图片"
  }
}
```

### 2. 前端页面修改

**文件：** `src/app/[locale]/(landing)/infographic/page.tsx`

#### 2.1 新增状态管理

```typescript
// 参考图上传（用于图生图模式）
const [referenceImage, setReferenceImage] = useState<File | null>(null);
const [referenceImageUrl, setReferenceImageUrl] = useState<string>('');
const [isUploadingReference, setIsUploadingReference] = useState(false);
const referenceInputRef = useRef<HTMLInputElement | null>(null);
```

#### 2.2 新增参考图上传处理函数

```typescript
const handleReferenceImageSelect = async (event) => {
  // 1. 检查文件大小（限制10MB）
  // 2. 上传到 R2 存储获取公网URL
  // 3. 保存文件对象和URL到状态
  // 4. 显示成功提示
}
```

**功能说明：**
- 限制文件大小：最大10MB
- 上传路径：`uploads/reference-images`
- 上传成功后保存URL供API调用

#### 2.3 UI组件新增

**新增参考图上传按钮：**
```tsx
<Button variant="outline" size="sm">
  <FileImage className="mr-2 h-4 w-4" />
  {t('upload.button_label_reference')}
</Button>
```

**新增参考图预览区域：**
```tsx
{referenceImage && referenceImageUrl && (
  <div className="bg-primary/5 border-primary/30 mb-3 rounded-lg border p-3">
    <img src={referenceImageUrl} alt="Reference" />
  </div>
)}
```

#### 2.4 API调用修改

```typescript
// 在生成请求中包含参考图URL
body: JSON.stringify({
  content: contentToGenerate,
  aspectRatio,
  resolution,
  outputFormat,
  referenceImageUrl: referenceImageUrl || undefined, // 新增参数
})
```

#### 2.5 清空按钮增强

清空操作现在也会清除参考图状态：
```typescript
setReferenceImage(null);
setReferenceImageUrl('');
```

### 3. API后端修改

**文件：** `src/app/api/infographic/generate-with-fallback/route.ts`

#### 3.1 接口参数扩展

```typescript
interface GenerateParams {
  content: string;
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
  referenceImageUrl?: string; // 新增：参考图URL
}
```

#### 3.2 FAL模型切换逻辑

```typescript
async function tryGenerateWithFal(params: GenerateParams, apiKey: string) {
  // 根据是否有参考图选择模型
  const hasReferenceImage = !!params.referenceImageUrl;
  const modelName = hasReferenceImage
    ? 'fal-ai/nano-banana-pro/edit'  // 图生图模式
    : 'fal-ai/nano-banana-pro';      // 文生图模式

  // 构建输入参数
  const input: any = {
    prompt,
    num_images: 1,
    aspect_ratio: falAspectRatio,
    output_format: 'png',
    resolution: params.resolution || '2K',
  };

  // 如果是图生图模式，添加参考图URL
  if (hasReferenceImage) {
    input.image_url = params.referenceImageUrl;
    console.log('[FAL] 图生图模式，参考图:', params.referenceImageUrl);
  }

  // 提交到正确的模型
  const { request_id } = await fal.queue.submit(modelName, {
    input: input as any,
  });
}
```

#### 3.3 POST请求处理增强

```typescript
export async function POST(request: NextRequest) {
  const { referenceImageUrl } = body || {};

  // 记录参考图使用情况
  if (referenceImageUrl) {
    console.log('[Infographic] 使用参考图模式，参考图URL:', referenceImageUrl);
  }

  const params: GenerateParams = {
    content,
    aspectRatio,
    resolution,
    outputFormat,
    referenceImageUrl, // 传递参考图URL
  };
}
```

## 🎯 功能特性

### 智能模型切换
- ✅ **无参考图**：使用 `fal-ai/nano-banana-pro`（文生图）
- ✅ **有参考图**：自动切换到 `fal-ai/nano-banana-pro/edit`（图生图）

### 用户体验优化
- ✅ 独立的参考图上传按钮，与内容文件上传分离
- ✅ 参考图预览功能，实时查看已上传的参考图
- ✅ 文件大小限制（10MB），防止上传过大文件
- ✅ 上传进度提示和错误处理
- ✅ 清空操作同时清除参考图
- ✅ 完整的中英文多语言支持

### 技术实现亮点
- ✅ 参考图上传到R2存储，获取稳定的公网URL
- ✅ 异步上传，不阻塞用户操作
- ✅ 完善的错误处理和用户提示
- ✅ 保持原有积分消耗逻辑不变
- ✅ 兼容现有的多提供商托底机制

## 📊 工作流程

### 用户操作流程

```
1. 用户输入或上传内容文件
   ↓
2. （可选）上传参考图
   ↓
3. 选择参数（宽高比、分辨率、格式）
   ↓
4. 点击"生成信息图"
   ↓
5. 系统判断：
   - 有参考图 → 使用 fal-ai/nano-banana-pro/edit
   - 无参考图 → 使用 fal-ai/nano-banana-pro
   ↓
6. 异步生成，轮询查询结果
   ↓
7. 展示生成的信息图
```

### 技术处理流程

```
前端：
1. 用户选择参考图文件
   ↓
2. 上传到 /api/storage/upload-file（R2存储）
   ↓
3. 获取公网URL并保存到状态
   ↓
4. 生成时将URL包含在请求body中

后端：
1. 接收 referenceImageUrl 参数
   ↓
2. 判断是否有参考图
   ↓
3. 选择对应的FAL模型
   - 有参考图 → fal-ai/nano-banana-pro/edit
   - 无参考图 → fal-ai/nano-banana-pro
   ↓
4. 构建input参数（有参考图时添加 image_url）
   ↓
5. 提交到FAL异步队列
   ↓
6. 返回taskId给前端轮询
```

## 🔍 测试要点

### 功能测试
- [ ] 上传参考图并生成信息图（图生图模式）
- [ ] 不上传参考图生成信息图（文生图模式）
- [ ] 参考图预览显示正确
- [ ] 删除参考图功能正常
- [ ] 清空按钮清除所有内容包括参考图
- [ ] 文件大小限制（10MB）生效
- [ ] 错误提示显示正确

### UI测试
- [ ] 参考图上传按钮位置合理
- [ ] 参考图预览样式美观
- [ ] 上传进度提示清晰
- [ ] 多语言切换文案正确

### API测试
- [ ] 有参考图时使用 edit 模型
- [ ] 无参考图时使用常规模型
- [ ] 参考图URL正确传递到FAL
- [ ] 日志输出完整清晰
- [ ] 错误处理机制正常

## 📝 代码质量

- ✅ **无Linter错误**：所有修改通过TypeScript和ESLint检查
- ✅ **充分注释**：关键函数都有详细的中文注释
- ✅ **类型安全**：使用TypeScript接口定义参数
- ✅ **错误处理**：完善的try-catch和用户提示
- ✅ **性能优化**：异步上传不阻塞UI

## 🎨 UI截图说明

### 新增UI元素位置

```
┌─────────────────────────────────────┐
│  输入知识内容                        │
├─────────────────────────────────────┤
│  [上传文件（支持批量）] 支持PDF...   │  ← 原有功能
│  [上传参考图] 上传图片作为风格参考   │  ← 新增功能
├─────────────────────────────────────┤
│  ┌─ 参考图预览 ──────────────────┐  │
│  │ [X] 参考图：example.jpg        │  │
│  │ [图片预览缩略图]               │  │
│  └────────────────────────────────┘  │
├─────────────────────────────────────┤
│  [文本输入框]                        │
│                                      │
├─────────────────────────────────────┤
│  宽高比 | 分辨率 | 格式               │
├─────────────────────────────────────┤
│           [清空内容] [生成信息图]     │
└─────────────────────────────────────┘
```

## 💡 使用建议

### 参考图选择建议
1. **风格统一**：选择与期望风格接近的图片
2. **清晰度**：使用高清图片效果更好
3. **内容相关**：选择与主题相关的参考图
4. **色彩搭配**：考虑参考图的配色方案

### 最佳实践
1. 先上传内容文件或输入文本
2. 再上传参考图（可选）
3. 调整参数（宽高比、分辨率）
4. 生成并查看结果
5. 如不满意可更换参考图重新生成

## 🚀 后续优化建议

### 功能增强
- [ ] 支持多张参考图对比
- [ ] 参考图风格预设（扁平风、插画风等）
- [ ] 参考图裁剪和调整功能
- [ ] 参考图历史记录

### 性能优化
- [ ] 参考图压缩优化
- [ ] 缓存已上传的参考图
- [ ] 支持参考图URL直接输入

### 用户体验
- [ ] 参考图使用教程
- [ ] 推荐参考图库
- [ ] 参考图效果对比展示

## 📚 相关文档

- [FAL AI nano-banana-pro 文档](https://fal.ai/models/nano-banana-pro)
- [FAL AI nano-banana-pro/edit 文档](https://fal.ai/models/nano-banana-pro/edit)
- [R2存储配置说明](./R2配置快速指南.md)

## 🎉 总结

此次功能实施成功添加了Infographic的"参考图上传"功能，实现了：

1. ✅ **智能模型切换**：根据是否有参考图自动选择文生图或图生图模型
2. ✅ **完整的用户体验**：上传、预览、删除、清空全流程
3. ✅ **稳定的技术实现**：R2存储、异步处理、错误处理
4. ✅ **多语言支持**：完整的中英文国际化
5. ✅ **代码质量保证**：无Linter错误，充分注释

用户现在可以通过上传参考图来自定义生成的信息图风格，大大增强了Infographic功能的灵活性和实用性！

---

**实施时间：** 2026-01-23
**实施状态：** ✅ 完成
**测试状态：** ⏳ 待测试


