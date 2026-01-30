# 联盟功能回退指南

## 📋 联盟相关文件清单

### 新增的文件（可以暂时保留，不影响功能）

#### 前端页面

- `src/app/[locale]/(landing)/affiliates/page.tsx` - 联盟页面（需要隐藏）

#### API 路由

- `src/app/api/affiliate/stats/route.ts` - 统计数据 API
- `src/app/api/affiliate/invitations/route.ts` - 邀请列表 API
- `src/app/api/affiliate/commissions/route.ts` - 佣金记录 API
- `src/app/api/affiliate/withdrawals/route.ts` - 提现记录 API
- `src/app/api/affiliate/withdraw/route.ts` - 提现申请 API

#### 数据模型

- `src/shared/models/commission.ts` - 佣金模型
- `src/shared/models/withdrawal.ts` - 提现模型

#### 多语言文件

- `src/config/locale/messages/en/affiliates.json` - 英文翻译
- `src/config/locale/messages/zh/affiliates.json` - 中文翻译

#### 数据库 Schema（已修改）

- `src/config/db/schema.ts` - 添加了 `commission` 和 `withdrawal` 表定义

### 修改的文件（需要回退）

1. **`src/app/[locale]/(landing)/settings/invitation/page.tsx`**
   - 当前：重定向到 `/affiliates`
   - 需要：恢复原来的邀请页面

2. **`src/shared/services/payment.ts`**
   - 当前：包含佣金逻辑（3处）
   - 需要：注释掉佣金相关代码

3. **`src/config/locale/messages/zh/settings/sidebar.json`**
   - 当前：链接指向 `/affiliates`
   - 需要：恢复为 `/settings/invitation`

4. **`src/config/locale/messages/en/settings/sidebar.json`**
   - 当前：链接指向 `/affiliates`
   - 需要：恢复为 `/settings/invitation`

5. **`src/config/locale/index.ts`**
   - 当前：包含 `affiliates` 多语言路径
   - 需要：可以保留（不影响功能）

6. **`src/shared/models/invitation.ts`**
   - 当前：添加了 `getInvitationByInviteeId` 函数
   - 需要：可以保留（不影响功能，只是新增函数）

## 🔄 回退步骤

### Step 1: 恢复邀请页面

恢复 `src/app/[locale]/(landing)/settings/invitation/page.tsx` 为原来的实现。

### Step 2: 注释掉佣金逻辑

在 `src/shared/services/payment.ts` 中注释掉所有佣金相关代码。

### Step 3: 恢复侧边栏链接

恢复 `src/config/locale/messages/*/settings/sidebar.json` 中的链接。

### Step 4: 隐藏联盟页面（可选）

将 `src/app/[locale]/(landing)/affiliates/page.tsx` 改为返回 404 或重定向。

## ✅ 验证清单

- [x] `/settings/invitation` 页面正常显示（已恢复）
- [x] 邀请好友功能正常工作（注册送积分）- 功能未受影响
- [x] 支付成功后不会创建佣金记录（已注释）
- [x] 侧边栏链接指向 `/settings/invitation`（已恢复）
- [x] `/affiliates` 页面不可访问（返回 404）

## ✅ 已完成的回退操作

1. ✅ 恢复了 `src/app/[locale]/(landing)/settings/invitation/page.tsx` 为原来的邀请页面
2. ✅ 注释掉了 `src/shared/services/payment.ts` 中所有佣金相关代码（3处）
3. ✅ 恢复了侧边栏链接为 `/settings/invitation`
4. ✅ 将 `/affiliates` 页面改为返回 404

## 🚀 未来启用联盟功能

当需要启用联盟功能时，只需：

1. 恢复 `src/app/[locale]/(landing)/settings/invitation/page.tsx` 的重定向
2. 取消注释 `src/shared/services/payment.ts` 中的佣金逻辑
3. 更新侧边栏链接指向 `/affiliates`
4. 恢复 `src/app/[locale]/(landing)/affiliates/page.tsx` 的正常实现
5. 运行数据库迁移（如果还没运行）：`npm run db:migrate`
