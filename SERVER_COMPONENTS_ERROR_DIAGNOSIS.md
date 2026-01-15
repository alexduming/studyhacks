# Server Components 渲染错误诊断指南

## 🔍 错误信息

```
An error occurred in the Server Components render.
The specific message is omitted in production builds to avoid leaking sensitive details.
A digest property is included on this error instance which may provide additional details about the nature of the error.
```

## 📋 常见原因分析

### 1. **环境变量缺失或未配置**

- **症状**：Server Component 中访问 `process.env.XXX` 时，如果变量未设置可能返回 `undefined`
- **影响**：导致 API 调用失败、数据库连接失败等
- **检查点**：
  - `DATABASE_URL` - 数据库连接字符串
  - `OPENROUTER_API_KEY` - AI 服务密钥
  - `DEEPSEEK_API_KEY` - DeepSeek API 密钥
  - `AUTH_SECRET` - 认证密钥
  - `STRIPE_*` - 支付相关配置

### 2. **数据库连接失败**

- **症状**：在 Server Component 中调用数据库查询时，连接超时或失败
- **常见错误**：
  - `CONNECT_TIMEOUT` - 连接超时
  - `DATABASE_URL is not set` - 数据库 URL 未设置
  - `ECONNREFUSED` - 连接被拒绝
- **影响**：所有依赖数据库的页面都会失败

### 3. **异步操作未正确处理**

- **症状**：在 Server Component 中调用异步函数时，未使用 `await` 或错误未捕获
- **常见场景**：
  - `getUserInfo()` - 获取用户信息
  - `getConfigs()` - 获取配置
  - `getThemePage()` - 加载主题页面
  - `getTranslations()` - 获取翻译

### 4. **动态导入失败**

- **症状**：使用 `import()` 动态导入模块时，路径错误或模块不存在
- **常见场景**：
  - `getThemePage()` - 主题页面加载
  - `getThemeLayout()` - 主题布局加载
  - `getThemeBlock()` - 主题块加载

### 5. **类型错误或运行时错误**

- **症状**：访问不存在的属性、调用未定义的函数等
- **常见场景**：
  - 访问 `undefined` 对象的属性
  - 调用 `null` 值的方法
  - 类型不匹配导致的运行时错误

## 🔧 排查步骤

### 步骤 1：检查开发环境错误日志

在开发环境中，错误信息会显示在控制台。运行：

```bash
npm run dev
```

查看终端输出的完整错误堆栈。

### 步骤 2：检查环境变量

创建 `.env.local` 文件，确保所有必需的环境变量都已设置：

```env
# 数据库配置
DATABASE_URL=postgresql://...

# AI 服务配置
OPENROUTER_API_KEY=sk-or-v1-...
DEEPSEEK_API_KEY=sk-...

# 认证配置
AUTH_SECRET=...
AUTH_URL=http://localhost:3000

# 支付配置（如需要）
STRIPE_ENABLED=true
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

### 步骤 3：检查数据库连接

运行诊断脚本检查数据库连接：

```bash
npx tsx scripts/check-schema-integrity.ts
```

### 步骤 4：添加错误边界和日志

在 Server Component 中添加 try-catch 错误处理：

```typescript
export default async function MyPage() {
  try {
    // 你的代码
  } catch (error) {
    console.error('[MyPage] Error:', error);
    // 返回错误页面或默认内容
    throw error; // 让错误边界处理
  }
}
```

### 步骤 5：检查特定页面

根据错误出现的页面，检查对应的 Server Component：

- **首页**：`src/app/[locale]/(landing)/page.tsx`
- **布局**：`src/app/[locale]/(landing)/layout.tsx`
- **其他页面**：检查对应的 `page.tsx` 文件

## 🛠️ 修复方案

### 方案 1：添加防御性检查

在所有 Server Component 中添加环境变量检查：

```typescript
// 检查必需的环境变量
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  // 返回错误页面或使用默认值
}
```

### 方案 2：改进错误处理

在关键函数中添加 try-catch：

```typescript
export default async function LandingPage({ params }: Props) {
  try {
    const { locale } = await params;
    setRequestLocale(locale);

    const t = await getTranslations('landing');
    const Page = await getThemePage('landing');

    return <Page locale={locale} page={page} />;
  } catch (error) {
    console.error('[LandingPage] Error:', error);
    // 返回错误页面
    return <ErrorPage error={error} />;
  }
}
```

### 方案 3：使用错误边界

Next.js 会自动使用 `error.tsx` 作为错误边界。确保文件存在：

- `src/app/[locale]/error.tsx` - 页面级错误边界
- `src/app/global-error.tsx` - 全局错误边界

### 方案 4：添加详细日志

在开发环境中添加详细日志，帮助定位问题：

```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('[Debug] Environment variables:', {
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
    // ... 其他关键变量
  });
}
```

## 📝 快速检查清单

- [ ] 检查 `.env.local` 文件是否存在且配置正确
- [ ] 检查数据库连接是否正常
- [ ] 检查所有 `await` 是否正确使用
- [ ] 检查动态导入路径是否正确
- [ ] 检查错误边界组件是否存在
- [ ] 检查开发环境控制台是否有详细错误信息
- [ ] 检查 Vercel 环境变量（如果部署到生产环境）

## 🚨 紧急修复

如果错误导致整个应用无法加载：

1. **临时禁用问题功能**：注释掉导致错误的代码
2. **使用默认值**：为缺失的配置提供默认值
3. **添加回退机制**：在关键路径添加 try-catch 和回退逻辑

## 📚 相关文件

- `src/app/[locale]/(landing)/page.tsx` - 首页 Server Component
- `src/app/[locale]/(landing)/layout.tsx` - 布局 Server Component
- `src/app/layout.tsx` - 根布局
- `src/core/db/index.ts` - 数据库连接
- `src/config/index.ts` - 配置管理
- `src/shared/models/config.ts` - 配置模型

## 💡 预防措施

1. **环境变量验证**：在应用启动时验证所有必需的环境变量
2. **错误监控**：集成错误监控服务（如 Sentry）
3. **健康检查**：添加健康检查端点，监控关键服务状态
4. **类型安全**：使用 TypeScript 严格模式，减少运行时错误

