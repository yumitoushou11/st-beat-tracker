// FILE: StoryBeatEngine.js

import { Chapter } from './Chapter.js';
import * as stateManager from './stateManager.js'; 
import { LLMApiService } from './LLMApiService.js';
import { DIRECTOR_RULEBOOK_PROMPT, AFFINITY_BEHAVIOR_MATRIX_PROMPT } from './ai/prompt_templates.js';
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
export class StoryBeatEngine {
    constructor(dependencies) {
        this.deps = dependencies;
        this.info = dependencies.info;
        this.warn = dependencies.warn;
        this.diagnose = dependencies.diagnose;
        this.toastr = dependencies.toastr;
        this.eventBus = dependencies.eventBus;
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
    this.status = ENGINE_STATUS.IDLE;
        this.isConductorActive = false; 
        this.intelligenceAgent = null;
        this.architectAgent = null; 
        this.historianAgent = null;
        this.mainLlmService = null; // 主服务
        this.conductorLlmService = null; // 回合裁判专用服务
        this.turnConductorAgent = null; 
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

        // 实例化主服务
        this.mainLlmService = new LLMApiService({
            api_url: apiSettings.main.apiUrl,
            api_key: apiSettings.main.apiKey,
            model_name: apiSettings.main.modelName,
        }, { EDITOR: this.EDITOR, USER: this.USER });
        this.info("核心大脑 LLM 服务已实例化。");

        // 实例化回合裁判服务
        this.conductorLlmService = new LLMApiService({
            api_url: apiSettings.conductor.apiUrl,
            api_key: apiSettings.conductor.apiKey,
            model_name: apiSettings.conductor.modelName,
        }, { EDITOR: this.EDITOR, USER: this.USER });
        this.info("回合裁判 LLM 服务已实例化。");

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
        this.info("核心AI Agent已根据双轨制API实例化。");
    }

