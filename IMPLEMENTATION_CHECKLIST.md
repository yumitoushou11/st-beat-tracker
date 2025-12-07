# ✅ StoryBeatEngine 重构实施清单

> **打印此清单，逐项勾选，确保不遗漏任何步骤**

---

## 📋 阶段1：基础工具模块提取

### 1.1 DebugLogger.js
- [ ] 创建文件 `src/utils/DebugLogger.js`
- [ ] 复制以下方法：
  - [ ] `debugLog()`
  - [ ] `debugGroup()`
  - [ ] `debugGroupCollapsed()`
  - [ ] `debugGroupEnd()`
  - [ ] `debugWarn()`
- [ ] 转换为类方法格式
- [ ] 添加构造函数和 `isEnabled()` 检查
- [ ] 导出类：`export class DebugLogger { }`
- [ ] 在 `StoryBeatEngine.js` 中导入：`import { DebugLogger } from './src/utils/DebugLogger.js';`
- [ ] 在构造函数中初始化：`this.logger = new DebugLogger('StoryBeatEngine');`
- [ ] 替换所有 `this.debugLog(` 为 `this.logger.log(`
- [ ] 替换所有 `this.debugGroup(` 为 `this.logger.group(`
- [ ] 替换所有 `this.debugGroupCollapsed(` 为 `this.logger.groupCollapsed(`
- [ ] 替换所有 `this.debugGroupEnd(` 为 `this.logger.groupEnd(`
- [ ] 替换所有 `this.debugWarn(` 为 `this.logger.warn(`
- [ ] 删除原始的5个调试方法
- [ ] 测试：开启调试模式，发送消息，检查日志输出
- [ ] 验证：控制台显示 `[StoryBeatEngine]` 前缀的日志
- [ ] Git提交：`git add src/utils/DebugLogger.js StoryBeatEngine.js`
- [ ] Git提交：`git commit -m "refactor: 提取DebugLogger工具类"`

### 1.2 TextSanitizer.js
- [ ] 创建文件 `src/utils/TextSanitizer.js`
- [ ] 复制 `_sanitizeText()` 方法
- [ ] 转换为静态方法：`static sanitizeText(text) { }`
- [ ] 导出类：`export class TextSanitizer { }`
- [ ] 在 `StoryBeatEngine.js` 中导入
- [ ] 查找所有 `this._sanitizeText(` 调用
- [ ] 替换为 `TextSanitizer.sanitizeText(`
- [ ] 删除原始 `_sanitizeText()` 方法
- [ ] 测试：触发章节转换，检查摘要显示
- [ ] 验证：摘要文本不包含乱码
- [ ] Git提交：`git commit -m "refactor: 提取TextSanitizer工具类"`

### 1.3 ChapterAnalyzer.js
- [ ] 创建文件 `src/utils/ChapterAnalyzer.js`
- [ ] 复制以下方法：
  - [ ] `_extractEndgameBeacons()`
  - [ ] `_extractChapterId()`
  - [ ] `_processStarMarkedBeats()`
- [ ] 转换为静态方法
- [ ] 导出类：`export class ChapterAnalyzer { }`
- [ ] 在 `StoryBeatEngine.js` 中导入
- [ ] 替换所有调用点为静态方法调用
- [ ] 删除原始3个方法
- [ ] 测试：创建带★标记的章节
- [ ] 验证：高光时刻正确识别
- [ ] Git提交：`git commit -m "refactor: 提取ChapterAnalyzer工具类"`

### 1.4 ServiceFactory.js
- [ ] 创建文件 `src/services/ServiceFactory.js`
- [ ] 导入 `LLMApiService`
- [ ] 复制 `_initializeCoreServices()` 方法内的服务创建逻辑
- [ ] 创建静态工厂方法：
  ```javascript
  static createServices(apiSettings, adapters) {
      const mainLlmService = new LLMApiService({ ... }, adapters);
      const conductorLlmService = new LLMApiService({ ... }, adapters);
      return { mainLlmService, conductorLlmService };
  }
  ```
- [ ] 导出类：`export class ServiceFactory { }`
- [ ] 在 `StoryBeatEngine.js` 中导入
- [ ] 修改 `_initializeCoreServices()`:
  ```javascript
  _initializeCoreServices() {
      const apiSettings = stateManager.getApiSettings();
      const { mainLlmService, conductorLlmService } = ServiceFactory.createServices(
          apiSettings,
          { USER: this.USER, EDITOR: this.EDITOR, LEADER: this.LEADER }
      );
      this.mainLlmService = mainLlmService;
      this.conductorLlmService = conductorLlmService;
      // ... Agent初始化保持不变
  }
  ```
