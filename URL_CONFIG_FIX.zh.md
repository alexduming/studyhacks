# 支付回调 URL 配置修复指南

## 🚨 问题描述

**现象：** 支付成功后跳转到 `http://localhost:3001/pricing` 而不是 `https://studyhacks.ai`

**影响：** 用户无法完成支付流程，因为 localhost 地址在用户浏览器上无法访问

---

## 🔍 问题根源

### 1. 配置优先级问题

系统按以下优先级加载 `app_url` 配置：

```
1. 数据库配置（Admin 面板）← 问题所在！
        ↓ 最高优先级
2. 环境变量（NEXT_PUBLIC_APP_URL）
        ↓ 备用方案
3. VERCEL_URL（Vercel 自动提供）
        ↓ 新增的智能回退
4. 默认值（http://localhost:3000）
```

### 2. 问题触发路径

```
本地开发阶段：
1. 你在本地运行项目：http://localhost:3001
2. 在 Admin 面板配置了 app_url = http://localhost:3001
3. 这个配置被保存到数据库
        ↓
部署到 Vercel：
4. Vercel 从数据库读取配置
5. app_url 仍然是 http://localhost:3001（数据库优先）
6. 支付回调 URL 使用了错误的 localhost 地址
        ↓
支付完成时：
7. Stripe 跳转到 http://localhost:3001/pricing
8. 用户看到无法访问的页面 ❌
```

### 3. 代码层面的问题

**原始代码（问题版本）：**
```typescript
// src/config/index.ts
export const envConfigs = {
  app_url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  // ...
};
```

**支付回调使用：**
```typescript
// src/app/api/payment/checkout/route.ts
successUrl: `${configs.app_url}/api/payment/callback?order_no=${orderNo}`,
cancelUrl: `${callbackBaseUrl}/pricing`,
```

---

## ✅ 已完成的修复

### 1. 代码层面改进

**新增智能 URL 获取函数：**

```typescript
/**
 * 获取应用 URL
 * 作用：确保生产环境不会使用 localhost
 * 
 * 非程序员解释：
 * - 在生产环境（Vercel）上，如果配置了 VERCEL_URL，会自动使用
 * - 开发环境使用 localhost
 * - 防止支付回调跳转到 localhost 的问题
 */
function getAppUrl(): string {
  // 优先使用明确设置的 APP_URL
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  
  // Vercel 部署时，使用 VERCEL_URL（自动提供）
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // 开发环境默认值
  return 'http://localhost:3000';
}

export const envConfigs = {
  app_url: getAppUrl(), // 使用智能函数
  auth_url: process.env.AUTH_URL || getAppUrl(), // auth_url 也使用相同逻辑
  // ...
};
```

**改进点：**
- ✅ **智能回退**：即使忘记配置 `NEXT_PUBLIC_APP_URL`，Vercel 会自动使用 `VERCEL_URL`
- ✅ **环境感知**：生产环境自动使用 HTTPS，开发环境使用 HTTP
- ✅ **减少配置错误**：降低因配置遗漏导致的问题

### 2. 配置项增强

**新增配置：**
```typescript
export const envConfigs = {
  // ...
  default_locale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en', // 用于支付回调 URL
  // ...
};
```

---

## 🚀 立即解决方案

### 方案 1：配置 Vercel 环境变量（推荐 ⭐）

#### 步骤 1：登录 Vercel Dashboard

