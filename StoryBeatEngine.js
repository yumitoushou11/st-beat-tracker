// FILE: StoryBeatEngine.js

import { Chapter } from './Chapter.js';
import * as stateManager from './stateManager.js';
import { USER, LEADER, EDITOR } from './src/engine-adapter.js';
import { simpleHash } from './utils/textUtils.js';
import * as staticDataManager from './src/StaticDataManager.js';
import { setupUI, initializeUIManager } from './ui/uiManager.js';
import { updateDashboard } from './ui/renderers.js';
import { ENGINE_STATUS } from './src/constants.js';
import { IntelligenceAgent } from './ai/intelligenceAgent.js';
import { HistorianAgent } from './ai/historianAgent.js';
import { ArchitectAgent } from './ai/architectAgent.js';
 import { deepmerge } from './utils/deepmerge.js';
import { TurnConductorAgent } from './ai/turnConductorAgent.js';
import { NarrativeControlTowerManager } from './src/NarrativeControlTowerManager.js';
import { EntityContextManager } from './src/EntityContextManager.js';
import { promptManager } from './promptManager.js';
import { DebugLogger } from './src/utils/DebugLogger.js';
import { TextSanitizer } from './src/utils/TextSanitizer.js';
import { ChapterAnalyzer } from './src/utils/ChapterAnalyzer.js';
import { ServiceFactory } from './src/services/ServiceFactory.js';
import { PromptBuilder } from './src/managers/PromptBuilder.js';
import { StateUpdateManager } from './src/managers/StateUpdateManager.js';
import { TransitionManager } from './src/managers/TransitionManager.js';
import { UserInteractionHandler } from './src/handlers/UserInteractionHandler.js';
import { CleanupHandler } from './src/handlers/CleanupHandler.js';

export class StoryBeatEngine {
    constructor(dependencies) {
        this.deps = dependencies;
        this.info = dependencies.info;
        this.warn = dependencies.warn;
        this.diagnose = dependencies.diagnose;
        this.toastr = dependencies.toastr;
        this.eventBus = dependencies.eventBus;

        // 初始化调试日志器
        this.logger = new DebugLogger('StoryBeatEngine');
        this.USER = USER;
        this.LEADER = LEADER;
        this.EDITOR = EDITOR;

        this.currentChapter = null; // 初始化为 null
        this.isGenesisStatePendingCommit = false;
        this.isTransitionPending = false; // 用于章节转换的旗标
        this.pendingTransitionPayload = null; // 用于存储转换的附带信息

        this.syncDebounceTimer = null;
        this.uiSyncRetryTimer = null; // 用于重试的计时器ID
        this.uiSyncRetryCount = 0; // 记录重试次数
        this._hasCleanedChat = false; // 🔧 标记是否已清理过chat消息

        this._earlyFocusPromise = null; // 追踪“提前规划”弹窗状态，避免并发弹出
        this._transitionStopRequested = false; // 标记当前章节转换是否被手动停止
        this._activeTransitionToast = null; // 当前章节转换通知引用，用于追加提示
        this.currentTaskAbortController = null; // V9.2 新增：中止控制器
        this.status = ENGINE_STATUS.IDLE;
        this.isConductorActive = false;
        this.lastExecutionTimestamp = 0;
        this.intelligenceAgent = null;
        this.architectAgent = null;
        this.historianAgent = null;
        this.mainLlmService = null; // 主服务
        this.conductorLlmService = null; // 回合裁判专用服务
        this.turnConductorAgent = null;

        this.narrativeControlTowerManager = new NarrativeControlTowerManager(this);
        this.entityContextManager = new EntityContextManager(this);

        // 初始化状态更新管理器
        this.stateUpdateManager = new StateUpdateManager(this, dependencies);

        // 初始化章节转换管理器
        this.transitionManager = new TransitionManager(this, dependencies);

        // 初始化用户交互处理器
        this.userInteractionHandler = new UserInteractionHandler(this, dependencies);

        // 初始化清理处理器
        this.cleanupHandler = new CleanupHandler(this, dependencies);
    }

    _setStatus(newStatus) {
        if (this.status !== newStatus) {
            this.status = newStatus;
            this.info(`引擎状态变更为: ${this.status.text}`);
            $(document).trigger('sbt-engine-status-changed', [this.status]);
        }
    }
    _initializeCoreServices() {
        const apiSettings = stateManager.getApiSettings();

        // 使用ServiceFactory创建服务
        const services = ServiceFactory.createServices(
            apiSettings,
            { USER: this.USER, EDITOR: this.EDITOR },
            this.info
        );
        this.mainLlmService = services.mainLlmService;
        this.conductorLlmService = services.conductorLlmService;

        const agentDependencies = {
            ...this.deps, // 继承来自引擎构造函数的基础依赖 (log, toastr等)
            mainLlmService: this.mainLlmService,
            conductorLlmService: this.conductorLlmService
            // 如果未来有更多服务，也在这里添加
        };

        this.intelligenceAgent = new IntelligenceAgent(agentDependencies);
        this.historianAgent = new HistorianAgent(agentDependencies);
        this.architectAgent = new ArchitectAgent(agentDependencies);
        this.turnConductorAgent = new TurnConductorAgent(agentDependencies);

        // 注入promptManager到支持自定义提示词的Agents
        this.architectAgent.setPromptManager(promptManager);
        this.turnConductorAgent.setPromptManager(promptManager);

        // 设置默认提示词到promptManager供UI显示
        this._initializeDefaultPrompts();

        this.info("核心AI Agent已根据双轨制API实例化。");
    }

    /**
     * 初始化默认提示词到promptManager
     * 这样UI才能通过"导出"功能查看完整的默认提示词
     */
    _initializeDefaultPrompts() {
        try {
            // 注册建筑师默认提示词的getter回调
            promptManager.setDefaultArchitectPromptGetter(() => {
                return this.architectAgent.getCompleteDefaultPrompt();
            });

            // 注册回合执导默认提示词的getter回调
            promptManager.setDefaultConductorPromptGetter(() => {
                return this.turnConductorAgent.getCompleteDefaultPrompt();
            });

            this.info("[promptManager] 默认提示词getter回调已注册");
        } catch (error) {
            this.diagnose("[promptManager] 初始化默认提示词时发生错误:", error);
        }
    }

    /**
     * 统一处理“史官复盘期间提前规划”按钮点击逻辑
     * 返回Promise以便在章节转换流程中检测是否仍在等待玩家输入
     * @param {Chapter} workingChapter
     * @param {JQuery} $button
     */


    // V9.2 新增：硬停止方法



    /**
     * 🔧 清理chat消息中的污染leader数据
     * 【修复V2】分别处理两种污染情况：
     * 1. 真实章节被污染了静态缓存标记（__source: "static_cache"）
     * 2. 纯静态缓存leader包含运行时字段
     * @returns {object} 清理报告 { cleanedCount, pollutedMessages }
     */

    async start() {
        this.info("叙事流引擎 ( State Refactored) 正在启动...");
        this._initializeCoreServices();
   // 1. 首先，初始化UI管理器并注入所有依赖项。
    const uiManagerDependencies = {
        ...this.deps,
        onReanalyzeWorldbook: this.reanalyzeWorldbook.bind(this),
        onForceChapterTransition: this.forceChapterTransition.bind(this),
        onStartGenesis: this.startGenesisProcess.bind(this),
        onRerollChapterBlueprint: this.rerollChapterBlueprint.bind(this),
            mainLlmService: this.mainLlmService,
            conductorLlmService: this.conductorLlmService,
        onSetNarrativeFocus: this.setNarrativeFocus.bind(this),
        onSaveCharacterEdit: this.saveCharacterEdit.bind(this),
    };
    const finalDependencies = initializeUIManager(uiManagerDependencies);
    this.deps = finalDependencies;
    // 2. 然后，在所有依赖都已就绪的情况下，再设置UI并绑定事件。
    await setupUI();
        // 调用 uiManager 初始化，它会向传入的对象中添加弹窗函数
        const { eventSource, event_types } = this.deps.applicationFunctionManager;

        this.info("正在注册事件监听器...");
        eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, this.onPromptReady);
                eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, this.onCommitState);
        this.info("  -> [onCommitState] 已成功绑定到 CHARACTER_MESSAGE_RENDERED 事件。");
        eventSource.on(event_types.CHAT_CHANGED, this.onStateChange);
        eventSource.on(event_types.MESSAGE_EDITED, this.onStateChange);
        eventSource.on(event_types.MESSAGE_DELETED, this.onStateChange);
        eventSource.on(event_types.MESSAGE_SWIPED, this.onStateChange);
        
        $(document).on('sbt-api-settings-saved', () => this._initializeCoreServices());

        // 🔧 自动清理污染数据：为所有玩家修复静态数据库
        try {
            this.info("正在检查静态数据库完整性...");
            const cleanReport = staticDataManager.autoCleanStaticDatabase();
            if (cleanReport.cleanedCharacters > 0) {
                this.info(`✅ 数据库修复完成：清理了 ${cleanReport.cleanedCharacters} 个角色的污染数据`);
                this.diagnose("清理详情:", cleanReport.removedFields);
            }
        } catch (error) {
            this.diagnose("自动清理失败（不影响使用）:", error);
        }

        this.onStateChange();

        this.info("叙事流引擎已准备就绪。");
    }

    /**
     * [V2.0 辅助方法] 生成实体清单（带缓存）
     * 用于TurnConductor进行ID匹配，以及动态上下文召回
     */
