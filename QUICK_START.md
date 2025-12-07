# 🚀 StoryBeatEngine 重构快速开始指南

> **5分钟了解重构方案，立即开始实施**

---

## 📊 一图看懂重构

### 当前问题
```
❌ StoryBeatEngine.js (3514行)
   ├── 54个方法混杂在一起
   ├── 职责不清晰
   ├── 难以维护和测试
   └── 新人需要几天才能理解
```

### 重构目标
```
✅ StoryBeatEngine.js (400行) + 10个专业模块
   ├── core/        - 主引擎协调器
   ├── services/    - 服务工厂
   ├── managers/    - 业务管理器 (转换、状态、提示词)
   ├── utils/       - 工具函数
   └── handlers/    - 特定处理器
```

---

## ⏱️ 实施时间表

| 阶段 | 时间 | 难度 | 减少行数 | 可独立验证 |
|------|------|------|----------|-----------|
| **阶段1**: 基础工具 | 1-2天 | ⭐ 简单 | -364行 | ✅ |
| **阶段2**: 提示词构建 | 2-3天 | ⭐⭐ 中等 | -1000行 | ✅ |
| **阶段3**: 状态更新 | 2-3天 | ⭐⭐⭐ 复杂 | -700行 | ✅ |
| **阶段4**: 章节转换 | 3-4天 | ⭐⭐⭐⭐ 困难 | -800行 | ✅ |
| **阶段5**: 用户交互 | 1-2天 | ⭐⭐ 中等 | -250行 | ✅ |
| **阶段6**: 最终整合 | 1-2天 | ⭐ 简单 | 清理优化 | ✅ |
| **总计** | **10-16天** | - | **-3114行** | - |

---

## 🎯 每日执行清单

### 第1天：准备工作
- [ ] 阅读完整的 `REFACTORING_PLAN.md`
- [ ] 创建Git分支: `git checkout -b refactor/modularize-engine`
- [ ] 备份当前代码: `git tag pre-refactor-backup`
- [ ] 运行完整测试确保当前状态正常
- [ ] 创建文件夹: `mkdir -p src/utils src/services src/managers src/handlers`

### 第2天：阶段1 - 提取基础工具
**目标**: 提取DebugLogger、TextSanitizer、ChapterAnalyzer、ServiceFactory

#### 上午
- [ ] 创建 `src/utils/DebugLogger.js`
- [ ] 复制调试方法到新文件
- [ ] 在StoryBeatEngine中导入并替换调用
- [ ] 测试：开启调试模式，检查日志输出
- [ ] Git提交: `git commit -m "refactor: 提取DebugLogger"`

#### 下午
- [ ] 创建 `src/utils/TextSanitizer.js`
- [ ] 提取 `_sanitizeText` 方法
- [ ] 更新所有调用点为静态方法
- [ ] 测试：检查UI中的摘要显示
- [ ] 创建 `src/utils/ChapterAnalyzer.js`
- [ ] 提取3个分析方法
- [ ] 创建 `src/services/ServiceFactory.js`
- [ ] 提取服务初始化逻辑
- [ ] Git提交: `git commit -m "refactor: 完成阶段1基础工具"`

**验证清单** ✅:
```javascript
// 控制台执行
localStorage.setItem('sbt-debug-mode', 'true');
// 发送消息，检查是否有日志输出

// 检查服务
console.log('mainLlmService:', window.engineInstance?.mainLlmService);
console.log('conductorLlmService:', window.engineInstance?.conductorLlmService);
```

### 第3-4天：阶段2 - 提取提示词构建
**目标**: 创建PromptBuilder模块，减少1000行

#### Day 3
- [ ] 创建 `src/managers/PromptBuilder.js`
- [ ] 迁移 `_buildRelationshipGuide()`
- [ ] 迁移 `_formatMicroInstruction()`
- [ ] 测试：检查关系指南格式
- [ ] Git提交: `git commit -m "refactor: 迁移PromptBuilder基础方法"`

