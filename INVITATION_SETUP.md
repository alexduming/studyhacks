# 邀请系统实施说明

## 功能概述

已成功实现完整的邀请系统，功能包括：

- ✅ 用户可以生成专属邀请码
- ✅ **支持自定义修改邀请码**（4-12位字母和数字）
- ✅ 新用户注册时可以输入邀请码
- ✅ **全自动邀请关联**：用户点击邀请链接后，系统会自动记录邀请关系，即使在邮件验证跳转过程中丢失参数也能找回
- ✅ 邀请方和被邀请方各获得100积分奖励
- ✅ 积分有效期为1个月
- ✅ 邀请方可累计叠加奖励
- ✅ 被邀请方一次性奖励
- ✅ 完整的邀请记录和统计

## 数据库迁移

### 1. 运行数据库迁移

**推荐方法：使用迁移脚本（已解决 drizzle-kit 兼容性问题）**

```bash
# 使用项目提供的迁移脚本
npm run migrate:invitation
```

这个脚本会：

- 直接连接到数据库
- 执行 SQL 创建 `invitation` 表
- 为 `email_verification` 表添加 `invite_code` 字段
- 创建所有必要的索引
- 验证迁移是否成功

**备选方法：手动执行 SQL**

如果迁移脚本无法运行，可以手动执行 SQL：

```sql
-- 文件位置: src/config/db/migrations/0002_add_invitation_table.sql
-- (创建 invitation 表 SQL)

-- 为 email_verification 表添加 invite_code 字段
ALTER TABLE "email_verification" ADD COLUMN "invite_code" text;
```

### 2. 表结构说明

`invitation` 表包含以下字段：

- `id`: 主键
- `inviter_id`: 邀请人ID
- `inviter_email`: 邀请人邮箱
- `invitee_id`: 被邀请人ID（注册后填充）
- `invitee_email`: 被邀请人邮箱
- `code`: 邀请码（唯一）
- `status`: 状态（pending/accepted/expired）
- `created_at`: 创建时间
- `updated_at`: 更新时间
- `accepted_at`: 接受时间
- `expires_at`: 过期时间
- `inviter_credit_id`: 邀请方积分ID
- `invitee_credit_id`: 被邀请方积分ID
- `note`: 备注

## 新增文件清单

### 后端文件

1. **数据库模型**
   - `src/shared/models/invitation.ts` - 邀请码模型和业务逻辑

2. **API 路由**
   - `src/app/api/invitation/generate/route.ts` - 生成邀请码
   - `src/app/api/invitation/list/route.ts` - 获取邀请列表
   - `src/app/api/invitation/stats/route.ts` - 获取邀请统计

3. **数据库迁移**
   - `src/config/db/migrations/0002_add_invitation_table.sql` - 数据库迁移文件

### 前端文件

1. **页面组件**
   - `src/app/[locale]/(landing)/settings/invitation/page.tsx` - 邀请页面

2. **多语言文件**
   - `src/config/locale/messages/zh/settings/invitation.json` - 中文翻译
   - `src/config/locale/messages/en/settings/invitation.json` - 英文翻译

### 修改的文件

1. **数据库 Schema**
   - `src/config/db/schema.ts` - 添加 invitation 表定义和 email_verification 字段

2. **注册流程**
   - `src/app/api/auth/send-verification/route.ts` - 保存邀请码到验证记录
   - `src/app/api/auth/register-with-email/route.ts` - 从验证记录恢复邀请码并处理奖励

3. **注册表单**
   - `src/shared/components/auth/email-verification-sign-up.tsx` - 发送邮件时传递邀请码
   - `src/shared/components/auth/register-complete-page.tsx` - 添加邀请码输入框（支持自动填充）

4. **设置侧边栏**
   - `src/config/locale/messages/zh/settings/sidebar.json` - 添加邀请菜单（中文）
   - `src/config/locale/messages/en/settings/sidebar.json` - 添加邀请菜单（英文）

## 使用流程

### 1. 邀请方流程

1. 登录系统
2. 进入 "设置" -> "邀请好友"
3. **（可选）自定义邀请码**：点击"自定义"按钮，输入4-12位字母和数字
4. 复制邀请码或邀请链接
5. 分享给好友

### 2. 被邀请方流程

1. 收到邀请链接或邀请码
2. 访问注册页面（如果是链接会自动填充邀请码）
3. 填写邮箱并接收验证邮件（此时邀请码已与邮箱关联）
4. 点击验证链接后，进入完成注册页面
5. **无需再次输入邀请码**，系统会自动识别
6. 完成注册

