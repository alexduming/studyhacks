# 年度订阅积分发放 Cron Job 修复说明

## 问题描述

之前的实现按照"每月1日统一发放"的逻辑，但这不符合订阅周期的实际情况。

**错误示例**：
- 用户1月28日购买年度订阅并获得首月积分
- 2月1日系统再次发放积分（错误！用户还没满一个月）
- 实际应该在2月28日发放第二个月积分

## 修复方案

### 1. 核心逻辑调整

**修改文件**：`src/app/api/cron/subscription-credits/route.ts`

**关键变更**：
- ❌ 旧逻辑：每月1日统一检查所有年度订阅，按"本月是否已发放"判断
- ✅ 新逻辑：每天检查所有年度订阅，按"从订阅开始经过了几个完整月"判断

**算法流程**：
```typescript
1. 获取订阅开始时间（currentPeriodStart）
2. 计算从订阅开始到现在经过了多少个完整月
   - 例：1月28日购买，2月27日是0个完整月，2月28日是1个完整月
3. 查询该订阅已发放到第几个月（从 description 字段提取）
4. 如果当前月数 > 已发放月数，则发放新积分
5. 在 description 中记录：`month {N} of subscription`
```

**具体示例**：
```
用户A：1月28日购买年度订阅
- 1月28日：首次购买，发放第0个月积分（购买时自动发放）
- 2月28日：Cron 检测到满1个月，发放第1个月积分
- 3月28日：Cron 检测到满2个月，发放第2个月积分
- ...以此类推

用户B：2月15日购买年度订阅
- 2月15日：首次购买，发放第0个月积分
- 3月15日：Cron 检测到满1个月，发放第1个月积分
- 4月15日：Cron 检测到满2个月，发放第2个月积分
- ...以此类推
```

### 2. Cron 调度调整

**修改文件**：`vercel.json`

```json
// 之前：每月1日执行
"schedule": "0 0 1 * *"

// 现在：每天执行
"schedule": "0 0 * * *"
```

**原因**：
- 需要每天检查是否有用户的订阅满月
- 例如有用户28日购买，另一个用户15日购买，不同日期都需要检查

### 3. 积分有效期调整

**之前**：积分有效期到当月最后一天
**现在**：积分有效期为发放日起30天

**原因**：
- 更符合"每月刷新"的逻辑
- 避免因月份天数不同导致的不公平（1月31天 vs 2月28天）

### 4. 防重复发放机制

通过以下方式确保不会重复发放：

1. **记录月数**：在 `description` 字段中记录 `month {N} of subscription`
2. **查询最近记录**：每次发放前查询该订阅最近一次发放的月数
3. **对比判断**：如果已发放月数 >= 当前应发放月数，则跳过

## 技术细节

### 月数计算逻辑

```typescript
let monthsPassed = 0;
let nextBillingDate = new Date(subscriptionStart);

while (nextBillingDate <= now && nextBillingDate < subscriptionEnd) {
  const tempDate = new Date(nextBillingDate);
  tempDate.setMonth(tempDate.getMonth() + 1);
  
  if (tempDate <= now) {
    monthsPassed++;
    nextBillingDate = tempDate;
  } else {
    break;
  }
}
```

### 防重复检查

```typescript
const latestCredits = await database
  .select()
  .from(credit)
  .where(
    and(
      eq(credit.subscriptionNo, sub.subscriptionNo || ''),
      eq(credit.transactionType, CreditTransactionType.GRANT),
      eq(credit.transactionScene, CreditTransactionScene.SUBSCRIPTION)
    )
  )
  .orderBy(desc(credit.createdAt))
  .limit(1);

// 从 description 中提取已发放的月数
let lastMonthNumber = 0;
if (latestCredits.length > 0) {
  const match = latestCredits[0].description?.match(/month (\d+) of subscription/);
  if (match) {
    lastMonthNumber = parseInt(match[1]);
  }
}

// 如果已经发放到当前月份，跳过
if (lastMonthNumber >= monthsPassed) {
  skippedCount++;
  continue;
}
```

## 测试建议

### 1. 手动测试 API

```bash
# 获取健康状态
curl https://your-domain.com/api/cron/subscription-credits

# 手动触发（需要 CRON_SECRET）
curl -X POST https://your-domain.com/api/cron/subscription-credits \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 2. 模拟场景测试

创建测试订阅，验证以下场景：

1. **首月不重复**：购买后立即运行 Cron，应该跳过（首月已在购买时发放）
2. **满月触发**：订阅满1个月当天运行 Cron，应该发放第1个月积分
3. **不提前发放**：订阅满1个月前一天运行 Cron，应该跳过
4. **不重复发放**：同一天多次运行 Cron，只发放一次

### 3. 数据库验证

检查 `credit` 表中的记录：

```sql
-- 查看某个订阅的积分发放记录
SELECT 
  subscription_no,
  credits,
  description,
  created_at,
  expires_at
FROM credit
WHERE subscription_no = 'YOUR_SUBSCRIPTION_NO'
  AND transaction_type = 'grant'
  AND transaction_scene = 'subscription'
ORDER BY created_at DESC;
```

预期结果：
- description 依次为 `month 1`, `month 2`, `month 3`...
- created_at 间隔约30天（根据购买日期）
- expires_at 为 created_at + 30天

## 部署检查清单

- [x] 修改 Cron Job API 逻辑
- [x] 更新 vercel.json cron 调度
- [x] 设置 CRON_SECRET 环境变量
- [x] 验证 Vercel Pro 计划（Cron 功能要求）
- [ ] 部署后监控日志
- [ ] 创建测试订阅验证
- [ ] 监控首次运行结果

## 相关文件

1. `src/app/api/cron/subscription-credits/route.ts` - Cron Job 主逻辑
2. `vercel.json` - Cron 调度配置
3. `src/shared/config/pricing-guard.ts` - 积分配置
4. `src/config/locale/messages/*/pricing.json` - 前端展示配置

## 注意事项

1. **环境变量**：确保在 Vercel 中设置了 `CRON_SECRET`
2. **时区**：Cron 运行时间为 UTC 00:00，根据用户时区可能有偏差
3. **性能**：每天检查所有订阅，如果订阅数量很大，可能需要优化查询
4. **日志**：首次运行后检查 Vercel 日志，确认正常运行

## 回滚方案

如果新逻辑出现问题，可以快速回滚：

1. 恢复 `vercel.json` 中的 cron 调度为 `0 0 1 * *`
2. 恢复 `route.ts` 中的旧逻辑（按月统一发放）
3. 重新部署

## 总结

此次修复使订阅积分发放逻辑更符合用户预期，避免了"购买后几天就再次发放"的问题。每个用户都按照自己的订阅周期获得积分，更加公平合理。

