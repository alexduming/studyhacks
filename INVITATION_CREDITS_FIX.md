# 邀请码积分问题诊断与修复方案

## 问题总结

### 现象
- 邀请码 `ZVVOEZIC` 被36个用户在注册时使用
- 只有第1个用户收到了100积分邀请奖励
- 其他28个已注册用户都没有收到邀请奖励积分
- 邀请人也只收到了1次100积分奖励（应该收到29次）

### 根本原因

**代码逻辑缺陷：**

在 `src/app/api/auth/register-with-email/route.ts` 第300-383行的邀请码处理逻辑中：

```typescript
// 查询邀请码是否有效
const invitation = await getInvitationByCode(finalInviteCode);

if (invitation) {
  // ... 发放积分
  
  // 更新邀请记录状态为 accepted
  await updateInvitation(invitation.id, {
    status: InvitationStatus.ACCEPTED,  // ⚠️ 问题所在
    inviteeId: userId,
    inviteeEmail: email,
    acceptedAt: now,
    inviterCreditId: inviterCreditId,
    inviteeCreditId: inviteeCreditId,
  });
}
```

而 `getInvitationByCode` 函数（`src/shared/models/invitation.ts` 第67-83行）：

```typescript
export async function getInvitationByCode(code: string): Promise<Invitation | null> {
  const [result] = await db()
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.code, code.toUpperCase()),
        eq(invitation.status, InvitationStatus.PENDING)  // ⚠️ 只查询 pending 状态
      )
    )
    .limit(1);

  return result || null;
}
```

**问题链条：**

1. 第1个用户使用邀请码注册 → 查询到 `status='pending'` 的邀请记录 → 发放积分 → 更新状态为 `accepted`
2. 第2个用户使用相同邀请码注册 → 查询 `status='pending'` → **找不到记录**（因为已经是 `accepted`）→ **不发放积分**
3. 后续所有用户都遇到相同问题

**设计缺陷：**

当前设计假设"一个邀请码只能被使用一次"，但实际业务需求是"一个邀请码可以被多人使用"（类似推广码）。

---

## 三个修复方案（按复杂度排序）

### 方案一：精准修复（推荐）⭐⭐⭐⭐⭐

**核心思路：** 改变邀请码的使用模式，从"一次性"改为"可重复使用"

**优点：**
- ✅ 直击根本原因
- ✅ 复杂度最低（只需修改2个函数）
- ✅ 零技术债务
- ✅ 符合用户预期（推广码应该可以被多人使用）
- ✅ 不破坏现有数据结构

**缺点：**
- ⚠️ 需要调整 `invitation` 表的数据模型理解（一对多关系）

**实施步骤：**

1. **修改邀请码查询逻辑**（`src/shared/models/invitation.ts`）
   - 移除 `status = 'pending'` 的限制
   - 允许查询已使用的邀请码

2. **修改邀请记录创建逻辑**（`src/app/api/auth/register-with-email/route.ts`）
   - 不再更新原有邀请记录的状态
   - 为每个新用户创建独立的邀请记录
   - 保持 `code` 字段相同，但 `inviteeId` 不同

3. **调整数据库约束**
   - 移除 `invitation.code` 的 UNIQUE 约束（如果存在）
   - 改为 `(code, inviteeId)` 的组合唯一约束

**代码修改量：** 约50行

---

### 方案二：保持现有设计，调整业务逻辑

**核心思路：** 保持"一个邀请码只能被使用一次"的设计，但允许邀请人创建多个邀请码

**优点：**
- ✅ 保持数据模型清晰（一对一关系）
- ✅ 符合传统邀请系统设计
- ✅ 便于追踪每个邀请关系

**缺点：**
- ❌ 不符合当前用户使用习惯（用户期望一个码可以分享给多人）
- ❌ 需要修改前端UI，让用户为每个被邀请人生成独立的邀请码
- ❌ 用户体验较差（需要频繁生成新码）

**实施步骤：**

1. 在前端添加"生成新邀请码"按钮
2. 每次生成新的邀请码时，创建新的 `invitation` 记录
3. 显示邀请码列表，标注每个码的使用状态

**代码修改量：** 约150行（含前端）

---

### 方案三：混合模式（最复杂）

**核心思路：** 支持两种邀请模式：
- 一次性邀请码（传统模式）
- 永久推广码（可重复使用）

**优点：**
- ✅ 功能最强大，满足不同场景需求
- ✅ 可以为不同用户等级提供不同权限

**缺点：**
- ❌ 复杂度最高（约为方案一的3倍）
- ❌ 需要修改数据库表结构（添加 `type` 字段）
- ❌ 需要修改前端UI（添加模式选择）
- ❌ 增加维护成本