### 3. 积分发放

注册成功后，系统会自动：

1. 为被邀请方发放100积分（有效期1个月）
2. 为邀请方发放100积分（有效期1个月）
3. 更新邀请记录状态为"已接受"
4. 记录积分发放的关联信息

## API 接口说明

### 1. 生成邀请码

```
POST/GET /api/invitation/generate
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "code": "ABC12345",
    "inviteUrl": "https://yourdomain.com/sign-up?invite=ABC12345"
  }
}
```

### 2. 获取邀请列表

```
GET /api/invitation/list?page=1&limit=20&status=accepted
```

**参数：**

- `page`: 页码（可选，默认1）
- `limit`: 每页数量（可选，默认20）
- `status`: 状态筛选（可选，pending/accepted/expired）

**响应示例：**

```json
{
  "success": true,
  "data": {
    "invitations": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    },
    "stats": {
      "total": 50,
      "accepted": 30
    }
  }
}
```

### 3. 获取邀请统计

```
GET /api/invitation/stats
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "total": 50,
    "accepted": 30,
    "pending": 20,
    "earnedCredits": 3000
  }
}
```

### 4. 修改邀请码（自定义）

```
POST /api/invitation/update-code
Body: { code: "MYCODE123" }
```

**参数说明：**

- `code`: 新的邀请码（4-12位大写字母和数字）

**限制条件：**

- 只能修改未使用的邀请码（pending 状态）
- 新邀请码必须唯一，不能与已有邀请码重复
- 邀请码格式：4-12位字母和数字组合

**响应示例：**

```json
{
  "success": true,
  "message": "邀请码修改成功",
  "data": {
    "code": "MYCODE123",
    "inviteUrl": "https://yourdomain.com/sign-up?invite=MYCODE123"
  }
}
```

**错误响应：**

```json
{
  "success": false,
  "error": "该邀请码已被使用，请选择其他邀请码"
}
```

## 积分奖励规则

1. **邀请方奖励**
   - 每成功邀请1人获得100积分
   - 可累计（邀请多人可获多次奖励）
   - 有效期1个月

2. **被邀请方奖励**
   - 使用邀请码注册成功获得100积分
   - 一次性奖励
   - 有效期1个月

3. **限制条件**
   - 每个新用户只能使用一次邀请码
   - 不能使用自己的邀请码
   - 邀请码必须是有效状态（pending）

## 注意事项

1. **数据库迁移**
   - 必须先运行数据库迁移，否则系统会报错
   - 建议在开发环境先测试迁移

2. **环境变量**
   - 确保 `NEXT_PUBLIC_APP_URL` 已正确配置，用于生成邀请链接

3. **积分有效期**
   - 积分有效期为1个月，过期后会自动失效
   - 可以在 `src/app/api/auth/register-with-email/route.ts` 中修改有效期

4. **邀请码格式**
   - 系统自动生成的邀请码为8位大写字母和数字组合
   - 用户可以自定义修改为4-12位字母和数字
   - 自动转换为大写
   - 唯一性由数据库约束保证
   - 只能修改未使用的邀请码（pending 状态）

## 测试建议

1. **功能测试**
   - 测试邀请码生成
   - 测试使用邀请码注册
   - 测试积分发放
   - 测试邀请记录显示

2. **边界测试**
   - 测试无效邀请码
   - 测试自己邀请自己
   - 测试重复使用邀请码
   - 测试已注册用户使用邀请码

3. **性能测试**
   - 测试大量邀请记录的查询性能
   - 测试并发注册场景

## 后续优化建议

1. **功能增强**
   - 添加邀请码有效期限制
   - 添加邀请排行榜
   - 添加邀请活动（限时双倍奖励等）
   - 添加邀请通知（邮件/站内信）

2. **数据分析**
   - 添加邀请转化率统计
   - 添加邀请来源追踪
   - 添加邀请效果分析

3. **用户体验**
   - 添加邀请码分享到社交媒体
   - 添加邀请海报生成
   - 添加邀请进度提示

## 问题排查

如果遇到问题，请检查：

1. 数据库迁移是否成功执行
2. 环境变量是否正确配置
3. 浏览器控制台是否有错误信息
4. 服务器日志是否有异常

## 技术支持

如有问题，请查看：

- 代码注释（每个文件都有详细的中文注释）
- 控制台日志（关键步骤都有日志输出）
- API 响应信息（包含详细的错误提示）