onPromptReady = async (eventData) => {
        const WATCHDOG_DELAY = 1000; // 看门狗延迟，单位：毫秒 (1秒)
    const now = Date.now();

       const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
    if (!isEngineEnabled) {
        // 我们只在控制台打印信息，避免打扰用户。
        this.info('[Guard-MasterSwitch] 流程中止：叙事流引擎总开关已关闭。');
        return;
    }

    // 【优先级1】锁检查 - 必须在任何日志之前进行，防止事件风暴时刷屏
    if (this.isConductorActive) {
        // 静默拦截，不输出日志，避免在API错误重试时刷屏
        return;
    }

    // 【优先级2】看门狗检查 - 防止短时间内重复触发
    if (now - this.lastExecutionTimestamp < WATCHDOG_DELAY) {
        // 静默拦截
        return;
    }

    // 通过守卫后才输出调试日志
    this.info(`PROBE [PROMPT-READY-ENTRY]: onPromptReady 事件触发。当前锁状态: ${this.isConductorActive}`);
    if (this.currentChapter) {
        this.info('[SBE DEBUG] Chapter State Snapshot (Before Turn):', JSON.parse(JSON.stringify(this.currentChapter)));
    }
    if (typeof eventData !== 'object' || eventData === null || eventData.dryRun) {
        return;
    }
    
    const { piece: lastStatePiece } = this.USER.findLastMessageWithLeader();
    if (!lastStatePiece || !Chapter.isValidStructure(lastStatePiece.leader)) {
        this.info(`[Guard-Inject] 流程中止：未找到有效的叙事状态，本次不进行注入。`);
        return;
    }
    
    this.isConductorActive = true;
    this.info("✅ 同步检查通过并成功上锁，即将执行分离式注入...");
const spoilerBlockPlaceholder = {
        role: 'system',
        content: "【SBT 引擎正在编译剧透封锁禁令...】",
        is_SBT_script: true,
        is_SBT_spoiler_block: true // 0. 剧透封锁（最高优先级）
    };
    const instructionPlaceholder = {
        role: 'system',
        content: "【SBT 引擎正在编译回合指令...】",
        is_SBT_script: true,
        is_SBT_turn_instruction: true // 1. 回合指令
    };
    const recallPlaceholder = {
        role: 'system',
        content: "【SBT 引擎正在编译实时召回上下文...】",
        is_SBT_script: true,
        is_SBT_realtime_recall: true // 2. 实时召回（动态）
    };
    const scriptPlaceholder = {
        role: 'system',
        content: "【SBT 引擎正在编译本章剧本...】",
        is_SBT_script: true,
        is_SBT_chapter_script: true // 3. 章节剧本
    };
    const rulesPlaceholder = {
        role: 'system',
        content: "【SBT 引擎正在编译通用法则...】",
        is_SBT_script: true,
        is_SBT_core_rules: true // 4. 通用法则
    };

    const finalChatContext = eventData.chat;
    for (let i = finalChatContext.length - 1; i >= 0; i--) {
        if (finalChatContext[i].is_SBT_script) {
            finalChatContext.splice(i, 1);
        }
    }
   finalChatContext.unshift(rulesPlaceholder);
    finalChatContext.unshift(scriptPlaceholder);
    finalChatContext.unshift(recallPlaceholder);
    finalChatContext.unshift(instructionPlaceholder);
    finalChatContext.unshift(spoilerBlockPlaceholder); // 剧透封锁放在最前面
    this.info("同步占位完成（5层注入：剧透封锁/指令/召回/剧本/法则）。即将进入异步处理阶段...");

    try {
        this.info("异步处理流程启动...");
        this.currentChapter = Chapter.fromJSON(lastStatePiece.leader);
        this.narrativeControlTowerManager.syncStorylineProgressWithStorylines(this.currentChapter);

        // 触发UI刷新事件，确保监控面板显示最新状态（包括故事梗概）
        this.eventBus.emit('CHAPTER_UPDATED', this.currentChapter);
        this.info("状态已从leader消息恢复，UI已刷新");

        // 【自由章模式】跳过回合指挥
        const isFreeRoamMode = this.currentChapter?.meta?.freeRoamMode || false;
        if (isFreeRoamMode) {
            this.info("🎲 [自由章模式] 跳过回合执导，将世界观档案全部发送到前台");

            // 生成包含所有世界观档案的完整上下文
            const allWorldviewContext = this.entityContextManager.generateFullWorldviewContext();

            // 直接注入到占位符
            const worldviewInjection = `【世界观档案（自由章模式）】\n${allWorldviewContext}`;

            // ✅ 修复：同时更新 content 和 mes，确保 API 和酒馆内部都能读取
            recallPlaceholder.content = worldviewInjection;
            recallPlaceholder.mes = worldviewInjection;

            // 同时也把其他占位符清空，防止把"正在编译..."发出去
            spoilerBlockPlaceholder.content = "";
            instructionPlaceholder.content = "【自由探索模式：无指令】";
            scriptPlaceholder.content = "【自由探索模式：无剧本】";
            rulesPlaceholder.content = "";

            this.info("✓ 世界观档案已注入，自由章模式激活完成");
            return;
        }

        // 读取开关状态，默认为 true (开启)
        const isConductorEnabled = localStorage.getItem('sbt-conductor-enabled') !== 'false';

        if (isConductorEnabled) {
            this.info("裁判模式已开启。正在执行回合指挥官...");
            
            let lastExchange;
            const chat = this.USER.getContext().chat;
            const chatLength = chat.length;

            let lastUserMsg = null;
            let lastAiMsg = null;
            let lastUserMsgIndex = -1;

            if (chatLength > 0) {
                for (let i = chatLength - 1; i >= 0; i--) {
                    if (chat[i]?.is_user) {
                        lastUserMsg = chat[i];
                        lastUserMsgIndex = i;
                        break;
                    }
                }
                if (lastUserMsgIndex > 0) {
                    for (let i = lastUserMsgIndex - 1; i >= 0; i--) {
                        if (!chat[i]?.is_user) {
                            lastAiMsg = chat[i];
                            break;
                        }
                    }
                }
            }

            if (lastUserMsg && lastAiMsg) {
                lastExchange = `【AI情境】:\n${lastAiMsg.mes}\n\n---\n\n【玩家行动】:\n${lastUserMsg.mes}`;
            } else if (lastUserMsg) {
                lastExchange = `【玩家行动】:\n${lastUserMsg.mes}`;
            } else {
                lastExchange = "情境：故事刚刚开始。";
            }

            let historicalContext = '';
            if (lastAiMsg) {
                const historyStartIndex = lastUserMsgIndex - 1;
                const historyDepth = 8; // 可配置的历史深度
                const history = [];
                let count = 0;
                for (let i = historyStartIndex - 1; i >= 0 && count < historyDepth; i--) {
                    history.unshift(chat[i]);
                    count++;
                }
                if (history.length > 0) {
                    const formattedHistory = history.map(msg => {
                        const prefix = msg.is_user ? "【玩家行动】:" : "【AI情境】:";
                        return `${prefix}\n${msg.mes}`;
                    }).join('\n\n---\n\n');
                    historicalContext = `# 前情提要 (按时间顺序):\n\n${formattedHistory}\n\n---\n\n# 最新交互:\n\n`;
                }
            }

            lastExchange = historicalContext + lastExchange;

            // V2.0: 准备 TurnConductor 所需的完整上下文
            this.logger.group('[ENGINE-V2-PROBE] 准备 TurnConductor 输入上下文');
            const conductorContext = {
                lastExchange: lastExchange,
                chapterBlueprint: this.currentChapter.chapter_blueprint,
                chapter: this.currentChapter // V2.0: 传递完整的 chapter 实例
            };
            this.logger.log('✓ chapter 实例已传递（包含 staticMatrices 和 stylistic_archive）');

            // 【调试增强】打印传递给 turnConductor 的 blueprint 结构
            this.logger.log('传递给 turnConductor 的 blueprint 信息:');
            this.logger.log('  - plot_beats 数量:', this.currentChapter.chapter_blueprint?.plot_beats?.length || 0);
            this.logger.log('  - 前3个节拍预览:');
            this.currentChapter.chapter_blueprint?.plot_beats?.slice(0, 3).forEach((beat, idx) => {
                this.logger.log(`    节拍${idx}: beat_id=${beat.beat_id}, has_physical_event=${!!beat.physical_event}, has_description=${!!beat.description}`);
            });

            this.logger.groupEnd();

            const conductorDecision = await this.turnConductorAgent.execute(conductorContext);

            this.info('[PROBE][CONDUCTOR-V10] 收到回合裁判的GPS定位与基调检查:', JSON.parse(JSON.stringify(conductorDecision)));

            // 【V9.0】检查是否触发章节转换
            if (conductorDecision.status === 'TRIGGER_TRANSITION') {
                this.info(`PROBE [PENDING-TRANSITION]: 回合裁判已发出章节转换信号`);
                this.isTransitionPending = true;
                this.pendingTransitionPayload = { decision: conductorDecision.status };
            }

            // V2.0: 处理实时上下文召回
            let dynamicContextInjection = '';
            if (conductorDecision.realtime_context_ids && conductorDecision.realtime_context_ids.length > 0) {
                this.logger.group('[ENGINE-V2-PROBE] 实时上下文召回流程');
                this.info(`检测到 ${conductorDecision.realtime_context_ids.length} 个需要实时召回的实体`);
                this.logger.log('实体ID列表:', conductorDecision.realtime_context_ids);

                dynamicContextInjection = this.entityContextManager.retrieveEntitiesByIds(conductorDecision.realtime_context_ids);

                if (dynamicContextInjection) {
                    this.info('✓ 动态上下文已生成，将注入到 Prompt');
                } else {
                    this.warn('⚠️ 动态上下文生成失败或为空');
                }
                this.logger.groupEnd();
            } else {
                this.info('[ENGINE-V2] 本回合无需实时上下文召回');
            }

if (this.currentChapter.chapter_blueprint) {
    // 【V10.0 新增】第0层：基调纠正指令（最高优先级）
    const toneCorrection = conductorDecision.tone_correction;
    let toneCorrectionContent = '';

    if (toneCorrection && toneCorrection !== null && toneCorrection.trim() !== '' && toneCorrection !== 'null') {
        toneCorrectionContent = [
            `# ⚠️ 【基调纠正 - 立即执行】`,
            ``,
            `## 🔴 检测到剧情基调偏离，必须立即纠正`,
            ``,
            toneCorrection,
            ``,
            `**执行要求**：`,
            `- 本回合输出必须优先执行上述纠正指令`,
            `- 如果要求重新演绎，则忽略之前的描写，从头开始`,
            `- 如果提供了多个方案，请根据当前情境选择最合适的方案`,
            ``
        ].join('\n');
        this.info('[SBT-INFO] ⚠️ 第0层基调纠正已激活');
        console.warn('[⚠️ TONE CORRECTION ACTIVE] 基调纠正指令已注入到提示词');
    } else {
        this.info('[SBT-INFO] ○ 第0层无需基调纠正');
    }

    // 【V9.0 精简】第1层：剧透封锁禁令
    const narrativeHold = conductorDecision.narrative_hold || '';

    if (narrativeHold && narrativeHold.trim() !== '' && narrativeHold !== '无' && narrativeHold !== '无。') {
        spoilerBlockPlaceholder.content = [
            toneCorrectionContent, // V10.0: 基调纠正放在最前面
            toneCorrectionContent ? '\n---\n' : '', // 如果有基调纠正，添加分隔线
            `# 🚫 【绝对严格禁止 - 剧透封锁铁则】`,
            ``,
            `## ⚠️ 以下为绝对不可违反的禁令`,
            ``,
            narrativeHold
        ].join('\n');
        this.info('[SBT-INFO] ✓ 第1层剧透封锁已注入');
    } else {
        if (toneCorrectionContent) {
            spoilerBlockPlaceholder.content = toneCorrectionContent;
        } else {
            spoilerBlockPlaceholder.content = `# 🚫 【剧透封锁与基调检查】\n\n本回合无特殊封锁要求，无需基调纠正。`;
        }
        this.info('[SBT-INFO] ○ 第1层无封锁内容');
    }

    // 【V9.0 新增】第2层：硬编码通用执导规则（不再由裁判生成）
    const currentBeatIdx = conductorDecision.current_beat_idx || 0;
    const beats = this.currentChapter.chapter_blueprint.plot_beats || [];
    const currentBeat = beats[currentBeatIdx];

    const hardcodedInstructions = PromptBuilder.buildHardcodedDirectorInstructions(currentBeatIdx, currentBeat, beats);

    instructionPlaceholder.content = hardcodedInstructions;

    // 【V9.0 修改】第2层：召回档案（双模式：按需召回 vs 全量注入）
    const isEntityRecallEnabled = localStorage.getItem('sbt-entity-recall-enabled') === 'true';

    let recallContent = [
        `# **【第2层：召回档案】**`,
        ``
    ];

    if (isEntityRecallEnabled) {
        // 【模式A：按需召回模式】章节级静态实体 + 回合级动态实体
        recallContent.push(`## (Entity Recall: On-Demand Mode)`);
        recallContent.push(``);

        const chapterStaticContext = this.currentChapter.cachedChapterStaticContext || '';

        // 第2A部分：章节级静态实体
        if (chapterStaticContext) {
            recallContent.push(chapterStaticContext);
            this.info('✓ [按需召回] 章节级静态实体已注入');
        } else {
            recallContent.push(`📋 本章无预设核心实体。`);
            recallContent.push(``);
        }

        // 第2B部分：回合级动态实体
        if (dynamicContextInjection) {
            recallContent.push(``);
            recallContent.push(`---`);
            recallContent.push(``);
            recallContent.push(`### 📌 本回合额外召回 (Turn-Specific Recall)`);
            recallContent.push(``);
            recallContent.push(`以下是本回合涉及的**规划外**实体档案（未在章节规划中，但本回合需要）：`);
            recallContent.push(``);
            recallContent.push(dynamicContextInjection);
            this.info('✓ [按需召回] 回合级动态召回已注入');
        } else {
            this.info('○ [按需召回] 本回合无动态召回需求');
        }
    } else {
        // 【模式B：全量注入模式】一次性注入所有世界实体（完整档案，不过滤）
        recallContent.push(`## (Entity Recall: Full Injection Mode)`);
        recallContent.push(``);
        recallContent.push(`**模式说明:** 召回功能已关闭，所有世界实体档案将一次性完整注入（不过滤）。`);
        recallContent.push(``);

        // 生成所有世界实体的完整上下文
        const allWorldviewContext = this.entityContextManager.generateFullWorldviewContext();

        if (allWorldviewContext) {
            recallContent.push(allWorldviewContext);
            this.info('✓ [全量注入] 所有世界实体已一次性注入');
        } else {
            recallContent.push(`📋 当前世界无实体数据。`);
        }
    }

    recallPlaceholder.content = recallContent.join('\n');

    // V9.0 调试：验证第2层召回内容
    this.logger.group('[ENGINE-V9-DEBUG] 第2层召回内容验证');
    this.logger.log('召回模式:', isEntityRecallEnabled ? '按需召回' : '全量注入');
    this.logger.log('注入内容总长度:', recallPlaceholder.content.length);
    if (isEntityRecallEnabled) {
        this.logger.log('是否包含章节级实体:', recallPlaceholder.content.includes('📂 章节级核心实体档案'));
        this.logger.log('是否包含回合级召回:', recallPlaceholder.content.includes('本回合额外召回'));
    } else {
        this.logger.log('是否为全量注入模式:', recallPlaceholder.content.includes('Full Injection Mode'));
    }
    this.logger.groupEnd();

    // 【V9.0 修改】第3层：本章创作蓝图（纯净版，使用信息迷雾）
    const maskedBlueprint = this._applyBlueprintMask(
        this.currentChapter.chapter_blueprint,
        currentBeatIdx
    );

    // 【V9.0 新增】提取玩家补充意见，单独强调
    const playerSupplement = this.currentChapter.chapter_blueprint?.player_supplement;

    const blueprintAsString = JSON.stringify(maskedBlueprint, null, 2);

    let scriptContent = [
        `# **【第3层：本章创作蓝图 - 你当前需要遵循的剧本流程】**`,
        `## (Chapter Blueprint - Script Flow You Must Follow)`,
        ``,
        `**📜 重要说明：**`,
        `这是本章节的剧本流程，你需要在创作时遵循这些剧情节拍的规划。`,
        `每个节拍定义了剧情的推进方向和关键事件，请确保你的回复与当前节拍内容没有过大偏移。`,
        `首要仍是服务玩家的意见，需要在合适的时机合理自然的拉回剧本内容。`,
        ``
    ];

    // 【绝对优先级】玩家补充意见（如果存在）
    if (playerSupplement && playerSupplement.trim() !== '') {
        scriptContent.push(`**【【【 ⚠️ 绝对优先级：玩家剧本补充 ⚠️ 】】】**`);
        scriptContent.push(``);
        scriptContent.push(`**玩家在审阅剧本后，提供了以下绝对优先级的补充说明：**`);
        scriptContent.push(``);
        scriptContent.push(`\`\`\``);
        scriptContent.push(playerSupplement);
        scriptContent.push(`\`\`\``);
        scriptContent.push(``);
        scriptContent.push(`**🚨 执行要求：**`);
        scriptContent.push(`- 这是**最高优先级指令**，凌驾于所有其他设计和蓝图`);
        scriptContent.push(`- 你必须**无条件执行**上述玩家补充的要求`);
        scriptContent.push(`- 当玩家意见与蓝图冲突时，**始终以玩家意见为准**`);
        scriptContent.push(``);
        scriptContent.push(`---`);
        scriptContent.push(``);
        this.info('✓ 玩家补充意见已提取并置顶强调');
    }

    // 剧本蓝图主体
    scriptContent.push(`## 📖 剧本执行规则`);
    scriptContent.push(``);
    scriptContent.push(`⚠️ **【信息迷雾协议】** 剧本已根据当前进度进行动态掩码处理`);
    scriptContent.push(`- 已完成的节拍：完整内容可见，标记为【已完成】（你需要知道已发生的事情）`);
    scriptContent.push(`- 当前执行节拍：完整内容可见，高亮标记为【⚠️ 当前执行目标 ⚠️】（**这是你现在应该推进的剧情**）`);
    scriptContent.push(`- 未来节拍：内容已屏蔽，状态为【待解锁】（防止剧透，不要提前透露）`);
    scriptContent.push(``);
    scriptContent.push(`**💡 创作指引：**`);
    scriptContent.push(`- 请根据【当前执行目标】的节拍内容来构思你的回复`);
    scriptContent.push(`- 避免你的叙述推动剧情违背了当前节拍的方向发展`);
    scriptContent.push(``);
    scriptContent.push(`\`\`\`json`);
    scriptContent.push(blueprintAsString);
    scriptContent.push(`\`\`\``);
    scriptContent.push(``);

    scriptPlaceholder.content = scriptContent.join('\n');
    this.info(`✓ 第3层创作蓝图已注入（当前节拍索引: ${currentBeatIdx}，已应用动态掩码）`);

    // V4.1 调试：验证掩码效果
    this.logger.group('[ENGINE-V4.1-DEBUG] 剧本动态掩码验证');
    this.logger.log('当前节拍索引:', currentBeatIdx);
    this.logger.log('原始节拍数量:', this.currentChapter.chapter_blueprint.plot_beats?.length || 0);
    this.logger.log('掩码后节拍结构:');
    maskedBlueprint.plot_beats?.forEach((beat, idx) => {
        const contentPreview = beat.plot_summary?.substring(0, 50) || beat.description?.substring(0, 50) || beat.summary?.substring(0, 50) || '无内容';
        const visibility = beat.status === '【待解锁】' ? '(已屏蔽)' : '(完整可见)';
        this.logger.log(`  节拍${idx + 1}: ${beat.status} ${visibility} - ${contentPreview}...`);
    });
    const beaconPreview = maskedBlueprint.endgame_beacon?.substring(0, 50) || maskedBlueprint.endgame_beacons?.[0]?.substring(0, 50) || '无';
    this.logger.log('终章信标状态:', beaconPreview);

    // 【新增】验证高光设计掩码状态
    if (maskedBlueprint.chapter_core_and_highlight) {
        const highlightMasked = maskedBlueprint.chapter_core_and_highlight.highlight_design_logic?._masked;
        const targetBeat = maskedBlueprint.chapter_core_and_highlight.highlight_design_logic?.target_beat_id;
        this.logger.log('高光设计状态:', highlightMasked ? `(已屏蔽 - 目标节拍: ${targetBeat})` : '(完整可见)');
        if (highlightMasked) {
            this.logger.log('  ↳ 避免通过高光设计泄露未来节拍详情');
        }
    }

    this.logger.groupEnd();

    // V3.0 调试：验证第3层内容
    this.logger.group('[ENGINE-V3-DEBUG] 第3层蓝图内容验证');
    this.logger.log('scriptContent 总长度:', scriptContent.length);
    this.logger.log('蓝图包含plot_beats:', scriptContent.includes('plot_beats'));
    this.logger.log('蓝图包含endgame信标:', scriptContent.includes('endgame_beacon'));
    this.logger.groupEnd();

    // 【V3.2 重构】第4层：通用核心法则与关系指南
    const regularSystemPrompt = PromptBuilder.buildRegularSystemPrompt(this.currentChapter);
    rulesPlaceholder.content = [
        `# **【第4层：通用核心法则与关系指南】**`,
        `## (Core Rules & Relationship Guide)`,
        ``,
        regularSystemPrompt
    ].join('\n');

    this.info("✅ [V3.2] 异步处理完成，已通过优化的4层注入策略更新指令。");

} else {
    throw new Error("在 onPromptReady 中，currentChapter.chapter_blueprint 为空或无效。");
}
        } else {
            this.info("裁判模式已关闭。将注入通用剧本和规则，给予AI更高自由度...");

            const regularSystemPrompt = PromptBuilder.buildRegularSystemPrompt(this.currentChapter); // 包含核心法则和关系指南
   const blueprintAsString = JSON.stringify(this.currentChapter.chapter_blueprint, null, 2);

            const classicPrompt = [
                regularSystemPrompt,
                `# **【第四部分：本章动态剧本 (参考)】**`,
                `---`,
                `你当前正在执行以下剧本。请在理解其核心设定的前提下，进行更具创造性的自由演绎。`,
                `\`\`\`json\n${blueprintAsString}\n\`\`\``
            ].join('\n\n');

    scriptPlaceholder.content = classicPrompt;
    instructionPlaceholder.content = "【回合裁判已禁用。请根据创作蓝图自由演绎。】";
    recallPlaceholder.content = "【经典模式下无需实时召回。】";
    this.info("✅ 经典模式注入成功。");
}
    this.lastExecutionTimestamp = Date.now();
        this.info("[Watchdog] 成功注入，已更新执行时间戳。");
    } catch (error) {
        this.diagnose("在 onPromptReady 异步流程中发生严重错误:", error);
        // 出错时，将所有占位符都更新为错误信息，避免注入不完整
        instructionPlaceholder.content = "【SBT 引擎在处理指令时发生错误，本次将使用常规Prompt。】";
        recallPlaceholder.content = "【SBT 引擎在处理召回时发生错误。】";
        scriptPlaceholder.content = "【SBT 引擎在处理剧本时发生错误。】";
        rulesPlaceholder.content = "【SBT 引擎在处理法则时发生错误。】";
    } finally {
        this.isConductorActive = false;
        this.info("[Lock] Prompt注入流程执行完毕，会话锁已立即释放。");    }
};