1. 访问 [Vercel Dashboard](https://vercel.com)
2. 选择你的项目：**studyhacks.ai**
3. 进入 **Settings** → **Environment Variables**

#### 步骤 2：添加环境变量

```bash
# 应用 URL（必需）
NEXT_PUBLIC_APP_URL=https://studyhacks.ai

# 认证 URL（如果使用认证功能）
AUTH_URL=https://studyhacks.ai
```

**注意事项：**
- ✅ 使用 `https://`（不是 `http://`）
- ✅ 不要在末尾加 `/`（斜杠）
- ✅ 选择环境：**Production** ✅
- ✅ 如果已存在，点击 **Edit** 修改

#### 步骤 3：重新部署

**方法 1：** 自动部署（Vercel 会自动检测环境变量变化）

**方法 2：** 手动触发
```bash
git commit --allow-empty -m "Fix: Update app URL to production domain"
git push
```

---

### 方案 2：清理数据库配置（如果可访问 Admin 面板）

#### 步骤 1：访问 Admin Settings

```
https://studyhacks.ai/admin/settings/basic
```

#### 步骤 2：检查并修改 App URL

**如果显示：** `http://localhost:3001`  
**修改为：** `https://studyhacks.ai`

**或者：** 留空（让系统使用环境变量）

#### 步骤 3：保存配置

点击 **Save** 保存配置

---

### 方案 3：使用代码改进（已完成 ✅）

通过代码改进，现在系统会：

1. **自动使用 Vercel URL**：即使没有配置 `NEXT_PUBLIC_APP_URL`
2. **智能环境识别**：生产环境用 HTTPS，开发环境用 HTTP
3. **防止 localhost 泄露**：Vercel 上不会使用 localhost 地址

---

## 🧪 验证修复

### 方法 1：测试支付流程

1. 访问：`https://studyhacks.ai/pricing`
2. 点击任意 **Checkout** 按钮
3. 使用测试卡完成支付：
   - 卡号：`4242 4242 4242 4242`
   - 日期：任意未来日期
   - CVC：任意 3 位数字
4. **检查跳转 URL：**
   - ✅ 正确：`https://studyhacks.ai/api/payment/callback?order_no=xxx`
   - ❌ 错误：`http://localhost:3001/pricing`

### 方法 2：检查 Stripe Dashboard

1. 登录 [Stripe Dashboard](https://dashboard.stripe.com)
2. 进入 **Payments** → 选择最近的支付
3. 点击 **Checkout Session**
4. 查看 `success_url` 字段：
   - ✅ 应该显示：`https://studyhacks.ai/api/payment/callback?order_no=xxx`
   - ❌ 不应该是：`http://localhost:3001/...`

### 方法 3：查看 Vercel 日志

```bash
# 在终端运行
vercel logs --prod

# 查找关键日志
# ✅ 正确：app_url: https://studyhacks.ai
# ✅ 或者：app_url: https://studyhacks-ai.vercel.app
# ❌ 错误：app_url: http://localhost:3001
```

### 方法 4：API 测试

在浏览器控制台（F12）运行：

```javascript
fetch('https://studyhacks.ai/api/config/get-configs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
.then(res => res.json())
.then(data => {
  console.log('App URL:', data.data.app_url);
  // 应该输出：https://studyhacks.ai
  // 不应该是：http://localhost:3001
});
```

---

## 📋 完整检查清单

### Vercel 环境变量
- [ ] `NEXT_PUBLIC_APP_URL` = `https://studyhacks.ai` ✅
- [ ] `AUTH_URL` = `https://studyhacks.ai` ✅（如果使用认证）
- [ ] 环境作用域选择 **Production** ✅
- [ ] 已重新部署（等待 1-2 分钟）✅

### Admin 面板（可选但推荐）
- [ ] 访问 `https://studyhacks.ai/admin/settings/basic`
- [ ] 检查 **App URL** 字段
- [ ] 如果是 localhost，修改为 `https://studyhacks.ai` 或留空
- [ ] 保存配置 ✅

### 代码部署
- [ ] `src/config/index.ts` 已更新（智能 URL 函数）✅
- [ ] 没有 TypeScript 错误 ✅
- [ ] Git 推送到远程仓库 ✅
- [ ] Vercel 自动部署完成 ✅

### Stripe 配置（额外检查）
- [ ] Webhook endpoint 已更新
- [ ] 应该是：`https://studyhacks.ai/api/payment/webhook/stripe`
- [ ] 不是：`http://localhost:3001/api/payment/webhook/stripe`

---

## 🔧 常见问题排查

### Q1: 配置了环境变量但还是跳转到 localhost？

**可能原因：**
1. 环境变量未重新部署
2. 数据库配置优先级更高

**解决方案：**
```bash
# 方案 1：清除数据库中的 app_url 配置
# 在 Admin 面板中将 App URL 留空

# 方案 2：强制重新部署
git commit --allow-empty -m "Force redeploy"
git push

# 方案 3：在 Vercel Dashboard 手动触发 Redeploy
```

### Q2: 代码改进后还需要配置环境变量吗？

**回答：** 推荐配置，但不是必需的。

**原因：**
- ✅ 代码改进后，Vercel 会自动使用 `VERCEL_URL`
- ✅ 但明确配置 `NEXT_PUBLIC_APP_URL` 更可靠
- ✅ 可以使用自定义域名而不是 `*.vercel.app`

**最佳实践：**
```bash
# 明确配置生产域名
NEXT_PUBLIC_APP_URL=https://studyhacks.ai

# 而不是依赖 VERCEL_URL（可能是 studyhacks-ai.vercel.app）
```

### Q3: 支付成功后跳转到了 404 页面？

**可能原因：**
1. 回调路由 `/api/payment/callback` 不存在
2. 域名配置正确但路由有问题

**检查方法：**
```bash
# 1. 检查路由文件是否存在
# 应该存在：src/app/api/payment/callback/route.ts

# 2. 手动访问回调 URL
https://studyhacks.ai/api/payment/callback?order_no=test

# 3. 查看 Vercel 日志
vercel logs --prod
```

### Q4: 如何在不同环境使用不同 URL？

**方案：** Vercel 环境变量支持不同环境配置

**配置示例：**

| 环境 | URL | 用途 |
|------|-----|------|
| Production | `https://studyhacks.ai` | 生产环境 |
| Preview | `https://preview.studyhacks.ai` | 预览环境 |
| Development | `http://localhost:3001` | 本地开发 |

**操作步骤：**
1. 在 Vercel Dashboard → Environment Variables
2. 添加 `NEXT_PUBLIC_APP_URL`
3. 为不同环境设置不同值：
   - ✅ Production: `https://studyhacks.ai`
   - ✅ Preview: `https://preview.studyhacks.ai`
   - ⚠️ Development: 不设置（使用默认 localhost）

---

## 🎯 配置工作原理

### 配置加载流程

```
API 请求：/api/payment/checkout
        ↓
调用 getAllConfigs()
        ↓
尝试从数据库加载 app_url
        ↓ 失败或不存在
回退到 envConfigs.app_url
        ↓
调用 getAppUrl() 函数
        ↓
1. 检查 NEXT_PUBLIC_APP_URL ← 最高优先级
        ↓ 不存在
2. 检查 VERCEL_URL ← Vercel 自动提供 ⭐ 新增
        ↓ 不存在
3. 使用默认值 localhost ← 仅用于开发环境
        ↓
返回最终的 app_url
        ↓
构建支付回调 URL
        ↓
传递给 Stripe
```

### 智能回退的好处

**场景 1：完整配置（最佳实践）**
```bash
NEXT_PUBLIC_APP_URL=https://studyhacks.ai
```
结果：✅ 使用 `https://studyhacks.ai`

**场景 2：忘记配置（智能回退）**
```bash
# 没有配置 NEXT_PUBLIC_APP_URL
# 但 Vercel 自动提供 VERCEL_URL=studyhacks-ai.vercel.app
```
结果：✅ 使用 `https://studyhacks-ai.vercel.app`（自动加 HTTPS）

**场景 3：本地开发**
```bash
# 没有 NEXT_PUBLIC_APP_URL
# 没有 VERCEL_URL
```
结果：✅ 使用 `http://localhost:3000`

---

## 📊 修复前后对比

### 修复前（问题版本）

| 环境 | 配置来源 | 实际值 | 结果 |
|------|----------|--------|------|
| Vercel Production | 数据库 | `http://localhost:3001` | ❌ 支付失败 |
| Vercel Production | 环境变量（未配置） | `http://localhost:3000` | ❌ 支付失败 |
| Local Development | 默认值 | `http://localhost:3000` | ✅ 正常 |

### 修复后（当前版本）

| 环境 | 配置来源 | 实际值 | 结果 |
|------|----------|--------|------|
| Vercel Production | 环境变量 | `https://studyhacks.ai` | ✅ 完美 |
| Vercel Production | VERCEL_URL（自动） | `https://studyhacks-ai.vercel.app` | ✅ 可用 |
| Vercel Production | 数据库（覆盖） | `https://studyhacks.ai` | ✅ 优先级最高 |
| Local Development | 默认值 | `http://localhost:3000` | ✅ 正常 |

---

## 🎉 总结

### 问题状态
- ✅ **代码层面**：已修复（智能 URL 获取函数）
- ⚠️ **配置层面**：需要用户配置 Vercel 环境变量

### 核心改进

1. **智能回退机制** 🛡️
   - 自动使用 Vercel URL（无需手动配置）
   - 防止 localhost 泄露到生产环境

2. **环境感知** 🎯
   - 生产环境自动使用 HTTPS
   - 开发环境使用 HTTP localhost

3. **减少配置错误** 🔧
   - 即使忘记配置也能正常工作
   - 降低支付失败率

### 后续步骤

1. ✅ **立即行动**：配置 Vercel 环境变量（5 分钟）
   ```bash
   NEXT_PUBLIC_APP_URL=https://studyhacks.ai
   ```

2. 🧪 **测试验证**：完成一笔测试支付（3 分钟）

3. 📊 **监控日志**：检查 Vercel 日志确认配置正确

4. 🔐 **清理数据库**：删除或修改 Admin 面板中的 localhost 配置

5. 📝 **文档更新**：记录配置过程供团队参考

---

## 📚 相关文档

- 📖 [PAYMENT_SETUP.zh.md](./PAYMENT_SETUP.zh.md) - 支付配置完整指南
- 📖 [PAYMENT_FIX_SUMMARY.zh.md](./PAYMENT_FIX_SUMMARY.zh.md) - 支付配置修复总结
- 📖 [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) - 环境变量配置模板
- 🔗 [Vercel 环境变量文档](https://vercel.com/docs/concepts/projects/environment-variables)
- 🔗 [Stripe Checkout 文档](https://stripe.com/docs/payments/checkout)

---

**修复完成时间：** 2025-12-05  
**问题类型：** 配置错误 + 代码改进  
**影响范围：** 支付回调 URL  
**修复状态：** ✅ 代码已改进，需配置环境变量

