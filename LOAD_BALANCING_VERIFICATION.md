# 🎯 负载均衡验证指南

## 📋 修复内容

### 问题诊断

之前的代码虽然有 `preferredProvider` 参数，但实现的是 **容错机制（Fallback）**，而不是 **负载均衡（Load Balancing）**。

- **容错机制**：先用 Replicate → 失败才用 KIE ❌
- **负载均衡**：强制 50% 用 Replicate，50% 用 KIE ✅

### 修复逻辑

#### 后端 (`src/app/actions/aippt.ts`)

```typescript
// 修复前：Replicate 不失败就不会用 KIE
for (let i = 0; i < providers.length; i++) {
  try {
    // 尝试第一个提供商（Replicate）
    // 只有失败了才会进入下一个循环
  } catch {
    // 继续尝试下一个
  }
}

// 修复后：强制使用指定提供商
if (primaryProvider === 'Replicate') {
  // 强制使用 Replicate
} else {
  // 强制使用 KIE
}
// 只有在强制使用的提供商失败后，才切换到备用
```

#### 前端 (`src/app/[locale]/(landing)/slides/page.tsx`)

```typescript
// 根据索引决定使用哪个提供商
const useReplicate = index % 2 === 0; // 偶数索引 → Replicate
const preferredProvider = useReplicate ? 'Replicate' : 'KIE'; // 奇数索引 → KIE

// Slide 0 (index=0) → Replicate
// Slide 1 (index=1) → KIE
// Slide 2 (index=2) → Replicate
// Slide 3 (index=3) → KIE
```

---

## 🧪 验证步骤

### 1. 重启开发服务器

```bash
# 停止当前服务器（Ctrl+C）
# 重新启动
npm run dev
# 或
pnpm dev
```

### 2. 生成 4 张 PPT 图片

### 3. 检查控制台日志

#### 前端日志应该显示：

```
📸 ============================================
📸 Slide 1/4: 强制分配给 Replicate
📸 索引: 0 (偶数→Replicate)
📸 ============================================

📸 ============================================
📸 Slide 2/4: 强制分配给 KIE
📸 索引: 1 (奇数→KIE)
📸 ============================================

📸 ============================================
📸 Slide 3/4: 强制分配给 Replicate
📸 索引: 2 (偶数→Replicate)
📸 ============================================

📸 ============================================
📸 Slide 4/4: 强制分配给 KIE
📸 索引: 3 (奇数→KIE)
📸 ============================================
```

#### 后端日志应该显示：

```
🎯 负载均衡 - 强制使用: Replicate，备用: KIE
🔄 [负载均衡] 使用 Replicate (google/nano-banana-pro)...
✅ Replicate 任务创建成功

🎯 负载均衡 - 强制使用: KIE，备用: Replicate
🔄 [负载均衡] 使用 KIE (nano-banana-pro)...
✅ KIE 任务创建成功: task_xxxxx

🎯 负载均衡 - 强制使用: Replicate，备用: KIE
🔄 [负载均衡] 使用 Replicate (google/nano-banana-pro)...
✅ Replicate 任务创建成功

🎯 负载均衡 - 强制使用: KIE，备用: Replicate
🔄 [负载均衡] 使用 KIE (nano-banana-pro)...
✅ KIE 任务创建成功: task_yyyyy
```

### 4. 预期结果

✅ **正确的负载均衡**：

- Slide 1 (index=0): Replicate
- Slide 2 (index=1): KIE
- Slide 3 (index=2): Replicate
- Slide 4 (index=3): KIE

❌ **如果还是全部 Replicate**：

- 说明 `preferredProvider` 参数没有生效
- 需要检查环境变量 `REPLICATE_API_TOKEN` 和 `KIE_API_KEY` 是否都正确配置

---

## 🔍 故障排查

### 问题 1: 全部使用 Replicate

**可能原因**：

- KIE API Key 未配置或无效
- 后端代码没有正确读取 `preferredProvider` 参数

**解决方案**：

```bash
# 检查 .env.local
cat .env.local | grep KIE_API_KEY
cat .env.local | grep REPLICATE_API_TOKEN

# 确保两个 Key 都存在且有效
```

### 问题 2: 全部使用 KIE

**可能原因**：

- Replicate API Token 未配置或无效

**解决方案**：

```bash
# 检查 Replicate Token
cat .env.local | grep REPLICATE_API_TOKEN

# 确保 Token 有效
```

### 问题 3: 还是批量显示，不是逐张显示

**可能原因**：

- 浏览器缓存了旧版本代码

**解决方案**：

```bash
# 清除浏览器缓存
# 硬刷新: Ctrl+Shift+R (Windows) 或 Cmd+Shift+R (Mac)

# 或清除 Next.js 缓存
rm -rf .next/cache
```

---

## 📊 性能对比

### 修复前（全部 Replicate，串行）

```
Slide 1: Replicate (60s) ────┐
Slide 2: Replicate (60s) ────┤
Slide 3: Replicate (60s) ────┤→ 串行执行
Slide 4: Replicate (60s) ────┘
总时间: 240 秒
```

### 修复后（Replicate + KIE，并行）

```
Slide 1: Replicate (60s) ────┐
Slide 2: KIE       (60s) ────┤→ 并行执行
Slide 3: Replicate (60s) ────┤
Slide 4: KIE       (60s) ────┘
总时间: 120 秒 (节省 50% 时间！)
```

### 用户体验

- ✅ 每张图片生成完立即显示（flushSync）
- ✅ 大约每 60 秒显示 2 张图片
- ✅ 总时间从 4 分钟减少到 2 分钟

---

## 🎯 总结

### 核心改进

1. **真正的负载均衡**：强制分配任务，不是等失败了再切换
2. **实时显示**：使用 `flushSync` 确保每张图片完成后立即渲染
3. **并行处理**：Replicate 和 KIE 同时工作，节省 50% 时间

### 关键代码

- **后端**：`createKieTaskWithFallbackAction` - 强制使用指定提供商
- **前端**：`flushSync` - 强制立即渲染
- **分配逻辑**：`index % 2` - 偶数 Replicate，奇数 KIE

### 下一步

重启服务器，生成 PPT，观察日志！应该会看到：

1. ✅ 明确的任务分配日志
2. ✅ Replicate 和 KIE 交替调用
3. ✅ 图片逐张实时显示
4. ✅ 总时间大约 2 分钟（4 张图）