#### Day 4
- [ ] 迁移 `_buildStrictNarrativeConstraints()`
- [ ] 迁移 `_buildHardcodedDirectorInstructions()`
- [ ] 迁移 `_buildRegularSystemPrompt()`
- [ ] 在StoryBeatEngine中创建promptBuilder实例
- [ ] 更新onPromptReady中的调用
- [ ] 测试：发送消息，检查提示词长度
- [ ] Git提交: `git commit -m "refactor: 完成PromptBuilder模块"`

**验证清单** ✅:
```javascript
// 在onPromptReady中添加
console.log('Prompt长度统计:', {
    instruction: instructionPlaceholder.content.length,
    recall: recallPlaceholder.content.length,
    script: scriptPlaceholder.content.length,
    rules: rulesPlaceholder.content.length
});
// 与重构前的长度对比，应该完全一致
```

### 第5-6天：阶段3 - 提取状态更新
**目标**: 创建StateUpdateManager，减少700行

#### Day 5
- [ ] 创建 `src/managers/StateUpdateManager.js`
- [ ] 迁移 `_findStorylineAcrossCategories()`
- [ ] 迁移 `_consolidateChapterEvents()`
- [ ] 测试：检查工具方法
- [ ] Git提交: `git commit -m "refactor: StateUpdateManager工具方法"`

#### Day 6
- [ ] 迁移 `_applyStateUpdates()` (最复杂)
- [ ] 仔细处理所有内部调用
- [ ] 在StoryBeatEngine中创建stateUpdateManager实例
- [ ] 更新triggerChapterTransition中的调用
- [ ] 完整测试章节转换流程
- [ ] Git提交: `git commit -m "refactor: 完成StateUpdateManager"`

**验证清单** ✅:
```javascript
// 触发章节转换，检查状态更新
// 在_applyStateUpdates开头添加
console.log('Delta输入:', delta);
console.log('角色更新:', delta.updates?.characters);
console.log('故事线更新:', delta.updates?.storylines);

// 转换完成后检查
console.log('新章节UID:', currentChapter.uid);
console.log('角色状态:', currentChapter.staticMatrices.characters);
```

### 第7-9天：阶段4 - 提取章节转换 (最复杂)
**目标**: 创建TransitionManager，减少800行

#### Day 7
- [ ] 创建 `src/managers/TransitionManager.js`
- [ ] 设计模块接口
- [ ] 迁移 `_planNextChapter()`
- [ ] 测试：建筑师调用
- [ ] Git提交: `git commit -m "refactor: TransitionManager规划方法"`

#### Day 8
- [ ] 迁移 `startGenesisProcess()`
- [ ] 处理复杂的依赖关系
- [ ] 测试：创世纪流程
- [ ] Git提交: `git commit -m "refactor: TransitionManager创世纪"`

#### Day 9
- [ ] 迁移 `triggerChapterTransition()` (核心方法)
- [ ] 在StoryBeatEngine中创建transitionManager实例
- [ ] 更新forceChapterTransition()委托调用
- [ ] 完整测试所有转换场景
- [ ] Git提交: `git commit -m "refactor: 完成TransitionManager"`

**验证清单** ✅:
```javascript
// 测试创世纪
// 新建对话 → 发送消息 → 检查章节生成

// 测试标准转换
// 点击"强制章节转换" → 检查流程完整性

// 测试断点恢复
// 在史官阶段刷新页面 → 重新触发 → 检查是否恢复

// 测试停止控制
// 触发转换 → 点击停止 → 检查是否立即中止
```

### 第10天：阶段5 - 提取用户交互
**目标**: 创建UserInteractionHandler和CleanupHandler

- [ ] 创建 `src/handlers/UserInteractionHandler.js`
- [ ] 迁移3个用户交互方法
- [ ] 创建 `src/handlers/CleanupHandler.js`
- [ ] 迁移3个清理方法
- [ ] 更新TransitionManager中的调用
- [ ] 测试：提前规划按钮、停止按钮
- [ ] Git提交: `git commit -m "refactor: 完成用户交互和清理模块"`

**验证清单** ✅:
```javascript
// 测试提前规划
// 触发转换 → 史官期间点击"规划"按钮 → 检查输入是否记录

// 测试停止按钮
// 触发转换 → 点击停止 → 检查清理逻辑

// 测试数据清理
// 手动污染数据 → 检查自动清理
```