- [ ] 测试：启动引擎，检查服务初始化
- [ ] 验证：控制台显示服务实例化日志
- [ ] Git提交：`git commit -m "refactor: 提取ServiceFactory"`

### 1.5 阶段1总结
- [ ] 检查 `StoryBeatEngine.js` 行数（应减少约364行）
- [ ] 运行完整功能测试：
  - [ ] 创世纪流程
  - [ ] 回合执导
  - [ ] 章节转换
- [ ] 检查控制台无错误
- [ ] 检查UI显示正常
- [ ] Git标签：`git tag refactor-phase1-complete`

---

## 📋 阶段2：提示词构建模块

### 2.1 创建PromptBuilder骨架
- [ ] 创建文件 `src/managers/PromptBuilder.js`
- [ ] 导入依赖：
  ```javascript
  import { DebugLogger } from '../utils/DebugLogger.js';
  import { DIRECTOR_RULEBOOK_PROMPT, AFFINITY_BEHAVIOR_MATRIX_PROMPT } from '../ai/prompt_templates.js';
  ```
- [ ] 创建类结构：
  ```javascript
  export class PromptBuilder {
      constructor(engine, dependencies) {
          this.engine = engine;
          this.deps = dependencies;
          this.logger = new DebugLogger('PromptBuilder');
      }
  }
  ```

### 2.2 迁移基础方法
- [ ] 复制 `_buildRelationshipGuide()` → `buildRelationshipGuide()`
- [ ] 修改内部调用：
  - [ ] `this.currentChapter` → `this.engine.currentChapter`
  - [ ] `this.info()` → `this.deps.info()`
  - [ ] `this.diagnose()` → `this.deps.diagnose()`
- [ ] 测试方法独立性：在构造函数中调用测试
- [ ] 复制 `_formatMicroInstruction()` → `formatMicroInstruction()`
- [ ] 测试方法独立性

### 2.3 迁移组合方法
- [ ] 复制 `_buildStrictNarrativeConstraints()` → `buildStrictNarrativeConstraints()`
- [ ] 检查内部是否调用其他方法（无）
- [ ] 复制 `_buildHardcodedDirectorInstructions()` → `buildHardcodedDirectorInstructions()`
- [ ] 检查内部调用（无）
- [ ] 复制 `_buildRegularSystemPrompt()` → `buildRegularSystemPrompt()`
- [ ] 修改内部调用：`this._buildRelationshipGuide()` → `this.buildRelationshipGuide()`

### 2.4 集成到主引擎
- [ ] 在 `StoryBeatEngine.js` 中导入：
  ```javascript
  import { PromptBuilder } from './src/managers/PromptBuilder.js';
  ```
- [ ] 在构造函数中初始化（在Agent创建之后）：
  ```javascript
  this.promptBuilder = new PromptBuilder(this, this.deps);
  ```
- [ ] 在 `onPromptReady` 中替换调用：
  - [ ] `this._buildRegularSystemPrompt()` → `this.promptBuilder.buildRegularSystemPrompt()`
  - [ ] `this._buildHardcodedDirectorInstructions()` → `this.promptBuilder.buildHardcodedDirectorInstructions()`
  - [ ] `this._buildStrictNarrativeConstraints()` → `this.promptBuilder.buildStrictNarrativeConstraints()`
  - [ ] `this._formatMicroInstruction()` → `this.promptBuilder.formatMicroInstruction()`
  - [ ] `this._buildRelationshipGuide()` → `this.promptBuilder.buildRelationshipGuide()`
- [ ] 删除原始5个方法
- [ ] 检查是否有遗漏的调用点：`grep -rn "_buildRegular\|_buildHardcoded\|_buildStrict\|_formatMicro\|_buildRelationship" StoryBeatEngine.js`

### 2.5 测试提示词构建
- [ ] 发送用户消息
- [ ] 在 `onPromptReady` 开头添加调试：
  ```javascript
  console.log('Prompt长度:', {
      instruction: instructionPlaceholder.content.length,
      recall: recallPlaceholder.content.length,
      script: scriptPlaceholder.content.length,
      rules: rulesPlaceholder.content.length
  });
  ```
- [ ] 记录提示词长度（重构前）
- [ ] 再次发送消息，对比长度（应该完全一致）
- [ ] 检查AI回复质量（应该无变化）
- [ ] 删除调试代码
- [ ] Git提交：`git commit -m "refactor: 完成PromptBuilder模块"`

