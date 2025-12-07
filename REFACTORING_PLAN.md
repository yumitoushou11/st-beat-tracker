# StoryBeatEngine.js 模块化重构设计文档

> **文档版本**: 1.0
> **创建日期**: 2025-12-07
> **目标**: 将3514行的StoryBeatEngine.js安全地拆分为可维护的模块化架构
> **兼容性承诺**: 100%向后兼容，保持所有公共API不变

---

## 📋 目录

1. [项目概览](#项目概览)
2. [当前架构分析](#当前架构分析)
3. [重构目标与原则](#重构目标与原则)
4. [模块化设计方案](#模块化设计方案)
5. [详细接口定义](#详细接口定义)
6. [实施路线图](#实施路线图)
7. [测试验证清单](#测试验证清单)
8. [风险评估与回滚方案](#风险评估与回滚方案)
9. [AI接手指南](#ai接手指南)

---

## 项目概览

### 当前状态
- **文件**: `StoryBeatEngine.js`
- **代码行数**: 3514行
- **方法数量**: 54个
- **主要职责**:
  - 叙事流引擎核心协调器
  - AI代理管理
  - 章节转换流程控制
  - 状态更新应用
  - 提示词构建
  - 事件处理
  - UI同步

### 问题诊断
1. **单一职责原则违反**: 一个类承担了过多职责
2. **可维护性低**: 3500+行代码难以定位和修改
3. **测试困难**: 紧耦合导致单元测试复杂
4. **协作困难**: 多人修改容易产生冲突
5. **认知负荷高**: 新开发者需要理解整个大文件

---

## 当前架构分析

### 方法职责矩阵

| 职责类别 | 方法数量 | 代码行数 | 关键方法 |
|---------|---------|---------|---------|
| **初始化与配置** | 4 | ~200 | `constructor`, `start`, `_initializeCoreServices` |
| **调试工具** | 5 | ~80 | `debugLog`, `debugGroup`, `debugWarn` |
| **章节转换** | 8 | ~900 | `triggerChapterTransition`, `startGenesisProcess`, `_planNextChapter` |
| **状态管理** | 3 | ~700 | `_applyStateUpdates`, `onCommitState`, `onStateChange` |
| **提示词构建** | 6 | ~1000 | `_buildRegularSystemPrompt`, `_buildHardcodedDirectorInstructions` |
| **事件处理** | 3 | ~500 | `onPromptReady`, `onCommitState` |
| **工具辅助** | 8 | ~300 | `_sanitizeText`, `_buildRelationshipGuide`, `_extractChapterId` |
| **用户交互** | 4 | ~300 | `_captureEarlyFocusInput`, `_bindStopButton` |
| **公共API** | 6 | ~400 | `reanalyzeWorldbook`, `rerollChapterBlueprint`, `forceChapterTransition` |
| **停止与清理** | 5 | ~150 | `abortCurrentTask`, `_cleanupAfterTransitionStop` |

### 依赖关系图

```
StoryBeatEngine (主引擎)
├── 外部依赖
│   ├── Chapter (章节模型)
│   ├── stateManager (状态持久化)
│   ├── LLMApiService (API服务)
│   ├── IntelligenceAgent (情报分析)
│   ├── HistorianAgent (历史复盘)
│   ├── ArchitectAgent (章节规划)
│   ├── TurnConductorAgent (回合执导)
│   ├── NarrativeControlTowerManager (叙事控制塔)
│   ├── EntityContextManager (实体上下文)
│   └── UI模块 (setupUI, updateDashboard, etc.)
│
└── 内部方法调用链
    ├── start() → _initializeCoreServices()
    ├── onPromptReady() → _buildRegularSystemPrompt()
    ├── triggerChapterTransition() → _planNextChapter() → _applyStateUpdates()
    └── forceChapterTransition() → triggerChapterTransition()
```

### 数据流分析

```
用户输入
   ↓
[Event Handler]
   ↓
┌──────────────────────┐
│ StoryBeatEngine      │
│ (事件分发)           │
└──────────────────────┘
   ↓
┌──────────────────────┐
│ AI Agents            │
│ (业务处理)           │
└──────────────────────┘
   ↓
┌──────────────────────┐
│ State Manager        │
│ (状态更新)           │
└──────────────────────┘
   ↓
┌──────────────────────┐
│ UI Renderer          │
│ (视图更新)           │
└──────────────────────┘
```

---

## 重构目标与原则

### 核心目标
1. **降低复杂度**: 将3500行拆分为多个300-700行的模块
2. **提升可维护性**: 每个模块职责单一、边界清晰
3. **保持兼容性**: 100%向后兼容，不破坏现有功能
4. **提高可测试性**: 模块独立可测，支持单元测试
5. **改善协作效率**: 减少文件冲突，支持并行开发

### 设计原则
1. **单一职责原则 (SRP)**: 每个模块只负责一个明确的业务领域
2. **开闭原则 (OCP)**: 对扩展开放，对修改关闭
3. **依赖倒置原则 (DIP)**: 依赖抽象而非具体实现
4. **接口隔离原则 (ISP)**: 接口最小化，避免臃肿
5. **渐进式重构**: 分阶段实施，每阶段独立验证

### 安全边界
- ✅ **允许修改**: 内部实现、私有方法、模块划分
- ❌ **禁止修改**: 公共API接口、事件名称、数据结构格式
- ⚠️ **谨慎修改**: 构造函数参数、依赖注入方式

---

## 模块化设计方案

### 目标架构概览

```
src/
├── core/
│   └── StoryBeatEngine.js          (主引擎 - 协调器, ~400行)
│
├── services/
│   ├── ServiceFactory.js           (服务工厂, ~120行)
│   └── AbortControllerManager.js   (中止控制, ~80行)
│
├── managers/
│   ├── TransitionManager.js        (章节转换管理, ~800行)
│   ├── StateUpdateManager.js       (状态更新管理, ~700行)
│   ├── PromptBuilder.js            (提示词构建, ~900行)
│   └── EventCoordinator.js         (事件协调, ~400行)
│
├── utils/
│   ├── DebugLogger.js              (调试日志, ~100行)
│   ├── TextSanitizer.js            (文本清理, ~60行)
│   └── ChapterAnalyzer.js          (章节分析, ~150行)
│
└── handlers/
    ├── UserInteractionHandler.js   (用户交互, ~250行)
    └── CleanupHandler.js           (清理逻辑, ~150行)
```

### 模块职责定义

#### 1. **StoryBeatEngine.js** (主引擎 - 重构后)
**职责**: 系统协调器和门面模式
- 初始化所有子模块
- 对外暴露公共API
- 事件路由和分发
- 模块间通信协调

**保留方法** (约15个):
- `constructor()` - 初始化
- `start()` - 启动引擎
- `onPromptReady()` - 事件入口
- `onCommitState()` - 事件入口
- `onStateChange()` - 事件入口
- `reanalyzeWorldbook()` - 公共API
- `rerollChapterBlueprint()` - 公共API
- `forceChapterTransition()` - 公共API
- `setNarrativeFocus()` - 公共API
- `saveCharacterEdit()` - 公共API
- `hardReset()` - 公共API
- `abortCurrentTask()` - 停止控制

**委托给子模块的方法**:
- 调试日志 → `DebugLogger`
- 章节转换 → `TransitionManager`
- 状态更新 → `StateUpdateManager`
- 提示词构建 → `PromptBuilder`

#### 2. **ServiceFactory.js** (服务工厂)
**职责**: 创建和配置LLM服务实例

```javascript
/**
 * 服务工厂 - 负责创建和配置LLM服务
 */
export class ServiceFactory {
    /**
     * 创建主服务和回合裁判服务
     * @param {Object} apiSettings - API配置
     * @param {Object} adapters - 引擎适配器 {USER, EDITOR, LEADER}
     * @returns {{mainLlmService: LLMApiService, conductorLlmService: LLMApiService}}
     */
    static createServices(apiSettings, adapters) {
        // 实现...
    }
}
```

**迁移方法**:
- `_initializeCoreServices()` → 拆分为 `createServices()`

#### 3. **DebugLogger.js** (调试日志)
**职责**: 统一的调试日志管理

```javascript
/**
 * 调试日志管理器
 * 根据 localStorage 'sbt-debug-mode' 控制输出
 */
export class DebugLogger {
    constructor(namespace = 'SBT') {
        this.namespace = namespace;
        this.isEnabled = () => localStorage.getItem('sbt-debug-mode') === 'true';
    }

    log(...args) { /* ... */ }
    group(...args) { /* ... */ }
    groupCollapsed(...args) { /* ... */ }
    groupEnd() { /* ... */ }
    warn(...args) { /* ... */ }
}
```

**迁移方法**:
- `debugLog()` → `logger.log()`
- `debugGroup()` → `logger.group()`
- `debugGroupCollapsed()` → `logger.groupCollapsed()`
- `debugGroupEnd()` → `logger.groupEnd()`
- `debugWarn()` → `logger.warn()`

#### 4. **TransitionManager.js** (章节转换管理)
**职责**: 完整的章节转换流程控制

```javascript
/**
 * 章节转换管理器
 * 负责 Genesis、Standard、Retry 等转换流程
 */
export class TransitionManager {
    constructor(engine, dependencies) {
        this.engine = engine;
        this.deps = dependencies;
        this.logger = new DebugLogger('TransitionManager');
    }

    /**
     * 触发章节转换
     * @param {string} eventUid - 事件唯一标识
     * @param {number} endIndex - 消息结束索引
     * @param {string} transitionType - 转换类型
     */
    async triggerChapterTransition(eventUid, endIndex, transitionType) {
        // 实现...
    }

    /**
     * 启动创世纪流程
     * @param {string} firstMessageContent - 开场白内容
     */
    async startGenesisProcess(firstMessageContent) {
        // 实现...
    }

    /**
     * 规划下一章节
     * @param {boolean} isGenesis - 是否为创世纪
     * @param {Chapter} chapterForPlanning - 用于规划的章节
     * @param {string} firstMessageContent - 首条消息内容
     * @param {AbortSignal} abortSignal - 中止信号
     */
    async planNextChapter(isGenesis, chapterForPlanning, firstMessageContent, abortSignal) {
        // 实现...
    }
}
```

**迁移方法**:
- `triggerChapterTransition()` → `TransitionManager.triggerChapterTransition()`
- `startGenesisProcess()` → `TransitionManager.startGenesisProcess()`
- `_planNextChapter()` → `TransitionManager.planNextChapter()`
- `_captureEarlyFocusInput()` → `UserInteractionHandler.captureEarlyFocusInput()`

#### 5. **StateUpdateManager.js** (状态更新管理)
**职责**: 应用AI返回的状态增量

```javascript
/**
 * 状态更新管理器
 * 负责将史官返回的Delta应用到Chapter对象
 */
export class StateUpdateManager {
    constructor(engine, dependencies) {
        this.engine = engine;
        this.deps = dependencies;
        this.logger = new DebugLogger('StateUpdateManager');
    }

    /**
     * 应用状态更新
     * @param {Chapter} workingChapter - 工作章节
     * @param {Object} delta - 状态增量
     * @returns {Chapter} 更新后的章节
     */
    applyStateUpdates(workingChapter, delta) {
        // 实现...
    }

    /**
     * 查找故事线（跨分类搜索）
     * @param {Chapter} chapter - 章节对象
     * @param {string} storylineId - 故事线ID
     * @returns {Object|null} 故事线信息
     */
    findStorylineAcrossCategories(chapter, storylineId) {
        // 实现...
    }
}
```

**迁移方法**:
- `_applyStateUpdates()` → `StateUpdateManager.applyStateUpdates()`
- `_findStorylineAcrossCategories()` → `StateUpdateManager.findStorylineAcrossCategories()`
- `_consolidateChapterEvents()` → `StateUpdateManager.consolidateChapterEvents()`

#### 6. **PromptBuilder.js** (提示词构建)
**职责**: 构建所有类型的提示词

```javascript
/**
 * 提示词构建器
 * 负责构建四层注入策略的所有提示词
 */
export class PromptBuilder {
    constructor(engine, dependencies) {
        this.engine = engine;
        this.deps = dependencies;
        this.logger = new DebugLogger('PromptBuilder');
    }

    /**
     * 构建常规系统提示词
     * @returns {string}
     */
    buildRegularSystemPrompt() {
        // 实现...
    }

    /**
     * 构建硬编码执导指令
     * @param {number} currentBeatIdx - 当前节拍索引
     * @param {Object} currentBeat - 当前节拍
     * @param {Array} beats - 所有节拍
     * @returns {string}
     */
    buildHardcodedDirectorInstructions(currentBeatIdx, currentBeat, beats) {
        // 实现...
    }

    /**
     * 构建严格叙事约束
     * @param {Object} currentBeat - 当前节拍
     * @param {Object} microInstruction - 微指令
     * @param {Object} commonSenseReview - 常识审查
     * @returns {string}
     */
    buildStrictNarrativeConstraints(currentBeat, microInstruction, commonSenseReview) {
        // 实现...
    }

    /**
     * 构建关系指南
     * @returns {string}
     */
    buildRelationshipGuide() {
        // 实现...
    }
}
```

**迁移方法**:
- `_buildRegularSystemPrompt()` → `PromptBuilder.buildRegularSystemPrompt()`
- `_buildHardcodedDirectorInstructions()` → `PromptBuilder.buildHardcodedDirectorInstructions()`
- `_buildStrictNarrativeConstraints()` → `PromptBuilder.buildStrictNarrativeConstraints()`
- `_buildRelationshipGuide()` → `PromptBuilder.buildRelationshipGuide()`
- `_formatMicroInstruction()` → `PromptBuilder.formatMicroInstruction()`

#### 7. **TextSanitizer.js** (文本清理)
**职责**: 清理AI生成的文本

```javascript
/**
 * 文本清理工具
 */
export class TextSanitizer {
    /**
     * 清理摘要文本中的乱码和占位符
     * @param {string} text - 原始文本
     * @returns {string} 清理后的文本
     */
    static sanitizeText(text) {
        if (!text || typeof text !== 'string') return "（暂无详细摘要）";
        if (text.includes('δ׫') || text.includes('дժ') ||
            text.trim().length < 5 ||
            text.includes("尚未撰写") ||
            text.includes("暂无")) {
            return "（暂无详细摘要）";
        }
        return text;
    }
}
```

**迁移方法**:
- `_sanitizeText()` → `TextSanitizer.sanitizeText()`

#### 8. **ChapterAnalyzer.js** (章节分析)
**职责**: 章节数据提取和分析

```javascript
/**
 * 章节分析工具
 */
export class ChapterAnalyzer {
    /**
     * 提取终章信标
     * @param {string} scriptText - 剧本文本
     * @returns {Array<string>} 信标列表
     */
    static extractEndgameBeacons(scriptText) {
        // 实现...
    }

    /**
     * 提取章节ID
     * @param {string} scriptText - 剧本文本
     * @returns {string|null} 章节ID
     */
    static extractChapterId(scriptText) {
        // 实现...
    }

    /**
     * 处理星标节拍
     * @param {Object} blueprint - 章节蓝图
     */
    static processStarMarkedBeats(blueprint) {
        // 实现...
    }
}
```

**迁移方法**:
- `_extractEndgameBeacons()` → `ChapterAnalyzer.extractEndgameBeacons()`
- `_extractChapterId()` → `ChapterAnalyzer.extractChapterId()`
- `_processStarMarkedBeats()` → `ChapterAnalyzer.processStarMarkedBeats()`

#### 9. **UserInteractionHandler.js** (用户交互处理)
**职责**: 处理用户交互逻辑

```javascript
/**
 * 用户交互处理器
 */
export class UserInteractionHandler {
    constructor(engine, dependencies) {
        this.engine = engine;
        this.deps = dependencies;
        this.logger = new DebugLogger('UserInteraction');
    }

    /**
     * 捕获提前规划输入
     * @param {Chapter} workingChapter - 工作章节
     * @param {jQuery} $button - 按钮元素
     * @returns {Promise<Object|null>} 玩家输入
     */
    async captureEarlyFocusInput(workingChapter, $button) {
        // 实现...
    }

    /**
     * 绑定停止按钮
     * @param {string} stageLabel - 阶段标签
     */
    bindStopButton(stageLabel) {
        // 实现...
    }

    /**
     * 处理停止转换请求
     * @param {string} stageLabel - 阶段标签
     * @param {jQuery} $button - 按钮元素
     */
    handleStopTransitionRequest(stageLabel, $button) {
        // 实现...
    }
}
```

**迁移方法**:
- `_captureEarlyFocusInput()` → `UserInteractionHandler.captureEarlyFocusInput()`
- `_bindStopButton()` → `UserInteractionHandler.bindStopButton()`
- `_handleStopTransitionRequest()` → `UserInteractionHandler.handleStopTransitionRequest()`

#### 10. **CleanupHandler.js** (清理处理器)
**职责**: 数据清理和错误恢复

```javascript
/**
 * 清理处理器
 */
export class CleanupHandler {
    constructor(engine, dependencies) {
        this.engine = engine;
        this.deps = dependencies;
        this.logger = new DebugLogger('CleanupHandler');
    }

    /**
     * 清理污染的leader数据
     * @returns {Object} 清理报告
     */
    cleanPollutedLeadersInChat() {
        // 实现...
    }

    /**
     * 清理转换停止后的状态
     */
    cleanupAfterTransitionStop() {
        // 实现...
    }

    /**
     * 检查是否请求停止
     * @param {string} stageLabel - 阶段标签
     * @throws {Error} 如果已请求停止
     */
    throwIfStopRequested(stageLabel) {
        // 实现...
    }
}
```

**迁移方法**:
- `_cleanPollutedLeadersInChat()` → `CleanupHandler.cleanPollutedLeadersInChat()`
- `_cleanupAfterTransitionStop()` → `CleanupHandler.cleanupAfterTransitionStop()`
- `_throwIfStopRequested()` → `CleanupHandler.throwIfStopRequested()`

---

## 详细接口定义

### 公共API保持不变

```javascript
/**
 * StoryBeatEngine - 叙事流引擎主类
 *
 * @public API - 这些方法必须保持签名不变
 */
export class StoryBeatEngine {
    /**
     * 构造函数
     * @param {Object} dependencies - 依赖注入
     * @param {Function} dependencies.info - 信息日志
     * @param {Function} dependencies.warn - 警告日志
     * @param {Function} dependencies.diagnose - 诊断日志
     * @param {Object} dependencies.toastr - Toast通知
     * @param {Object} dependencies.eventBus - 事件总线
     * @param {Object} dependencies.applicationFunctionManager - 应用功能管理器
     */
    constructor(dependencies) {
        // 初始化所有子模块
        this.deps = dependencies;
        this.logger = new DebugLogger('StoryBeatEngine');

        // 创建服务
        const { mainLlmService, conductorLlmService } = ServiceFactory.createServices(
            stateManager.getApiSettings(),
            { USER, EDITOR, LEADER }
        );
        this.mainLlmService = mainLlmService;
        this.conductorLlmService = conductorLlmService;

        // 创建管理器
        this.transitionManager = new TransitionManager(this, dependencies);
        this.stateUpdateManager = new StateUpdateManager(this, dependencies);
        this.promptBuilder = new PromptBuilder(this, dependencies);
        this.userInteractionHandler = new UserInteractionHandler(this, dependencies);
        this.cleanupHandler = new CleanupHandler(this, dependencies);

        // 保持原有的其他初始化逻辑...
    }

    /**
     * 启动引擎
     * @public
     */
    async start() {
        this.logger.log("叙事流引擎正在启动...");
        // 委托给各模块初始化...
    }

    /**
     * 重新分析世界书
     * @public
     */
    async reanalyzeWorldbook() {
        // 保持原有签名和行为...
    }

    /**
     * 重新生成章节蓝图
     * @public
     */
    async rerollChapterBlueprint() {
        // 保持原有签名和行为...
    }

    /**
     * 强制章节转换
     * @public
     */
    async forceChapterTransition() {
        // 委托给 TransitionManager
        const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
        if (!isEngineEnabled) {
            this.toastr.warning('叙事流引擎已关闭', '功能已禁用');
            return;
        }

        await this.transitionManager.forceChapterTransition();
    }

    /**
     * 设置叙事焦点
     * @public
     * @param {string} focusText - 焦点文本
     */
    setNarrativeFocus(focusText) {
        // 保持原有签名和行为...
    }

    /**
     * 保存角色编辑
     * @public
     * @param {string} charId - 角色ID
     * @param {Object} updatedChapterState - 更新后的章节状态
     */
    async saveCharacterEdit(charId, updatedChapterState) {
        // 保持原有签名和行为...
    }

    /**
     * 硬重置
     * @public
     */
    async hardReset() {
        // 保持原有签名和行为...
    }

    /**
     * 中止当前任务
     * @public
     */
    abortCurrentTask() {
        this.warn('收到外部强制中止指令！');
        this._transitionStopRequested = true;
        if (this.currentTaskAbortController) {
            this.currentTaskAbortController.abort();
        }
    }

    // 事件处理器 - 保持原有签名
    onPromptReady = async (eventData) => { /* ... */ }
    onCommitState = async (messageIndex) => { /* ... */ }
    onStateChange = () => { /* ... */ }
}
```

### 内部模块通信协议

```javascript
/**
 * 模块间通信接口规范
 */

// 1. 引擎状态枚举 (已存在于 constants.js，保持不变)
const ENGINE_STATUS = {
    IDLE: { value: 'idle', text: '空闲' },
    BUSY_PLANNING: { value: 'busy_planning', text: '规划中' },
    BUSY_TRANSITIONING: { value: 'busy_transitioning', text: '转换中' },
    BUSY_DIRECTING: { value: 'busy_directing', text: '等待导演指示' }
};

// 2. 模块构造函数统一接口
class BaseManager {
    /**
     * @param {StoryBeatEngine} engine - 主引擎引用
     * @param {Object} dependencies - 依赖注入
     */
    constructor(engine, dependencies) {
        this.engine = engine;
        this.deps = dependencies;
        this.logger = new DebugLogger(this.constructor.name);
    }
}

// 3. 错误处理统一格式
class SBTError extends Error {
    constructor(message, code, metadata = {}) {
        super(message);
        this.name = 'SBTError';
        this.code = code; // 例如: 'SBT_TRANSITION_STOP'
        this.metadata = metadata;
    }
}
```

---

## 实施路线图

### 🎯 阶段1：基础工具模块提取 (1-2天)
**目标**: 提取无依赖的工具类，立即减少主文件300行

**步骤**:
1. 创建文件结构
   ```bash
   mkdir -p src/utils src/services
   ```

2. 提取 `DebugLogger.js`
   - 复制5个调试方法到新文件
   - 在 `StoryBeatEngine` 中导入并使用
   - 运行测试验证日志输出正常

3. 提取 `TextSanitizer.js`
   - 复制 `_sanitizeText` 方法
   - 修改所有调用点为静态方法调用
   - 运行测试验证文本清理功能

4. 提取 `ChapterAnalyzer.js`
   - 复制3个提取方法
   - 转换为静态方法
   - 更新调用点

5. 提取 `ServiceFactory.js`
   - 复制 `_initializeCoreServices` 核心逻辑
   - 重构为工厂方法
   - 在 `constructor` 中使用新工厂

**验证清单**:
- [ ] 所有调试日志仍然正常输出
- [ ] 文本清理功能正常（检查UI中的摘要显示）
- [ ] 服务初始化成功（检查启动日志）
- [ ] 没有控制台错误
- [ ] 创世纪流程可以正常启动
- [ ] Git提交: `git commit -m "refactor: 提取基础工具模块"`

**预期成果**:
- `StoryBeatEngine.js`: 3514行 → ~3150行 (-364行)
- 新增4个工具模块
- 代码功能100%一致

---

### 🎯 阶段2：提示词构建模块 (2-3天)
**目标**: 提取最庞大的提示词构建逻辑，减少1000行

**步骤**:
1. 创建 `src/managers/PromptBuilder.js`

2. 迁移方法 (按依赖顺序):
   - `_buildRelationshipGuide()` (无内部依赖)
   - `_formatMicroInstruction()` (无内部依赖)
   - `_buildStrictNarrativeConstraints()` (依赖上面2个)
   - `_buildHardcodedDirectorInstructions()` (独立)
   - `_buildRegularSystemPrompt()` (依赖 `_buildRelationshipGuide`)

3. 更新 `StoryBeatEngine`:
   ```javascript
   constructor(dependencies) {
       // ...
       this.promptBuilder = new PromptBuilder(this, dependencies);
   }

   // 在需要的地方调用
   const systemPrompt = this.promptBuilder.buildRegularSystemPrompt();
   ```

4. 保持 `onPromptReady` 中的调用逻辑不变，只修改方法调用方式

**验证清单**:
- [ ] 提示词长度和格式与重构前一致
- [ ] 四层注入策略正常工作
- [ ] 回合执导指令正确生成
- [ ] 关系指南正确显示
- [ ] 高光时刻标记生效
- [ ] Git提交: `git commit -m "refactor: 提取提示词构建模块"`

**预期成果**:
- `StoryBeatEngine.js`: ~3150行 → ~2150行 (-1000行)
- `PromptBuilder.js`: ~900行

---

### 🎯 阶段3：状态更新模块 (2-3天)
**目标**: 提取状态更新逻辑，减少700行

**步骤**:
1. 创建 `src/managers/StateUpdateManager.js`

2. 迁移方法:
   - `_findStorylineAcrossCategories()` (工具方法)
   - `_applyStateUpdates()` (核心方法，最复杂)
   - `_consolidateChapterEvents()` (事件聚合)

3. 特别注意 `_applyStateUpdates` 的复杂依赖:
   - 调用 `deepmerge` (外部库，保持不变)
   - 修改 `workingChapter` (传入引用，保持语义)
   - 调用 `this.info/warn/diagnose` (通过 `this.deps` 访问)

4. 更新调用点:
   ```javascript
   // 在 triggerChapterTransition 中
   const updatedChapter = this.stateUpdateManager.applyStateUpdates(newChapter, reviewDelta);
   ```

**验证清单**:
- [ ] 角色状态更新正确
- [ ] 故事线状态更新正确
- [ ] 关系图谱更新正确
- [ ] 时间状态更新正确
- [ ] 宏观叙事弧光更新正确
- [ ] 文体档案合并正确
- [ ] 叙事控制塔更新正确
- [ ] Git提交: `git commit -m "refactor: 提取状态更新模块"`

**预期成果**:
- `StoryBeatEngine.js`: ~2150行 → ~1450行 (-700行)
- `StateUpdateManager.js`: ~700行

---

### 🎯 阶段4：章节转换模块 (3-4天)
**目标**: 提取最复杂的章节转换流程，减少900行

**步骤**:
1. 创建 `src/managers/TransitionManager.js`

2. 迁移方法 (按调用顺序):
   - `_planNextChapter()` (AI交互)
   - `startGenesisProcess()` (创世纪)
   - `triggerChapterTransition()` (核心流程)

3. 处理复杂依赖:
   - `currentChapter` 访问 → 通过 `this.engine.currentChapter`
   - `_setStatus()` 调用 → 通过 `this.engine._setStatus()`
   - `_applyStateUpdates()` → 通过 `this.engine.stateUpdateManager.applyStateUpdates()`
   - `_buildRelationshipGuide()` → 通过 `this.engine.promptBuilder.buildRelationshipGuide()`

4. 保持 AbortController 逻辑完整性

5. 更新公共API:
   ```javascript
   async forceChapterTransition() {
       await this.transitionManager.forceChapterTransition();
   }
   ```

**验证清单**:
- [ ] 创世纪流程完整运行
- [ ] 标准章节转换流程完整运行
- [ ] 断点恢复机制正常工作
- [ ] 史官复盘成功
- [ ] 建筑师规划成功
- [ ] 提前规划按钮功能正常
- [ ] 停止按钮功能正常
- [ ] 自由章模式正常工作
- [ ] 状态正确保存到消息
- [ ] Git提交: `git commit -m "refactor: 提取章节转换模块"`

**预期成果**:
- `StoryBeatEngine.js`: ~1450行 → ~650行 (-800行)
- `TransitionManager.js`: ~800行

---

### 🎯 阶段5：用户交互与清理模块 (1-2天)
**目标**: 提取剩余的辅助逻辑，完成重构

**步骤**:
1. 创建 `src/handlers/UserInteractionHandler.js`
   - 迁移 `_captureEarlyFocusInput()`
   - 迁移 `_bindStopButton()`
   - 迁移 `_handleStopTransitionRequest()`

2. 创建 `src/handlers/CleanupHandler.js`
   - 迁移 `_cleanPollutedLeadersInChat()`
   - 迁移 `_cleanupAfterTransitionStop()`
   - 迁移 `_throwIfStopRequested()`

3. 更新 `TransitionManager` 中的调用点

**验证清单**:
- [ ] 提前规划弹窗正常工作
- [ ] 停止按钮交互正常
- [ ] 数据清理功能正常
- [ ] 转换停止后清理正确
- [ ] Git提交: `git commit -m "refactor: 提取用户交互和清理模块"`

**预期成果**:
- `StoryBeatEngine.js`: ~650行 → ~400行 (-250行)
- `UserInteractionHandler.js`: ~250行
- `CleanupHandler.js`: ~150行

---

### 🎯 阶段6：最终整合与优化 (1-2天)
**目标**: 清理主引擎类，完成最终优化

**步骤**:
1. 审查 `StoryBeatEngine.js` 剩余代码
2. 将仅在一个模块使用的私有方法移到对应模块
3. 添加完整的JSDoc注释
4. 优化导入语句
5. 添加模块级的README文档

6. 创建 `src/README.md`:
   ```markdown
   # StoryBeatEngine 模块架构

   ## 模块职责
   - core/: 主引擎协调器
   - services/: 服务创建和管理
   - managers/: 业务流程管理器
   - utils/: 通用工具函数
   - handlers/: 特定场景处理器

   ## 数据流
   (图示...)

   ## 开发指南
   (规范...)
   ```

**验证清单**:
- [ ] 所有功能完整测试通过
- [ ] 代码风格一致
- [ ] JSDoc注释完整
- [ ] 没有代码重复
- [ ] 导入路径正确
- [ ] Git提交: `git commit -m "refactor: 完成模块化重构"`

**最终成果**:
- `StoryBeatEngine.js`: ~400行 (原始3514行的11%)
- 总模块数: 10个
- 代码功能: 100%一致
- 可维护性: 显著提升

---

## 测试验证清单

### 完整功能测试矩阵

| 功能模块 | 测试场景 | 验证点 | 通过标准 |
|---------|---------|--------|---------|
| **初始化** | 引擎启动 | 服务创建、Agent初始化 | 无控制台错误，UI正常显示 |
| **创世纪** | 新对话开篇 | 情报分析、建筑师规划、状态锚定 | 章节蓝图生成，状态保存成功 |
| **回合执导** | 发送用户消息 | 提示词注入、裁判执行 | AI回复符合剧本，日志正常 |
| **章节转换** | 手动触发转换 | 史官复盘、焦点弹窗、建筑师规划 | 新章节创建，状态正确更新 |
| **断点恢复** | 转换失败后重试 | 状态恢复、流程继续 | 从中断点正确恢复 |
| **提前规划** | 史官期间点击规划按钮 | 弹窗交互、输入记录 | 输入正确传递给建筑师 |
| **停止控制** | 点击停止按钮 | AI请求中止、状态清理 | 流程立即停止，无残留状态 |
| **热重载** | 重新分析世界书 | 静态数据更新、用户创建内容保护 | 新数据生效，用户内容不丢失 |
| **重roll** | 重新生成剧本 | 建筑师重新执行、蓝图更新 | 新剧本生成，UI刷新 |
| **自由章模式** | 选择自由探索 | 跳过建筑师、跳过裁判 | AI自由发挥，无剧本约束 |
| **高光时刻** | 触发★标记节拍 | 强制执行提示、详细演绎 | AI输出篇幅增加，质量提升 |
| **状态更新** | AI返回复杂Delta | 角色、故事线、关系图谱更新 | 所有字段正确应用 |
| **数据清理** | 检测污染数据 | 自动清理、保存Chat | 污染字段移除，无副作用 |
| **调试模式** | 开启sbt-debug-mode | 详细日志输出 | 日志结构清晰，信息完整 |

### 回归测试脚本

```javascript
/**
 * 手动回归测试清单
 * 在浏览器控制台中执行
 */

// 1. 测试调试日志
localStorage.setItem('sbt-debug-mode', 'true');
// 发送一条消息，检查控制台是否有详细日志

// 2. 测试创世纪
// 新建对话 → 发送消息 → 检查是否弹出情报分析提示 → 检查章节蓝图是否生成

// 3. 测试章节转换
// 点击"强制章节转换"按钮 → 等待史官复盘 → 输入焦点 → 等待建筑师 → 检查新章节UID

// 4. 测试停止控制
// 触发章节转换 → 在史官阶段点击"停止"按钮 → 检查流程是否立即中止

// 5. 测试热重载
// 修改世界书 → 点击"重新分析"按钮 → 检查状态是否更新

// 6. 测试状态持久化
// 刷新页面 → 检查状态是否从 leader 字段恢复

// 7. 检查UI
// 打开叙事罗盘 → 检查所有面板是否正常显示

console.log('✅ 如果所有测试都通过，重构成功！');
```

### 性能基准测试

**重构前后性能对比** (预期):
| 指标 | 重构前 | 重构后 | 变化 |
|------|--------|--------|------|
| 文件加载时间 | ~150ms | ~200ms | +33% (多个文件) |
| 引擎初始化时间 | ~50ms | ~50ms | 无变化 |
| 章节转换时间 | ~5s | ~5s | 无变化 (AI调用主导) |
| 内存占用 | ~15MB | ~15MB | 无变化 |
| 代码可读性 | 低 | 高 | 显著提升 ✅ |
| 维护成本 | 高 | 低 | 显著降低 ✅ |

---

## 风险评估与回滚方案

### 风险矩阵

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 模块间依赖错误 | 中 | 高 | 每阶段独立测试，Git分支隔离 |
| 调用栈变化影响性能 | 低 | 低 | 基准测试对比，JavaScript JIT优化 |
| 循环依赖 | 低 | 中 | 严格遵循依赖方向：utils → managers → core |
| 事件处理器断裂 | 低 | 高 | 保持事件名称和签名完全不变 |
| 状态丢失 | 极低 | 高 | 状态持久化逻辑完全不修改 |
| 用户数据污染 | 极低 | 极高 | 不修改任何数据结构，只重组代码 |

### 回滚方案

#### 快速回滚 (5分钟内)
```bash
# 回滚到重构前的版本
git checkout <pre-refactor-commit-hash>

# 或回滚到最后一个可工作的阶段
git checkout <phase-N-commit-hash>

# 如果已经部署，立即推送
git push -f origin main
```

#### 部分回滚 (保留部分模块)
```bash
# 只回滚特定文件
git checkout <commit-hash> -- StoryBeatEngine.js

# 保留已稳定的工具模块
# 只需删除有问题的管理器导入
```

#### 渐进式回滚 (逐阶段验证)
1. 先回滚阶段5和6 (用户交互、清理)
2. 如果问题仍存在，回滚阶段4 (章节转换)
3. 依次向前回滚，直到找到问题引入点

### 应急预案

**如果在生产环境发现严重Bug**:
1. 立即切换到备用分支 (保留重构前的版本)
2. 通知用户临时使用旧版本
3. 在开发环境修复问题
4. 充分测试后再次部署

**如果用户报告功能异常**:
1. 收集详细的复现步骤
2. 在对应的阶段分支中定位问题
3. 修复后单独提交补丁
4. 合并到主分支

---

## AI接手指南

### 快速上手清单

**如果你是接手这个项目的AI助手，请按以下步骤操作**:

#### 1. 了解当前进度
```bash
# 查看最新的Git提交
git log --oneline -10

# 查看文件结构
tree src/

# 查看哪些阶段已完成
grep -r "refactor:" .git/logs/HEAD
```

#### 2. 确认当前阶段
- 查看 [实施路线图](#实施路线图) 章节
- 找到最后一次提交对应的阶段
- 阅读该阶段的"验证清单"
- 运行测试确认当前状态稳定

#### 3. 继续下一阶段
- 阅读下一阶段的"步骤"部分
- 严格按照步骤执行
- 每完成一个小步骤就运行测试
- 遇到问题查阅 [风险评估](#风险评估与回滚方案)

#### 4. 关键注意事项

**必须遵守的规则**:
- ✅ 保持所有公共API签名不变
- ✅ 不修改数据结构格式
- ✅ 不修改事件名称
- ✅ 每个阶段独立提交Git
- ✅ 出现问题立即停止并回滚

**禁止的操作**:
- ❌ 跳过阶段或颠倒顺序
- ❌ 同时修改多个模块
- ❌ 修改核心数据模型 (Chapter, LEADER, etc.)
- ❌ 删除或重命名公共方法
- ❌ 改变依赖注入方式

### 常见问题解答

**Q: 如果测试失败怎么办？**
A: 立即回滚到上一个提交，检查差异，逐行验证修改。不要继续下一步。

**Q: 如果遇到循环依赖怎么办？**
A: 检查依赖方向是否正确：`utils → services → handlers → managers → core`。如果发现反向依赖，重新设计接口或使用依赖注入。

**Q: 如何处理跨模块的私有方法？**
A: 如果方法只在一个模块使用，移到该模块内部。如果多个模块使用，提升为工具函数或通过引擎引用传递。

**Q: 性能是否会受影响？**
A: 现代JavaScript引擎的JIT优化会内联小函数，额外的函数调用开销可忽略不计（<1ms）。AI调用是性能瓶颈，不是代码结构。

**Q: 如何验证重构正确性？**
A: 对比重构前后的行为：
1. 控制台日志的数量和内容应该一致
2. UI显示应该完全相同
3. 网络请求的参数应该一致
4. 状态保存的JSON结构应该一致

### 调试技巧

**如果遇到 "xxx is not a function" 错误**:
```javascript
// 检查导入路径
console.log('导入的对象:', SomeManager);

// 检查方法是否存在
console.log('方法列表:', Object.getOwnPropertyNames(SomeManager.prototype));

// 检查this绑定
console.log('this是什么:', this);
```

**如果状态更新异常**:
```javascript
// 在 _applyStateUpdates 开头添加
console.log('Delta输入:', JSON.parse(JSON.stringify(delta)));
console.log('章节输入:', JSON.parse(JSON.stringify(workingChapter.toJSON())));

// 在结尾添加
console.log('章节输出:', JSON.parse(JSON.stringify(workingChapter.toJSON())));
```

**如果提示词格式错误**:
```javascript
// 在 onPromptReady 中添加
console.log('Placeholder内容长度:', {
    instruction: instructionPlaceholder.content.length,
    recall: recallPlaceholder.content.length,
    script: scriptPlaceholder.content.length,
    rules: rulesPlaceholder.content.length
});
```

### 代码审查清单

**每次提交前检查**:
- [ ] 文件头部注释完整（文件职责、作者、日期）
- [ ] 所有公共方法有JSDoc注释
- [ ] 没有console.log调试代码残留
- [ ] 没有TODO/FIXME注释
- [ ] 导入语句按字母排序
- [ ] 代码风格符合项目规范
- [ ] Git提交信息格式正确：`refactor: 描述`
- [ ] 本地测试全部通过

---

## 附录

### A. 完整文件结构

```
st-beat-tracker/
├── StoryBeatEngine.js (重构后, ~400行)
│
├── src/
│   ├── core/
│   │   └── (未来可扩展: EngineCore.js)
│   │
│   ├── services/
│   │   ├── ServiceFactory.js (~120行)
│   │   └── AbortControllerManager.js (~80行)
│   │
│   ├── managers/
│   │   ├── TransitionManager.js (~800行)
│   │   ├── StateUpdateManager.js (~700行)
│   │   ├── PromptBuilder.js (~900行)
│   │   └── EventCoordinator.js (~400行)
│   │
│   ├── utils/
│   │   ├── DebugLogger.js (~100行)
│   │   ├── TextSanitizer.js (~60行)
│   │   └── ChapterAnalyzer.js (~150行)
│   │
│   ├── handlers/
│   │   ├── UserInteractionHandler.js (~250行)
│   │   └── CleanupHandler.js (~150行)
│   │
│   └── README.md (模块架构说明)
│
├── REFACTORING_PLAN.md (本文档)
├── CHANGELOG.md (重构历史记录)
└── (其他现有文件保持不变)
```

### B. 术语表

| 术语 | 含义 | 英文 |
|------|------|------|
| 引擎 | StoryBeatEngine核心系统 | Engine |
| 章节 | 故事的一个阶段单元 | Chapter |
| 节拍 | 章节内的情节点 | Beat |
| 史官 | 历史复盘AI (HistorianAgent) | Historian |
| 建筑师 | 章节规划AI (ArchitectAgent) | Architect |
| 回合裁判 | 执导AI (TurnConductorAgent) | Conductor |
| 情报员 | 分析AI (IntelligenceAgent) | Intelligence |
| 领袖 | 临时消息对象 | LEADER |
| 用户 | 用户代理对象 | USER |
| 编辑器 | 编辑器代理对象 | EDITOR |
| Delta | 状态增量/变化 | Delta |
| 静态矩阵 | 静态设定数据 | staticMatrices |
| 动态状态 | 动态变化数据 | dynamicState |

### C. 参考资源

- [单一职责原则](https://en.wikipedia.org/wiki/Single-responsibility_principle)
- [依赖注入模式](https://en.wikipedia.org/wiki/Dependency_injection)
- [门面模式](https://en.wikipedia.org/wiki/Facade_pattern)
- [工厂模式](https://en.wikipedia.org/wiki/Factory_method_pattern)

---

## 文档维护

**本文档由以下AI维护**:
- 创建者: Claude (Anthropic, 2025-12-07)
- 更新规则: 每完成一个阶段后更新"当前进度"标记

**如需修改本文档**:
1. 保持结构不变
2. 更新"文档版本"号
3. 在"文档维护"部分记录修改历史
4. 提交Git: `git commit -m "docs: 更新重构文档"`

---

**文档结束** | 总字数: ~12000字 | 预计阅读时间: 30分钟