**实施步骤：**

1. 修改 `invitation` 表，添加 `type` 字段（`one_time` / `permanent`）
2. 修改查询逻辑，根据 `type` 决定是否检查 `status`
3. 修改前端UI，让用户选择邀请码类型
4. 添加权限控制（普通用户只能创建一次性码，VIP用户可以创建永久码）

**代码修改量：** 约300行（含前端和数据库迁移）

---

## 推荐方案：方案一

**理由：**

1. **精（复杂度≤原方案80%）：** 只需修改2个函数，约50行代码
2. **准（直击根本原因）：** 解决了"邀请码只能用一次"的设计缺陷
3. **净（0技术债务）：** 不引入新的复杂性，符合SonarQube标准

**修复三律验证：**
- ✅ 复杂度：50行代码 < 原方案（约100行）的80%
- ✅ 准确性：直接修改了导致问题的查询条件和状态更新逻辑
- ✅ 清洁度：不引入新字段、新表或新的业务逻辑分支

---

## 历史数据补偿方案

修复代码后，还需要为历史用户补发积分：

**补偿脚本功能：**

1. 查询所有在 `email_verification` 表中有 `invite_code` 但没有收到邀请奖励的用户
2. 为每个用户：
   - 创建邀请奖励积分记录（100积分，有效期1个月）
   - 创建或更新 `invitation` 表记录
   - 为邀请人补发积分
3. 记录补偿日志，便于审计

**预计补偿用户数：** 28个被邀请人 + 1个邀请人（28次奖励）

---

## 实施计划

### 第一步：修复代码（30分钟）
1. 修改 `getInvitationByCode` 函数
2. 修改注册流程中的邀请码处理逻辑
3. 调整数据库约束（如需要）

### 第二步：测试（20分钟）
1. 测试新用户使用邀请码注册
2. 测试多个用户使用同一邀请码
3. 验证积分是否正确发放

### 第三步：补偿历史用户（10分钟）
1. 运行补偿脚本
2. 验证补偿结果
3. 通知受影响用户

### 第四步：监控（持续）
1. 监控邀请码使用情况
2. 监控积分发放情况
3. 收集用户反馈

---

## 风险评估

### 低风险 ✅
- 代码修改量小
- 不影响现有已发放的积分
- 可以先在开发环境测试

### 中风险 ⚠️
- 需要修改数据库约束（可能需要停机维护）
- 历史数据补偿需要仔细验证

### 缓解措施
1. 在生产环境执行前，先在测试环境完整测试
2. 补偿脚本先在只读模式运行，验证无误后再执行写入
3. 准备回滚方案（保存补偿前的数据快照）

---

## 下一步行动

请确认是否采用**方案一**进行修复？

如果确认，我将立即：
1. 修改相关代码
2. 创建数据库迁移脚本（如需要）
3. 创建历史数据补偿脚本
4. 提供测试步骤

---

## 附录：调用链分析

```
用户注册流程
├── POST /api/auth/register-with-email
│   ├── EmailVerificationService.verifyToken()  // 验证邮箱
│   ├── EmailVerificationService.getInviteCode()  // 获取邀请码
│   └── 数据库事务
│       ├── 创建用户 (user 表)
│       ├── 创建账户 (account 表)
│       ├── 发放月度积分 (credit 表)
│       └── 处理邀请码 ⚠️ 问题所在
│           ├── getInvitationByCode(code)  // ❌ 只查询 status='pending'
│           ├── 发放被邀请人积分 (100)
│           ├── 发放邀请人积分 (100)
│           └── updateInvitation()  // ❌ 更新状态为 'accepted'
│
└── 结果：第2+个用户找不到邀请记录 → 不发放积分
```

---

## 数据库状态快照

**当前状态：**
```
invitation 表：
- code='ZVVOEZIC', status='accepted', inviteeId='db0bdd8c...'  (只有1条)

email_verification 表：
- 36条记录的 invite_code='ZVVOEZIC'

credit 表：
- 只有1个被邀请人收到了邀请奖励
- 邀请人只收到了1次奖励
```

**期望状态（修复后）：**
```
invitation 表：
- code='ZVVOEZIC', status='accepted', inviteeId='db0bdd8c...'
- code='ZVVOEZIC', status='accepted', inviteeId='95bf4a9c...'
- code='ZVVOEZIC', status='accepted', inviteeId='c2873ddc...'
- ... (共29条，每个被邀请人一条)

credit 表：
- 29个被邀请人各收到100积分
- 邀请人收到29次100积分奖励
```

