# 叙事流引擎（SBT / st-beat-tracker）工作原理总览

本文件面向后续长期维护，目标是统一解释插件的工作流、数据模型与核心机制，确保未来优化时不偏离原设计初衷。文中描述基于当前代码结构（manifest.json、index.js、StoryBeatEngine.js、src/**、ai/**、ui/**）。

---

## 1. 插件定位与目标

SBT 是一个面向 SillyTavern 的剧情优化与章节化叙事引擎。它通过“导演团队式”的多 Agent 管线，将传统一次性对话变成可持续、可推进、可记忆的长篇叙事。核心目标：

- 持久记忆：把剧情状态持久化到聊天记录与本地静态数据库中。
- 节奏可控：用“叙事控制塔 + 节奏环”驱动长线节奏与高潮安排。
- 剧情可规划：以章节蓝图（chapter blueprint）为结构化“剧本”，避免跑偏。
- 互动增强：把玩家意图作为最高优先级，引导 AI 在互动中推进剧情。

---

## 2. 总体架构（模块级视角）

### 2.1 入口与生命周期

- manifest.json：注册插件入口 index.js 与 UI 资源。
- index.js：SillyTavern APP_READY 后启动引擎与 UI。
- StoryBeatEngine.js：引擎核心，负责事件监听、Prompt 注入、章节转换、任务协调。

### 2.2 核心引擎与子系统

- StoryBeatEngine
  - 监听聊天事件，注入提示词。
  - 管理“创世纪 / 章节转换 / 热重载”等流程。
  - 维护当前章节状态与锁机制。
- TransitionManager
  - 负责创世纪与章节切换的完整流程（含可断点恢复）。
- StateUpdateManager
  - 将史官输出的 Delta 事务写入 Chapter（强校验与防污染）。
- NarrativeControlTowerManager
  - 节奏控制塔（节奏环、冷却、故事线进度与指令生成）。
- EntityContextManager
  - 召回实体数据（按需 or 全量），并进行缓存。

### 2.3 AI 代理团队

- IntelligenceAgent（情报官）
  - 创世纪时解析世界书与主角信息，生成 staticMatrices（静态数据库）。
- ArchitectAgent（建筑师）
  - 生成章节蓝图（plot beats、设计笔记）。
- HistorianAgent（史官）
  - 复盘本章文本，输出状态增量（creations / updates / summaries / rhythm）。
- TurnConductorAgent（回合裁判）
  - 每回合判断“当前节拍位置 + 基调纠正 + 转章触发”。

### 2.4 UI 层

- ui/uiManager.js：抽屉面板与交互。
- ui/renderers.js：渲染故事摘要、角色档案、故事线进度、关系图谱等。
- UI 支持编辑章节蓝图、故事线、摘要并回写状态。

---

## 3. 数据模型（Chapter 为核心）

Chapter 是整个系统的“世界快照”，每章为一份完整状态树。

### 3.1 Chapter 顶层结构

- uid：章节唯一 ID
- characterId：绑定角色 ID
- staticMatrices：静态设定（世界书解析结果 + 人工编辑）
  - characters / worldview / storylines / relationship_graph
- dynamicState：动态状态（随章节推进不断变化）
  - characters / worldview / storylines
  - chronology：时段与天数推进
  - stylistic_archive：文体消耗记录（避免重复意象）
- meta：全局叙事控制层
  - longTermStorySummary：累积故事摘要
  - narrative_control_tower：节奏控制塔数据
  - freeRoamMode：自由章模式开关
- chapter_blueprint：建筑师生成的本章“剧本蓝图”
- activeChapterDesignNotes：建筑师设计笔记
- playerNarrativeFocus：玩家设定的本章焦点

### 3.2 静态 vs 动态数据边界

- 静态：世界书推导结果，原则上不随剧情自然变化（除非玩家或史官显式更新）。
- 动态：章节内的进度推进、关系好感变化、时间流逝等。

### 3.3 叙事控制塔（Narrative Control Tower）

控制塔是“节奏中枢”，包括：

- 节奏环（Inhale / Hold / Exhale / Pause）相位与循环计数
- 最近章节强度记录
- 故事线进度量化追踪
- 叙事手法冷却（如 spotlight_protocol）
- Rhythm Directive（节奏指令）
  - 强制冷却 / 强度范围 / 章节类型建议 / 即将触发阈值

---

## 4. 持久化与缓存策略

### 4.1 聊天记录锚定（Leader）

引擎将 Chapter 序列化后写入最近的 AI 消息：

- onCommitState 在消息渲染后执行锚定。
- 这使得剧情状态随聊天记录保存，实现跨会话持久记忆。
- 章节规划时，建筑师读取最近一条带 leader 的消息正文作为衔接参考。

### 4.2 全局临时状态（LEADER）

通过 chatMetadata.leader 保存：

- pendingTransition（章节转换断点恢复）
- earlyPlayerInput（提前规划焦点）

### 4.3 静态数据库缓存

StaticDataManager 使用 localStorage 保存：

- sbt-static-character-database：角色静态设定缓存
- 作用：即使聊天未开始，也能预览与编辑世界设定

### 4.4 设置与提示词配置

- API 设置优先保存到 extension_settings（云端），否则降级到 localStorage。
- 自定义 Prompt 保存在 localStorage：
  - sbt-architect-prompt-custom
  - sbt-conductor-prompt-custom
- 叙事模式保存到角色卡 extensions（角色专属）。

---

## 5. API 与双轨服务

引擎默认采用双轨制服务：

- 主服务：负责 Intelligence / Architect / Historian
- 回合裁判服务：负责 TurnConductor

LLMApiService 支持三种策略：

1) direct_openai：前端直接调用
2) sillytavern_proxy_openai：通过 ST 后端代理
3) sillytavern_preset：使用 ST 预设配置

模型列表由 modelManager 在设置面板中按策略获取并缓存。

---

## 6. 核心运行流程（回合级）

触发点：SillyTavern CHAT_COMPLETION_PROMPT_READY

### 6.1 输入守卫与锁

- isConductorActive 与 watchdog 防止事件风暴。
- 引擎总开关 sbt-engine-enabled 可直接停机。

### 6.2 五层 Prompt 注入（从高到低优先级）

注入基于占位符系统实现，最终进入 ST 的 prompt 序列。

1) 剧透封锁 / 基调纠正层
   - 来自 TurnConductor 的 narrative_hold 与 tone_correction
2) 回合执导指令层
   - 系统硬编码的导演指令（PromptBuilder.buildHardcodedDirectorInstructions）
3) 实体召回层
   - 按需召回模式：章节级 + 回合级动态实体
   - 全量注入模式：一次性注入全部世界设定
4) 章节蓝图层（带信息迷雾）
   - _applyBlueprintMask 屏蔽未来节拍，避免剧透
   - 玩家补充意见（player_supplement）置顶优先
5) 通用法则层
   - DIRECTOR_RULEBOOK_PROMPT + 好感度行为矩阵

### 6.3 回合裁判（TurnConductor）

TurnConductorAgent 的输出关键字段：

- current_beat_idx：当前节拍定位
- tone_correction：基调纠正指令（如偏离剧情）
- narrative_hold：禁止剧透与推进禁令
- realtime_context_ids：本回合需额外召回的实体
- status：若 current_beat_idx 为最后节拍 → 触发章节转换

---

## 7. 创世纪流程（Genesis）

入口：UI 触发 startGenesisProcess

### 7.1 数据来源优先级（三级降级）

1) 静态数据库缓存（StaticDataManager）
2) 内存中的 Chapter
3) 实时 AI 分析（IntelligenceAgent）

### 7.2 世界书条目来源

通过 genesis-worldbook 支持两种模式：

- 自动模式：角色绑定世界书
- 手动精选：用户挑选世界书条目

### 7.3 生成流程

1) IntelligenceAgent 生成 staticMatrices
2) 玩家输入叙事焦点（可选择 Free Roam / ABC 沉浸）
3) ArchitectAgent 生成第一章蓝图
4) 若无开场白：系统生成“纯环境描写”开场
5) 状态锚定到第一条 AI 消息

---

## 8. 章节转换流程（Chapter Transition）

触发来源：

- TurnConductor 检测最后节拍
- UI 手动触发（叙事罗盘按钮）

### 8.1 史官复盘（Historian）

1) 从上一锚点到终点索引抽取章节对话（{{user}} / {{char}} 标记）
2) HistorianAgent 输出 Delta（creations / updates / summaries / rhythm）
3) Delta 经 StateUpdateManager 应用到新 Chapter

### 8.2 玩家焦点输入

支持“提前规划”按钮并行输入，减少等待。

### 8.3 建筑师规划新章

ArchitectAgent 输出：

- chapter_blueprint
- design_notes

### 8.4 断点恢复与安全机制

- pendingTransition 记录进度，可恢复中断阶段
- AbortController 支持强制中止
- 停止按钮会立即终止所有 AI 请求

---

## 9. 状态更新与防污染机制

StateUpdateManager 负责 Delta 应用，具备多层防线：

- 故事线分类校验：防止 ID 落错分类
- 禁止 AI 创建 personal/relationship arcs
- 关系双向同步（防止关系孤岛）
- 历史记录简化：避免 UI 过长
- 关系图谱更新兼容（支持扁平/嵌套结构）
- 文体档案合并（避免重复意象）

同时自动更新：

- longTermStorySummary（按章条状摘要，每行一条，单条不超过40字）
- chronology（时间推进）

---

## 10. 叙事控制塔（节奏驱动）

史官输出的 rhythm_assessment 进入控制塔：

- 更新节奏相位与周期
- 记录章节强度曲线
- 生成下一章节奏指令（rhythm_directive）
- 检测故事线进度失衡与阈值事件

---

## 11. 实体召回系统

两种模式：

1) 按需召回（默认）
   - Architect 在蓝图中生成 chapter_context_ids
   - TurnConductor 输出 realtime_context_ids（回合级）
2) 全量注入
   - 直接注入全部世界设定

EntityContextManager 负责实体检索与缓存：

- 缓存命中可显著减少重复注入
- 支持 NEW: 前缀的新实体规划

---

## 12. UI 交互与编辑体系

抽屉式 UI 提供三类能力：

- 监控面板
  - 故事摘要、章节剧本、设计笔记、故事线进度、关系图谱
- 叙事罗盘
  - 开关引擎 / 回合裁判 / 章节转换
  - 章节重 roll / 叙事焦点调整
- 设置与管理
  - API 设置、模型列表、Prompt 管理
  - 静态数据库浏览 / 删除 / 清空

UI 支持直接编辑：

- 蓝图节拍内容
- 故事线历史记录
- 章节摘要
- 角色档案与世界观条目

---

## 13. 运行开关与常用标记

- sbt-engine-enabled：引擎总开关
- sbt-conductor-enabled：回合裁判开关
- sbt-entity-recall-enabled：实体按需召回开关
- sbt-focus-popup-enabled：章节转换时焦点弹窗开关

---

## 14. 可扩展点（未来优化方向）

建议后续扩展沿以下方向保持一致性：

- 新增 Agent：遵循 Agent 抽象，注入 LLM 服务后统一执行。
- 新增状态字段：优先挂载到 Chapter.meta 或 dynamicState。
- 新增 UI 面板：统一走 eventBus + updateDashboard 刷新机制。
- 新增节奏策略：优先在 NarrativeControlTowerManager 扩展。

---

## 15. 小结

SBT 的核心价值在于：
用结构化“章节蓝图 + 史官审计 + 节奏控制塔”将 AI 互动小说从“即时对话”升级为“连续叙事”。
这套体系保证了记忆持久、剧情推进、互动可控、节奏有序，并且允许玩家始终以导演身份参与叙事走向。

本文件应作为长期传承文档，若有架构变动，请同步更新对应章节。
Generate entered
index.js:20 [QR2] calling {args: Array(1), functionToCall: ƒ}
script.js:3705 Core/all messages: 6/6
world-info.js:4714 [WI] Adding 2 entries to prompt (2) [{…}, {…}]
index.js:20 [QR2] calling {args: Array(1), functionToCall: ƒ}
script.js:3768 skipWIAN not active, adding WIAN
logger.js:40 [SBT] PROBE [PROMPT-READY-ENTRY]: onPromptReady 事件触发。当前锁状态: false
logger.js:40 [SBT] [SBE DEBUG] Chapter State Snapshot (Before Turn): {uid: 'chapter_1771936511877_vwvmk9g79', characterId: '6', staticMatrices: {…}, dynamicState: {…}, meta: {…}, …}
logger.js:40 [SBT] ✅ 同步检查通过并成功上锁，即将执行分离式注入...
logger.js:40 [SBT] 同步占位完成（5层注入：剧透封锁/指令/召回/剧本/法则）。即将进入异步处理阶段...
logger.js:40 [SBT] 异步处理流程启动...
logger.js:40 [StateManager] 角色卡未设置叙事模式，使用默认值: 宝可梦
logger.js:40 [SBT] [UIManager] 接收到 'CHAPTER_UPDATED' 事件，正在刷新仪表盘...
logger.js:40 [SBT] 状态已从leader消息恢复，UI已刷新
logger.js:40 [SBT] 裁判模式已开启。正在执行回合指挥官...
DebugLogger.js:63 [ENGINE-V2-PROBE] 准备 TurnConductor 输入上下文
sbtConsole.js:25 [SBT-DIAGNOSE] TurnConductor Prompt V11.0
logger.js:70 [LLMApiService] 策略: SillyTavern 代理模式
logger.js:70 [LLMApiService] [代理-调试] 发送到 SillyTavern 后端的参数: {stream: false, messages: '1 条消息', max_tokens: 63000, model: 'gemini-2.5-pro', temperature: 1, …}
inject.js:1004 APP_READY undefined
logger.js:70 [LLMApiService] 策略: SillyTavern 代理模式
logger.js:70 [LLMApiService] [代理-调试] 发送到 SillyTavern 后端的参数: {stream: false, messages: '1 条消息', max_tokens: 63000, model: 'gemini-2.5-pro', temperature: 1, …}
logger.js:70 [LLMApiService] [代理-调试] SillyTavern 后端响应: {id: 'req_1771943587486_6432hvtc9', object: 'chat.completion', created: 1771943633, model: 'gemini-2.5-pro', choices: Array(1), …}
sbtConsole.js:13 [SBT-INFO] [JSON Extractor] V2: Found and extracted JSON from a precise markdown code block.
sbtConsole.js:22 [CONDUCTOR-V11-OUTPUT] Navigation + GPS/Tone Output
logger.js:40 [SBT] --- TurnConductor V11.0 --- Navigation Gate + GPS/Tone DONE
logger.js:40 [SBT] [PROBE][CONDUCTOR-V10] 收到回合裁判的GPS定位与基调检查: {navigation_decision: 'SWITCH', reasoning: '用户输入“继续”是明确的推进指令，表示其希望执行当前节拍（index 0）的核心事件，即从门外进入大厅并与乔伊互动，而非在门外进行额外探索。因此判定为“切换”以推进剧情。', logic_safety_warning: 'NONE', status: '继续', current_beat_idx: 0, …}
logger.js:40 [SBT] [PROBE][NAVIGATION] decision=SWITCH, current=0, effective=1
DebugLogger.js:63 [ENGINE-V2-PROBE] 实时上下文召回流程
logger.js:40 [SBT] [SBT-INFO] ○ 第0层无需基调纠正
logger.js:40 [SBT] [SBT-INFO] ✓ 第1层剧透封锁已注入
DebugLogger.js:63 [ENGINE-FREE-ROAM] 生成完整世界观档案
logger.js:40 [SBT] ✓ [全量注入] 所有世界实体已一次性注入
DebugLogger.js:63 [ENGINE-V9-DEBUG] 第2层召回内容验证
sbtConsole.js:22 [信息迷雾] 剧本动态掩码处理
logger.js:40 [SBT] Chapter blueprint omitted.
DebugLogger.js:63 [ENGINE-V4.1-DEBUG] 剧本动态掩码验证
DebugLogger.js:63 [ENGINE-V3-DEBUG] 第3层蓝图内容验证
logger.js:40 [SBT] [V3.2] Core rules omitted.
logger.js:40 [SBT] [Watchdog] 成功注入，已更新执行时间戳。
logger.js:40 [SBT] [Lock] Prompt注入流程执行完毕，会话锁已立即释放。
handler.ts:190 [Prompt Template] start generate after 33 messages
handler.ts:295 [Prompt Template] processing 33 messages in 2ms
prompts.ts:72 [Prompt Template] processing send result: 10498 tokens and 20338 chars
inject.js:1004 APP_READY undefined
index.js:20 [QR2] calling {args: Array(2), functionToCall: ƒ}
logger.js:40 [SBT] PROBE [COMMIT-1]: onCommitState 事件触发，消息索引: 6。检查待办任务... {isGenesisPending: false, isTransitionPending: false}
logger.js:40 [SBT] [UIManager] 接收到 'CHAPTER_UPDATED' 事件，正在刷新仪表盘...
logger.js:40 [SBT] PROBE [COMMIT-BEAT]: currentBeatIndex -> 1 (anchor=4)
logger.js:40 [GenesisSource-UI] 角色已切换，重新加载创世纪资料源配置
script.js:3394 Generate entered
script.js:3705 Core/all messages: 7/7
world-info.js:4714 [WI] Hypothetically adding 2 entries to prompt (2) [{…}, {…}]
script.js:3768 skipWIAN not active, adding WIAN
logger.js:40 [SBT] PROBE [PROMPT-READY-ENTRY]: onPromptReady 事件触发。当前锁状态: false
logger.js:40 [SBT] [SBE DEBUG] Chapter State Snapshot (Before Turn): {uid: 'chapter_1771936511877_vwvmk9g79', characterId: '6', staticMatrices: {…}, dynamicState: {…}, meta: {…}, …}
logger.js:40 [SBT] PROBE [PROMPT-READY-ENTRY]: onPromptReady 事件触发。当前锁状态: false
logger.js:40 [SBT] [SBE DEBUG] Chapter State Snapshot (Before Turn): {uid: 'chapter_1771936511877_vwvmk9g79', characterId: '6', staticMatrices: {…}, dynamicState: {…}, meta: {…}, …}
inject.js:1004 APP_READY undefined分割线分割线分割线分割线APP_READY undefined
logger.js:70 [LLMApiService] [代理-调试] SillyTavern 后端响应: {id: 'req_1771945983003_id5a3tt82', object: 'chat.completion', created: 1771946006, model: 'gemini-2.5-pro', choices: Array(1), …}
sbtConsole.js:13 [SBT-INFO] [JSON Extractor] V2: Found and extracted JSON from a precise markdown code block.
sbtConsole.js:22 [CONDUCTOR-V11-OUTPUT] Navigation + GPS/Tone Output
logger.js:40 [SBT] --- TurnConductor V11.0 --- Navigation Gate + GPS/Tone DONE
logger.js:40 [SBT] [PROBE][CONDUCTOR-V10] 收到回合裁判的GPS定位与基调检查: {navigation_decision: 'STAY', reasoning: '用户输入“继续”，意为推进剧情。但当前节拍1（奥兰多的质问）的核心事件尚未展开，AI仅完成了角色的登场。根据“伪完成判定”规则，必须先完整演绎当前节拍的内容，因此判定为“停留”以完成该节拍的互动。', logic_safety_warning: 'NONE', status: '继续', current_beat_idx: 1, …}
logger.js:40 [SBT] [PROBE][NAVIGATION] decision=STAY, current=1, effective=1
DebugLogger.js:63 [ENGINE-V2-PROBE] 实时上下文召回流程
logger.js:40 [SBT] [SBT-INFO] ○ 第0层无需基调纠正
logger.js:40 [SBT] [SBT-INFO] ✓ 第1层剧透封锁已注入
DebugLogger.js:63 [ENGINE-FREE-ROAM] 生成完整世界观档案
logger.js:40 [SBT] ✓ [全量注入] 所有世界实体已一次性注入
DebugLogger.js:63 [ENGINE-V9-DEBUG] 第2层召回内容验证
sbtConsole.js:22 [信息迷雾] 剧本动态掩码处理
logger.js:40 [SBT] Chapter blueprint omitted.
DebugLogger.js:63 [ENGINE-V4.1-DEBUG] 剧本动态掩码验证
DebugLogger.js:63 [ENGINE-V3-DEBUG] 第3层蓝图内容验证
logger.js:40 [SBT] [V3.2] Core rules omitted.
logger.js:40 [SBT] [Watchdog] 成功注入，已更新执行时间戳。
logger.js:40 [SBT] [Lock] Prompt注入流程执行完毕，会话锁已立即释放。
handler.ts:190 [Prompt Template] start generate after 35 messages
handler.ts:295 [Prompt Template] processing 35 messages in 8ms
prompts.ts:72 [Prompt Template] processing send result: 11431 tokens and 21795 chars
inject.js:1004 APP_READY undefined
index.js:3680 [shujuku_v104] ACU GENERATION_ENDED event for message_id: 9
index.js:3680 [shujuku_v104] New message event (GENERATION_ENDED) detected for ACU, debouncing for 500ms...
script.js:3394 Generate entered
script.js:3705 Core/all messages: 9/9
world-info.js:4714 [WI] Hypothetically adding 2 entries to prompt (2) [{…}, {…}]
script.js:3768 skipWIAN not active, adding WIAN
index.js:20 [QR2] calling {args: Array(2), functionToCall: ƒ}
logger.js:40 [SBT] PROBE [COMMIT-1]: onCommitState 事件触发，消息索引: 8。检查待办任务... {isGenesisPending: false, isTransitionPending: false}
logger.js:40 [SBT] PROBE [COMMIT-2-SKIP]: 无待处理的创世纪或转换任务。
logger.js:40 [GenesisSource-UI] 角色已切换，重新加载创世纪资料源配置
index.js:3680 [shujuku_v104] Debounced new message processing triggered for ACU.
index.js:3680 [shujuku_v104] ACU Loaded 9 messages for: 宝可梦 - 2026-02-24@01h37m41s.
index.js:3680 [shujuku_v104] ACU Auto-Trigger: Starting independent check...
index.js:3680 [shujuku_v104] ACU: AI Message count increased (0 -> 5). Waiting 2000ms...
logger.js:40 [SBT] PROBE [PROMPT-READY-ENTRY]: onPromptReady 事件触发。当前锁状态: false
logger.js:40 [SBT] [SBE DEBUG] Chapter State Snapshot (Before Turn): {uid: 'chapter_1771936511877_vwvmk9g79', characterId: '6', staticMatrices: {…}, dynamicState: {…}, meta: {…}, …}
logger.js:40 [SBT] PROBE [PROMPT-READY-ENTRY]: onPromptReady 事件触发。当前锁状态: false
logger.js:40 [SBT] [SBE DEBUG] Chapter State Snapshot (Before Turn): {uid: 'chapter_1771936511877_vwvmk9g79', characterId: '6', staticMatrices: {…}, dynamicState: {…}, meta: {…}, …}
inject.js:1004 APP_READY undefined
script.js:3394 Generate entered
script.js:3705 Core/all messages: 9/9
world-info.js:4714 [WI] Hypothetically adding 2 entries to prompt (2) [{…}, {…}]
script.js:3768 skipWIAN not active, adding WIAN
logger.js:40 [SBT] PROBE [PROMPT-READY-ENTRY]: onPromptReady 事件触发。当前锁状态: false
logger.js:40 [SBT] [SBE DEBUG] Chapter State Snapshot (Before Turn): {uid: 'chapter_1771936511877_vwvmk9g79', characterId: '6', staticMatrices: {…}, dynamicState: {…}, meta: {…}, …}
logger.js:40 [SBT] PROBE [PROMPT-READY-ENTRY]: onPromptReady 事件触发。当前锁状态: false
logger.js:40 [SBT] [SBE DEBUG] Chapter State Snapshot (Before Turn): {uid: 'chapter_1771936511877_vwvmk9g79', characterId: '6', staticMatrices: {…}, dynamicState: {…}, meta: {…}, …}
index.js:3680 [shujuku_v104] ACU Auto-Trigger: Database is empty (First Floor scenario). Will use normal frequency-based update logic.
index.js:3680 [shujuku_v104] [Trigger Check] Table: 全局数据表, TotalAI: 5, Skip: 0, LastUpdated: 0, Unrecorded: 5, Freq: 1
index.js:3680 [shujuku_v104] [Trigger Check] EffIndicesLen: 5, StartIndex: 0
index.js:3680 [shujuku_v104] [Trigger Check] Unupdated: 5, ContextScope: 3
index.js:3680 [shujuku_v104] [Trigger Check] Table: 主角信息, TotalAI: 5, Skip: 0, LastUpdated: 0, Unrecorded: 5, Freq: 1
index.js:3680 [shujuku_v104] [Trigger Check] EffIndicesLen: 5, StartIndex: 0
index.js:3680 [shujuku_v104] [Trigger Check] Unupdated: 5, ContextScope: 3
index.js:3680 [shujuku_v104] [Trigger Check] Table: 重要人物表, TotalAI: 5, Skip: 0, LastUpdated: 0, Unrecorded: 5, Freq: 1
index.js:3680 [shujuku_v104] [Trigger Check] EffIndicesLen: 5, StartIndex: 0
index.js:3680 [shujuku_v104] [Trigger Check] Unupdated: 5, ContextScope: 3
index.js:3680 [shujuku_v104] [Trigger Check] Table: 主角技能表, TotalAI: 5, Skip: 0, LastUpdated: 0, Unrecorded: 5, Freq: 1
index.js:3680 [shujuku_v104] [Trigger Check] EffIndicesLen: 5, StartIndex: 0
index.js:3680 [shujuku_v104] [Trigger Check] Unupdated: 5, ContextScope: 3
index.js:3680 [shujuku_v104] [Trigger Check] Table: 背包物品表, TotalAI: 5, Skip: 0, LastUpdated: 0, Unrecorded: 5, Freq: 1
index.js:3680 [shujuku_v104] [Trigger Check] EffIndicesLen: 5, StartIndex: 0
index.js:3680 [shujuku_v104] [Trigger Check] Unupdated: 5, ContextScope: 3
index.js:3680 [shujuku_v104] [Trigger Check] Table: 任务与事件表, TotalAI: 5, Skip: 0, LastUpdated: 0, Unrecorded: 5, Freq: 1
index.js:3680 [shujuku_v104] [Trigger Check] EffIndicesLen: 5, StartIndex: 0
index.js:3680 [shujuku_v104] [Trigger Check] Unupdated: 5, ContextScope: 3
index.js:3680 [shujuku_v104] [Trigger Check] Table: 总结表, TotalAI: 5, Skip: 0, LastUpdated: 0, Unrecorded: 5, Freq: 1
index.js:3680 [shujuku_v104] [Trigger Check] EffIndicesLen: 5, StartIndex: 0
index.js:3680 [shujuku_v104] [Trigger Check] Unupdated: 5, ContextScope: 3
index.js:3680 [shujuku_v104] [Trigger Check] Table: 总体大纲, TotalAI: 5, Skip: 0, LastUpdated: 0, Unrecorded: 5, Freq: 1
index.js:3680 [shujuku_v104] [Trigger Check] EffIndicesLen: 5, StartIndex: 0
index.js:3680 [shujuku_v104] [Trigger Check] Unupdated: 5, ContextScope: 3
index.js:3680 [shujuku_v104] [Trigger Check] Table: 选项表, TotalAI: 5, Skip: 0, LastUpdated: 0, Unrecorded: 5, Freq: 1
index.js:3680 [shujuku_v104] [Trigger Check] EffIndicesLen: 5, StartIndex: 0
index.js:3680 [shujuku_v104] [Trigger Check] Unupdated: 5, ContextScope: 3
index.js:3680 [shujuku_v104] [Parallel] Processing group update for sheets: 全局数据表, 主角信息, 重要人物表, 主角技能表, 背包物品表, 任务与事件表, 总结表, 总体大纲, 选项表
index.js:3680 [shujuku_v104] [auto_independent] Processing 3 updates in 1 batches of size 3 (标准表模式). Target Sheets: 9
index.js:3680 [shujuku_v104] [Batch 1] Using chat sheet guide as merge base.
index.js:3680 [shujuku_v104] [Batch 1] Loaded 0/9 tables from history before index 4. Missing tables will use template structure (header-only).
index.js:3680 [shujuku_v104] [Batch 1] Adjusted slice start to 3 to include preceding user message.
index.js:3680 [shujuku_v104] Notifying 0 callbacks about table fill start.
index.js:3680 [shujuku_v104] Starting to get combined worldbook content with advanced logic...
index.js:3680 [shujuku_v104] Worldbook recursion stabilized after 1 passes.
index.js:3680 [shujuku_v104] Combined worldbook content generated, length: 1207. 2 entries triggered.
index.js:3680 [shujuku_v104] [填表] $U (persona_description) 获取结果: 成功
index.js:3680 [shujuku_v104] [填表] $C (char_description) 获取结果: 为空
index.js:3680 [shujuku_v104] [剧情推进] [Plot] getPlotFromHistory_ACU 被调用，聊天记录长度: 9
index.js:3680 [shujuku_v104] [剧情推进] [Plot] 当前预设名称: 缝合怪Rebron V 铠之孤岛
index.js:3680 [shujuku_v104] [剧情推进] [Plot] 未找到精确匹配预设 "缝合怪Rebron V 铠之孤岛" 的数据，尝试寻找无标签旧数据...
index.js:3680 [shujuku_v104] [剧情推进] [Plot] 未找到匹配预设 "缝合怪Rebron V 铠之孤岛" 的plot数据
index.js:3680 [shujuku_v104] [填表] $6 上轮规划数据: (空)
index.js:3680 [shujuku_v104] Final messages array being sent to API: (10) [{…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}, {…}]
index.js:3680 [shujuku_v104] 使用API预设: 当前配置, 模式: custom
world-info.js:4714 [WI] Adding 2 entries to prompt (2) [{…}, {…}]
index.js:20 [QR2] calling {args: Array(1), functionToCall: ƒ}
inject.js:1004 APP_READY undefined
logger.js:40 [SBT] PROBE [PROMPT-READY-ENTRY]: onPromptReady 事件触发。当前锁状态: false
logger.js:40 [SBT] [SBE DEBUG] Chapter State Snapshot (Before Turn): {uid: 'chapter_1771936511877_vwvmk9g79', characterId: '6', staticMatrices: {…}, dynamicState: {…}, meta: {…}, …}
logger.js:40 [SBT] ✅ 同步检查通过并成功上锁，即将执行分离式注入...
logger.js:40 [SBT] 同步占位完成（5层注入：剧透封锁/指令/召回/剧本/法则）。即将进入异步处理阶段...
logger.js:40 [SBT] 异步处理流程启动...
logger.js:40 [StateManager] 角色卡未设置叙事模式，使用默认值: 宝可梦
logger.js:40 [SBT] [UIManager] 接收到 'CHAPTER_UPDATED' 事件，正在刷新仪表盘...
logger.js:40 [SBT] 状态已从leader消息恢复，UI已刷新
logger.js:40 [SBT] 裁判模式已开启。正在执行回合指挥官...
DebugLogger.js:63 [ENGINE-V2-PROBE] 准备 TurnConductor 输入上下文
sbtConsole.js:25 [SBT-DIAGNOSE] TurnConductor Prompt V11.0
logger.js:70 [LLMApiService] 策略: SillyTavern 代理模式
logger.js:70 [LLMApiService] [代理-调试] 发送到 SillyTavern 后端的参数: {stream: false, messages: '1 条消息', max_tokens: 63000, model: 'gemini-2.5-pro', temperature: 1, …}
handler.ts:190 [Prompt Template] start generate after 15 messages
handler.ts:295 [Prompt Template] processing 15 messages in 1ms
prompts.ts:72 [Prompt Template] processing send result: 19961 tokens and 35805 chars
inject.js:1004 APP_READY undefined
index.js:3680 [shujuku_v104] ACU GENERATION_ENDED event for message_id: 9
index.js:3680 [shujuku_v104] ACU: Skip auto table update due to quiet/background generation.
index.js:3680 [shujuku_v104] Applied insertRow to table 0 (全局数据表) with data: {0: '宝可梦中心/研究所', 1: '1996-02-27 18:00', 2: '1996-02-27 18:00', 3: '大约一个下午'}
index.js:3680 [shujuku_v104] Applied insertRow to table 1 (主角信息) with data: {0: 'yumi', 1: '男/25', 2: '普通东亚男性长相，黑发黑瞳，身材匀称，因长时间工作有些虚胖。目前衣衫褴褛，浑身沾满泥土与草屑，面带疲惫。', 3: '穿越者(前上班族)', 4: '来自21世纪地球的普通上班族，因意外穿越到宝可梦世界。在野外跋涉一下午后，终于抵达古辰镇，并进入宝可梦中心，渴望获得一只属于自己的宝可梦。', 5: '务实、有一定社会经验、对未知事物既渴望又警惕。'}
index.js:3680 [shujuku_v104] Applied insertRow to table 2 (重要人物表) with data: {0: '乔伊', 1: '女/约20-25岁', 2: '粉色头发在脑后梳成两个独特的环状发髻，蓝色眼睛，身材匀称，胸部丰满（约D罩杯），腰肢纤细。穿着粉色护士裙和白色围裙，裙摆较短，恰好遮住臀部，腿上是白色长筒袜。', 3: ';', 4: '否', 5: '宝可梦中心的护士，负责接待训练家和治疗宝可梦。工作态度程序化，恪守规章制度，在面对没有身份证明的yumi时表现出警惕。'}
index.js:3680 [shujuku_v104] Applied insertRow to table 2 (重要人物表) with data: {0: '奥兰多', 1: '男/约40-50岁', 2: '头发微乱的白大褂研究员，眼神锐利。', 3: ';', 4: '否', 5: '古辰镇的驻点研究员，对异常事物有强烈的好奇心和研究欲。一出场就通过观察yumi身上的细节，推断出其来历不凡，并展开高压质询。'}
index.js:3680 [shujuku_v104] Applied insertRow to table 3 (主角技能表) with data: {0: '超常厨艺', 1: '被动', 2: '大师级', 3: '能够利用任何世界的食材，制作出抚慰人心、甚至带有微弱增益效果的美味料理。'}
index.js:3680 [shujuku_v104] Applied insertRow to table 4 (背包物品表) with data: {0: ';', 1: '0', 2: ';', 3: ';'}
index.js:3680 [shujuku_v104] Applied insertRow to table 5 (任务与事件表) with data: {0: '获得第一只宝可梦', 1: '主线任务', 2: '世界规则', 3: '作为一名训练家，获得属于自己的第一只宝可梦。', 4: '抵达宝可梦中心，但因没有身份证明而陷入僵局，被研究员奥兰多质询。', 5: '无', 6: '开启训练家生涯', 7: '无法成为训练家'}
index.js:3680 [shujuku_v104] Applied insertRow to table 6 (总结表) with data: {0: '1996-02-27 傍晚', 1: '宝可梦世界-丰缘地区-古辰镇-宝可梦中心', 2: '来自21世纪的上班族yumi在穿越到宝可梦世界后，经过一下午在野外的艰难跋涉，终于抵达了古辰镇。他身…抛出了尖锐的问题，质问其真实来历，并给出两个选项:承认自己在撒谎，或者承认自己来自一个未知的地方。', 3: '奥兰多:“所以，摆在你面前的解释有两个。一，你在撒谎。你根本不是迷路的普通人。二……你来自一个我们所有人都不知道的地方。你是哪一种？”', 4: 'AM01'}
index.js:3680 [shujuku_v104] Applied insertRow to table 7 (总体大纲) with data: {0: '1996-02-27 傍晚', 1: '穿越者yumi抵达古辰镇宝可梦中心，因无身份证明而陷入困境，被研究员奥兰多就其来历展开质询。', 2: 'AM01'}
index.js:3680 [shujuku_v104] Applied insertRow to table 8 (选项表) with data: {0: '承认自己来自未知的地方，并展示自己的特殊之处（比如厨艺）来换取信任。', 1: '对自己的来历含糊其辞，谎称失忆，试图蒙混过关。', 2: '坦诚相告，说明自己是“穿越”而来，赌对方是否会相信。', 3: '尝试与乔伊小姐进行更深入的私人“交流”，以获取她的同情和帮助。'}
index.js:3680 [shujuku_v104] [Init] First time initialization detected. Saving complete template structure with all tables.
index.js:3680 [shujuku_v104] [Tracking] Recorded modified keys for tag [无标签] at index 8: sheet_dCudvUnH, sheet_DpKcVGqg, sheet_NcBlYRH5, sheet_lEARaBa8, sheet_in05z9vz, sheet_etak47Ve, sheet_3NoMc1wI, sheet_PfzcX5v2, sheet_OptionsNew
index.js:3680 [shujuku_v104] [Merge Update Success] Group keys for tag [无标签] recorded at index 8: sheet_dCudvUnH, sheet_DpKcVGqg, sheet_NcBlYRH5, sheet_lEARaBa8, sheet_in05z9vz, sheet_etak47Ve, sheet_3NoMc1wI, sheet_PfzcX5v2, sheet_OptionsNew
index.js:3680 [shujuku_v104] Saved 9 tables for tag [无标签] to message at index 8. Actually modified: 9 tables.
index.js:3680 [shujuku_v104] ACU Loaded 9 messages for: 宝可梦 - 2026-02-24@01h37m41s.
index.js:3680 [shujuku_v104] [Merge] Loading data for isolation key: [无标签]
index.js:3680 [shujuku_v104] [Merge] Found 9 tables for tag [无标签] from chat history.
index.js:3680 [shujuku_v104] Updated currentJsonTableData_ACU with independently merged data.
index.js:3680 [shujuku_v104] ACU Loaded 9 messages for: 宝可梦 - 2026-02-24@01h37m41s.
index.js:3680 [shujuku_v104] [Merge] Loading data for isolation key: [无标签]
index.js:3680 [shujuku_v104] [Merge] Found 9 tables for tag [无标签] from chat history.
index.js:3680 [shujuku_v104] Successfully created 4 new person-related entries.
index.js:3680 [shujuku_v104] Successfully created 1 new summary entries.
index.js:3680 [shujuku_v104] Outline table lorebook entry not found. Created a new one. enabled=true (0TK占用模式=false)
index.js:3680 [shujuku_v104] [Profile] Settings saved for code: (default)
index.js:3680 [shujuku_v104] Updated knownCustomEntryNames. Count: 0
index.js:3680 [shujuku_v104] Global readable lorebook entry not found. Created a new one. (position: before_char)
index.js:3680 [shujuku_v104] Created wrapper start entry.
index.js:3680 [shujuku_v104] Created wrapper end entry.
index.js:3680 [shujuku_v104] Updated worldbook entries with merged data.
index.js:3680 [shujuku_v104] Notifying 0 callbacks about table update.
index.js:3680 [shujuku_v104] Notified frontend to refresh UI after data merge.
index.js:3680 [shujuku_v104] Triggered global visualizer refresh.
index.js:3680 [shujuku_v104] UI refresh wait period completed. Frontend should have finished reading data.
index.js:3680 [shujuku_v104] ACU Loaded 9 messages for: 宝可梦 - 2026-02-24@01h37m41s.
index.js:3680 [shujuku_v104] [Merge] Loading data for isolation key: [无标签]
index.js:3680 [shujuku_v104] [Merge] Found 9 tables for tag [无标签] from chat history.
index.js:3680 [shujuku_v104] Deleted 4 old person-related lorebook entries.
index.js:3680 [shujuku_v104] Successfully created 4 new person-related entries.
index.js:3680 [shujuku_v104] Deleted 1 old summary lorebook entries.
index.js:3680 [shujuku_v104] Successfully created 1 new summary entries.
index.js:3680 [shujuku_v104] Outline table lorebook entry is already up-to-date.
index.js:3680 [shujuku_v104] [Profile] Settings saved for code: (default)
index.js:3680 [shujuku_v104] Updated knownCustomEntryNames. Count: 0
index.js:3680 [shujuku_v104] Successfully updated the global readable lorebook entry (position: before_char).
index.js:3680 [shujuku_v104] updateCardUpdateStatusDisplay_ACU: UI elements not ready.
index.js:3680 [shujuku_v104] All group updates completed. Forcing data refresh...
2index.js:3680 [shujuku_v104] ACU Loaded 9 messages for: 宝可梦 - 2026-02-24@01h37m41s.
index.js:3680 [shujuku_v104] [Merge] Loading data for isolation key: [无标签]
index.js:3680 [shujuku_v104] [Merge] Found 9 tables for tag [无标签] from chat history.
index.js:3680 [shujuku_v104] Updated currentJsonTableData_ACU with independently merged data.
index.js:3680 [shujuku_v104] ACU Loaded 9 messages for: 宝可梦 - 2026-02-24@01h37m41s.
index.js:3680 [shujuku_v104] [Merge] Loading data for isolation key: [无标签]
index.js:3680 [shujuku_v104] [Merge] Found 9 tables for tag [无标签] from chat history.
index.js:3680 [shujuku_v104] Deleted 4 old person-related lorebook entries.
index.js:3680 [shujuku_v104] Successfully created 4 new person-related entries.
index.js:3680 [shujuku_v104] Deleted 1 old summary lorebook entries.
index.js:3680 [shujuku_v104] Successfully created 1 new summary entries.
index.js:3680 [shujuku_v104] Outline table lorebook entry is already up-to-date.
index.js:3680 [shujuku_v104] [Profile] Settings saved for code: (default)
index.js:3680 [shujuku_v104] Updated knownCustomEntryNames. Count: 0
index.js:3680 [shujuku_v104] Successfully updated the global readable lorebook entry (position: before_char).
index.js:3680 [shujuku_v104] Updated worldbook entries with merged data.
index.js:3680 [shujuku_v104] Notifying 0 callbacks about table update.
index.js:3680 [shujuku_v104] Notified frontend to refresh UI after data merge.
index.js:3680 [shujuku_v104] Notifying 0 callbacks about table update.
index.js:3680 [shujuku_v104] Delayed notification sent after saving.
index.js:3680 [shujuku_v104] Triggered global visualizer refresh.
index.js:3680 [shujuku_v104] UI refresh wait period completed. Frontend should have finished reading data.
inject.js:1004 APP_READY undefined
handler.ts:589 [Prompt Template] *** REFRESHING WORLD INFO: 宝可梦 ***
handler.ts:640 [Prompt Template] processing 13 world info in 2ms
index.js:3680 [shujuku_v104] ACU Loaded 9 messages for: 宝可梦 - 2026-02-24@01h37m41s.
index.js:3680 [shujuku_v104] [Merge] Loading data for isolation key: [无标签]
index.js:3680 [shujuku_v104] [Merge] Found 9 tables for tag [无标签] from chat history.
index.js:3680 [shujuku_v104] Updated currentJsonTableData_ACU with independently merged data.
index.js:3680 [shujuku_v104] ACU Loaded 9 messages for: 宝可梦 - 2026-02-24@01h37m41s.
index.js:3680 [shujuku_v104] [Merge] Loading data for isolation key: [无标签]
index.js:3680 [shujuku_v104] [Merge] Found 9 tables for tag [无标签] from chat history.
index.js:3680 [shujuku_v104] Deleted 4 old person-related lorebook entries.
index.js:3680 [shujuku_v104] Successfully created 4 new person-related entries.
index.js:3680 [shujuku_v104] Deleted 1 old summary lorebook entries.
index.js:3680 [shujuku_v104] Successfully created 1 new summary entries.
index.js:3680 [shujuku_v104] Outline table lorebook entry is already up-to-date.
index.js:3680 [shujuku_v104] [Profile] Settings saved for code: (default)
index.js:3680 [shujuku_v104] Updated knownCustomEntryNames. Count: 0
index.js:3680 [shujuku_v104] Successfully updated the global readable lorebook entry (position: before_char).
index.js:3680 [shujuku_v104] Updated worldbook entries with merged data.
index.js:3680 [shujuku_v104] Notifying 0 callbacks about table update.
index.js:3680 [shujuku_v104] Notified frontend to refresh UI after data merge.
index.js:3680 [shujuku_v104] Triggered global visualizer refresh.
index.js:3680 [shujuku_v104] UI refresh wait period completed. Frontend should have finished reading data.
index.js:3680 [shujuku_v104] [数据清理] 含数据消息总数(1) <= 保留层数(100)，无需清理。
inject.js:1004 APP_READY undefined
handler.ts:589 [Prompt Template] *** REFRESHING WORLD INFO: 宝可梦 ***
handler.ts:640 [Prompt Template] processing 13 world info in 4ms
logger.js:70 [LLMApiService] [代理-调试] SillyTavern 后端响应: {id: 'req_1771946031719_hnrcg1e0q', object: 'chat.completion', created: 1771946064, model: 'gemini-2.5-pro', choices: Array(1), …}
sbtConsole.js:13 [SBT-INFO] [JSON Extractor] V2: Found and extracted JSON from a precise markdown code block.
sbtConsole.js:22 [CONDUCTOR-V11-OUTPUT] Navigation + GPS/Tone Output
logger.js:70 [回合裁判] navigation_decision: STAY
logger.js:70 [回合裁判] reasoning: 用户的'继续'指令是推进剧情的信号。当前场景（节拍1：奥兰多的登场与审视）刚刚开始，核心事件（质问）尚未发生。因此，决策为'停留'，以完整演绎当前节拍内容，而非跳跃至下一节拍。...
logger.js:70 [回合裁判] logic_safety_warning: NONE...
logger.js:70 [回合裁判] status: 继续
logger.js:70 [回合裁判] current_beat_idx: 1
logger.js:70 [回合裁判] narrative_hold: 核心冲突是奥兰多对yumi的审视与质问。禁止yumi轻易蒙混过关。必须展现奥兰多极具侵略性的观察力和连珠炮般的质问，迫使...
logger.js:70 [回合裁判] tone_correction: null (none)
logger.js:70 [回合裁判] beat_completion_analysis: 节拍0已完成：yumi的诉求被体制规则（乔伊）阻挡，气氛降至冰点，符合exit_condition。节拍1刚刚开始：关键...
logger.js:70 [回合裁判] realtime_context_ids: (3) ['yumi', 'char_npc_researcher_orlando', 'npc_joy']
logger.js:40 [SBT] --- TurnConductor V11.0 --- Navigation Gate + GPS/Tone DONE
logger.js:40 [SBT] [PROBE][CONDUCTOR-V10] 收到回合裁判的GPS定位与基调检查: {navigation_decision: 'STAY', reasoning: "用户的'继续'指令是推进剧情的信号。当前场景（节拍1：奥兰多的登场与审视）刚刚开始，核心事件（质问）尚未发生。因此，决策为'停留'，以完整演绎当前节拍内容，而非跳跃至下一节拍。", logic_safety_warning: 'NONE', status: '继续', current_beat_idx: 1, …}
logger.js:40 [SBT] [PROBE][NAVIGATION] decision=STAY, current=1, effective=1
DebugLogger.js:63 [ENGINE-V2-PROBE] 实时上下文召回流程
logger.js:40 [SBT] [SBT-INFO] ○ 第0层无需基调纠正
logger.js:40 [SBT] [SBT-INFO] ✓ 第1层剧透封锁已注入
DebugLogger.js:63 [ENGINE-FREE-ROAM] 生成完整世界观档案
logger.js:40 [SBT] ✓ [全量注入] 所有世界实体已一次性注入
DebugLogger.js:63 [ENGINE-V9-DEBUG] 第2层召回内容验证
sbtConsole.js:22 [信息迷雾] 剧本动态掩码处理
logger.js:40 [SBT] Chapter blueprint omitted.
DebugLogger.js:63 [ENGINE-V4.1-DEBUG] 剧本动态掩码验证
DebugLogger.js:63 [ENGINE-V3-DEBUG] 第3层蓝图内容验证
logger.js:40 [SBT] [V3.2] Core rules omitted.
logger.js:40 [SBT] [Watchdog] 成功注入，已更新执行时间戳。
logger.js:40 [SBT] [Lock] Prompt注入流程执行完毕，会话锁已立即释放。
logger.js:40 [ModelManager] 从缓存读取到 26 个模型
logger.js:40 [ModelManager] 从缓存读取到 14 个模型
logger.js:40 [SBT] [UIManager] 设置面板UI已根据已加载的配置完成填充。
logger.js:40 [SBT] [UIManager] 提示词管理UI已加载
sbtConsole.js:7 [Renderers] 使用聊天 leader 状态作为渲染源。
logger.js:40 [SBT] [UIManager] 动态Leader状态获取成功 (尝试 1/5)
sbtConsole.js:22 [RENDERERS-V4.2-DEBUG] updateDashboard 收到数据
sbtConsole.js:7 章节UID: chapter_1771936511877_vwvmk9g79
logger.js:40 [SBT] [UIManager] 检测到动态章节状态，已成功加载。这分别是两次发送消息的对应日志。
第一次没有用数据库插件，第二次我在我插件基础上同时用了数据库插件，我放在文件里了，只开启了数据更新功能，不知道为什么，似乎我流程里的回合指导因此被重复触发了，分析原因