---

## 📋 阶段3：状态更新模块

### 3.1 创建StateUpdateManager骨架
- [ ] 创建文件 `src/managers/StateUpdateManager.js`
- [ ] 导入依赖：
  ```javascript
  import { DebugLogger } from '../utils/DebugLogger.js';
  import { TextSanitizer } from '../utils/TextSanitizer.js';
  import { deepmerge } from '../utils/deepmerge.js';
  ```
- [ ] 创建类结构

### 3.2 迁移辅助方法
- [ ] 复制 `_findStorylineAcrossCategories()` → `findStorylineAcrossCategories()`
- [ ] 转换为静态方法（不依赖实例状态）
- [ ] 复制 `_consolidateChapterEvents()` → `consolidateChapterEvents()`
- [ ] 修改内部调用为 `this.deps.info()`

### 3.3 迁移核心方法 _applyStateUpdates()
- [ ] 复制整个 `_applyStateUpdates()` 方法（约700行）
- [ ] 重命名为 `applyStateUpdates()`
- [ ] 逐行检查内部调用：
  - [ ] `this.info()` → `this.deps.info()`
  - [ ] `this.warn()` → `this.deps.warn()`
  - [ ] `this.diagnose()` → `this.deps.diagnose()`
  - [ ] `this.debugGroup()` → `this.logger.group()`
  - [ ] `this.debugLog()` → `this.logger.log()`
  - [ ] `this.debugGroupEnd()` → `this.logger.groupEnd()`
  - [ ] `this._findStorylineAcrossCategories()` → `this.findStorylineAcrossCategories()`
  - [ ] `this._sanitizeText()` → `TextSanitizer.sanitizeText()`
- [ ] 检查是否访问 `this.currentChapter`（应该通过参数传入，不需要修改）
- [ ] 检查 `deepmerge` 调用（应该正常工作）

### 3.4 集成到主引擎
- [ ] 在 `StoryBeatEngine.js` 中导入
- [ ] 在构造函数中初始化：
  ```javascript
  this.stateUpdateManager = new StateUpdateManager(this, this.deps);
  ```
- [ ] 查找所有 `this._applyStateUpdates(` 调用
- [ ] 替换为 `this.stateUpdateManager.applyStateUpdates(`
- [ ] 删除原始方法

### 3.5 测试状态更新
- [ ] 触发章节转换
- [ ] 在 `applyStateUpdates` 开头添加调试：
  ```javascript
  console.log('Delta输入:', JSON.parse(JSON.stringify(delta)));
  console.log('Chapter输入:', workingChapter.uid);
  ```
- [ ] 在方法结尾添加：
  ```javascript
  console.log('Chapter输出:', workingChapter.uid);
  console.log('角色数量:', Object.keys(workingChapter.staticMatrices.characters).length);
  ```
- [ ] 检查角色状态是否正确更新
- [ ] 检查故事线状态是否正确更新
- [ ] 检查关系图谱是否正确更新
- [ ] 删除调试代码
- [ ] Git提交：`git commit -m "refactor: 完成StateUpdateManager模块"`

---

## 📋 阶段4：章节转换模块（最复杂）

### 4.1 创建TransitionManager骨架
- [ ] 创建文件 `src/managers/TransitionManager.js`
- [ ] 导入依赖：
  ```javascript
  import { DebugLogger } from '../utils/DebugLogger.js';
  import { ChapterAnalyzer } from '../utils/ChapterAnalyzer.js';
  import { Chapter } from '../Chapter.js';
  import * as stateManager from '../stateManager.js';
  import { deepmerge } from '../utils/deepmerge.js';
  import { ENGINE_STATUS } from './constants.js';
  ```
- [ ] 创建类结构

### 4.2 迁移 _planNextChapter()
- [ ] 复制整个方法 → `planNextChapter()`
- [ ] 修改内部调用：
  - [ ] `this._setStatus()` → `this.engine._setStatus()`
  - [ ] `this.info()` → `this.deps.info()`
  - [ ] `this.debugGroup()` → `this.logger.group()`
  - [ ] `this.architectAgent` → `this.engine.architectAgent`
  - [ ] `this._processStarMarkedBeats()` → `ChapterAnalyzer.processStarMarkedBeats()`
- [ ] 测试独立编译（检查语法）

