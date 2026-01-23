# 📐 多页 PPT 风格一致性机制详解

## 🎯 问题

生成多页 PPT 时，如何确保每一页的视觉风格（配色、排版、字体等）保持一致？

## ✅ 解决方案：风格锚定机制（Style Anchoring Mechanism）

### 核心原理

通过**传递参考图片**而非**文字指令**来实现风格一致性。

### 🎯 微调策略（2026-01-23 更新）

**锚定内容**（严格遵循）：
- ✅ **标题样式**：位置、字体、字号、颜色、粗细（精确匹配）
- ✅ **整体风格**：配色方案、设计语言、视觉氛围

**非锚定内容**（根据内容灵活调整）：
- ❌ 内容区域的布局方式（列表、表格、图表等）
- ❌ 元素的排列方式和数量
- ❌ 图形和图表的具体形式
- ❌ 文本块的组织方式

**目标**：
- 🎨 保持品牌一致性：通过标题样式让人一眼认出是同一套 PPT
- 📊 优化信息传达：每页内容区域根据实际信息需求灵活设计
- ✨ 避免千篇一律：不要所有页面看起来像套模板

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

### 3. 配置：生成锚定提示词（微调版）

**文件**：`src/config/aippt-slides2.ts`

**核心策略**：锚定**标题样式**和**整体风格**，但**不锚定内容区域布局**

```typescript
export function generateAnchorPrompt(anchorImageUrl?: string | null): string {
  if (!anchorImageUrl) return '';
  return `\n\n--- STYLE CONTINUITY ANCHOR ---
[REFERENCE IMAGE]: ${anchorImageUrl}

CRITICAL ANCHORING RULES:
You MUST maintain these aspects from the reference:
✓ TITLE STYLE: Position, font family, font size, font weight, color (exact match required)
✓ OVERALL AESTHETIC: Color palette, design language, visual mood

You SHOULD adapt these based on current slide content:
• Content area layout (lists, tables, charts - choose what fits the content best)
• Element arrangement and quantity (adapt to information density)
• Graphics and charts format (use appropriate visualizations for the data)
• Text block organization (optimize for readability based on content type)

Goal: Create a cohesive deck where titles are instantly recognizable as part of the same presentation, but content areas are intelligently adapted to their specific information needs. Avoid cookie-cutter layouts - each slide should feel tailored to its content while maintaining brand consistency through title styling.`;
}
```

**非程序员解释**：
- ✅ **锚定内容**：标题的位置、字体、字号、颜色必须一致
- ✅ **锚定内容**：整体配色方案和设计风格保持统一
- ❌ **不锚定**：内容区域的具体布局（列表、表格、图表等根据内容选择）
- ❌ **不锁定**：元素的排列方式和数量（根据信息密度调整）
- 🎯 **目标**：标题一致让人一眼看出是同一套 PPT，但内容区域灵活适配，避免所有页面千篇一律

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

想象你在设计一本杂志：

1. **第 1 张**（封面）：你按照品牌指南设计了封面
2. **第 2 张**（第一篇文章）：你设计了第一篇文章的页面
3. **第 3 张开始**：
   - 你会参考第 2 张的**标题样式**（字体、大小、颜色、位置）
   - 你会保持第 2 张的**整体配色和风格**
   - 但**内容区域会根据这一页的内容灵活调整**：
     - 如果是数据页，用图表展示
     - 如果是要点页，用列表展示
     - 如果是对比页，用表格展示
   - **不会**让所有页面看起来完全一样

这就是"**智能锚定**"的意思：
- ✅ 标题一致 → 一眼看出是同一套 PPT
- ✅ 内容灵活 → 每页根据信息需求定制
- ✅ 避免死板 → 不是简单地套用同一个模板

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

## 🆕 更新日志

### 2026-01-23 - 智能锚定微调

**更新内容**：
- ✅ 优化锚定策略：从"完全锚定"改为"智能锚定"
- ✅ 明确锚定范围：仅锚定标题样式和整体风格，不锚定内容区域布局
- ✅ 更新提示词：指导 AI 在保持品牌一致性的同时，灵活适配内容区域

**预期效果**：
- ✅ 标题样式统一：一眼看出是同一套 PPT
- ✅ 内容区域灵活：图表、列表、表格等根据内容选择
- ✅ 避免千篇一律：每页根据信息需求定制设计

**改动文件**：
- `src/config/aippt-slides2.ts` - 更新 `generateAnchorPrompt` 函数
- `src/app/[locale]/(landing)/slides/slides2-client.tsx` - 更新注释说明
- `docs/SLIDES_STYLE_CONSISTENCY.md` - 更新文档

---

**最后更新**：2026-01-23  
**作者**：AI Assistant  
**适用版本**：slides2-client（新版 PPT 生成器）