    async start() {
        this.info("叙事流引擎 ( State Refactored) 正在启动...");
        this._initializeCoreServices();
   // 1. 首先，初始化UI管理器并注入所有依赖项。
    const uiManagerDependencies = {
        ...this.deps,
        onReanalyzeWorldbook: this.reanalyzeWorldbook.bind(this),
        onForceChapterTransition: this.forceChapterTransition.bind(this),
        onStartGenesis: this.startGenesisProcess.bind(this),
            mainLlmService: this.mainLlmService, 
            conductorLlmService: this.conductorLlmService,
        onSetNarrativeFocus: this.setNarrativeFocus.bind(this),
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
        
        this.onStateChange();

        this.info("叙事流引擎已准备就绪。");
    }
onPromptReady = async (eventData) => {
       const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
    if (!isEngineEnabled) {
        // 我们只在控制台打印信息，避免打扰用户。
        this.info('[Guard-MasterSwitch] 流程中止：叙事流引擎总开关已关闭。');
        return;
    }
    this.diagnose(`PROBE [PROMPT-READY-ENTRY]: onPromptReady 事件触发。当前锁状态: ${this.isConductorActive}`);
    
    if (this.isConductorActive) {
        this.info(`[Guard-Lock] 流程中止：上一个回合的异步处理尚未完成，已拦截重复触发。`);
        return;
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
const instructionPlaceholder = {
        role: 'system',
        content: "【SBT 引擎正在编译回合指令...】",
        is_SBT_script: true,
        is_SBT_turn_instruction: true // 1. 回合指令
    };
    const scriptPlaceholder = { 
        role: 'system', 
        content: "【SBT 引擎正在编译本章剧本...】",
        is_SBT_script: true,
        is_SBT_chapter_script: true // 2. 章节剧本
    };
    const rulesPlaceholder = {
        role: 'system',
        content: "【SBT 引擎正在编译通用法则...】",
        is_SBT_script: true,
        is_SBT_core_rules: true // 3. 通用法则
    };

    const finalChatContext = eventData.chat;
    for (let i = finalChatContext.length - 1; i >= 0; i--) {
        if (finalChatContext[i].is_SBT_script) {
            finalChatContext.splice(i, 1);
        }
    }
   finalChatContext.unshift(rulesPlaceholder);
    finalChatContext.unshift(scriptPlaceholder);
    finalChatContext.unshift(instructionPlaceholder);
    this.info("同步占位完成。即将进入异步处理阶段...");

    try {
        this.info("异步处理流程启动...");
        this.currentChapter = Chapter.fromJSON(lastStatePiece.leader);

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
                const historyDepth = 10; // 可配置的历史深度
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

            const conductorContext = { 
                lastExchange: lastExchange, 
                    chapterBlueprint: this.currentChapter.chapter_blueprint 
            };
            const conductorDecision = await this.turnConductorAgent.execute(conductorContext);

            this.diagnose('[PROBE][CONDUCTOR-DECISION] 收到回合指挥官的完整决策:', JSON.parse(JSON.stringify(conductorDecision)));
            if (conductorDecision.decision === 'TRIGGER_TRANSITION' || conductorDecision.decision === 'TRIGGER_EMERGENCY_TRANSITION') {
                const reason = conductorDecision.decision === 'TRIGGER_EMERGENCY_TRANSITION' ? "【紧急熔断】" : "【常规】";
                this.info(`PROBE [PENDING-TRANSITION]: 回合指挥官已发出${reason}章节转换的后台密令。`);
                this.isTransitionPending = true;
                this.pendingTransitionPayload = { decision: conductorDecision.decision }; 
            }

if (this.currentChapter.chapter_blueprint) {
    const formattedInstruction = this._formatMicroInstruction(conductorDecision.micro_instruction);
    instructionPlaceholder.content = `# **【最高优先级：本回合导演微指令 (Turn Instruction)】**\n---\n${formattedInstruction}`;
    
    // 【适配】将完整的蓝图对象字符串化后，作为参考资料注入
    const blueprintAsString = JSON.stringify(this.currentChapter.chapter_blueprint, null, 2);
    scriptPlaceholder.content = `# **【参考资料1：本章创作蓝图 (Chapter Blueprint)】**\n---\n\`\`\`json\n${blueprintAsString}\n\`\`\``;

    const regularSystemPrompt = this._buildRegularSystemPrompt();
    rulesPlaceholder.content = `# **【参考资料2：通用核心法则与关系指南 (Core Rules & Relationship Guide)】**\n---\n${regularSystemPrompt}`;
    
    this.info("✅ 异步处理完成，已通过优化的三层结构更新指令，注入成功。");
} else {
    throw new Error("在 onPromptReady 中，currentChapter.chapter_blueprint 为空或无效。");
}
        } else {
            this.info("裁判模式已关闭。将注入通用剧本和规则，给予AI更高自由度...");
            
            const regularSystemPrompt = this._buildRegularSystemPrompt(); // 包含核心法则和关系指南
   const blueprintAsString = JSON.stringify(this.currentChapter.chapter_blueprint, null, 2);
   
            const classicPrompt = [
                regularSystemPrompt,
                `# **【第四部分：本章动态剧本 (参考)】**`,
                `---`,
                `你当前正在执行以下剧本。请在理解其核心设定的前提下，进行更具创造性的自由演绎。`,
                fullChapterScript
            ].join('\n\n');

    scriptPlaceholder.content = classicPrompt;
    instructionPlaceholder.content = "【回合裁判已禁用。请根据创作蓝图自由演绎。】";
    this.info("✅ 经典模式注入成功。");
}

    } catch (error) {
        this.diagnose("在 onPromptReady 异步流程中发生严重错误:", error);
        // 出错时，将两个占位符都更新为错误信息，避免注入不完整
        scriptPlaceholder.content = "【SBT 引擎在处理剧本时发生错误。】";
        instructionPlaceholder.content = "【SBT 引擎在处理指令时发生错误，本次将使用常规Prompt。】";
    } finally {
        this.info("[Lock] 异步流程执行完毕，释放会话锁。");
        // isConductorActive 的解锁逻辑移至 onCommitState，保持不变
    }
};
    _buildRegularSystemPrompt() {
        const relationshipGuide = this._buildRelationshipGuide();
        
 return [
        DIRECTOR_RULEBOOK_PROMPT,
        relationshipGuide
    ].join('\n\n---\n\n');
}
 _consolidateChapterEvents(log, startIndex, endIndex) {
        this.info(`[Event Consolidation] 正在固化消息索引 ${startIndex} 到 ${endIndex} 之间的关系事件...`);

        const chapterEvents = log.filter(event =>
            event.sourceMessageIndex >= startIndex && event.sourceMessageIndex <= endIndex
        );

        const relationshipUpdates = chapterEvents.filter(
            e => e.event_type === 'RELATIONSHIP_UPDATE' || e.event_type === 'RELATIONSHIP_AFFINITY_MODIFIED'
        );

        if (relationshipUpdates.length === 0) {
            this.info("[Event Consolidation] 本章无关系变化事件可固化。");
            return log; // 如果没有关系事件，直接返回原日志
        }

        const netChanges = {}; // 用于存储净变化

        for (const event of relationshipUpdates) {
            const { character_a, character_b, affinity_change } = event.payload;
            const key = [character_a, character_b].sort().join('-'); // 创建一个唯一的键来代表一对关系
            
            if (!netChanges[key]) {
                netChanges[key] = { character_a, character_b, total_change: 0 };
            }
            netChanges[key].total_change += parseInt(affinity_change, 10) || 0;
        }
        
        // 创建一个新的、总结性的事件
        const consolidationEvent = {
            event_type: 'CHAPTER_RELATIONSHIP_SUMMARY',
            sourceChapterRange: { start: startIndex, end: endIndex },
            payload: {
                summary: `本章的关系动态已固化。`,
                net_changes: Object.values(netChanges).filter(c => c.total_change !== 0)
            },
            reasoning: "此事件取代了本章内所有独立的RELATIONSHIP_UPDATE事件，以压缩状态大小。"
        };

        // 从原始日志中，过滤掉所有被固化的独立事件
        const consolidatedLog = log.filter(event =>
            !(event.sourceMessageIndex >= startIndex && event.sourceMessageIndex <= endIndex && (event.event_type === 'RELATIONSHIP_UPDATE' || event.event_type === 'RELATIONSHIP_AFFINITY_MODIFIED'))
        );
        
        // 将新的总结性事件添加进去
        consolidatedLog.push(consolidationEvent);
        
        this.info(`[Event Consolidation] 固化完成！已将 ${relationshipUpdates.length} 条独立事件合并为1条总结事件。`);
        return consolidatedLog;
    }
_formatMicroInstruction(instruction) {
    // 如果输入无效，返回一个安全的默认值
    if (!instruction || typeof instruction !== 'object') {
        return "无特殊指令，请按剧本自由演绎。";
    }
    const { narrative_goal, scope_limit, narrative_hold, corrective_action } = instruction;
    // 如果是校准指令，优先显示
    if (corrective_action && corrective_action.toLowerCase() !== '无 (none)') {
        return `# 🚨 **【校准指令】**\n---\n*   ${corrective_action}`;
    }

    // 否则，构建常规的导演指令
    let formattedString = "# 🎬 **【本回合导演微指令】**\n---\n";
    formattedString += `*   **战术目标 (Goal):** ${narrative_goal || '自由演绎。'}\n`;
    formattedString += `*   **演绎边界 (Scope Limit):** ${scope_limit || '无特殊限制。'}\n`;
    formattedString += `*   **信息壁垒 (Hold):** ${narrative_hold || '无。'}`;

    return formattedString.trim();
}
/**带有智能重试机制的UI同步器。如果失败，则会在有限次数内自动重试。*/
_syncUiWithRetry() {
    this.info(`[UI-SYNC-RETRY] 正在尝试同步UI (第 ${this.uiSyncRetryCount + 1} 次)...`);
    
    // 1. 尝试加载状态
    const { piece } = this.USER.findLastMessageWithLeader();
      const genesisBtn = $('#sbt-start-genesis-btn');
    const transitionBtnWrapper = $('#sbt-force-transition-btn-wrapper');

    if (piece && Chapter.isValidStructure(piece.leader)) {
        this.info(`  -> 成功找到leader状态！正在切换到“游戏内”按钮。`);
        genesisBtn.hide();
        transitionBtnWrapper.show();

        this.eventBus.emit('CHAPTER_UPDATED', Chapter.fromJSON(piece.leader));
        clearTimeout(this.uiSyncRetryTimer);
        this.uiSyncRetryTimer = null;
        this.uiSyncRetryCount = 0;
        return;
    }
    
    // 3. 如果失败，检查是否应该继续重试
    const MAX_RETRIES = 5; // 最多重试5次
    const RETRY_DELAY = 500; // 每次重试间隔500毫秒

    if (this.uiSyncRetryCount >= MAX_RETRIES) {
        this.warn(`  -> 已达到最大重试次数，仍未找到leader状态。放弃同步。`);
         genesisBtn.show();
        transitionBtnWrapper.hide();

        this.eventBus.emit('CHAPTER_UPDATED', new Chapter({ characterId: this.USER.getContext()?.characterId }));
        clearTimeout(this.uiSyncRetryTimer);
        this.uiSyncRetryTimer = null;
        this.uiSyncRetryCount = 0;
        return;
    }    
    // 4. 安排下一次重试
    this.uiSyncRetryCount++;
    this.info(`  -> 未找到leader状态，将在 ${RETRY_DELAY}ms 后重试...`);
    this.uiSyncRetryTimer = setTimeout(() => this._syncUiWithRetry(), RETRY_DELAY);
}
    /**
     * [辅助函数] 从剧本纯文本中提取出“终章信标”部分。
     * @param {string} scriptText - 完整的剧本字符串。
     * @returns {string} - 只包含“终章信标”部分的文本。
     */
    _extractEndgameBeacons(scriptText = '') {
        const match = scriptText.match(/## 四、事件触发逻辑与终章信标[\s\S]*?(?=(?:## 五、|$))/);
        return match ? match[0].trim() : "【错误：未能提取终章信标】";
    }

    /**
     * [辅助函数] 从剧本纯文本中提取出当前的章节ID（例如 "第一卷"）。
     * @param {string} scriptText - 完整的剧本字符串。
     * @returns {string} - 章节ID。
     */
    _extractChapterId(scriptText = '') {
        const match = scriptText.match(/<第(.*?)>/);
        return match ? match[1].trim() : "未知章节";
    }

    /**
     * [辅助函数] 构建关系指南部分（从 onPromptReady 中抽离出来）。
     * @returns {string}
     */
    _buildRelationshipGuide() {
        let guide = AFFINITY_BEHAVIOR_MATRIX_PROMPT;
        
        const dynamicState = this.currentChapter.calculateCurrentDynamicState();
        const protagonistKey = Object.keys(this.currentChapter.staticMatrices.characterMatrix).find(
            key => this.currentChapter.staticMatrices.characterMatrix[key].isProtagonist
        ) || '{{user}}';
        
        const protagonistRelations = dynamicState.relationshipMatrix[protagonistKey] || {};

        if (Object.keys(protagonistRelations).length > 0) {
            for (const [charName, relData] of Object.entries(protagonistRelations)) {
                const affinity = relData?.affinity ?? '未知';
                let stage = "未知";
                if (affinity <= 10) stage = "陌生/警惕";
                else if (affinity <= 40) stage = "熟悉/中立";
                else if (affinity <= 70) stage = "友好/信任";
                else if (affinity <= 90) stage = "亲密/依赖";
                else stage = "羁绊/守护";
                
                guide += `- **你对 ${charName} 的看法:** 好感度 **${affinity}** (处于【${stage}】阶段)。\n`;
            }
        } else {
            guide += "你与其他角色的关系网络尚未建立。\n";
        }
        return guide;
    }
    onStateChange = () => {
    // 使用 debounce 防止事件风暴（例如，快速删除多条消息）
    clearTimeout(this.syncDebounceTimer);
    this.syncDebounceTimer = setTimeout(() => {
        this.info("[SBE Engine] 状态变更事件触发，启动智能UI同步流程...");
          const { piece, deep } = this.USER.findLastMessageWithLeader();
        const $anchorIndex = $('#sbt-chapter-anchor-index');

        if (piece && Chapter.isValidStructure(piece.leader)) {
            const startIndex = deep + 1;
            $anchorIndex.text(`#${startIndex}`);
        } else {
            $anchorIndex.text(`--`);
        }
        clearTimeout(this.uiSyncRetryTimer);
        this.uiSyncRetryTimer = null;
        this.uiSyncRetryCount = 0;
        this._syncUiWithRetry();

    }, 150);
}
    
    async _runGenesisFlow(firstMessageContent = null) {
    this._setStatus(ENGINE_STATUS.BUSY_GENESIS);
    this.info(`--- 创世纪流程启动 ---`);
    console.group(`BRIDGE-PROBE [GENESIS-FLOW-REFACTORED]`);
   const loadingToast = this.toastr.info(
            "正在初始化...",
            "创世纪...",
            { timeOut: 0, extendedTimeOut: 0, closeButton: false, progressBar: true, tapToDismiss: false }
        );
    try {
        const context = this.deps.applicationFunctionManager.getContext();
        const activeCharId = context?.characterId;
        if (!activeCharId) throw new Error("无法获取 activeCharId，创世纪中止。");
        this.currentChapter = new Chapter({ characterId: activeCharId });
        this.info("GENESIS: 已为新篇章创建 Chapter 实例。");
        this.diagnose("GENESIS: 正在检查或分析静态数据...");
            let analysisResult = staticDataManager.loadStaticData(activeCharId);
              loadingToast.find('.toast-message').text("正在分析世界观与角色设定...");
            if (!analysisResult) {
                this.info("GENESIS: 未找到缓存，正在实时分析世界书...");
                const persona = window.personas?.[window.main_persona];
                const worldInfoEntries = await this.deps.getCharacterBoundWorldbookEntries(context);
                
                // 2. 从AI获取包含三个顶级键的完整分析结果
                analysisResult = await this.intelligenceAgent.execute({ worldInfoEntries, persona });

                if (analysisResult) {
                    // 3. 将完整的分析结果（包含三个键）存入缓存
                    staticDataManager.saveStaticData(activeCharId, analysisResult);
                } else {
                    throw new Error("IntelligenceAgent未能返回有效数据。");
                }
            } else {
                this.info("GENESIS: 已从缓存加载分析结果。");
            }
            
            // 4. 无论数据来源是缓存还是AI，都使用这套分发逻辑
            if (analysisResult && analysisResult.characterMatrix && analysisResult.worldviewMatrix && analysisResult.lineMatrix) {
                this.currentChapter.staticMatrices = {
                    characterMatrix: analysisResult.characterMatrix,
                    worldviewMatrix: analysisResult.worldviewMatrix
                };
                // 将 lineMatrix 分发到顶层的 lineMatrix
                this.currentChapter.lineMatrix = analysisResult.lineMatrix;
            } else {
                // 降级处理：如果加载的数据结构不正确
                this.warn("加载的静态数据或缓存结构不完整，将使用空档案。");
                this.currentChapter.staticMatrices = { characterMatrix: {}, worldviewMatrix: {} };
                this.currentChapter.lineMatrix = {};
            }
                    this.info("GENESIS: 静态数据与初始故事线已准备就绪。");
        this._setStatus(ENGINE_STATUS.BUSY_DIRECTING);
        loadingToast.find('.toast-message').text("等待导演（玩家）指示...");
        const popupResult = await this.deps.showNarrativeFocusPopup(''); 
        let initialChapterFocus = "由AI自主创新。";
        if (popupResult.nsfw) {
            initialChapterFocus = "nsfw: " + (popupResult.value || "请AI自主设计成人情节");
        } else if (popupResult.confirmed && popupResult.value) {
            initialChapterFocus = popupResult.value;
        }
        this.currentChapter.playerNarrativeFocus = initialChapterFocus;
        this.info(`GENESIS: 玩家设定的开篇小章焦点为: "${initialChapterFocus}"`);
        this._setStatus(ENGINE_STATUS.BUSY_PLANNING);
        loadingToast.find('.toast-message').text("建筑师正在构思开篇剧本...");
     const architectResult = await this._planNextChapter(true, this.currentChapter, firstMessageContent);    
       if (architectResult && architectResult.new_chapter_script) { // new_chapter_script 现在是蓝图对象
    this.currentChapter.chapter_blueprint = architectResult.new_chapter_script; // 【适配】
    this.currentChapter.activeChapterDesignNotes = architectResult.design_notes;
    this.info("GENESIS: 建筑师成功生成开篇创作蓝图及设计笔记。");
} else {
    throw new Error("建筑师未能生成有效的开篇创作蓝图。");
}
    } catch (error) {
        this.diagnose("创世纪流程中发生严重错误:", error);
        this.toastr.error(`创世纪失败: ${error.message}`, "引擎严重错误");
        if (!this.currentChapter) {
            this.currentChapter = new Chapter({ characterId: this.deps.applicationFunctionManager.getContext()?.characterId });
        }
    } finally {
        this._setStatus(ENGINE_STATUS.IDLE);
        console.groupEnd();
          if (loadingToast) this.toastr.clear(loadingToast);
    }
}
    onCommitState = async (messageIndex) => {
     try {
            this.diagnose(`PROBE [COMMIT-1]: onCommitState 事件触发，消息索引: ${messageIndex}。检查待办任务...`, {
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

        } else {
            this.diagnose("PROBE [COMMIT-2-SKIP]: 无待处理的创世纪或转换任务。");
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

async triggerChapterTransition(eventUid, endIndex, transitionType = 'Standard') {
    this._setStatus(ENGINE_STATUS.BUSY_TRANSITIONING);
    const loadingToast = this.toastr.info(
        "正在启动章节转换流程...",
        "章节转换中...",
        { timeOut: 0, extendedTimeOut: 0, closeButton: false, progressBar: true, tapToDismiss: false }
    );
    this.info(`--- 章节转换流程启动 (健壮模式 V2 - 状态优化) ---`);
    console.group(`BRIDGE-PROBE [CHAPTER-TRANSITION-OPTIMIZED]: ${eventUid}`);

    try {
        const activeCharId = this.USER.getContext()?.characterId;
        if (!activeCharId) throw new Error("无法获取 activeCharId。");

        const { piece: lastStatePiece, deep: lastAnchorIndex } = this.USER.findLastMessageWithLeader({ deep: (this.USER.getContext().chat.length - 1 - endIndex) + 1 });

        let workingChapter = (lastStatePiece && Chapter.isValidStructure(lastStatePiece.leader))
            ? Chapter.fromJSON(lastStatePiece.leader)
            : new Chapter({ characterId: activeCharId });

        const staticData = staticDataManager.loadStaticData(activeCharId);
        workingChapter.staticMatrices = staticData || { characterMatrix: {}, worldviewMatrix: {} };

        let reviewResult = null;
        let finalNarrativeFocus = "由AI自主创新。";

        if (this.LEADER.pendingTransition) {
            this.info("检测到未完成的过渡，正在恢复进度...");
            loadingToast.find('.toast-message').text("恢复进度...");
            reviewResult = this.LEADER.pendingTransition.historianReviewResult;
            finalNarrativeFocus = this.LEADER.pendingTransition.playerNarrativeFocus;
            workingChapter.playerNarrativeFocus = finalNarrativeFocus; // 提前应用焦点
            this.info("史官分析结果和玩家焦点已从临时存储中恢复。");
        } else {
            loadingToast.find('.toast-message').text("史官正在复盘...");
            loadingToast.find('.toast-message').text("史官正在复盘本章历史...");
            reviewResult = await this._runStrategicReview(workingChapter, lastAnchorIndex, endIndex);
            if (!reviewResult) {
                this.toastr.error(
                    "史官在复盘本章历史时遇到严重错误（很可能是网络连接问题），章节转换已中止。<br><small>请检查您的网络和API设置后，前往“叙事罗盘”面板手动点击按钮重试。</small>", 
                    "章节转换失败", 
                    { timeOut: 15000, escapeHtml: false }
                );
                this.LEADER.pendingTransition = null;
                this.USER.saveChat();
                this._setStatus(ENGINE_STATUS.IDLE);
                if (loadingToast) this.toastr.clear(loadingToast);
                console.groupEnd();
                return; 
            }
            this.LEADER.pendingTransition = {
                historianReviewResult: reviewResult,
                playerNarrativeFocus: null,
                status: 'awaiting_focus'
            };
            this.USER.saveChat();
            this.info("史官复盘完成，中间结果已暂存。");

            loadingToast.find('.toast-message').text("等待导演指示...");
            if (localStorage.getItem('sbt-focus-popup-enabled') !== 'false') {
                this._setStatus(ENGINE_STATUS.BUSY_DIRECTING);
                const popupResult = await this.deps.showNarrativeFocusPopup(workingChapter.playerNarrativeFocus);
                if (popupResult.nsfw) {
                    finalNarrativeFocus = "nsfw: " + (popupResult.value || "请AI自主设计成人情节");
                } else if (popupResult.confirmed && popupResult.value) {
                    finalNarrativeFocus = popupResult.value;
                }
            }
            this.LEADER.pendingTransition.playerNarrativeFocus = finalNarrativeFocus;
            this.LEADER.pendingTransition.status = 'awaiting_architect';
            this.USER.saveChat();
            this.info("玩家焦点已捕获，中间结果已更新并暂存。");
        }

        workingChapter.playerNarrativeFocus = finalNarrativeFocus;

if (reviewResult) {


            if (reviewResult.new_events && Array.isArray(reviewResult.new_events)) {
                workingChapter.dynamicChronicle.log.push(...reviewResult.new_events);
            }

            if (reviewResult.new_line_matrix && typeof reviewResult.new_line_matrix === 'object') {
                workingChapter.lineMatrix = reviewResult.new_line_matrix;
                this.info("故事线网络已更新为包含所有历史的总览。");
            }

            const summaryEvent = reviewResult.new_events?.find(
                e => (e.event_type || e.eventType) === 'CHAPTER_SUMMARY_APPENDED'
            );
            if (summaryEvent?.payload) {
                if (typeof summaryEvent.payload.long_term_summary === 'string') {
                    workingChapter.longTermStorySummary = summaryEvent.payload.long_term_summary;
                    this.info("长篇故事摘要已更新。");
                }
                if (typeof summaryEvent.payload.handoff_memo === 'object') {
                    workingChapter.lastChapterHandoff = summaryEvent.payload.handoff_memo;
                    this.info("章节交接备忘录已更新。");
                }
            }
            if (reviewResult.dossier_updates && typeof reviewResult.dossier_updates === 'object') {
                this.info("检测到角色心理档案更新，正在深度合并...");
                for (const charId in reviewResult.dossier_updates) {
                    if (workingChapter.staticMatrices.characterMatrix[charId]) {
                        workingChapter.staticMatrices.characterMatrix[charId] = deepmerge(
                            workingChapter.staticMatrices.characterMatrix[charId],
                            reviewResult.dossier_updates[charId]
                        );

                        this.info(` -> 角色 [${charId}] 的心理档案已通过深度合并更新。`);
                    }
                }
            }
          workingChapter.dynamicChronicle.log = this._consolidateChapterEvents(
                workingChapter.dynamicChronicle.log,
                lastAnchorIndex + 1, 
                endIndex             
            );
            // =====================================================================================
        }
        workingChapter.lastProcessedEventUid = eventUid;

        this._setStatus(ENGINE_STATUS.BUSY_PLANNING);
        loadingToast.find('.toast-message').text("建筑师正在规划新章节...");
        const architectResult = await this._planNextChapter(false, workingChapter);
        if (!architectResult || !architectResult.new_chapter_script) {
            throw new Error("建筑师未能生成新剧本。中间进度已保存，请点击按钮重试。");
        }

        loadingToast.find('.toast-message').text("正在固化记忆并刷新状态...");
        const finalChapterState = workingChapter;
        finalChapterState.chapter_blueprint = architectResult.new_chapter_script; // 【适配】
finalChapterState.activeChapterDesignNotes = architectResult.design_notes;
        finalChapterState.checksum = simpleHash(JSON.stringify(finalChapterState) + Date.now());

        const targetPiece = this.USER.getContext().chat[endIndex];
        if (targetPiece) {
            targetPiece.leader = finalChapterState.toJSON();
            this.LEADER.pendingTransition = null;
            this.USER.saveChat();
            this.currentChapter = finalChapterState;
            this.info("新章节状态已成功写入聊天记录，临时状态已清除。");

            try {
                this.eventBus.emit('CHAPTER_UPDATED', this.currentChapter);
                this.toastr.success("章节已更新，仪表盘已刷新！", "无缝衔接");
            } catch (uiError) {
                this.diagnose("UI更新操作失败，但这不会影响核心状态的保存。", uiError);
                this.toastr.error("后台状态已更新，但UI刷新失败，请检查控制台。", "UI错误");
            }
        } else {
            throw new Error(`最终写入失败！索引 ${endIndex} 处无目标消息。`);
        }
    } catch (error) {
        this.diagnose("章节转换流程中发生严重错误:", error);
        this.toastr.error(`${error.message}`, "章节规划失败", { timeOut: 5000 });
    } finally {
        this._setStatus(ENGINE_STATUS.IDLE);
        if (loadingToast) this.toastr.clear(loadingToast);
        console.groupEnd();
    }
}
    async _runStrategicReview(chapterContext, startIndex, endIndex) {
        console.group("BRIDGE-PROBE [STRATEGIC-REVIEW]: 史官复盘");
        let reviewResult = null;
        try {
            let chapterTranscript = "【对话记录提取失败】";
            const chat = this.USER.getContext().chat;
            const chapterMessages = [];

            for (let i = endIndex; i > startIndex; i--) {
                chapterMessages.unshift(chat[i]);
            }

        if (chapterMessages.length > 0) {
            chapterTranscript = chapterMessages.map(msg => `[${msg.is_user ? "{{user}}" : "{{char}}"}]:\n${msg.mes}`).join('\n\n---\n\n');
        } else {
            chapterTranscript = "【本章无实质性对话】";
        }
         const currentDynamicState = chapterContext.calculateCurrentDynamicState();

   const contextForHistorian = {
                chapterTranscript,
                chapter: chapterContext,
                isNsfwTransition: false, 
                currentDynamicState,
            };

        reviewResult = await this.historianAgent.execute(contextForHistorian);

    } catch (error) {
        this.diagnose("在 _runStrategicReview 过程中发生错误:", error);
    } finally {
        console.groupEnd();
        return reviewResult;
    }
}
/**创世纪流程启动器。*/
async startGenesisProcess() {
    this.info("--- 用户通过UI启动创世纪流程 ---");

    if (typeof TavernHelper?.setChatMessages !== 'function') {
        this.toastr.error("核心辅助插件 (TavernHelper) 未找到或版本不兼容。", "依赖缺失");
        this.diagnose("TavernHelper.setChatMessages 不是一个有效的函数。");
        return;
    }
    if (this.status !== ENGINE_STATUS.IDLE) {
        this.toastr.warning("引擎当前正忙，请稍后再试。", "操作繁忙");
        return;
    }
    const { piece } = this.USER.findLastMessageWithLeader();
    if (piece) {
        this.toastr.error("当前聊天已存在叙事状态，无法重复开启新篇章。", "操作失败");
        return;
    }

    // --- 核心逻辑分支 ---
    const chat = this.USER.getContext().chat;
    const hasExistingFirstMessage = chat.length > 0 && chat[0] && !chat[0].is_user;
  const firstMessageContent = hasExistingFirstMessage ? chat[0].mes : null;
   await this._runGenesisFlow(firstMessageContent);
    if (!this.currentChapter || !this.currentChapter.chapter_blueprint) {
        this.toastr.error("创世纪流程未能成功生成剧本，请检查后台AI设置或查看控制台。", "创世纪失败");
        return;
    }
    
    const loadingToast = this.toastr.info("正在为您渲染故事的开端...", "序幕拉开", { timeOut: 0, extendedTimeOut: 0 });
    this._setStatus(ENGINE_STATUS.BUSY_ANALYZING);

    try {
        if (hasExistingFirstMessage) {
            // --- 方案A: 采用并增强已有的开场白 ---
            this.info("检测到角色自带开场白。将在此基础上静默初始化引擎...");
            
            const firstMessage = chat[0];
            firstMessage.leader = this.currentChapter.toJSON();
            await TavernHelper.setChatMessages(
                [{ message_id: 0, ...firstMessage }], 
                { refresh: 'all' }
            );

            this.info(`引擎状态已成功锚定到已存在的开场白 (消息ID: 0)。`);
            this.toastr.success("已在角色开场白上成功初始化叙事流引擎！", "无缝启动");

        } else {
            this.info("未检测到开场白。将为故事主动生成新的开场白...");

   const openingPrompt = `
# 指令：史诗的开端 (The Epic's Overture)

**身份确认:** 你是一位才华横溢的叙事者。

**核心任务:** 你将收到一份“框架式互动规则”（即第一章的剧本）。你的任务是根据这份规则，只撰写一段**“开场场景描述”**。

**【【【 绝对的、不可违背的规则 】】】**
1.  **禁止对话:** 你的回复中【绝对不能】包含任何角色的对话、心理独白或动作。
2.  **纯粹的环境描写:** 你的回复【必须】是一段纯粹的、第三人称的、富有文学性的**环境与氛围描写**。
3.  **忠于剧本:** 你的描写必须严格遵循下方“规则手册”中定义的场景、氛围和核心世界法则。你需要将那些抽象的规则，转化为玩家可以直观感受到的景象和感觉。

**任务开始...**
---
# **【第一卷 框架式互动规则】**
---
\`\`\`json
${JSON.stringify(this.currentChapter.chapter_blueprint, null, 2)}
\`\`\`
`;

            const openingNarration = await this.mainLlmService.callLLM([{ role: 'user', content: openingPrompt }]);
            if (!openingNarration || openingNarration.trim() === '') {
                throw new Error("AI未能生成有效的开场白。");
            }
            
            const openingMessage = {
                is_user: false,
                mes: openingNarration.trim(),
                leader: this.currentChapter.toJSON()
            };
            
            // 将新消息添加到聊天数组的末尾
            chat.push(openingMessage);
            const newMessageId = chat.length - 1;

            // 渲染这条新消息
            await TavernHelper.setChatMessages(
                [{ message_id: newMessageId, ...openingMessage }], 
                { refresh: 'all' }
            );

            this.info(`创世纪开场白已成功创建并锚定在消息ID: ${newMessageId}`);
            this.toastr.success("故事的序幕已拉开！现在，请您做出第一个行动。", "篇章开启");
        }

    } catch (error) {
        this.diagnose("在生成或提交开场白时发生错误:", error);
        this.toastr.error(`开场失败: ${error.message}`, "引擎错误");
    } finally {
        this.toastr.clear(loadingToast);
        this._setStatus(ENGINE_STATUS.IDLE);
        // 重置内存中的chapter，因为状态已经安全地写入了聊天记录
        this.currentChapter = null;
    }
}

async reanalyzeWorldbook() {
    if (!confirm("【高级操作】\n\n您确定要重新分析世界书吗？\n\n- 这会清除此角色的【静态设定缓存】。\n- 只有在您【更新了世界书文件】后，此操作才有意义。\n- 分析完成后，新的设定将【立即应用】到当前的游戏状态中。\n\n此操作不可逆，请谨慎操作。")) {
        return;
    }
    this._setStatus(ENGINE_STATUS.BUSY_ANALYZING);
    this.toastr.info("正在加载当前状态并分析世界书...", "引擎工作中");
    const loadingToast = this.toastr.info("正在加载状态...", "引擎后台分析中...", { timeOut: 0, extendedTimeOut: 0 });

    try {
        const { piece: lastStatePiece } = this.USER.findLastMessageWithLeader();
        if (lastStatePiece && Chapter.isValidStructure(lastStatePiece.leader)) {
            this.currentChapter = Chapter.fromJSON(lastStatePiece.leader);
            this.info("热重载: 已从聊天记录中成功加载当前 Chapter 状态。");
        } else {
            throw new Error("在聊天记录中未找到有效的故事状态。请先开始对话。");
        }
        
        loadingToast.find('.toast-message').text('正在重新分析世界书...');

        const activeCharId = this.currentChapter.characterId; 
        this.info(`--- 启动对角色 ${activeCharId} 的世界书热重载 ---`);

        const persona = window.personas?.[window.main_persona];
        const worldInfoEntries = await this.deps.getCharacterBoundWorldbookEntries(this.USER.getContext());
        
        this.diagnose("热重载: 调用 IntelligenceAgent...");
        const analysisResult = await this.intelligenceAgent.execute({ worldInfoEntries, persona });

        if (!analysisResult) {
            throw new Error("IntelligenceAgent未能返回有效的分析结果。");
        }
        staticDataManager.saveStaticData(activeCharId, analysisResult);
        this.info("热重载: 新的静态数据已分析并存入缓存。");


        if (analysisResult.characterMatrix && analysisResult.worldviewMatrix) {
            this.currentChapter.staticMatrices = {
                characterMatrix: analysisResult.characterMatrix,
                worldviewMatrix: analysisResult.worldviewMatrix
            };
            this.info("热重载: 新的 characterMatrix 和 worldviewMatrix 已成功组装并覆盖到当前 Chapter 实例。");
        } else {
            this.warn("热重载警告: IntelligenceAgent未能返回完整的 characterMatrix 或 worldviewMatrix，静态设定未更新。");
        }
        if (analysisResult.lineMatrix) {
            this.currentChapter.lineMatrix = analysisResult.lineMatrix;
            this.info("热重载: 新的初始 lineMatrix 已覆盖到当前 Chapter 实例。");
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
        this.diagnose("世界书热重载失败:", error);
        this.toastr.error(`操作失败: ${error.message.substring(0, 100)}...`, "内部错误");
    } finally {
        if (loadingToast) this.toastr.clear(loadingToast);
        this._setStatus(ENGINE_STATUS.IDLE);
        this.currentChapter = null; 
    }
}


async forceChapterTransition() {
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
async _planNextChapter(isGenesis = false, chapterForPlanning = null, firstMessageContent = null) {
    this._setStatus(ENGINE_STATUS.BUSY_PLANNING);
    const action = isGenesis ? "开篇章节" : "下一章节";
    this.info(`--- 启动“章节建筑师”规划${action}...`);
    
    const chapterContext = chapterForPlanning || this.currentChapter;
    const currentDynamicState = chapterContext.calculateCurrentDynamicState();

     const contextForArchitect = {
        system_confidence: isGenesis ? 0.1 : 0.5,
        player_profile: { description: "暂无画像。" },
        chapter: chapterContext,
        currentDynamicState: currentDynamicState,
        firstMessageContent: firstMessageContent
    };
    
    console.group(`BRIDGE-PROBE [PLAN-CHAPTER]`);
    this.diagnose(`PLAN-1: 正在调用 ArchitectAgent (${isGenesis ? '创世纪模式' : '常规模式'})...`);
    console.groupCollapsed("传递给 ArchitectAgent 的完整 'context' 对象:");
    console.dir(JSON.parse(JSON.stringify(contextForArchitect)));
    console.groupEnd();

    try {
        const architectResult = await this.architectAgent.execute(contextForArchitect);
        if (architectResult && architectResult.new_chapter_script && architectResult.design_notes) {
            this.info("PLAN-2-SUCCESS: ArchitectAgent 成功生成新剧本及其设计笔记。");
            return architectResult; // 直接返回这个结构清晰的对象
        } else {
            this.warn("PLAN-2-FAIL: ArchitectAgent 未能返回有效的剧本和设计笔记。");
            // 记录下失败时的返回内容，以便调试
            this.diagnose("ArchitectAgent 返回了无效或不完整的结构:", architectResult);
            return null;
        }
    } catch (error) {
        this.diagnose(`章节建筑师在规划时失败:`, error);
        return null;
    } finally {
        console.groupEnd();
    }
}
    
    setNarrativeFocus(focusText) {
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

    async hardReset() {
        if (confirm("【警告】确定要硬重置吗？这将清除当前角色的所有SBT故事状态，并开始新的创世纪。")) {
            this.info("--- 引擎硬重置启动 ---");
            this.currentChapter = null;
            this.toastr.success("内存状态已清除。下次对话将触发新的创世纪。", "重置成功");
        }
    }
    

}