### 4.3 迁移 startGenesisProcess()
- [ ] 复制整个方法（约200行）
- [ ] 修改内部调用：
  - [ ] `this.currentChapter` → `this.engine.currentChapter`
  - [ ] `this._setStatus()` → `this.engine._setStatus()`
  - [ ] `this._planNextChapter()` → `this.planNextChapter()`
  - [ ] `this._processStarMarkedBeats()` → `ChapterAnalyzer.processStarMarkedBeats()`
  - [ ] `this.entityContextManager` → `this.engine.entityContextManager`
  - [ ] `this.onCommitState` → `this.engine.onCommitState`
  - [ ] `this.currentTaskAbortController` → `this.engine.currentTaskAbortController`
  - [ ] `this.toastr` → `this.deps.toastr`
  - [ ] `this.USER` → `this.engine.USER`
  - [ ] `this.LEADER` → `this.engine.LEADER`
  - [ ] `this.intelligenceAgent` → `this.engine.intelligenceAgent`
- [ ] 检查是否有遗漏的 `this.` 访问

### 4.4 迁移 triggerChapterTransition() (最复杂)
- [ ] 复制整个方法（约500行）
- [ ] 逐段修改内部调用（建议分成多个小提交）:

  **段1: 初始化和加载**
  - [ ] `this._transitionStopRequested` → `this.engine._transitionStopRequested`
  - [ ] `this._activeTransitionToast` → `this.engine._activeTransitionToast`
  - [ ] `this.currentTaskAbortController` → `this.engine.currentTaskAbortController`
  - [ ] `this._setStatus()` → `this.engine._setStatus()`
  - [ ] `this.toastr` → `this.deps.toastr`
  - [ ] `this.USER` → `this.engine.USER`
  - [ ] `this.LEADER` → `this.engine.LEADER`

  **段2: 史官复盘**
  - [ ] `this._runStrategicReview()` → 保持不变（在主引擎中）
  - [ ] `this._bindStopButton()` → `this.userInteractionHandler.bindStopButton()` (阶段5创建)
  - [ ] 暂时保留原样，标记TODO

  **段3: 状态更新**
  - [ ] `this._applyStateUpdates()` → `this.engine.stateUpdateManager.applyStateUpdates()`
  - [ ] `this.narrativeControlTowerManager` → `this.engine.narrativeControlTowerManager`

  **段4: 章节规划**
  - [ ] `this._planNextChapter()` → `this.planNextChapter()`
  - [ ] `this._processStarMarkedBeats()` → `ChapterAnalyzer.processStarMarkedBeats()`
  - [ ] `this.entityContextManager` → `this.engine.entityContextManager`

### 4.5 集成到主引擎
- [ ] 在 `StoryBeatEngine.js` 中导入
- [ ] 在构造函数中初始化（在所有依赖准备好后）：
  ```javascript
  this.transitionManager = new TransitionManager(this, this.deps);
  ```
- [ ] 修改 `forceChapterTransition()`:
  ```javascript
  async forceChapterTransition() {
      const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
      if (!isEngineEnabled) {
          this.toastr.warning('...', '...');
          return;
      }
      await this.transitionManager.forceChapterTransition();
  }
  ```
- [ ] 删除原始3个方法
- [ ] 检查是否有遗漏的调用点

### 4.6 测试章节转换（完整流程）
- [ ] **测试1: 创世纪**
  - [ ] 新建对话
  - [ ] 发送首条消息
  - [ ] 检查情报分析
  - [ ] 检查建筑师规划
  - [ ] 检查章节生成
  - [ ] 检查状态锚定

- [ ] **测试2: 标准转换**
  - [ ] 点击"强制章节转换"
  - [ ] 等待史官复盘
  - [ ] 输入焦点
  - [ ] 等待建筑师规划
  - [ ] 检查新章节UID

- [ ] **测试3: 断点恢复**
  - [ ] 触发转换
  - [ ] 在史官阶段刷新页面
  - [ ] 重新点击转换
  - [ ] 检查是否从建筑师阶段继续

- [ ] **测试4: 停止控制**
  - [ ] 触发转换
  - [ ] 在史官阶段点击停止
  - [ ] 检查流程立即中止
  - [ ] 检查状态清理正确

- [ ] **测试5: 自由章模式**
  - [ ] 触发转换
  - [ ] 选择"自由探索"
  - [ ] 检查跳过建筑师
  - [ ] 检查AI自由发挥

- [ ] Git提交：`git commit -m "refactor: 完成TransitionManager模块"`

---

## 📋 阶段5：用户交互与清理模块