/**
 * V4.1: 应用剧本动态掩码（方案二：信息迷雾）
 * 根据当前节拍进度，屏蔽未来节拍的详细内容
 */
_applyBlueprintMask(blueprint, currentBeatIdx) {
    if (!blueprint || !blueprint.plot_beats) {
        return blueprint;
    }

    // 深拷贝蓝图，避免修改原始数据
    const maskedBlueprint = JSON.parse(JSON.stringify(blueprint));

    // 【V9.0 简化】直接使用数字索引，不再解析字符串
    // 【修复】默认减一回合，避免AI多看一个节拍
    const currentBeatIndex = Math.max(0, (currentBeatIdx || 0) - 1);

    console.group('[信息迷雾] 剧本动态掩码处理');
    console.log('原始节拍索引:', currentBeatIdx);
    console.log('调整后索引（减1）:', currentBeatIndex);

    // 遍历节拍并应用掩码
    maskedBlueprint.plot_beats = maskedBlueprint.plot_beats.map((beat, index) => {
        if (index < currentBeatIndex) {
            // 过去的节拍：展示完整内容（AI需要知道已发生的事情），仅标记状态为已完成
            return {
                ...beat,
                status: "【已完成】",
                _context_note: "此节拍已完成，内容完整展示供AI参考"
            };
        } else if (index === currentBeatIndex) {
            // 当前节拍：完全展示并高亮标记
            return {
                ...beat,
                status: "【⚠️ 当前执行目标 ⚠️】",
                _instruction: "FOCUS HERE: 你的所有描写必须且只能服务于此节拍。禁止推进到下一节拍。"
            };
        } else {
            // 未来的节拍：物理屏蔽内容
            return {
                beat_id: `【节拍${index + 1}：内容已屏蔽】`,
                status: "【待解锁】",
                description: "【数据删除 - 此时不可见】",
                type: "Unknown",
                _note: "此节拍内容已被系统屏蔽，你无法访问"
            };
        }
    });

    // 屏蔽终章信标（除非已经到达终局）
    const isEndgame = currentBeatIndex >= maskedBlueprint.plot_beats.length;
    if (!isEndgame) {
        if (maskedBlueprint.endgame_beacons) {
            maskedBlueprint.endgame_beacons = ["【数据删除 - 仅在最后节拍解锁】"];
        }
        if (maskedBlueprint.endgame_beacon) {
            maskedBlueprint.endgame_beacon = "【数据删除 - 仅在最后节拍解锁】";
        }
    }

    // 【修复】屏蔽 chapter_core_and_highlight 中的导演意图，避免影响AI自然演绎
    if (maskedBlueprint.chapter_core_and_highlight) {
        const highlightInfo = maskedBlueprint.chapter_core_and_highlight;

        // 提取目标节拍ID
        const targetBeatId = highlightInfo.highlight_design_logic?.target_beat_id
                          || highlightInfo.highlight_directive?.target_beat;

        if (targetBeatId) {
            // 查找目标节拍的索引
            const targetBeatIndex = maskedBlueprint.plot_beats.findIndex(
                beat => beat.beat_id === targetBeatId
            );

            // 【关键修改】始终屏蔽导演意图的详细内容，避免AI被"导演思维"污染
            // 只保留 creative_core 让AI理解情感方向，但不告诉它具体怎么做
            maskedBlueprint.chapter_core_and_highlight = {
                creative_core: highlightInfo.creative_core,
                highlight_design_logic: {
                    _masked: true,
                    _note: "【数据删除 - 导演意图已屏蔽，请AI根据节拍内容自然演绎】"
                },
                highlight_directive: {
                    _masked: true,
                    _note: "【数据删除 - 执行指令已屏蔽，请AI根据节拍内容自然演绎】"
                }
            };
        }
    }

    // 【新增】在控制台打印掩码后的完整蓝图
    console.log('掩码后的完整蓝图:');
    console.dir(maskedBlueprint, { depth: null });
    console.groupEnd();

    return maskedBlueprint;
}
/**带有智能重试机制的UI同步器。如果失败，则会在有限次数内自动重试。*/
    _syncUiWithRetry() {
        // 1. 尝试从消息历史中寻找 Leader 状态
        const { piece } = this.USER.findLastMessageWithLeader();
        const metadataLeader = this.USER.getContext()?.chatMetadata?.leader;
        let resolvedLeader = null;
        let leaderSource = null;

        if (piece && Chapter.isValidStructure(piece.leader)) {
            resolvedLeader = piece.leader;
            leaderSource = 'chat';
        } else if (metadataLeader && Chapter.isValidStructure(metadataLeader)) {
            resolvedLeader = metadataLeader;
            leaderSource = 'metadata';
        }

        const genesisBtn = $('#sbt-start-genesis-btn');
        const transitionBtnWrapper = $('#sbt-force-transition-btn-wrapper');

        // Case A: 找到了历史状态 -> 恢复它
        if (resolvedLeader) {
            this.info(`  -> 成功找到leader状态！（来源: ${leaderSource}）正在切换“开始游戏”按钮。`);
            genesisBtn.hide();
            transitionBtnWrapper.show();

            // 恢复状态到内存
            this.currentChapter = Chapter.fromJSON(resolvedLeader);
            this.narrativeControlTowerManager.syncStorylineProgressWithStorylines(this.currentChapter);
            
            // 触发UI更新
            this.eventBus.emit('CHAPTER_UPDATED', this.currentChapter);
            
            // 清理计时器
            clearTimeout(this.uiSyncRetryTimer);
            this.uiSyncRetryTimer = null;
            this.uiSyncRetryCount = 0;
            return;
        }
        
        // Case B: 未找到状态，检查重试次数
        const MAX_RETRIES = 5; 
        const RETRY_DELAY = 500;

        if (this.uiSyncRetryCount >= MAX_RETRIES) {
            this.warn(`  -> 已达到最大重试次数，仍未找到leader状态。启动【降级模式】。`);
            
            // 切换按钮显示为“开始新篇章”
            genesisBtn.show();
            transitionBtnWrapper.hide();

            // ================= [修复核心] =================
            // 尝试构建静态缓存预览，并将其作为 currentChapter
            // 这样前端就能看到数据，且 Genesis 流程可以复用它
            let fallbackChapter = this._buildChapterPreviewFromStaticCache();

            if (!fallbackChapter) {
                // 如果连缓存都没有，创建一个空白的作为最后手段
                const charId = this.USER.getContext()?.characterId;
                fallbackChapter = new Chapter({ characterId: charId });
                this.info("  -> 无静态缓存，初始化空白章节。");
            } else {
                this.info("  -> 已加载静态数据库缓存作为预览状态。");
            }

            // 将其设为当前章节，允许用户在前端修改
            this.currentChapter = fallbackChapter;
            this.eventBus.emit('CHAPTER_UPDATED', fallbackChapter);
            // ==============================================

            clearTimeout(this.uiSyncRetryTimer);
            this.uiSyncRetryTimer = null;
            this.uiSyncRetryCount = 0;
            return;
        }    

        // Case C: 继续重试
        this.uiSyncRetryCount++;
        // this.info(`  -> 未找到leader状态，将在 ${RETRY_DELAY}ms 后重试...`); // 减少刷屏
        this.uiSyncRetryTimer = setTimeout(() => this._syncUiWithRetry(), RETRY_DELAY);
    }
    /**
     * 尝试从静态数据库构建一个章节预览，用于在缺少 leader 状态时展示。
     * @returns {Chapter|null}
     */
    _buildChapterPreviewFromStaticCache() {
        try {
            const context = this.USER.getContext ? this.USER.getContext() : {};
            const charId = context?.characterId;
            if (!charId) {
                this.info('[Engine] 当前会话缺少角色ID，静态缓存预览跳过。');
                return null;
            }

            const cachedData = staticDataManager.loadStaticData?.(charId) || null;
            if (!cachedData) {
                this.info(`[Engine] 角色 ${charId} 暂无静态缓存数据。`);
                return null;
            }

            const safeWorldview = cachedData.worldview || {};
            const safeStorylines = cachedData.storylines || {};

            const chapterData = {
                uid: `static_cache_${charId}`,
                characterId: charId,
                staticMatrices: {
                    characters: cachedData.characters || {},
                    worldview: {
                        locations: safeWorldview.locations || {},
                        items: safeWorldview.items || {},
                        factions: safeWorldview.factions || {},
                        concepts: safeWorldview.concepts || {},
                        events: safeWorldview.events || {},
                        races: safeWorldview.races || {}
                    },
                    storylines: {
                        main_quests: safeStorylines.main_quests || {},
                        side_quests: safeStorylines.side_quests || {},
                        relationship_arcs: safeStorylines.relationship_arcs || {},
                        personal_arcs: safeStorylines.personal_arcs || {}
                    },
                    relationship_graph: cachedData.relationship_graph || { edges: [] }
                },
                dynamicState: {
                    characters: {},
                    worldview: {
                        locations: {},
                        items: {},
                        factions: {},
                        concepts: {},
                        events: {},
                        races: {}
                    },
                    storylines: {
                        main_quests: {},
                        side_quests: {},
                        relationship_arcs: {},
                        personal_arcs: {}
                    }
                },
                meta: {
                    longTermStorySummary: cachedData.longTermStorySummary || '（静态数据预览）',
                    lastChapterHandoff: cachedData.lastChapterHandoff || null,
                    narrative_control_tower: cachedData.narrative_control_tower || { storyline_progress: {} }
                },
                chapter_blueprint: cachedData.chapter_blueprint || {},
                activeChapterDesignNotes: cachedData.activeChapterDesignNotes || null,
                __source: 'static_cache'
            };

            if (!chapterData.meta.narrative_control_tower.storyline_progress) {
                chapterData.meta.narrative_control_tower.storyline_progress = {};
            }

            return new Chapter(chapterData);
        } catch (error) {
            this.diagnose('[Engine] 构建静态缓存章节预览失败:', error);
            return null;
        }
    }

    onStateChange = () => {
        // 使用 debounce 防止事件风暴（例如，快速删除多条消息）
        clearTimeout(this.syncDebounceTimer);
        this.syncDebounceTimer = setTimeout(() => {
        this.info("[SBE Engine] 状态变更事件触发，启动智能UI同步流程...");

          // 🔧 自动清理chat消息中的污染leader数据（首次运行）
          if (!this._hasCleanedChat) {
              try {
                  this.info("正在检查聊天消息中的leader数据完整性...");
                  const chatCleanReport = this._cleanPollutedLeadersInChat();
                  if (chatCleanReport.cleanedCount > 0) {
                      this.info(`✅ 聊天消息修复完成：清理了 ${chatCleanReport.cleanedCount} 条消息中的污染leader数据`);
                      this.diagnose("清理详情:", chatCleanReport);
                  }
                  this._hasCleanedChat = true;
              } catch (error) {
                  this.diagnose("清理聊天消息失败（不影响使用）:", error);
                  this._hasCleanedChat = true; // 即使失败也标记为已尝试，避免重复
              }
          }

          const { piece, deep } = this.USER.findLastMessageWithLeader();
        const $anchorIndex = $('#sbt-chapter-anchor-index');

        if (piece && Chapter.isValidStructure(piece.leader)) {
            const startIndex = deep;
            $anchorIndex.text(`#${startIndex}`);

            // 🔍 诊断日志：打印锚定楼层的详细信息（完整版，不省略）
            this.info("════════════════════════════════════════════════════");
            this.info(`📍 [锚定楼层诊断] 找到 Leader 消息`);
            this.info(`   → 消息索引: ${deep}`);
            this.info(`   → 消息发送者: ${piece.is_user ? '用户' : 'AI'}`);
            this.info(`   → 消息完整内容: ${piece.mes || '(空)'}`);
            this.info(`   → Leader UID: ${piece.leader?.uid || '未知'}`);
            this.info(`   → 章节标题: ${piece.leader?.meta?.chapter_title || '未设置'}`);
            this.info(`   → 聊天总消息数: ${this.USER.getContext().chat.length}`);
            this.info(`   → Leader 完整数据（JSON格式，不省略）:`);
            try {
                const leaderJson = JSON.stringify(piece.leader, null, 2);
                // 分段输出，每400字符一段
                const chunkSize = 400;
                for (let i = 0; i < leaderJson.length; i += chunkSize) {
                    const chunk = leaderJson.substring(i, i + chunkSize);
                    const partNum = Math.floor(i / chunkSize) + 1;
                    const totalParts = Math.ceil(leaderJson.length / chunkSize);
                    this.info(`[Part ${partNum}/${totalParts}] ${chunk}`);
                }
            } catch (err) {
                this.info(`JSON序列化失败: ${err.message}`);
            }
            this.info("════════════════════════════════════════════════════");
        } else {
            $anchorIndex.text(`--`);
        }
        clearTimeout(this.uiSyncRetryTimer);
        this.uiSyncRetryTimer = null;
        this.uiSyncRetryCount = 0;
        this._syncUiWithRetry();

        }, 150);
    }
    onCommitState = async (messageIndex) => {
     try {
            this.info(`PROBE [COMMIT-1]: onCommitState 事件触发，消息索引: ${messageIndex}。检查待办任务...`, {
                isGenesisPending: this.isGenesisStatePendingCommit,
                isTransitionPending: this.isTransitionPending
            });

            if (typeof messageIndex !== 'number' || messageIndex < 0) {
                this.warn("PROBE [COMMIT-2-FAIL]: 收到无效的消息索引，任务中止。");
                return;
            }
        if (this.isGenesisStatePendingCommit && this.currentChapter) {
            this.info("PROBE [COMMIT-3-GENESIS]: 检测到待处理的【创世纪】任务。开始锚定状态...");
            const chat = this.USER.getContext().chat;
            const anchorMessage = chat[messageIndex];
            if (anchorMessage && !anchorMessage.is_user) {
                anchorMessage.leader = this.currentChapter.toJSON();
                this.USER.saveChat();
                this.isGenesisStatePendingCommit = false; 
                this.info(`PROBE [COMMIT-4-SUCCESS]: 创世纪状态已成功锚定。旗标已重置。`);
                this.eventBus.emit('CHAPTER_UPDATED', this.currentChapter);
            } else {
                this.warn(`PROBE [COMMIT-4-FAIL]: 创世纪锚定失败，目标消息无效。`);
            }
            
        } else if (this.isTransitionPending) {
            this.info("PROBE [COMMIT-3-TRANSITION]: 检测到待处理的【章节转换】任务。开始执行...");

            const transitionType = this.pendingTransitionPayload?.transitionType || 'Standard';
            const eventUid = `transition_${messageIndex}_${Date.now()}`;

            await this.triggerChapterTransition(eventUid, messageIndex, transitionType);

            this.isTransitionPending = false;
            this.pendingTransitionPayload = null;
            this.info("PROBE [COMMIT-4-SUCCESS]: 章节转换流程已触发。旗标已重置。");

        } else if (this.isNewChapterPendingCommit && this.currentChapter) {
            // V7.2: 遗留逻辑 - 正常情况下不应触发（新章节已在转换时直接保存）
            // 保留此逻辑作为后备方案，以防出现意外情况
            this.warn("PROBE [COMMIT-3-LEGACY]: 检测到遗留的【新章节待提交】标记。这不应该发生（V7.2后新章节已在转换时保存）。");
            this.warn("正在执行后备锚定逻辑...");
            const chat = this.USER.getContext().chat;
            const anchorMessage = chat[messageIndex];
            if (anchorMessage && !anchorMessage.is_user) {
                anchorMessage.leader = this.currentChapter.toJSON();
                this.USER.saveChat();
                this.isNewChapterPendingCommit = false;
                this.warn(`PROBE [COMMIT-4-LEGACY-SUCCESS]: 新章节状态已通过后备逻辑锚定（UID: ${this.currentChapter.uid}）。`);
                this.eventBus.emit('CHAPTER_UPDATED', this.currentChapter);
            } else {
                this.warn(`PROBE [COMMIT-4-LEGACY-FAIL]: 后备锚定失败，目标消息无效。`);
            }

        } else {
            this.info("PROBE [COMMIT-2-SKIP]: 无待处理的创世纪或转换任务。");
        }
         } catch (error) {
            this.diagnose("在 onCommitState 流程中发生严重错误:", error);
        } finally {
            if (this.isConductorActive) {
                this.isConductorActive = false;
                this.info("[Lock] onCommitState 执行完毕，已释放会话锁，准备接收下一次用户输入。");
            }
        }
    }



