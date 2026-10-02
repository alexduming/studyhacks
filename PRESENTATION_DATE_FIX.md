# Presentation Date 序列化问题修复总结

## 问题描述

部分用户在访问 `https://www.studyhacks.ai/zh/slides` 时遇到 Server Components 渲染错误：

```
An error occurred in the Server Components render. 
The specific message is omitted in production builds to avoid leaking sensitive details.
```

## 根本原因

Next.js Server Components 在将数据从服务端传递到客户端时，需要通过 JSON 序列化。**Date 对象无法被序列化**，导致渲染失败。

具体问题出现在：
1. `getPresentationAction` 返回数据库查询结果，其中包含 `createdAt` 和 `updatedAt` 字段为 Date 对象
2. `getUserPresentationsAction` 同样返回包含 Date 对象的数组
3. 这些数据直接作为 props 传递给客户端组件，导致序列化失败

## 解决方案

### 1. 定义序列化类型

创建 `SerializedPresentation` 类型，将 Date 字段改为字符串：

```typescript
export type SerializedPresentation = {
  id: string;
  userId: string;
  title: string;
  content: string | null;
  status: string;
  kieTaskId: string | null;
  styleId: string | null;
  thumbnailUrl: string | null;
  createdAt: string | null;  // ✅ ISO 字符串
  updatedAt: string | null;  // ✅ ISO 字符串
};
```

### 2. 修改 Server Actions 返回类型

```typescript
// src/app/actions/presentation.ts

export async function getPresentationAction(id: string): Promise<SerializedPresentation | undefined> {
  // ...
  return {
    id: record.id,
    userId: record.userId,
    title: record.title,
    content: nextContent,
    status: record.status,
    kieTaskId: record.kieTaskId,
    styleId: record.styleId,
    thumbnailUrl: nextThumbnail,
    createdAt: record.createdAt ? record.createdAt.toISOString() : null,
    updatedAt: record.updatedAt ? record.updatedAt.toISOString() : null,
  };
}

export async function getUserPresentationsAction(): Promise<SerializedPresentation[]> {
  // ...
  patchedResults.push({
    // 同样转换为 ISO 字符串
  });
}
```

### 3. 更新客户端类型定义

修改所有使用 presentation 数据的组件接口：

**slides2-client.tsx:**
```typescript
interface PresentationData {
  createdAt: string | null;  // 改为 string
  updatedAt: string | null;  // 改为 string
  // ...
}
```

**presentation-card.tsx:**
```typescript
interface PresentationCardProps {
  item: {
    createdAt: string | null;  // 改为 string
    // ...
  };
}
```

### 4. 添加 null 检查

由于 `createdAt` 现在可能为 `null`，需要添加条件渲染：

```typescript
{item.createdAt
  ? new Date(item.createdAt).toLocaleDateString()
  : '-'}
```

## 修改的文件

1. ✅ `src/app/actions/presentation.ts` - 添加类型定义，修改返回值
2. ✅ `src/app/[locale]/(landing)/slides/slides2-client.tsx` - 更新接口类型
3. ✅ `src/app/[locale]/(landing)/library/presentations/presentation-card.tsx` - 更新接口和渲染逻辑
4. ✅ `src/app/[locale]/(landing)/aippt/history/page.tsx` - 添加 null 检查

## 测试验证

- ✅ TypeScript 类型检查通过
- ✅ Next.js 构建成功（`pnpm build`）
- ✅ 向后兼容：客户端代码已使用 `new Date()` 转换，无需修改

## 部署说明

1. **Vercel 部署安全**：Vercel 使用 Linux 环境，不会遇到 Windows 的 symlink 问题
2. **本地开发**：Windows 用户可能在构建时看到 symlink 错误，但不影响功能和 Vercel 部署
3. **测试步骤**：
   - 访问 `/zh/slides?id=<existing_presentation_id>`
   - 访问 `/zh/library/presentations`
   - 创建新的 presentation

## 最佳实践

**规则**：任何需要跨 Server/Client 边界传递的数据，都应该：
1. 将 Date 对象转换为 ISO 字符串（`date.toISOString()`）
2. 在类型定义中使用 `string | null` 而不是 `Date`
3. 在客户端使用时，先检查 null 再转换：`new Date(dateString)`

---

**修复日期**: 2026-01-30
**影响范围**: Presentation/Slides 相关功能
**优先级**: 高（影响生产环境用户体验）