### 5.1 创建UserInteractionHandler
- [ ] 创建文件 `src/handlers/UserInteractionHandler.js`
- [ ] 创建类结构
- [ ] 复制 `_captureEarlyFocusInput()` → `captureEarlyFocusInput()`
- [ ] 修改内部调用
- [ ] 复制 `_bindStopButton()` → `bindStopButton()`
- [ ] 复制 `_handleStopTransitionRequest()` → `handleStopTransitionRequest()`
- [ ] 在 `StoryBeatEngine` 中初始化
- [ ] 更新 `TransitionManager` 中的调用
- [ ] 删除原始方法
- [ ] 测试：提前规划按钮、停止按钮

### 5.2 创建CleanupHandler
- [ ] 创建文件 `src/handlers/CleanupHandler.js`
- [ ] 创建类结构
- [ ] 复制 `_cleanPollutedLeadersInChat()` → `cleanPollutedLeadersInChat()`
- [ ] 复制 `_cleanupAfterTransitionStop()` → `cleanupAfterTransitionStop()`
- [ ] 复制 `_throwIfStopRequested()` → `throwIfStopRequested()`
- [ ] 修改内部调用
- [ ] 在 `StoryBeatEngine` 中初始化
- [ ] 更新调用点
- [ ] 删除原始方法
- [ ] 测试：数据清理功能

### 5.3 阶段5总结
- [ ] Git提交：`git commit -m "refactor: 完成用户交互和清理模块"`
- [ ] 运行完整回归测试

---

## 📋 阶段6：最终整合与优化

### 6.1 代码审查
- [ ] 检查 `StoryBeatEngine.js` 剩余代码
- [ ] 确认所有公共API保持不变
- [ ] 确认所有事件处理器正常工作
- [ ] 检查是否有可以移到模块的私有方法

### 6.2 文档完善
- [ ] 为所有公共方法添加JSDoc注释
- [ ] 为所有模块添加文件头注释
- [ ] 创建 `src/README.md`:
  ```markdown
  # StoryBeatEngine 模块架构

  ## 模块列表
  - utils/: 通用工具函数
  - services/: 服务创建和管理
  - managers/: 业务流程管理
  - handlers/: 特定场景处理

  ## 依赖关系
  utils → services → handlers → managers → core
  ```

### 6.3 最终测试
- [ ] 运行所有功能测试（测试矩阵）
- [ ] 检查控制台无错误
- [ ] 检查UI显示正常
- [ ] 检查性能无明显下降
- [ ] 邀请他人进行测试

### 6.4 清理和提交
- [ ] 删除所有调试代码
- [ ] 优化导入语句（按字母排序）
- [ ] 统一代码风格
- [ ] Git提交：`git commit -m "refactor: 完成模块化重构"`
- [ ] Git标签：`git tag refactor-complete-v1.0`

---

## 📊 最终验证清单

### 代码质量
- [ ] `StoryBeatEngine.js` 约400行（±50行）
- [ ] 所有模块文件行数合理（100-900行）
- [ ] 没有代码重复
- [ ] 导入路径正确
- [ ] JSDoc注释完整

### 功能完整性
- [ ] 创世纪流程 ✅
- [ ] 标准章节转换 ✅
- [ ] 断点恢复 ✅
- [ ] 提前规划 ✅
- [ ] 停止控制 ✅
- [ ] 热重载 ✅
- [ ] 重roll剧本 ✅
- [ ] 自由章模式 ✅
- [ ] 高光时刻 ✅
- [ ] 状态持久化 ✅
- [ ] 调试模式 ✅

### 性能指标
- [ ] 文件加载时间: < 300ms
- [ ] 引擎初始化时间: < 100ms
- [ ] 章节转换时间: 无变化（AI主导）
- [ ] 内存占用: 无明显增加

### 文档完整性
- [ ] `REFACTORING_PLAN.md` 完整
- [ ] `QUICK_START.md` 完整
- [ ] `IMPLEMENTATION_CHECKLIST.md` 完整（本文件）
- [ ] `src/README.md` 已创建
- [ ] Git提交历史清晰

---

## 🎉 完成标志

当你勾选了以上所有复选框，恭喜你完成了一次专业的企业级代码重构！

**重构成果**:
- 原始代码: 3514行 × 1个文件
- 重构后: 400行主引擎 + 10个专业模块
- 代码减少: 88.6%
- 可维护性: 显著提升 ✅
- 功能完整性: 100% ✅
- 向后兼容性: 100% ✅

**下一步**:
- [ ] 创建Pull Request
- [ ] 代码审查
- [ ] 合并到主分支
- [ ] 发布版本更新
- [ ] 更新用户文档

---

**清单版本**: 1.0 | **更新日期**: 2025-12-07