/**创世纪流程启动器。*/

async reanalyzeWorldbook() {
    // 【总开关保护】检查引擎是否已启用
    const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
    if (!isEngineEnabled) {
        this.toastr.warning('叙事流引擎已关闭，请先在设置中启用总开关', '功能已禁用');
        this.info('[Guard-MasterSwitch] 世界书重新分析中止：引擎总开关已关闭。');
        return;
    }

    if (!confirm("【高级操作】\n\n您确定要重新分析世界书吗？\n\n- 这会清除此角色的【静态设定缓存】。\n- 只有在您【更新了世界书文件】后，此操作才有意义。\n- 分析完成后，新的设定将【立即应用】到当前的游戏状态中。\n\n此操作不可逆，请谨慎操作。")) {
        return;
    }

    // 初始化中止控制器
    this._transitionStopRequested = false;
    this._activeTransitionToast = null;
    this.currentTaskAbortController = new AbortController();

    this._setStatus(ENGINE_STATUS.BUSY_ANALYZING);
    this.toastr.info("正在加载当前状态并分析世界书...", "引擎工作中");
    const loadingToast = this.toastr.info("正在加载状态...", "引擎后台分析中...", { timeOut: 0, extendedTimeOut: 0 });
    this._activeTransitionToast = loadingToast;

    try {
        const { piece: lastStatePiece } = this.USER.findLastMessageWithLeader();
        if (lastStatePiece && Chapter.isValidStructure(lastStatePiece.leader)) {
            this.currentChapter = Chapter.fromJSON(lastStatePiece.leader);
            this.narrativeControlTowerManager.syncStorylineProgressWithStorylines(this.currentChapter);
            this.info("热重载: 已从聊天记录中成功加载当前 Chapter 状态。");
            // 触发UI刷新，确保监控面板显示最新状态
            this.eventBus.emit('CHAPTER_UPDATED', this.currentChapter);
        } else {
            throw new Error("在聊天记录中未找到有效的故事状态。请先开始对话。");
        }

        loadingToast.find('.toast-message').html(`
            正在重新分析世界书...<br>
            <div class="sbt-compact-toast-actions">
                <button id="sbt-stop-transition-btn" class="sbt-compact-focus-btn sbt-stop-transition-btn" title="立即停止分析">
                    <i class="fa-solid fa-octagon-exclamation"></i> 停止
                </button>
            </div>
        `);
        this._bindStopButton('热重载-智能分析阶段');

        const activeCharId = this.currentChapter.characterId;
        this.info(`--- 启动对角色 ${activeCharId} 的世界书热重载 ---`);

        // V8.0: 获取完整的用户/主角信息
        const context = this.USER.getContext();
        const userName = window.name1 || context.name1 || '未知';
        const personaDescription = context.powerUserSettings?.persona_description || '';
        const persona = window.personas?.[window.main_persona];

        const protagonistInfo = {
            name: userName,
            description: personaDescription,
            personaContent: persona?.content || '',
        };

        const worldInfoEntries = await this.deps.getCharacterBoundWorldbookEntries(context);

        this.diagnose("热重载: 调用 IntelligenceAgent...");
        const analysisResult = await this.intelligenceAgent.execute({
            worldInfoEntries,
            protagonistInfo
        }, this.currentTaskAbortController.signal);

        if (!analysisResult || !analysisResult.staticMatrices) {
            throw new Error("IntelligenceAgent未能返回有效的分析结果（缺少staticMatrices）。");
        }

        // 保存到缓存：StaticDataManager期望接收staticMatrices对象
        staticDataManager.saveStaticData(activeCharId, analysisResult.staticMatrices);
        this.info("热重载: 新的静态数据已分析并存入缓存。");

        // 【关键保护逻辑】提取所有用户手动创建的内容
        const userCreatedContent = {
            characters: {},
            worldview: {},
            storylines: {},
            relationship_graph: { edges: [] }
        };

        // 提取用户创建的角色
        if (this.currentChapter.staticMatrices.characters) {
            for (const [charId, charData] of Object.entries(this.currentChapter.staticMatrices.characters)) {
                if (charData.isUserCreated === true) {
                    userCreatedContent.characters[charId] = charData;
                    this.info(`热重载保护: 保留用户创建的角色 "${charData.core?.name || charId}"`);
                }
            }
        }

        // 提取用户创建的世界观词条
        if (this.currentChapter.staticMatrices.worldview) {
            for (const [category, items] of Object.entries(this.currentChapter.staticMatrices.worldview)) {
                userCreatedContent.worldview[category] = {};
                if (items && typeof items === 'object') {
                    for (const [itemId, itemData] of Object.entries(items)) {
                        if (itemData.isUserCreated === true) {
                            userCreatedContent.worldview[category][itemId] = itemData;
                            this.info(`热重载保护: 保留用户创建的世界观词条 "${itemData.name || itemId}" (${category})`);
                        }
                    }
                }
            }
        }

        // 提取用户创建的故事线
        if (this.currentChapter.staticMatrices.storylines) {
            for (const [category, lines] of Object.entries(this.currentChapter.staticMatrices.storylines)) {
                userCreatedContent.storylines[category] = {};
                if (lines && typeof lines === 'object') {
                    for (const [lineId, lineData] of Object.entries(lines)) {
                        if (lineData.isUserCreated === true) {
                            userCreatedContent.storylines[category][lineId] = lineData;
                            this.info(`热重载保护: 保留用户创建的故事线 "${lineData.title || lineId}" (${category})`);
                        }
                    }
                }
            }
        }

        // 提取用户创建的关系
        if (this.currentChapter.staticMatrices.relationship_graph?.edges) {
            for (const edge of this.currentChapter.staticMatrices.relationship_graph.edges) {
                if (edge.isUserCreated === true) {
                    userCreatedContent.relationship_graph.edges.push(edge);
                    this.info(`热重载保护: 保留用户创建的关系 "${edge.relationship_label || edge.id}"`);
                }
            }
        }

        // 替换静态数据
        if (analysisResult.staticMatrices) {
            this.currentChapter.staticMatrices = analysisResult.staticMatrices;
            this.info("热重载: 新的 staticMatrices 已从世界书重新分析。");

            // 【关键合并逻辑】将用户创建的内容合并回来
            // 合并角色
            for (const [charId, charData] of Object.entries(userCreatedContent.characters)) {
                this.currentChapter.staticMatrices.characters[charId] = charData;
            }

            // 合并世界观词条
            for (const [category, items] of Object.entries(userCreatedContent.worldview)) {
                if (!this.currentChapter.staticMatrices.worldview[category]) {
                    this.currentChapter.staticMatrices.worldview[category] = {};
                }
                for (const [itemId, itemData] of Object.entries(items)) {
                    this.currentChapter.staticMatrices.worldview[category][itemId] = itemData;
                }
            }

            // 合并故事线
            for (const [category, lines] of Object.entries(userCreatedContent.storylines)) {
                if (!this.currentChapter.staticMatrices.storylines) {
                    this.currentChapter.staticMatrices.storylines = {};
                }
                if (!this.currentChapter.staticMatrices.storylines[category]) {
                    this.currentChapter.staticMatrices.storylines[category] = {};
                }
                for (const [lineId, lineData] of Object.entries(lines)) {
                    this.currentChapter.staticMatrices.storylines[category][lineId] = lineData;
                }
            }

            // 合并关系
            if (!this.currentChapter.staticMatrices.relationship_graph) {
                this.currentChapter.staticMatrices.relationship_graph = { edges: [] };
            }
            if (!this.currentChapter.staticMatrices.relationship_graph.edges) {
                this.currentChapter.staticMatrices.relationship_graph.edges = [];
            }
            for (const edge of userCreatedContent.relationship_graph.edges) {
                this.currentChapter.staticMatrices.relationship_graph.edges.push(edge);
            }

            const protectedCount =
                Object.keys(userCreatedContent.characters).length +
                Object.values(userCreatedContent.worldview).reduce((sum, cat) => sum + Object.keys(cat).length, 0) +
                Object.values(userCreatedContent.storylines).reduce((sum, cat) => sum + Object.keys(cat).length, 0) +
                userCreatedContent.relationship_graph.edges.length;

            if (protectedCount > 0) {
                this.info(`热重载: 已保护并合并 ${protectedCount} 项用户手动创建的内容。`);
            }

            this.info("热重载: 新的 staticMatrices (AI生成 + 用户创建) 已完成合并。");
        } else {
            this.warn("热重载警告: IntelligenceAgent未能返回完整的 staticMatrices，静态设定未更新。");
        }

        const chat = this.USER.getContext().chat;
        let lastAiMessageIndex = -1;
        for (let i = chat.length - 1; i >= 0; i--) {
            if (chat[i] && !chat[i].is_user) {
                lastAiMessageIndex = i;
                break;
            }
        }
        
        if (lastAiMessageIndex !== -1) {
            const anchorMessage = chat[lastAiMessageIndex];
            delete anchorMessage.leader; 
            anchorMessage.leader = this.currentChapter.toJSON();
            anchorMessage.leader.lastUpdated = new Date().toISOString(); // 添加一个更新时间戳
            this.USER.saveChat();
            this.info(`热重载: 更新后的 Chapter 状态已成功锚定到消息索引 ${lastAiMessageIndex}。`);
        } else {
            this.warn("热重载: 未找到可用的AI消息来锚定新状态，状态仅在内存中更新。");
        }
        this.eventBus.emit('CHAPTER_UPDATED', this.currentChapter);

        this.toastr.success("世界书已重新分析，并已应用到当前游戏状态！", "热重载成功");

    } catch (error) {
        if (error.name === 'AbortError' || error.code === 'SBT_TRANSITION_STOP') {
            this.warn('热重载流程被强制中止。');
            this._cleanupAfterTransitionStop();
            this.toastr.info("热重载已由用户成功中止。", "操作已取消");
        } else {
            this.diagnose("世界书热重载失败:", error);
            this.toastr.error(`操作失败: ${error.message.substring(0, 100)}...`, "内部错误");
        }
    } finally {
        if (loadingToast) this.toastr.clear(loadingToast);
        this._setStatus(ENGINE_STATUS.IDLE);
        this.currentTaskAbortController = null;
        this.currentChapter = null;
    }
}


