# 📐 多页 PPT 风格一致性机制详解

## 🎯 问题

生成多页 PPT 时，如何确保每一页的视觉风格（配色、排版、字体等）保持一致？

## ✅ 解决方案：风格锚定机制（Style Anchoring Mechanism）

### 核心原理

通过**传递参考图片**而非**文字指令**来实现风格一致性。

### 具体实现流程

```
第 1 页（封面）
├─ 使用：风格模板的 6-8 张参考图
└─ 生成：封面图片 A

第 2 页（第一张内页）
├─ 使用：风格模板的 6-8 张参考图
└─ 生成：内页图片 B  ← 🔑 锚定源（Anchor）

第 3 页开始
├─ 使用：
│   ├─ 图片 B（锚定图片）← 优先参考
│   └─ 风格模板的 6-8 张参考图
└─ 生成：内页图片 C、D、E...
    └─ 严格遵循图片 B 的"设计 DNA"
```

### 为什么选择第 2 页作为锚定源？

1. **第 1 页是封面**：排版通常与内页差异较大（大标题、无正文等）
2. **第 2 页是第一张内页**：更能代表整个 PPT 的主要视觉风格
3. **实战效果更好**：经验证，使用第 2 页作为锚定效果最佳

## 💻 代码实现位置

### 1. 客户端：设置锚定图片

**文件**：`src/app/[locale]/(landing)/slides/slides2-client.tsx`

```typescript
// 第 2 页生成成功后，记录其 URL 作为锚定
if (i === 1 && resultUrl) {
  anchorImageUrl = resultUrl;
  console.log('📌 风格锚定已设置（使用第 2 页作为参考）:', anchorImageUrl);
}

// 第 3 页开始，传入锚定图片
const resultUrl = await generateSlide(slide, {
  // ...其他参数
  anchorImageUrl: i > 1 ? anchorImageUrl : undefined,
});
```

### 2. 后端：添加锚定图片到参考图列表

**文件**：`src/app/actions/aippt.ts`

```typescript
// 在 createKieTaskWithFallbackAction 中
if (deckContext?.anchorImageUrl && deckContext.currentSlide > 2) {
  const anchorUrl = resolveImageUrl(deckContext.anchorImageUrl);
  // 将锚定图片放在最前面，确保 AI 优先参考
  customImagesWithAnchor = [anchorUrl, ...customImagesWithAnchor];
  console.log(
    `[一致性锚定] 第 ${deckContext.currentSlide}/${deckContext.totalSlides} 页使用首张作为风格锚定`
  );
}
```

### 3. 配置：生成锚定提示词

**文件**：`src/config/aippt-slides2.ts`

```typescript
export function generateAnchorPrompt(anchorImageUrl?: string | null): string {
  if (!anchorImageUrl) return '';
  return `\n\n--- CONSISTENCY ANCHOR ---\n[REFERENCE IMAGE FOR STYLE CONTINUITY]: ${anchorImageUrl}\nCRITICAL: Analyze the typography, spacing, color usage, and container styles from the reference image. The new slide MUST strictly adhere to these visual rules to maintain a seamless presentation deck experience. The content changes, but the 'design DNA' remains identical.`;
}
```

## ⚠️ 重要注意事项

### ❌ 错误做法：在 Prompt 中添加页码说明

```typescript
// ❌ 错误示例 - 不要这样做！
const prompt = `当前渲染第 ${index + 1}/${total} 页，需确保整体视觉一致。

Slide Title: "${slide.title}"
...`;
```

**问题**：AI 可能会将"当前渲染第 3/10 页"这样的文字渲染到图片上！

### ✅ 正确做法：通过参数传递，不在 Prompt 中体现

```typescript
// ✅ 正确示例
const prompt = `Slide Title: "${slide.title}"
Key Content: ...`;

// 页码信息通过 deckContext 传递，仅用于后端日志
createKieTaskWithFallbackAction({
  prompt,
  deckContext: {
    currentSlide: index + 1,
    totalSlides: total,
    anchorImageUrl: anchorUrl, // 🔑 核心：通过图片 URL 传递风格参考
  },
});
```