### 第11天：阶段6 - 最终整合
- [ ] 审查 `StoryBeatEngine.js` 剩余代码
- [ ] 添加完整JSDoc注释
- [ ] 优化导入语句
- [ ] 创建 `src/README.md` 模块说明
- [ ] 运行完整回归测试
- [ ] Git提交: `git commit -m "refactor: 完成模块化重构"`
- [ ] 创建PR或合并到主分支

**最终验证** ✅:
```javascript
// 运行完整功能测试矩阵
// 详见 REFACTORING_PLAN.md "测试验证清单"

// 检查文件行数
// StoryBeatEngine.js 应该在 ~400行左右
wc -l StoryBeatEngine.js  // 或 find /c /v "" StoryBeatEngine.js

// 检查所有模块导入正确
grep -r "import.*from" src/

// 检查没有未使用的变量
// (如果有ESLint配置)
npm run lint
```

---

## 🛡️ 安全检查表

**每次提交前必须检查**:
- [ ] 运行基础功能测试（创世纪、转换、回合）
- [ ] 检查控制台无错误
- [ ] 检查UI显示正常
- [ ] Git提交信息格式正确：`refactor: 描述`
- [ ] 本地代码备份完整

**出现问题立即**:
```bash
# 快速回滚
git reset --hard HEAD~1

# 查看差异
git diff HEAD~1

# 恢复特定文件
git checkout HEAD~1 -- StoryBeatEngine.js
```

---

## 📝 进度跟踪模板

**复制到你的笔记中**:
```
## StoryBeatEngine 重构进度

### 阶段1: 基础工具 ⬜
- [ ] DebugLogger
- [ ] TextSanitizer
- [ ] ChapterAnalyzer
- [ ] ServiceFactory
- [ ] 测试通过
- [ ] Git提交

### 阶段2: 提示词构建 ⬜
- [ ] PromptBuilder创建
- [ ] 5个方法迁移
- [ ] 调用点更新
- [ ] 测试通过
- [ ] Git提交

### 阶段3: 状态更新 ⬜
- [ ] StateUpdateManager创建
- [ ] _applyStateUpdates迁移
- [ ] 测试通过
- [ ] Git提交

### 阶段4: 章节转换 ⬜
- [ ] TransitionManager创建
- [ ] 3个核心方法迁移
- [ ] 测试通过
- [ ] Git提交

### 阶段5: 用户交互 ⬜
- [ ] UserInteractionHandler
- [ ] CleanupHandler
- [ ] 测试通过
- [ ] Git提交

### 阶段6: 最终整合 ⬜
- [ ] 代码审查
- [ ] 文档完善
- [ ] 完整测试
- [ ] PR/合并

### 完成日期: _______
```

---

## 🆘 常见问题速查

### Q1: 提示 "xxx is not a function"
**解决**: 检查导入路径和导出方式
```javascript
// 错误
import DebugLogger from './utils/DebugLogger.js';

// 正确
import { DebugLogger } from './utils/DebugLogger.js';
```

### Q2: 方法中的 this.currentChapter 报错
**解决**: 通过 this.engine 访问
```javascript
// 在Manager中
this.engine.currentChapter
```

### Q3: 测试发现行为不一致
**解决**: 立即回滚，逐行对比差异
```bash
git diff HEAD~1 StoryBeatEngine.js
```

### Q4: 想跳过某个阶段
**回答**: ❌ 不允许！阶段之间有依赖关系，必须按顺序执行

### Q5: 可以同时修改多个文件吗？
**回答**: ⚠️ 不建议！每次只修改一个模块，立即测试验证

---

## 📚 相关文档

- **完整设计文档**: [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) (必读)
- **模块架构说明**: `src/README.md` (阶段6创建)
- **Git提交历史**: `git log --oneline --grep="refactor:"`

---

## ✅ 成功标志

**当你完成所有阶段后，应该看到**:
1. `StoryBeatEngine.js` 约400行（原3514行）
2. `src/` 目录下有10个清晰的模块
3. 所有功能测试100%通过
4. 代码可读性显著提升
5. 新人可以快速定位功能模块

**恭喜你完成了一次专业的代码重构！** 🎉

---

**文档版本**: 1.0 | **更新日期**: 2025-12-07