async rerollChapterBlueprint() {
    // 【总开关保护】检查引擎是否已启用
    const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
    if (!isEngineEnabled) {
        this.toastr.warning('叙事流引擎已关闭，请先在设置中启用总开关', '功能已禁用');
        this.info('[Guard-MasterSwitch] 重roll中止：引擎总开关已关闭。');
        return;
    }

    // 检查是否有当前章节
    if (!this.currentChapter) {
        this.toastr.warning('当前没有活跃的章节，无法进行重roll。', '操作中止');
        return;
    }

    const userConfirmed = confirm("确定要重新分析当前章节的剧本吗？\n\n建筑师AI将使用相同的输入条件重新生成章节蓝图。\n\n注意：这不会影响已完成的对话，只会更新剧本计划。");

    if (!userConfirmed) {
        this.info("用户取消了重roll操作");
        return;
    }

    try {
        this._setStatus(ENGINE_STATUS.BUSY_PLANNING);
        this.info("--- 开始重新分析章节剧本 ---");

        // 显示进度提示
        const toastId = this.toastr.info('建筑师正在重新分析章节...', '剧本重roll中', {
            timeOut: 0,
            extendedTimeOut: 0,
            closeButton: true
        });

        // 创建中止控制器
        this.currentTaskAbortController = new AbortController();
        const abortSignal = this.currentTaskAbortController.signal;

        // 保存当前章节的上下文
        const contextForArchitect = {
            system_confidence: 0.5,
            player_profile: { description: "暂无画像。" },
            chapter: this.currentChapter,
            firstMessageContent: null // 重roll时不使用开场白
        };

        this.info("准备传递给建筑师的上下文:");
        this.logger.groupCollapsed("建筑师上下文（重roll）");
        console.dir(JSON.parse(JSON.stringify(contextForArchitect)));
        this.logger.groupEnd();

        // 调用建筑师AI重新生成
        const architectResult = await this.architectAgent.execute(contextForArchitect, abortSignal);

        if (architectResult && architectResult.new_chapter_script && architectResult.design_notes) {
            this.info("✓ 建筑师成功生成新的剧本");

            // 更新当前章节的蓝图和设计笔记
            this.currentChapter.chapter_blueprint = architectResult.new_chapter_script;
            this.currentChapter.activeChapterDesignNotes = architectResult.design_notes;

            // 保存到最后一条带有 leader 的消息中
            const { piece: lastStatePiece, index: lastStateIndex } = this.USER.findLastMessageWithLeader();
            if (lastStatePiece && lastStateIndex !== -1) {
                const chat = this.USER.getContext().chat;
                const targetMessage = chat[lastStateIndex];
                if (targetMessage) {
                    targetMessage.leader = this.currentChapter.toJSON();
                    this.USER.saveChat();
                    this.info("剧本已更新到聊天记录中的章节状态");
                } else {
                    this.warn("找不到目标消息，无法保存章节状态");
                }
            } else {
                this.warn("找不到带有 leader 的消息，无法保存章节状态");
            }

            // 触发UI刷新
            this.eventBus.emit('CHAPTER_UPDATED', this.currentChapter);

            // 关闭进度提示
            if (toastId) {
                toastr.clear(toastId);
            }

            this.toastr.success('章节剧本已重新生成！请在剧本区域查看。', '重roll成功');
            this.info("剧本重roll完成，UI已刷新");
        } else {
            this.warn("建筑师未能返回有效的剧本");
            if (toastId) {
                toastr.clear(toastId);
            }
            this.toastr.error('建筑师未能生成有效的剧本，请重试。', '重roll失败');
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            this.info('重roll操作被用户中止');
            this.toastr.info('剧本重roll已取消', '操作中止');
        } else {
            this.diagnose("重roll剧本时发生错误:", error);
            this.toastr.error(`重roll失败: ${error.message}`, '内部错误');
        }
    } finally {
        this._setStatus(ENGINE_STATUS.IDLE);
        this.currentTaskAbortController = null;
    }
}

