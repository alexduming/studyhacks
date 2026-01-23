# Infographic 参考图功能 - 快速测试指南

## 🚀 启动服务器

进程和锁文件已清理，现在在终端运行：

```powershell
pnpm dev
```

服务器将在 **http://localhost:3000** 启动

## ✅ 测试步骤

### 测试1：图生图模式（有参考图）

1. 访问 http://localhost:3000/zh/infographic

2. **上传参考图**
   - 点击"上传参考图"按钮
   - 选择一张图片（建议选择扁平风格的插画或信息图）
   - 确认看到预览

3. **输入内容**
   ```
   人工智能的发展历程：
   1. 1956年：人工智能概念诞生
   2. 1997年：深蓝击败国际象棋冠军
   3. 2016年：AlphaGo击败围棋世界冠军
   4. 2022年：ChatGPT发布
   ```

4. **生成信息图**
   - 点击"生成信息图"按钮
   - 等待生成完成（约20-60秒）

5. **验证日志**
   在服务器日志中应该看到：
   ```
   [Infographic] 使用参考图模式，参考图URL: https://...
   🔄 尝试使用 FAL (fal-ai/nano-banana-pro/edit) 异步生成... [图生图模式]
   [FAL] 图生图模式，参考图: https://...
   [FAL] 任务创建成功, request_id: xxx
   [FAL Query] 使用模型 fal-ai/nano-banana-pro/edit 查询成功
   [FAL Query] 任务状态: COMPLETED
   [FAL Query] 获取结果成功
   ```

### 测试2：文生图模式（无参考图）

1. 刷新页面或点击"清空内容"

2. **不上传参考图**，直接输入内容：
   ```
   学习方法：
   1. 制定计划
   2. 专注学习
   3. 定期复习
   4. 实践应用
   ```

3. **生成信息图**

4. **验证日志**
   应该看到：
   ```
   🔄 尝试使用 FAL (fal-ai/nano-banana-pro) 异步生成...
   [FAL Query] 使用模型 fal-ai/nano-banana-pro 查询成功
   ```

## 🔍 问题排查

### 如果还是出现 500 错误

**原因分析：**
查询API无法正确识别模型，可能是缓存或编译问题。

**解决方案：**

1. **清除 Next.js 缓存**
   ```powershell
   Remove-Item -Path ".next" -Recurse -Force
   pnpm dev
   ```

2. **检查日志中的错误信息**
   查看具体是哪个环节出错：
   - 任务创建失败？→ 检查 FAL API Key
   - 任务查询失败？→ 检查 query-with-fallback 日志

3. **验证文件修改**
   确认以下文件已正确修改：
   - ✅ `src/app/api/infographic/query-with-fallback/route.ts`（第44-66行）
   - ✅ `src/app/api/infographic/generate-with-fallback/route.ts`（第58-117行）

### 查看详细日志

在服务器终端中应该看到每个请求的详细日志：

```
POST /api/infographic/generate-with-fallback 200 in 8.4s
GET /api/infographic/query-with-fallback?taskId=xxx&provider=FAL 200 in 3.9s
```

如果看到 `500 in ...`，说明出错了，查看上面的错误日志。

## 📊 预期结果

### 成功的标志

1. ✅ 任务创建成功（收到 taskId）
2. ✅ 轮询查询成功（状态从 PENDING → COMPLETED）
3. ✅ 获取图片URL成功
4. ✅ 图片显示在右侧结果区域
5. ✅ 可以下载图片

### 图生图效果

使用参考图生成的信息图应该：
- 继承参考图的风格（色彩、布局、图形风格）
- 包含用户输入的内容
- 保持信息图的清晰度和可读性

## 🛠️ 调试命令

### 查看进程
```powershell
Get-Process -Name node
```

### 停止所有 node 进程
```powershell
Stop-Process -Name node -Force
```

### 清除锁文件
```powershell
Remove-Item -Path ".next\dev\lock" -Force
```

### 完整重启流程
```powershell
Stop-Process -Name node -Force
Remove-Item -Path ".next" -Recurse -Force
pnpm dev
```

## 📝 关键代码位置

如需手动检查代码：

1. **查询API修复**（关键！）
   - 文件：`src/app/api/infographic/query-with-fallback/route.ts`
   - 函数：`queryFalTask`（第33行开始）
   - 关键逻辑：第44-66行（模型自动匹配）

2. **生成API修复**
   - 文件：`src/app/api/infographic/generate-with-fallback/route.ts`
   - 函数：`tryGenerateWithFal`（第47行开始）
   - 关键逻辑：第58-117行（模型选择和参数构建）

3. **前端UI**
   - 文件：`src/app/[locale]/(landing)/infographic/page.tsx`
   - 参考图上传：第210-280行
   - 参考图预览：第660-680行

## ✨ 测试清单

- [ ] 服务器成功启动（无端口冲突）
- [ ] 访问 /infographic 页面正常
- [ ] 上传参考图成功（看到预览）
- [ ] 有参考图时使用 edit 模型（查看日志）
- [ ] 无参考图时使用常规模型（查看日志）
- [ ] 生成成功并显示图片
- [ ] 可以下载生成的图片
- [ ] 清空功能正常（包括参考图）

---

**如果仍然遇到问题，请提供：**
1. 服务器完整的错误日志
2. 浏览器控制台的错误信息
3. 使用的参考图文件信息

祝测试顺利！🎉