## 📊 实际效果日志示例

```
🎯 生成任务 - 优先级顺序: FAL -> KIE -> Replicate
🔄 [主力] 使用 FAL (nano-banana-pro)...
[FAL] 使用 6 张参考图   ← 第 1 页：仅风格模板参考图

[FAL] 使用 6 张参考图   ← 第 2 页：仅风格模板参考图

[一致性锚定] 第 3/4 页使用首张作为风格锚定
[FAL] 使用 7 张参考图   ← 第 3 页：6 张模板 + 1 张锚定（第 2 页）

[一致性锚定] 第 4/4 页使用首张作为风格锚定
[FAL] 使用 7 张参考图   ← 第 4 页：6 张模板 + 1 张锚定（第 2 页）
```

## 🔧 相关文件清单

| 文件 | 作用 |
|------|------|
| `src/app/[locale]/(landing)/slides/slides2-client.tsx` | 客户端：设置和传递锚定图片 |
| `src/app/actions/aippt.ts` | 后端：处理锚定图片并添加到参考图列表 |
| `src/config/aippt-slides2.ts` | 配置：生成锚定提示词 |
| `src/config/locale/messages/zh/aippt.json` | i18n：页码相关文案（⚠️ 已标记为废弃）|

## 📝 废弃的 i18n Key

```json
{
  "_comment_rendering_page_prompt": "⚠️ 已废弃 - 不要使用此 key！如果在 prompt 中包含页码信息，AI 会将其渲染到图片上。",
  "rendering_page_prompt": "当前渲染第 {current}/{total} 页，需确保整体视觉一致。"
}
```

**说明**：此 key 保留是为了兼容性，但已添加注释说明不应使用。如果发现代码中有使用此 key 的地方，应立即移除。

## 🎓 非程序员解释

### 比喻说明

想象你在画一套 PPT：

1. **第 1 张**（封面）：你按照参考图（风格模板）画了一个封面
2. **第 2 张**（第一张内页）：你按照参考图画了第一页内容
3. **第 3 张开始**：
   - 你不仅参考原来的风格模板
   - 还会看着第 2 张的配色、字体、排版
   - 确保新画的页面和第 2 张"看起来是一套的"

这就是"锚定"的意思：**用已经画好的页面作为参考，确保后续页面风格一致**。

### 为什么不直接告诉 AI "第几页"？

如果你在指令中写："这是第 3 页，共 10 页"，AI 可能会把这句话画到图片上，就像一个误解指令的画师。

所以我们只给它看图片，不给它文字说明页码。

## 🔍 如何验证机制是否正常工作？

### 查看后端日志

生成多页 PPT 时，在终端中查找：

```bash
# 应该能看到类似的日志
[一致性锚定] 第 3/4 页使用首张作为风格锚定
[FAL] 使用 7 张参考图
```

### 检查参考图数量

- **第 1-2 页**：应该显示 6 张（或风格模板定义的数量）
- **第 3 页开始**：应该显示 7 张（6 + 1 张锚定图）

## 🐛 故障排查

### 问题：风格不一致

**可能原因**：
1. 锚定图片未正确设置
2. 第 2 页生成失败导致无法获取锚定 URL
3. 参考图片 URL 解析失败

**排查步骤**：
1. 检查日志中是否有 `📌 风格锚定已设置` 的输出
2. 检查第 3 页开始是否有 `[一致性锚定]` 日志
3. 确认参考图数量是否从 6 张增加到 7 张

### 问题：图片上出现"第 X 页"字样

**原因**：Prompt 中包含了页码文案

**解决**：
1. 检查 `buildSlidePrompt` 函数，确保没有使用 `rendering_page_prompt` i18n key
2. 确保 `index` 和 `total` 参数仅用于传递给 `deckContext`，不在 prompt 中使用

## 📚 相关文档

- [PPT 生成流程文档](./pptx-export-notes.md)
- [R2 存储配置](./R2_STORAGE_SETUP.md)

---

**最后更新**：2026-01-23  
**作者**：AI Assistant  
**适用版本**：slides2-client（新版 PPT 生成器）