async forceChapterTransition() {
    // 【总开关保护】检查引擎是否已启用
    const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
    if (!isEngineEnabled) {
        this.toastr.warning('叙事流引擎已关闭，请先在设置中启用总开关', '功能已禁用');
        this.info('[Guard-MasterSwitch] 强制章节转换中止：引擎总开关已关闭。');
        return;
    }

    const isRetryAvailable = !!this.LEADER.pendingTransition;
    let confirmationMessage = "您确定要立即结束当前篇章，并开始规划下一章吗？\n\n系统将以最新的AI回复作为本章的终点进行复盘。";
    
    if (isRetryAvailable) {
        confirmationMessage = "【检测到上次规划失败】\n\n系统已保存了史官的分析结果和您上次输入的焦点。\n\n您想直接从失败的“章节规划”步骤重试吗？\n\n(点击“取消”将清除失败记录，并开启一次全新的复盘)";
    }

    const userConfirmed = confirm(confirmationMessage);

    if (userConfirmed) {
        this.info("--- 用户手动触发章节转换 ---");
        
        if (!isRetryAvailable && this.LEADER.pendingTransition) {
            this.LEADER.pendingTransition = null;
            this.USER.saveChat(); 
            this.info("状态守卫：已强制清除过时的待处理过渡状态，确保全新启动。");
        }
        
        try {
            const chat = this.USER.getContext().chat;
            if (!chat || chat.length === 0) {
                this.toastr.warning("聊天记录为空，无法进行章节转换。", "操作中止");
                return;
            }

            let lastAiMessageIndex = -1;
            for (let i = chat.length - 1; i >= 0; i--) {
                if (chat[i] && !chat[i].is_user) {
                    lastAiMessageIndex = i;
                    break;
                }
            }

            if (lastAiMessageIndex === -1) {
                this.toastr.warning("未找到任何AI回复，无法进行章节转换。", "操作中止");
                return;
            }
            
            const eventUid = `manual_transition_${lastAiMessageIndex}_${Date.now()}`;
            this.info(`手动转换锚点：消息索引 ${lastAiMessageIndex}，事件 UID: ${eventUid}`);

            this.triggerChapterTransition(eventUid, lastAiMessageIndex, 'Standard');

        } catch (error) {
            this.diagnose("手动章节转换失败:", error);
            this.toastr.error("操作失败，详情请查看控制台。", "内部错误");
        }

    } else {
        if (isRetryAvailable) {
            this.LEADER.pendingTransition = null; // 使用 null 替代 delete
            this.USER.saveChat(); 
            this.toastr.info("已清除失败的规划记录。您可以重新开始一次全新的章节转换。", "操作已取消");
        }
    }
}
    setNarrativeFocus(focusText) {
        // 【轻度保护】如果引擎关闭，记录警告但允许设置焦点
        const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
        if (!isEngineEnabled) {
            this.warn('[Guard-Info] 引擎已关闭，但允许设置叙事焦点');
        }

        if (this.currentChapter && typeof focusText === 'string') {
            this.currentChapter.playerNarrativeFocus = focusText.trim();

            // 保存状态。由于这是在用户交互后立即发生，我们直接保存到 localStorage
            stateManager.saveChapterState(this.currentChapter);

            this.info(`叙事焦点已更新为: "${this.currentChapter.playerNarrativeFocus}"`);
            this.toastr.success("下一章的叙事焦点已设定！建筑师AI将会参考您的意见。", "罗盘已校准");

            // 触发一次UI更新，以防有显示焦点的地方
            $(document).trigger('sbt-chapter-updated', [this.currentChapter]);
        }
    }

    async saveCharacterEdit(charId, updatedChapterState) {
        this.info(`--- 保存角色 ${charId} 的编辑内容 ---`);

        // 【轻度保护】如果引擎关闭，记录警告但允许编辑（不触发AI）
        const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
        if (!isEngineEnabled) {
            this.warn('[Guard-Info] 引擎已关闭，但允许编辑操作（不会触发AI）');
        }

        try {
            // 查找最后一条AI消息作为锚点
            const chat = this.USER.getContext().chat;
            let lastAiMessageIndex = -1;

            for (let i = chat.length - 1; i >= 0; i--) {
                if (chat[i] && !chat[i].is_user) {
                    lastAiMessageIndex = i;
                    break;
                }
            }

            if (lastAiMessageIndex === -1) {
                throw new Error("未找到可锚定的AI消息");
            }

            // 将更新后的状态锚定到消息上
            const anchorMessage = chat[lastAiMessageIndex];
            anchorMessage.leader = updatedChapterState.toJSON ? updatedChapterState.toJSON() : updatedChapterState;

            // 保存聊天记录
            this.USER.saveChat();

            // 更新当前章节引用
            this.currentChapter = updatedChapterState;

            this.info(`角色 ${charId} 的编辑已成功保存到消息索引 ${lastAiMessageIndex}`);

        } catch (error) {
            this.diagnose("保存角色编辑失败:", error);
            throw error;
        }
    }

    async hardReset() {
        if (confirm("【警告】确定要硬重置吗？这将清除当前角色的所有SBT故事状态，并开始新的创世纪。")) {
            this.info("--- 引擎硬重置启动 ---");
            this.currentChapter = null;
            this.toastr.success("内存状态已清除。下次对话将触发新的创世纪。", "重置成功");
        }
    }
    


    // ========== 章节转换委托方法 ==========
    
    /**
     * 触发章节转换（委托给 TransitionManager）
     * @public
     */
    async triggerChapterTransition(eventUid, endIndex, transitionType = 'Standard') {
        return this.transitionManager.triggerChapterTransition(eventUid, endIndex, transitionType);
    }
    
    /**
     * 启动创世纪流程（委托给 TransitionManager）
     * @public
     */
    async startGenesisProcess() {
        return this.transitionManager.startGenesisProcess();
    }
    
    // 以下私有方法已迁移到 TransitionManager，保留桩方法以供向后兼容（如有需要）
    // _planNextChapter() - 已迁移
    // _runGenesisFlow() - 已迁移
    // _runStrategicReview() - 已迁移

    // ========== 用户交互委托方法 ==========
    
    /**
     * 捕获提前规划输入（委托给 UserInteractionHandler）
     * @private
     */
    async _captureEarlyFocusInput(workingChapter, $button) {
        return this.userInteractionHandler._captureEarlyFocusInput(workingChapter, $button);
    }
    
    /**
     * 绑定停止按钮（委托给 UserInteractionHandler）
     * @private
     */
    _bindStopButton(stageLabel) {
        return this.userInteractionHandler._bindStopButton(stageLabel);
    }
    
    /**
     * 处理停止转换请求（委托给 UserInteractionHandler）
     * @private
     */
    _handleStopTransitionRequest(stageLabel, $button) {
        return this.userInteractionHandler._handleStopTransitionRequest(stageLabel, $button);
    }
    
    // ========== 清理委托方法 ==========
    
    /**
     * 中止当前任务（委托给 CleanupHandler）
     * @public
     */
    abortCurrentTask() {
        return this.cleanupHandler.abortCurrentTask();
    }
    
    /**
     * 检查是否请求停止（委托给 CleanupHandler）
     * @private
     */
    _throwIfStopRequested(stageLabel) {
        return this.cleanupHandler._throwIfStopRequested(stageLabel);
    }
    
    /**
     * 转换停止后清理（委托给 CleanupHandler）
     * @private
     */
    _cleanupAfterTransitionStop() {
        return this.cleanupHandler._cleanupAfterTransitionStop();
    }
    
    /**
     * 清理污染的leader数据（委托给 CleanupHandler）
     * @private
     */
    _cleanPollutedLeadersInChat() {
        return this.cleanupHandler._cleanPollutedLeadersInChat();
    }
}
