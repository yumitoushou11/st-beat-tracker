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
import { NarrativeControlTowerManager } from './src/NarrativeControlTowerManager.js';
import { EntityContextManager } from './src/EntityContextManager.js';
import { promptManager } from './promptManager.js';
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

        // 【调试模式辅助方法】
        this.debugLog = (...args) => {
            if (localStorage.getItem('sbt-debug-mode') === 'true') {
                console.log(...args); // <--- 修改为调用 console.log
            }
        };
        this.debugGroup = (...args) => {
            if (localStorage.getItem('sbt-debug-mode') === 'true') {
                console.group(...args);
            }
        };
        this.debugGroupCollapsed = (...args) => {
            if (localStorage.getItem('sbt-debug-mode') === 'true') {
                console.groupCollapsed(...args);
            }
        };
        this.debugGroupEnd = () => {
            if (localStorage.getItem('sbt-debug-mode') === 'true') {
                console.groupEnd();
            }
        };
        this.debugWarn = (...args) => {
            if (localStorage.getItem('sbt-debug-mode') === 'true') {
                console.warn(...args);
            }
        };

        this.narrativeControlTowerManager = new NarrativeControlTowerManager(this);
        this.entityContextManager = new EntityContextManager(this);
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
            api_provider: apiSettings.main.apiProvider || 'direct_openai',
            api_url: apiSettings.main.apiUrl,
            api_key: apiSettings.main.apiKey,
            model_name: apiSettings.main.modelName,
        }, { EDITOR: this.EDITOR, USER: this.USER });
        this.info(`核心大脑 LLM 服务已实例化 [模式: ${apiSettings.main.apiProvider || 'direct_openai'}]`);

        // 实例化回合裁判服务
        this.conductorLlmService = new LLMApiService({
            api_provider: apiSettings.conductor.apiProvider || 'direct_openai',
            api_url: apiSettings.conductor.apiUrl,
            api_key: apiSettings.conductor.apiKey,
            model_name: apiSettings.conductor.modelName,
        }, { EDITOR: this.EDITOR, USER: this.USER });
        this.info(`回合裁判 LLM 服务已实例化 [模式: ${apiSettings.conductor.apiProvider || 'direct_openai'}]`);

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
    async _captureEarlyFocusInput(workingChapter, $button) {
        if (!$button || $button.length === 0) {
            return null;
        }

        if (this._transitionStopRequested) {
            this.info("章节转换已请求停止，忽略新的提前规划输入。");
            return null;
        }

        this.info("玩家点击了提前规划按钮");
        $button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i>');

        this._setStatus(ENGINE_STATUS.BUSY_DIRECTING);
        let popupResult;

        try {
            popupResult = await this.deps.showNarrativeFocusPopup(workingChapter.playerNarrativeFocus);
        } catch (error) {
            this.warn("[SBT] 提前规划弹窗异常，已回退到常规流程", error);
            $button.prop('disabled', false).html('<i class="fa-solid fa-pen-ruler"></i> 规划');
            this._setStatus(ENGINE_STATUS.BUSY_TRANSITIONING);
            throw error;
        }

        // 玩家取消：恢复按钮并提前返回
        if (!popupResult.confirmed && !popupResult.freeRoam && !popupResult.abc) {
            $button.prop('disabled', false)
                .html('<i class="fa-solid fa-pen-ruler"></i> 规划')
                .css('background-color', '');
            this._setStatus(ENGINE_STATUS.BUSY_TRANSITIONING);
            this.info("玩家取消了提前输入");
            return null;
        }

        let earlyFocus = "由AI自主创新。";
        let earlyFreeRoam = false;

        if (popupResult.freeRoam) {
            earlyFreeRoam = true;
            earlyFocus = "[FREE_ROAM] " + (popupResult.value || "自由探索");
        } else if (popupResult.abc) {
            const userInput = popupResult.value || "";
            earlyFocus = userInput ? `${userInput} [IMMERSION_MODE]` : "[IMMERSION_MODE]";
        } else if (popupResult.confirmed && popupResult.value) {
            earlyFocus = popupResult.value;
        }

        this.LEADER.earlyPlayerInput = {
            focus: earlyFocus,
            freeRoam: earlyFreeRoam
        };

        this._setStatus(ENGINE_STATUS.BUSY_TRANSITIONING);
        $button.html('<i class="fa-solid fa-check"></i> 已记录')
            .css('background-color', '#4caf50');
        this.info(`玩家提前输入已记录: ${earlyFocus}`);
        return this.LEADER.earlyPlayerInput;
    }

    _bindStopButton(stageLabel) {
        const $stopBtn = $('#sbt-stop-transition-btn');
        if ($stopBtn.length === 0) {
            return;
        }
        $stopBtn.off('click').on('click', () => {
            this._handleStopTransitionRequest(stageLabel, $stopBtn);
        });
    }

    _handleStopTransitionRequest(stageLabel = '未知阶段', $button = null) {
        if (this._transitionStopRequested) {
            this.info("章节转换停止指令已存在，忽略重复请求。");
            return;
        }

        this._transitionStopRequested = true;
        if ($button && $button.length > 0) {
            $button.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 停止中');
        }
        $('.sbt-compact-focus-btn').prop('disabled', true);

        // V9.2: 升级为硬停止
        this.warn(`[SBT-Stop] 在${stageLabel}阶段收到停止指令，立即中止所有AI请求。`);
        this.abortCurrentTask();

        if (this._activeTransitionToast) {
            const $message = this._activeTransitionToast.find('.toast-message');
            if ($message.length > 0 && $message.find('.sbt-stop-hint').length === 0) {
                $message.append('<div class="sbt-stop-hint" style="color: #ffc107;">[!] 已发送强制中止指令...</div>');
            }
        }
    }
    // V9.2 新增：硬停止方法
    abortCurrentTask() {
        this.warn('收到外部强制中止指令！');
        this._transitionStopRequested = true;
        if (this.currentTaskAbortController) {
            this.currentTaskAbortController.abort();
            this.info('AbortController 已触发中止。');
        }
    }

    _throwIfStopRequested(stageLabel = '') {
        if (this._transitionStopRequested) {
            const error = new Error(`用户在${stageLabel || '未知'}阶段终止了章节转换`);
            error.code = 'SBT_TRANSITION_STOP';
            throw error;
        }
    }

    _cleanupAfterTransitionStop() {
        this.LEADER.pendingTransition = null;
        this.LEADER.earlyPlayerInput = null;
        this.USER.saveChat?.();
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
            recallPlaceholder.mes = worldviewInjection;

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
            this.debugGroup('[ENGINE-V2-PROBE] 准备 TurnConductor 输入上下文');
            const conductorContext = {
                lastExchange: lastExchange,
                chapterBlueprint: this.currentChapter.chapter_blueprint,
                chapter: this.currentChapter // V2.0: 传递完整的 chapter 实例
            };
            this.debugLog('✓ chapter 实例已传递（包含 staticMatrices 和 stylistic_archive）');
            this.debugGroupEnd();

            const conductorDecision = await this.turnConductorAgent.execute(conductorContext);

            this.info('[PROBE][CONDUCTOR-DECISION] 收到回合指挥官的完整决策:', JSON.parse(JSON.stringify(conductorDecision)));

            // 【V4.0】边界验证日志
            if (conductorDecision.micro_instruction?.scope_limit_reasoning) {
                this.info(`[BOUNDARY-CHECK] scope_limit边界推理: ${conductorDecision.micro_instruction.scope_limit_reasoning}`);
            }

            if (conductorDecision.decision === 'TRIGGER_TRANSITION' || conductorDecision.decision === 'TRIGGER_EMERGENCY_TRANSITION') {
                const reason = conductorDecision.decision === 'TRIGGER_EMERGENCY_TRANSITION' ? "【紧急熔断】" : "【常规】";
                this.info(`PROBE [PENDING-TRANSITION]: 回合指挥官已发出${reason}章节转换的后台密令。`);
                this.isTransitionPending = true;
                this.pendingTransitionPayload = { decision: conductorDecision.decision };
            }

            // V2.0: 处理实时上下文召回
            let dynamicContextInjection = '';
            if (conductorDecision.realtime_context_ids && conductorDecision.realtime_context_ids.length > 0) {
                this.debugGroup('[ENGINE-V2-PROBE] 实时上下文召回流程');
                this.info(`检测到 ${conductorDecision.realtime_context_ids.length} 个需要实时召回的实体`);
                this.debugLog('实体ID列表:', conductorDecision.realtime_context_ids);

                dynamicContextInjection = this.entityContextManager.retrieveEntitiesByIds(conductorDecision.realtime_context_ids);

                if (dynamicContextInjection) {
                    this.info('✓ 动态上下文已生成，将注入到 Prompt');
                } else {
                    this.warn('⚠️ 动态上下文生成失败或为空');
                }
                this.debugGroupEnd();
            } else {
                this.info('[ENGINE-V2] 本回合无需实时上下文召回');
            }

if (this.currentChapter.chapter_blueprint) {
    // 【V4.2 新增】第0层：剧透封锁禁令（最高优先级，独立消息）
    const narrativeHold = conductorDecision.micro_instruction?.narrative_hold || '';

    if (narrativeHold && narrativeHold.trim() !== '' && narrativeHold !== '无' && narrativeHold !== '无。') {
        spoilerBlockPlaceholder.content = [
            `# 🚫 【绝对禁止与封锁内容】`,
            ``,
            `**这是本回合的剧透封锁禁令。以下内容是绝对禁止的，违反将导致叙事失败。**`,
            ``,
            narrativeHold,
            ``,
            `**请在开始写作前，再次确认你已理解并遵守上述封锁禁令。**`
        ].join('\n');
        this.info('[SBT-INFO] ✓ 第0层剧透封锁已注入');
    } else {
        spoilerBlockPlaceholder.content = [
            `# 🚫 【绝对禁止与封锁内容】`,
            ``,
            `本回合无特殊剧透封锁要求。`
        ].join('\n');
        this.info('[SBT-INFO] ○ 第0层无封锁内容');
    }

    // 【V4.3 新增】第0.5层：场景状态补充（剧本润滑 - 信息补充）
    const scriptLubrication = conductorDecision.micro_instruction?.script_lubrication || '';

    if (scriptLubrication && scriptLubrication.trim() !== '' && scriptLubrication !== '无' && scriptLubrication !== '无。') {
        spoilerBlockPlaceholder.content += '\n\n' + [
            `---`,
            ``,
            `# 📍 【当前场景状态补充】`,
            ``,
            `**以下是本回合的场景物理状态信息，请将其作为当前场景的客观事实：**`,
            ``,
            scriptLubrication
        ].join('\n');
        this.info('[SBT-INFO] ✓ 第0.5层场景状态补充已注入');
    } else {
        this.info('[SBT-INFO] ○ 第0.5层无场景状态补充');
    }

    // 【V3.2 重构】第1层：最高优先级微指令（放在最前面，独立强调）
    // 【V4.1 增强】添加强化负面约束
    const formattedInstruction = this._formatMicroInstruction(conductorDecision.micro_instruction);
    const strictNarrativeConstraints = this._buildStrictNarrativeConstraints(
        conductorDecision.analysis.current_beat,
        conductorDecision.micro_instruction,
        conductorDecision.analysis.common_sense_review
    );

    instructionPlaceholder.content = [
        `# 【本回合导演微指令】`,
        ``,
        strictNarrativeConstraints,
        ``,
        formattedInstruction
    ].join('\n');

    // 【V3.2 重构】第2层：双轨召回档案（章节级 + 回合级）
    const chapterStaticContext = this.currentChapter.cachedChapterStaticContext || '';

    let recallContent = [
        `# **【第2层：召回档案】**`,
        `## (Entity Recall: Chapter-Level & Turn-Level)`,
        ``
    ];

    // 第2A部分：章节级静态实体（始终注入）
    if (chapterStaticContext) {
        recallContent.push(chapterStaticContext);
        this.info('✓ 章节级静态实体已注入到第2层');
    } else {
        recallContent.push(`📋 本章无预设核心实体。`);
        recallContent.push(``);
    }

    // 第2B部分：回合级动态实体（按需注入）
    if (dynamicContextInjection) {
        recallContent.push(``);
        recallContent.push(`---`);
        recallContent.push(``);
        recallContent.push(`### 📌 本回合额外召回 (Turn-Specific Recall)`);
        recallContent.push(``);
        recallContent.push(`以下是本回合涉及的**规划外**实体档案（未在章节规划中，但本回合需要）：`);
        recallContent.push(``);
        recallContent.push(dynamicContextInjection);
        this.info('✓ 回合级动态召回已注入到第2层');
    } else {
        this.info('○ 本回合无动态召回需求');
    }

    recallPlaceholder.content = recallContent.join('\n');

    // V3.0 调试：验证第2层召回内容
    this.debugGroup('[ENGINE-V3-DEBUG] 第2层召回内容验证');
    this.debugLog('recallContent 总长度:', recallPlaceholder.content.length);
    this.debugLog('是否包含章节级实体档案:', recallPlaceholder.content.includes('📂 章节级核心实体档案'));
    this.debugLog('是否包含char_yumi_pc:', recallPlaceholder.content.includes('char_yumi_pc'));
    this.debugLog('是否包含本回合额外召回:', recallPlaceholder.content.includes('本回合额外召回'));
    this.debugGroupEnd();

    // 【V3.2 重构】第3层：本章创作蓝图（纯净版，不再包含实体档案）
    // 【V4.1 增强】实现剧本动态掩码（信息迷雾）
    const currentBeat = conductorDecision.analysis.current_beat;
    const maskedBlueprint = this._applyBlueprintMask(
        this.currentChapter.chapter_blueprint,
        currentBeat
    );

    const blueprintAsString = JSON.stringify(maskedBlueprint, null, 2);
    const scriptContent = [
        `# **【第3层：本章创作蓝图】**`,
        `## (Chapter Blueprint)`,
        ``,
        `⚠️ **【信息迷雾协议】** 剧本已根据当前进度进行动态掩码处理`,
        `- 已完成的节拍：完整内容可见，标记为【已完成】（AI需要知道已发生的事情）`,
        `- 当前执行节拍：完整内容可见，高亮标记为【⚠️ 当前执行目标 ⚠️】`,
        `- 未来节拍：内容已屏蔽，状态为【待解锁】（防止剧透）`,
        ``,
        `\`\`\`json`,
        blueprintAsString,
        `\`\`\``,
        ``
    ].join('\n');

    scriptPlaceholder.content = scriptContent;
    this.info(`✓ 第3层创作蓝图已注入（当前节拍: ${currentBeat}，已应用动态掩码）`);

    // V4.1 调试：验证掩码效果
    this.debugGroup('[ENGINE-V4.1-DEBUG] 剧本动态掩码验证');
    this.debugLog('当前节拍:', currentBeat);
    this.debugLog('原始节拍数量:', this.currentChapter.chapter_blueprint.plot_beats?.length || 0);
    this.debugLog('掩码后节拍结构:');
    maskedBlueprint.plot_beats?.forEach((beat, idx) => {
        const contentPreview = beat.plot_summary?.substring(0, 50) || beat.description?.substring(0, 50) || beat.summary?.substring(0, 50) || '无内容';
        const visibility = beat.status === '【待解锁】' ? '(已屏蔽)' : '(完整可见)';
        this.debugLog(`  节拍${idx + 1}: ${beat.status} ${visibility} - ${contentPreview}...`);
    });
    const beaconPreview = maskedBlueprint.endgame_beacon?.substring(0, 50) || maskedBlueprint.endgame_beacons?.[0]?.substring(0, 50) || '无';
    this.debugLog('终章信标状态:', beaconPreview);
    this.debugGroupEnd();

    // V3.0 调试：验证第3层内容
    this.debugGroup('[ENGINE-V3-DEBUG] 第3层蓝图内容验证');
    this.debugLog('scriptContent 总长度:', scriptContent.length);
    this.debugLog('蓝图包含plot_beats:', scriptContent.includes('plot_beats'));
    this.debugLog('蓝图包含endgame信标:', scriptContent.includes('endgame_beacon'));
    this.debugGroupEnd();

    // 【V3.2 重构】第4层：通用核心法则与关系指南
    const regularSystemPrompt = this._buildRegularSystemPrompt();
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

            const regularSystemPrompt = this._buildRegularSystemPrompt(); // 包含核心法则和关系指南
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
    // 如果输入无效，返回空字符串（主要内容已在 _buildStrictNarrativeConstraints 中输出）
    if (!instruction || typeof instruction !== 'object') {
        return "";
    }
    const { corrective_action } = instruction;
    // 如果是校准指令，显示校准提示
    if (corrective_action && corrective_action.toLowerCase() !== '无 (none)') {
        return `**校准提示:** ${corrective_action}`;
    }

    // 常规情况下返回空，因为主要内容已在 _buildStrictNarrativeConstraints 中
    return "";
}

/**
 * V4.2: 构建强化负面约束（方案三：Prompt强化）
 * narrative_hold 已移至独立的第0层，此处只保留边界和建议
 * V8.1: 添加润滑策略传递 - 当社交摩擦力为高/极高时，将润滑策略发送给演绎AI
 * V8.2: 高光时刻强制执行 - 检测到★高光标记时，将"建议"改为"要求"
 */
_buildStrictNarrativeConstraints(currentBeat, microInstruction, commonSenseReview) {
    const scopeLimit = microInstruction?.scope_limit || '未定义';
    const narrativeGoal = microInstruction?.narrative_goal || '按照当前节拍自由演绎。';

    // 【V8.2 新增】检测是否为高光时刻
    const isHighlightMoment = narrativeGoal.includes('【★ 高光时刻】');

    let constraints = [
        `**当前节拍:** ${currentBeat}`
    ];

    // 【V8.2 新增】高光时刻时，scope_limit 升维为强制约束
    if (isHighlightMoment) {
        constraints.push(`**演绎边界（★强制约束）:** ${scopeLimit}`);
    } else {
        constraints.push(`**演绎边界:** ${scopeLimit}`);
    }

    constraints.push(``);

    // 【V8.1 新增】检查社交摩擦力，如果为高/极高，则添加润滑策略
    if (commonSenseReview && typeof commonSenseReview === 'object') {
        const frictionLevel = commonSenseReview.social_friction_level;
        const lubricationStrategy = commonSenseReview.lubrication_strategy;

        if ((frictionLevel === '高' || frictionLevel === '极高') &&
            lubricationStrategy &&
            lubricationStrategy.trim() !== '' &&
            lubricationStrategy !== '无需润滑') {

            // 添加润滑策略到叙事建议之前
            constraints.push(`**【社交摩擦力润滑方案】** ${lubricationStrategy}`);
            constraints.push(``);
        }
    }

    // 【V8.2 新增】高光时刻使用强制语气
    if (isHighlightMoment) {
        constraints.push(`**导演要求（★高光时刻 - 强制执行）:** ${narrativeGoal}`);
    } else {
        constraints.push(`**叙事建议:** ${narrativeGoal}`);
    }

    return constraints.join('\n');
}

/**
 * 处理节拍中的 ★ 星标标记
 * 检测 description 是否以 ★ 开头，如果是则设置 is_highlight 并清理标记
 */
_processStarMarkedBeats(blueprint) {
    if (!blueprint || !blueprint.plot_beats || !Array.isArray(blueprint.plot_beats)) {
        return;
    }

    let starCount = 0;
    blueprint.plot_beats.forEach((beat, index) => {
        if (beat.description && typeof beat.description === 'string') {
            const trimmed = beat.description.trim();
            if (trimmed.startsWith('★')) {
                // 设置高光标记
                beat.is_highlight = true;
                // 清理描述中的 ★ 符号
                beat.description = trimmed.substring(1).trim();
                starCount++;
                this.info(`[★ 星标检测] 节拍 ${index + 1} 被标记为高光节拍: ${beat.description.substring(0, 50)}...`);
            }
        }
    });

    if (starCount > 0) {
        this.info(`[★ 星标统计] 本章共有 ${starCount} 个高光节拍`);
    }
}

/**
 * V4.1: 应用剧本动态掩码（方案二：信息迷雾）
 * 根据当前节拍进度，屏蔽未来节拍的详细内容
 */
_applyBlueprintMask(blueprint, currentBeat) {
    if (!blueprint || !blueprint.plot_beats) {
        return blueprint;
    }

    // 深拷贝蓝图，避免修改原始数据
    const maskedBlueprint = JSON.parse(JSON.stringify(blueprint));

    // 解析当前节拍索引
    let currentBeatIndex = -1;
    let isEndgame = false;

    if (currentBeat.includes('【终章】')) {
        isEndgame = true;
        currentBeatIndex = maskedBlueprint.plot_beats.length; // 所有节拍都已完成
    } else {
        // 尝试从 "【节拍X】" 或 "【节拍X：名称】" 中提取索引
        // 支持格式: 【节拍6】 或 【节拍6：初次会面】
        const match = currentBeat.match(/【节拍(\d+)[：:】]/);
        if (match) {
            currentBeatIndex = parseInt(match[1]) - 1; // 转换为0-based索引
        }
    }

    // 如果无法识别当前节拍，保守处理：只显示第一个节拍
    if (currentBeatIndex === -1) {
        this.warn(`⚠️ 无法解析当前节拍: ${currentBeat}，默认显示第一个节拍`);
        currentBeatIndex = 0;
    }

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
                beat_id: beat.beat_id,
                status: "【待解锁】",
                description: "【数据删除 - 此时不可见】",
                type: "Unknown",
                _note: "此节拍内容已被系统屏蔽，你无法访问"
            };
        }
    });

    // 屏蔽终章信标（除非已经到达终局）
    if (!isEndgame) {
        if (maskedBlueprint.endgame_beacons) {
            maskedBlueprint.endgame_beacons = ["【数据删除 - 仅在最后节拍解锁】"];
        }
        if (maskedBlueprint.endgame_beacon) {
            maskedBlueprint.endgame_beacon = "【数据删除 - 仅在最后节拍解锁】";
        }
    }

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

        const characters = this.currentChapter.staticMatrices.characters || {};
        const protagonistId = Object.keys(characters).find(
            id => characters[id].isProtagonist
        );

        if (!protagonistId) {
            guide += "错误：未找到主角信息。\n";
            return guide;
        }

        // 从新数据模型中提取关系：遍历所有NPC对主角的关系
        let hasRelations = false;
        for (const charId in characters) {
            if (charId === protagonistId) continue; // 跳过主角自己

            // 优先使用动态关系，回退到静态关系
            const dynamicRel = this.currentChapter.dynamicState.characters?.[charId]?.relationships?.[protagonistId];
            const staticRel = characters[charId]?.relationships?.[protagonistId];

            const affinity = dynamicRel?.current_affinity ?? staticRel?.affinity;
            if (affinity !== undefined) {
                hasRelations = true;
                const charName = characters[charId]?.name || charId;
                let stage = "未知";
                if (affinity <= 10) stage = "陌生/警惕";
                else if (affinity <= 40) stage = "熟悉/中立";
                else if (affinity <= 70) stage = "友好/信任";
                else if (affinity <= 90) stage = "亲密/依赖";
                else stage = "羁绊/守护";

                guide += `- **${charName} 对你的看法:** 好感度 **${affinity}** (处于【${stage}】阶段)。\n`;
            }
        }

        if (!hasRelations) {
            guide += "你与其他角色的关系网络尚未建立。\n";
        }
        return guide;
    }
        _applyStateUpdates(workingChapter, delta) {
        this.info("--- 引擎核心：开始应用状态更新Delta ---");
        
        // 步骤一：处理新实体的创生 (Creations)
        if (delta.creations && delta.creations.staticMatrices) {
            this.info(" -> 检测到新实体创生请求...");
            // 使用深度合并，将新创建的静态档案安全地并入现有的staticMatrices中
            workingChapter.staticMatrices = deepmerge(workingChapter.staticMatrices, delta.creations.staticMatrices);
            this.diagnose(" -> 新的静态实体档案已合并。", delta.creations.staticMatrices);
        }

        // 步骤二：处理已存在实体的状态更新 (Updates)
        if (delta.updates) {
            this.info(" -> 检测到实体状态更新请求...");
            const updates = delta.updates;

            // 更新角色动态和静态
            if (updates.characters) {
                for (const charId in updates.characters) {
                    const charUpdates = updates.characters[charId];

                    // 确保角色在 staticMatrices 和 dynamicState 中都存在
                    if (!workingChapter.staticMatrices.characters[charId]) {
                        this.warn(`警告：尝试更新不存在的角色 ${charId}，跳过此角色的更新`);
                        continue;
                    }
                    if (!workingChapter.dynamicState.characters[charId]) {
                        workingChapter.dynamicState.characters[charId] = {};
                    }

                    // 处理 social.relationships 的特殊逻辑（动态数据）
                    if (charUpdates.social?.relationships) {
                        if (!workingChapter.dynamicState.characters[charId].relationships) {
                            workingChapter.dynamicState.characters[charId].relationships = {};
                        }
                        for (const targetCharId in charUpdates.social.relationships) {
                            const relUpdate = charUpdates.social.relationships[targetCharId];
                            if (!workingChapter.dynamicState.characters[charId].relationships[targetCharId]) {
                                workingChapter.dynamicState.characters[charId].relationships[targetCharId] = { history: [] };
                            }
                            const targetRel = workingChapter.dynamicState.characters[charId].relationships[targetCharId];

                            if (relUpdate.current_affinity !== undefined) {
                                targetRel.current_affinity = relUpdate.current_affinity;
                            }
                            if (relUpdate.history_entry) {
                                // V3.1: 只保留最新的完整reasoning，避免UI过长
                                // 将完整的reasoning存储到latest_reasoning字段（替换模式）
                                targetRel.latest_reasoning = relUpdate.history_entry;

                                // 在history中只保留简化的数值变化记录（可选：限制长度）
                                const simplifiedEntry = {
                                    timestamp: relUpdate.history_entry.timestamp,
                                    change: relUpdate.history_entry.change,
                                    final_affinity: relUpdate.history_entry.final_affinity,
                                    source_chapter_uid: relUpdate.history_entry.source_chapter_uid
                                };
                                targetRel.history.push(simplifiedEntry);

                                // 限制history长度，只保留最近10条数值记录
                                if (targetRel.history.length > 10) {
                                    targetRel.history = targetRel.history.slice(-10);
                                }
                            }
                        }
                    }

                    // 处理旧版 relationships 格式（兼容性）
                    if (charUpdates.relationships) {
                        if (!workingChapter.dynamicState.characters[charId].relationships) {
                            workingChapter.dynamicState.characters[charId].relationships = {};
                        }
                        for (const targetCharId in charUpdates.relationships) {
                            const relUpdate = charUpdates.relationships[targetCharId];
                            if (!workingChapter.dynamicState.characters[charId].relationships[targetCharId]) {
                                workingChapter.dynamicState.characters[charId].relationships[targetCharId] = { history: [] };
                            }
                            const targetRel = workingChapter.dynamicState.characters[charId].relationships[targetCharId];

                            if (relUpdate.current_affinity !== undefined) {
                                targetRel.current_affinity = relUpdate.current_affinity;
                            }
                            if (relUpdate.history_entry) {
                                // V3.1: 只保留最新的完整reasoning，避免UI过长
                                // 将完整的reasoning存储到latest_reasoning字段（替换模式）
                                targetRel.latest_reasoning = relUpdate.history_entry;

                                // 在history中只保留简化的数值变化记录（可选：限制长度）
                                const simplifiedEntry = {
                                    timestamp: relUpdate.history_entry.timestamp,
                                    change: relUpdate.history_entry.change,
                                    final_affinity: relUpdate.history_entry.final_affinity,
                                    source_chapter_uid: relUpdate.history_entry.source_chapter_uid
                                };
                                targetRel.history.push(simplifiedEntry);

                                // 限制history长度，只保留最近10条数值记录
                                if (targetRel.history.length > 10) {
                                    targetRel.history = targetRel.history.slice(-10);
                                }
                            }
                        }
                    }

                    // 更新心理档案
                    if (charUpdates.dossier_updates && Array.isArray(charUpdates.dossier_updates)) {
                        if (!workingChapter.dynamicState.characters[charId].dossier_updates) {
                            workingChapter.dynamicState.characters[charId].dossier_updates = [];
                        }
                        workingChapter.dynamicState.characters[charId].dossier_updates.push(...charUpdates.dossier_updates);
                    }

                    // 【关键修复】更新角色的静态字段（核心身份、外貌、性格、能力等）
                    // 将更新合并到 staticMatrices.characters
                    const staticChar = workingChapter.staticMatrices.characters[charId];
                    const fieldsToMerge = [
                        'core', 'appearance', 'personality', 'background', 'goals',
                        'capabilities', 'equipment', 'experiences', 'secrets'
                    ];

                    // 字符串类型字段（直接覆盖）
                    const stringFields = ['appearance', 'secrets'];
                    // 对象类型字段（深度合并）
                    const objectFields = ['core', 'personality', 'background', 'goals', 'capabilities', 'equipment', 'experiences'];

                    for (const field of fieldsToMerge) {
                        if (charUpdates[field]) {
                            // 判断字段类型
                            if (stringFields.includes(field)) {
                                // 字符串字段：直接覆盖
                                staticChar[field] = charUpdates[field];
                                this.diagnose(`  -> 已更新角色 ${charId} 的 ${field} 字段（字符串）`);
                            } else if (objectFields.includes(field)) {
                                // 对象字段：深度合并
                                let fieldValue = charUpdates[field];

                                // 处理字段值 - 检查是否有 operation 结构（向后兼容）
                                if (typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
                                    // 遍历子字段，处理可能的 operation 结构
                                    for (const subKey in fieldValue) {
                                        const subValue = fieldValue[subKey];

                                        // 如果是 {operation: 'append', values: [...]} 格式，转换为直接数组
                                        if (subValue && typeof subValue === 'object' && subValue.operation === 'append' && Array.isArray(subValue.values)) {
                                            this.warn(`警告：检测到旧格式的 operation 结构 (${field}.${subKey})，自动转换为完整数组`);

                                            // 获取原有值
                                            const existingValue = staticChar[field]?.[subKey];
                                            if (Array.isArray(existingValue)) {
                                                // 合并原有值和新值
                                                fieldValue[subKey] = [...existingValue, ...subValue.values];
                                            } else {
                                                // 只使用新值
                                                fieldValue[subKey] = subValue.values;
                                            }
                                        }
                                    }
                                }

                                // 确保原字段存在且为对象
                                if (!staticChar[field] || typeof staticChar[field] !== 'object') {
                                    staticChar[field] = {};
                                }

                                // 使用深度合并
                                staticChar[field] = deepmerge(staticChar[field], fieldValue);
                                this.diagnose(`  -> 已更新角色 ${charId} 的 ${field} 字段（对象）`);
                            }
                        }
                    }

                    // 更新 social 字段（除了 relationships，因为那是动态的）
                    if (charUpdates.social) {
                        if (!staticChar.social) {
                            staticChar.social = {};
                        }
                        // 合并除了 relationships 之外的 social 字段
                        const socialUpdates = { ...charUpdates.social };
                        delete socialUpdates.relationships; // relationships 已经在上面处理
                        staticChar.social = deepmerge(staticChar.social, socialUpdates);
                    }
                }
            }

            // 更新世界观动态 (此处逻辑可根据未来需求扩展，目前框架已备好)
            if (updates.worldview) {
                for (const category in updates.worldview) { // 遍历 locations, items...
                    if (!workingChapter.dynamicState.worldview[category]) {
                        workingChapter.dynamicState.worldview[category] = {};
                    }
                    for (const entityId in updates.worldview[category]) {
                        const entityUpdate = updates.worldview[category][entityId];
                        if (!workingChapter.dynamicState.worldview[category][entityId]) {
                            workingChapter.dynamicState.worldview[category][entityId] = { updates: [] };
                        }
                        const targetEntity = workingChapter.dynamicState.worldview[category][entityId];

                        // 如果史官直接提供了更新后的描述，我们也可以更新它
                        if (entityUpdate.current_description) {
                            targetEntity.current_description = entityUpdate.current_description;
                        }
                        
                        // 追加历史记录
                        if (entityUpdate.update_entry && typeof entityUpdate.update_entry === 'object') {
                            targetEntity.updates.push(entityUpdate.update_entry);
                        }
                    }
                }
            }

            // 更新故事线动态和静态
            if (updates.storylines) {
                this.debugGroup('[SBE-PROBE] 故事线更新流程启动');
                this.info(`检测到故事线更新请求，分类数量: ${Object.keys(updates.storylines).length}`);
                this.debugLog('史官输出的完整 updates.storylines:', JSON.parse(JSON.stringify(updates.storylines)));

                for (const category in updates.storylines) { // main_quests, side_quests...
                    this.debugGroup(`[SBE-PROBE] 处理分类: ${category}`);
                    this.info(`  -> 当前分类: ${category}, 故事线数量: ${Object.keys(updates.storylines[category]).length}`);

                    if (!workingChapter.dynamicState.storylines[category]) {
                        workingChapter.dynamicState.storylines[category] = {};
                        this.info(`  -> 已初始化 dynamicState.storylines.${category}`);
                    }
                    if (!workingChapter.staticMatrices.storylines[category]) {
                        workingChapter.staticMatrices.storylines[category] = {};
                        this.info(`  -> 已初始化 staticMatrices.storylines.${category}`);
                    }

                    this.debugLog(`现有的 staticMatrices.storylines.${category} 故事线:`, Object.keys(workingChapter.staticMatrices.storylines[category]));

                    for (const storylineId in updates.storylines[category]) {
                        this.debugGroup(`[SBE-PROBE] 处理故事线: ${storylineId}`);
                        const storylineUpdate = updates.storylines[category][storylineId];
                        this.info(`  -> 正在处理故事线: ${category}/${storylineId}`);
                        this.debugLog('史官提供的更新内容:', JSON.parse(JSON.stringify(storylineUpdate)));

                        // 确保故事线在 staticMatrices 中存在
                        if (!workingChapter.staticMatrices.storylines[category][storylineId]) {
                            this.warn(`❌ 警告：尝试更新不存在的故事线 ${category}/${storylineId}，跳过此更新`);
                            this.debugLog('现有故事线列表:', Object.keys(workingChapter.staticMatrices.storylines[category]));
                            this.debugGroupEnd();
                            continue;
                        }

                        // 更新动态状态
                        if (!workingChapter.dynamicState.storylines[category][storylineId]) {
                            workingChapter.dynamicState.storylines[category][storylineId] = { history: [] };
                            this.info(`  -> 已初始化 dynamicState.storylines.${category}.${storylineId}`);
                        }
                        const dynamicStoryline = workingChapter.dynamicState.storylines[category][storylineId];
                        this.debugLog('更新前的动态状态:', JSON.parse(JSON.stringify(dynamicStoryline)));

                        let dynamicUpdated = false;
                        if (storylineUpdate.current_status) {
                            dynamicStoryline.current_status = storylineUpdate.current_status;
                            this.info(`    ✓ 已更新 current_status: ${storylineUpdate.current_status}`);
                            dynamicUpdated = true;
                        }
                        if (storylineUpdate.current_summary) {
                            dynamicStoryline.current_summary = storylineUpdate.current_summary;
                            this.info(`    ✓ 已更新 current_summary: ${storylineUpdate.current_summary.substring(0, 50)}...`);
                            dynamicUpdated = true;
                        }
                        if (storylineUpdate.history_entry) {
                            // V3.1: 只保留最新的完整reasoning，避免UI过长
                            // 将完整的reasoning存储到latest_reasoning字段（替换模式）
                            dynamicStoryline.latest_reasoning = storylineUpdate.history_entry;

                            // 在history中只保留简化的状态变化记录（可选：限制长度）
                            const simplifiedEntry = {
                                timestamp: storylineUpdate.history_entry.timestamp,
                                status_change: storylineUpdate.history_entry.status_change,
                                summary_update: storylineUpdate.history_entry.summary_update,
                                source_chapter_uid: storylineUpdate.history_entry.source_chapter_uid
                            };
                            dynamicStoryline.history.push(simplifiedEntry);

                            // 限制history长度，只保留最近10条记录
                            if (dynamicStoryline.history.length > 10) {
                                dynamicStoryline.history = dynamicStoryline.history.slice(-10);
                            }

                            this.info(`    ✓ 已添加历史记录条目（简化版）`);
                            dynamicUpdated = true;
                        }

                        // 【关键修复】更新静态字段
                        const staticStoryline = workingChapter.staticMatrices.storylines[category][storylineId];
                        this.debugLog('更新前的静态状态:', JSON.parse(JSON.stringify(staticStoryline)));

                        let staticUpdated = false;
                        // 更新基本字段（如果史官提供了新值）
                        if (storylineUpdate.title) {
                            staticStoryline.title = storylineUpdate.title;
                            this.info(`    ✓ 已更新静态字段 title: ${storylineUpdate.title}`);
                            staticUpdated = true;
                        }
                        if (storylineUpdate.summary) {
                            staticStoryline.summary = storylineUpdate.summary;
                            this.info(`    ✓ 已更新静态字段 summary: ${storylineUpdate.summary.substring(0, 50)}...`);
                            staticUpdated = true;
                        }
                        if (storylineUpdate.status) {
                            staticStoryline.status = storylineUpdate.status;
                            this.info(`    ✓ 已更新静态字段 status: ${storylineUpdate.status}`);
                            staticUpdated = true;
                        }
                        if (storylineUpdate.trigger) {
                            staticStoryline.trigger = storylineUpdate.trigger;
                            this.info(`    ✓ 已更新静态字段 trigger: ${storylineUpdate.trigger}`);
                            staticUpdated = true;
                        }
                        if (storylineUpdate.type) {
                            staticStoryline.type = storylineUpdate.type;
                            this.info(`    ✓ 已更新静态字段 type: ${storylineUpdate.type}`);
                            staticUpdated = true;
                        }
                        if (storylineUpdate.involved_chars) {
                            staticStoryline.involved_chars = storylineUpdate.involved_chars;
                            this.info(`    ✓ 已更新静态字段 involved_chars: [${storylineUpdate.involved_chars.join(', ')}]`);
                            staticUpdated = true;
                        }

                        if (dynamicUpdated || staticUpdated) {
                            this.info(`  ✅ 故事线 ${category}/${storylineId} 更新完成 (动态:${dynamicUpdated}, 静态:${staticUpdated})`);
                        } else {
                            this.warn(`  ⚠️ 故事线 ${category}/${storylineId} 没有任何字段被更新`);
                        }

                        this.debugLog('更新后的动态状态:', JSON.parse(JSON.stringify(dynamicStoryline)));
                        this.debugLog('更新后的静态状态:', JSON.parse(JSON.stringify(staticStoryline)));
                        this.debugGroupEnd();
                    }
                    this.debugGroupEnd();
                }
                this.debugGroupEnd();
            } else {
                this.info("史官未提供任何故事线更新（updates.storylines 为空）");
            }
            this.diagnose(" -> 实体动态状态已更新。", updates);
        }

        // 步骤三：更新元数据
        if (delta.new_long_term_summary) {
            this.info(" -> 正在更新长篇故事摘要...");
            workingChapter.meta.longTermStorySummary = delta.new_long_term_summary;
        }
        if (delta.new_handoff_memo) {
            this.info(" -> 正在更新章节交接备忘录...");
            workingChapter.meta.lastChapterHandoff = delta.new_handoff_memo;
        }

        // V6.0 步骤三B：更新年表时间
        if (delta.chronology_update) {
            this.debugGroup('[ENGINE-V6-CHRONOLOGY] 时间流逝更新流程');
            this.info(" -> 检测到年表更新请求...");

            const chronUpdate = delta.chronology_update;
            this.debugLog('收到时间更新:', chronUpdate);

            if (!workingChapter.dynamicState.chronology) {
                workingChapter.dynamicState.chronology = {
                    day_count: 1,
                    time_slot: "evening",
                    weather: null,
                    last_rest_chapter: null
                };
                this.info(" -> 已初始化年表系统");
            }

            const chron = workingChapter.dynamicState.chronology;

            // 应用时间更新
            if (chronUpdate.new_day_count !== undefined) {
                chron.day_count = chronUpdate.new_day_count;
                this.info(`  ✓ 天数更新: ${chronUpdate.new_day_count}`);
            }
            if (chronUpdate.new_time_slot) {
                const oldSlot = chron.time_slot;
                chron.time_slot = chronUpdate.new_time_slot;
                this.info(`  ✓ 时段更新: ${oldSlot} -> ${chronUpdate.new_time_slot}`);
            }
            if (chronUpdate.new_weather !== undefined) {
                chron.weather = chronUpdate.new_weather;
                this.info(`  ✓ 天气更新: ${chronUpdate.new_weather || '清除'}`);
            }

            // 如果是时间跳跃,应用生理状态变更
            if (chronUpdate.transition_type === 'time_jump' && chronUpdate.physiological_effects) {
                this.info("  -> 检测到时间跳跃,应用生理状态变更...");
                let hasRest = false;
                for (const charId in chronUpdate.physiological_effects) {
                    const effects = chronUpdate.physiological_effects[charId];
                    if (!workingChapter.dynamicState.characters[charId]) {
                        workingChapter.dynamicState.characters[charId] = {};
                    }
                    Object.assign(workingChapter.dynamicState.characters[charId], effects);
                    this.info(`    ✓ 角色 ${charId}: ${JSON.stringify(effects)}`);

                    // 检查是否有角色休息
                    if (effects.fatigue === 'rested' || effects.fatigue === 'refreshed') {
                        hasRest = true;
                    }
                }

                // 更新last_rest_chapter
                if (hasRest) {
                    chron.last_rest_chapter = workingChapter.uid;
                    this.info(`  ✓ 记录休息章节: ${workingChapter.uid}`);
                }
            }

            this.debugLog('最终时间状态:', JSON.parse(JSON.stringify(chron)));
            this.debugLog('时间转换类型:', chronUpdate.transition_type);
            this.debugLog('推理:', chronUpdate.reasoning);
            this.debugGroupEnd();
        }

        // V2.0 步骤四：更新宏观叙事弧光
        if (delta.updates?.meta?.active_narrative_arcs) {
            this.debugGroup('[ENGINE-V2-PROBE] 宏观叙事弧光更新流程');
            this.info(" -> 检测到宏观叙事弧光更新请求...");

            if (!workingChapter.meta.active_narrative_arcs) {
                workingChapter.meta.active_narrative_arcs = [];
                this.info(" -> 已初始化 meta.active_narrative_arcs 数组");
            }

            const arcUpdates = delta.updates.meta.active_narrative_arcs;
            this.debugLog(`收到 ${arcUpdates.length} 条弧光更新`, arcUpdates);

            for (const arcUpdate of arcUpdates) {
                const existingArcIndex = workingChapter.meta.active_narrative_arcs.findIndex(
                    arc => arc.arc_id === arcUpdate.arc_id
                );

                if (existingArcIndex !== -1) {
                    // 更新现有弧光
                    const existingArc = workingChapter.meta.active_narrative_arcs[existingArcIndex];

                    if (arcUpdate.impact_type === 'close') {
                        // 弧光完成，从活跃列表中移除
                        workingChapter.meta.active_narrative_arcs.splice(existingArcIndex, 1);
                        this.info(`  ✓ 弧光 ${arcUpdate.arc_id} 已完成，已从活跃列表移除`);
                    } else {
                        // 更新弧光状态
                        if (arcUpdate.current_stage) existingArc.current_stage = arcUpdate.current_stage;
                        if (arcUpdate.stage_description) existingArc.stage_description = arcUpdate.stage_description;
                        if (arcUpdate.progression_note) {
                            if (!existingArc.progression_history) existingArc.progression_history = [];
                            existingArc.progression_history.push({
                                timestamp: new Date().toISOString(),
                                note: arcUpdate.progression_note
                            });
                        }
                        existingArc.last_updated = new Date().toISOString();
                        this.info(`  ✓ 弧光 ${arcUpdate.arc_id} 已更新 (类型: ${arcUpdate.impact_type || 'progress'})`);
                    }
                } else {
                    // 新弧光，添加到列表
                    if (arcUpdate.impact_type !== 'close') {
                        const newArc = {
                            arc_id: arcUpdate.arc_id,
                            title: arcUpdate.title || '未命名弧光',
                            long_term_goal: arcUpdate.long_term_goal || '',
                            current_stage: arcUpdate.current_stage || 'initial',
                            stage_description: arcUpdate.stage_description || '',
                            involved_entities: arcUpdate.involved_entities || [],
                            created_at: new Date().toISOString(),
                            last_updated: new Date().toISOString(),
                            progression_history: arcUpdate.progression_note ? [{
                                timestamp: new Date().toISOString(),
                                note: arcUpdate.progression_note
                            }] : []
                        };
                        workingChapter.meta.active_narrative_arcs.push(newArc);
                        this.info(`  ✓ 新弧光 ${arcUpdate.arc_id} 已添加到活跃列表`);
                    }
                }
            }

            this.debugLog(`当前活跃弧光数量: ${workingChapter.meta.active_narrative_arcs.length}`);
            this.debugGroupEnd();
        }

        // V3.0 步骤五：处理关系图谱更新 (Relationship Graph Updates)
        if (delta.relationship_updates && Array.isArray(delta.relationship_updates)) {
            this.debugGroup('[ENGINE-V3-PROBE] 关系图谱更新流程');
            this.info(" -> 检测到关系图谱更新请求...");

            // 确保relationship_graph存在
            if (!workingChapter.staticMatrices.relationship_graph) {
                workingChapter.staticMatrices.relationship_graph = { edges: [] };
                this.info(" -> 已初始化 staticMatrices.relationship_graph");
            }

            const relationshipUpdates = delta.relationship_updates;
            this.debugLog(`收到 ${relationshipUpdates.length} 条关系边更新`, relationshipUpdates);

            for (const relUpdate of relationshipUpdates) {
                const { relationship_id, updates } = relUpdate;

                // 查找对应的关系边
                const edgeIndex = workingChapter.staticMatrices.relationship_graph.edges.findIndex(
                    edge => edge.id === relationship_id
                );

                if (edgeIndex === -1) {
                    this.warn(`警告：尝试更新不存在的关系边 ${relationship_id}，跳过此更新`);
                    continue;
                }

                const edge = workingChapter.staticMatrices.relationship_graph.edges[edgeIndex];
                this.debugLog(`正在更新关系边: ${relationship_id}`, updates);

                // 应用更新 - 使用点标记法路径
                for (const [path, value] of Object.entries(updates)) {
                    const keys = path.split('.');
                    let target = edge;

                    // 遍历到倒数第二层
                    for (let i = 0; i < keys.length - 1; i++) {
                        const key = keys[i];
                        if (!target[key]) {
                            target[key] = {};
                        }
                        target = target[key];
                    }

                    // 设置最终值
                    const finalKey = keys[keys.length - 1];
                    target[finalKey] = value;

                    this.info(`  ✓ 已更新 ${relationship_id}.${path}`);
                }

                // 处理占位符替换
                const currentChapterUid = workingChapter.uid;

                function replacePlaceholders(obj) {
                    if (typeof obj === 'string') {
                        return obj.replace(/\{\{current_chapter_uid\}\}/g, currentChapterUid);
                    } else if (Array.isArray(obj)) {
                        return obj.map(replacePlaceholders);
                    } else if (obj && typeof obj === 'object') {
                        const result = {};
                        for (const [key, value] of Object.entries(obj)) {
                            result[key] = replacePlaceholders(value);
                        }
                        return result;
                    }
                    return obj;
                }

                workingChapter.staticMatrices.relationship_graph.edges[edgeIndex] = replacePlaceholders(edge);
                this.info(`  ✅ 关系边 ${relationship_id} 更新完成`);
            }

            this.debugLog(`关系图谱当前边数: ${workingChapter.staticMatrices.relationship_graph.edges.length}`);
            this.debugGroupEnd();
        }

        // V2.0 步骤六：合并文体档案更新
        if (delta.stylistic_analysis_delta) {
            this.debugGroup('[ENGINE-V2-PROBE] 文体档案合并流程');
            this.info(" -> 检测到文体档案更新请求...");

            if (!workingChapter.dynamicState.stylistic_archive) {
                workingChapter.dynamicState.stylistic_archive = {
                    imagery_and_metaphors: [],
                    frequent_descriptors: { adjectives: [], adverbs: [] },
                    sensory_patterns: []
                };
                this.info(" -> 已初始化 dynamicState.stylistic_archive");
            }

            const stylisticDelta = delta.stylistic_analysis_delta;
            const archive = workingChapter.dynamicState.stylistic_archive;

            // 合并意象和隐喻
            if (stylisticDelta.new_imagery && Array.isArray(stylisticDelta.new_imagery)) {
                archive.imagery_and_metaphors.push(...stylisticDelta.new_imagery);
                this.info(`  ✓ 已添加 ${stylisticDelta.new_imagery.length} 条新意象/隐喻`);
            }

            // 合并描述词
            if (stylisticDelta.new_descriptors) {
                if (stylisticDelta.new_descriptors.adjectives) {
                    for (const newAdj of stylisticDelta.new_descriptors.adjectives) {
                        const existing = archive.frequent_descriptors.adjectives.find(
                            item => item.word === newAdj.word
                        );
                        if (existing) {
                            existing.count += newAdj.count || 1;
                            existing.overused = existing.count > 5; // 阈值可配置
                        } else {
                            archive.frequent_descriptors.adjectives.push(newAdj);
                        }
                    }
                    this.info(`  ✓ 已合并 ${stylisticDelta.new_descriptors.adjectives.length} 条形容词`);
                }

                if (stylisticDelta.new_descriptors.adverbs) {
                    for (const newAdv of stylisticDelta.new_descriptors.adverbs) {
                        const existing = archive.frequent_descriptors.adverbs.find(
                            item => item.word === newAdv.word
                        );
                        if (existing) {
                            existing.count += newAdv.count || 1;
                            existing.overused = existing.count > 5;
                        } else {
                            archive.frequent_descriptors.adverbs.push(newAdv);
                        }
                    }
                    this.info(`  ✓ 已合并 ${stylisticDelta.new_descriptors.adverbs.length} 条副词`);
                }
            }

            // 合并感官模式
            if (stylisticDelta.new_sensory_patterns && Array.isArray(stylisticDelta.new_sensory_patterns)) {
                for (const newPattern of stylisticDelta.new_sensory_patterns) {
                    const existing = archive.sensory_patterns.find(
                        p => p.type === newPattern.type && p.pattern === newPattern.pattern
                    );
                    if (existing) {
                        existing.used_count = (existing.used_count || 1) + (newPattern.used_count || 1);
                    } else {
                        archive.sensory_patterns.push(newPattern);
                    }
                }
                this.info(`  ✓ 已合并 ${stylisticDelta.new_sensory_patterns.length} 条感官模式`);
            }

            // 记录诊断信息
            if (stylisticDelta.stylistic_diagnosis) {
                this.diagnose('[文体诊断]', stylisticDelta.stylistic_diagnosis);
            }

            this.debugGroupEnd();
        }

        // V4.0 步骤七：更新叙事控制塔 (Narrative Control Tower)
        if (delta.rhythm_assessment || delta.storyline_progress_deltas) {
            this.narrativeControlTowerManager.update(workingChapter, delta);
        }

        this.info("--- 状态更新Delta应用完毕 ---");
        return workingChapter;
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
        this.info(`--- 创世纪流程启动 (ECI模型 V3.1) ---`);
        this.debugGroup(`BRIDGE-PROBE [GENESIS-FLOW-ECI]`);
        const loadingToast = this.toastr.info(
            "正在初始化...", "创世纪...",
            { timeOut: 0, extendedTimeOut: 0, closeButton: false, progressBar: true, tapToDismiss: false }
        );

        try {
            const context = this.deps.applicationFunctionManager.getContext();
            const activeCharId = context?.characterId;
            if (!activeCharId) throw new Error("无法获取 activeCharId，创世纪中止。");

            // ========================= [修复逻辑：三级数据源探查] =========================
            // 优先级 1: 内存中的当前状态 (保留用户在前端对预览数据的修改)
            // 优先级 2: 本地静态数据库缓存 (StaticDataManager)
            // 优先级 3: 实时AI分析 (IntelligenceAgent)

            let finalStaticMatrices = null;
            let sourceLabel = "未知";

            // --- 阶段一：检查内存 (前端修改优先) ---
            if (this.currentChapter && 
                this.currentChapter.characterId === activeCharId && 
                this.currentChapter.staticMatrices && 
                Object.keys(this.currentChapter.staticMatrices.characters || {}).length > 0) {
                
                this.info("GENESIS: 检测到内存中存在有效的章节数据（包含前端预览/修改），准备复用。");
                // 复用内存数据，不重新实例化，从而保留用户的修改
                finalStaticMatrices = this.currentChapter.staticMatrices;
                sourceLabel = "内存复用 (用户修改)";
            } 
            // --- 阶段二：降级检查缓存 (静态数据库) ---
            else {
                this.info("GENESIS: 内存中无有效数据，尝试读取静态数据库缓存...");
                
                // 此时才创建新的实例，防止污染可能存在的有效旧引用
                this.currentChapter = new Chapter({ characterId: activeCharId });
                
                loadingToast.find('.toast-message').text("读取世界观设定...");
                const cachedDb = staticDataManager.loadStaticData(activeCharId);

                if (cachedDb && Object.keys(cachedDb.characters || {}).length > 0) {
                    this.info("GENESIS: 已从缓存加载静态数据。");
                    finalStaticMatrices = cachedDb;
                    sourceLabel = "静态数据库缓存";
                } 
                // --- 阶段三：降级执行AI分析 (实时生成) ---
                else {
                    this.info("GENESIS: 未找到有效缓存，正在实时分析世界书...");
                    loadingToast.find('.toast-message').text("正在分析世界观与角色设定...");
                    
                    const persona = window.personas?.[window.main_persona];
                    const worldInfoEntries = await this.deps.getCharacterBoundWorldbookEntries(context);
                    const agentOutput = await this.intelligenceAgent.execute({ worldInfoEntries, persona });

                    if (agentOutput && agentOutput.staticMatrices) {
                        this.info("GENESIS: AI分析成功，生成了新的数据。");
                        finalStaticMatrices = agentOutput.staticMatrices;
                        sourceLabel = "AI实时分析";
                        
                        // 顺手存入缓存
                        staticDataManager.saveStaticData(activeCharId, finalStaticMatrices);
                    } else {
                        throw new Error("IntelligenceAgent未能返回有效数据，且无可用缓存或内存状态。");
                    }
                }
            }

            // --- 统一注入点 ---
            // 使用 deepmerge 确保数据完整性 (如果是新建的 Chapter，staticMatrices 是空的，合并后即为 full data；如果是复用的，合并自身无副作用)
            if (finalStaticMatrices) {
                this.currentChapter.staticMatrices = deepmerge(this.currentChapter.staticMatrices, finalStaticMatrices);
                this.narrativeControlTowerManager.normalizeStorylineStaticData(this.currentChapter);
                this.info(`GENESIS: 数据注入完成。数据来源: [${sourceLabel}]`);
            } else {
                throw new Error("严重错误：未能从任何来源获取到静态数据矩阵。");
            }
            // 4. 【验证日志】
            this.debugGroupCollapsed('[SBE-DIAGNOSE] Chapter state before planning:');
            console.dir(JSON.parse(JSON.stringify(this.currentChapter)));
            this.debugGroupEnd();

            // 5. 获取玩家导演焦点
            this._setStatus(ENGINE_STATUS.BUSY_DIRECTING);
            // ... (后续流程与之前版本一致)
            loadingToast.find('.toast-message').text("等待导演（玩家）指示...");
            const popupResult = await this.deps.showNarrativeFocusPopup('');
            let initialChapterFocus = "由AI自主创新。";
            let isFreeRoamMode = false;

            if (popupResult.freeRoam) {
                // 自由章模式：跳过建筑师和回合执导
                isFreeRoamMode = true;
                initialChapterFocus = "[FREE_ROAM] " + (popupResult.value || "自由探索");
                this.info("🎲 [自由章模式] 已激活：本章将跳过建筑师规划和回合执导，世界观档案将全部发送到前台");
            } else if (popupResult.abc) {
                // ABC沉浸流模式：添加[IMMERSION_MODE]标记
                const userInput = popupResult.value || "";
                initialChapterFocus = userInput ? `${userInput} [IMMERSION_MODE]` : "[IMMERSION_MODE]";
            } else if (popupResult.confirmed && popupResult.value) {
                initialChapterFocus = popupResult.value;
            }

            this.currentChapter.playerNarrativeFocus = initialChapterFocus;
            this.currentChapter.meta.freeRoamMode = isFreeRoamMode;
            this.info(`GENESIS: 玩家设定的开篇小章焦点为: "${initialChapterFocus}"`);

            if (isFreeRoamMode) {
                // 自由章模式：跳过建筑师规划
                this.info("🎲 跳过建筑师规划，直接进入自由章模式");
                this.currentChapter.chapter_blueprint = {
                    title: "自由探索",
                    emotional_arc: "自由发挥",
                    plot_beats: []
                };
            } else {
                // 6. 规划开篇剧本
                this._setStatus(ENGINE_STATUS.BUSY_PLANNING);
                loadingToast.find('.toast-message').text("建筑师正在构思开篇剧本...");
                const architectResult = await this._planNextChapter(true, this.currentChapter, firstMessageContent);
                if (architectResult && architectResult.new_chapter_script) {
                    // 处理 ★ 星标节拍
                    this._processStarMarkedBeats(architectResult.new_chapter_script);

                    this.currentChapter.chapter_blueprint = architectResult.new_chapter_script;
                    this.currentChapter.activeChapterDesignNotes = architectResult.design_notes;

                    // V3.0: 生成并缓存章节级静态上下文
                    const chapterContextIds = architectResult.new_chapter_script.chapter_context_ids || [];
                    this.debugGroup('[ENGINE-V3-DEBUG] GENESIS - 章节上下文缓存');
                    this.debugLog('建筑师返回的 chapter_context_ids:', chapterContextIds);
                    this.currentChapter.cachedChapterStaticContext = this.entityContextManager.generateChapterStaticContext(chapterContextIds);
                    this.debugLog('缓存后 cachedChapterStaticContext 长度:', this.currentChapter.cachedChapterStaticContext?.length || 0);
                    this.debugGroupEnd();
                    this.info(`GENESIS: 建筑师成功生成开篇创作蓝图及设计笔记。章节级静态上下文已缓存（${chapterContextIds.length}个实体）。`);
                    this.isGenesisStatePendingCommit = true;
                    const chatPieces = this.USER.getContext()?.chat || [];
                    const firstAssistantIndex = chatPieces.findIndex(piece => piece && !piece.is_user);
                    if (firstAssistantIndex !== -1) {
                        this.info(`GENESIS: 已找到可锚定的AI消息 (索引: ${firstAssistantIndex})，立即写入leader。`);
                        await this.onCommitState(firstAssistantIndex);
                    } else {
                        this.info('GENESIS: 暂未找到可锚定的AI消息，将等待下一次 onCommitState 触发。');
                    }
                } else {
                    throw new Error("建筑师未能生成有效的开篇创作蓝图。");
                }
            }

        } catch (error) {
            this.diagnose("创世纪流程中发生严重错误:", error);
            this.toastr.error(`创世纪失败: ${error.message}`, "引擎严重错误");
            this.currentChapter = null; 
        } finally {
            this._setStatus(ENGINE_STATUS.IDLE);
            this.debugGroupEnd();
            if (loadingToast) this.toastr.clear(loadingToast);
        }
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

async triggerChapterTransition(eventUid, endIndex, transitionType = 'Standard') {
    // 【总开关保护】检查引擎是否已启用
    const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
    if (!isEngineEnabled) {
        this.toastr.warning('叙事流引擎已关闭，章节转换已中止', '功能已禁用');
        this.info('[Guard-MasterSwitch] 章节转换流程中止：引擎总开关已关闭。');
        return;
    }

    this._transitionStopRequested = false;
    this._activeTransitionToast = null;
    this.currentTaskAbortController = new AbortController(); // V9.2: 创建中止控制器

    this._setStatus(ENGINE_STATUS.BUSY_TRANSITIONING);
    const loadingToast = this.toastr.info(
        "正在启动章节转换流程...", "章节转换中...",
        { timeOut: 0, extendedTimeOut: 0, closeButton: false, progressBar: true, tapToDismiss: false }
    );
    this._activeTransitionToast = loadingToast;
    this.info(`--- 章节转换流程启动 (ECI事务模型 V3.1 - 断点恢复增强版) ---`);
    this.debugGroup(`BRIDGE-PROBE [CHAPTER-TRANSITION-RESILIENT]: ${eventUid}`);

    try {
        const activeCharId = this.USER.getContext()?.characterId;
        if (!activeCharId) throw new Error("无法获取 activeCharId。");

        // 1. 加载当前状态
        const { piece: lastStatePiece, deep: lastAnchorIndex } = this.USER.findLastMessageWithLeader({ 
            deep: (this.USER.getContext().chat.length - 1 - endIndex) 
        });

        let workingChapter;
        if (lastStatePiece && Chapter.isValidStructure(lastStatePiece.leader)) {
            workingChapter = Chapter.fromJSON(lastStatePiece.leader);
        } else {
            workingChapter = new Chapter({ characterId: activeCharId });
        }
        this.narrativeControlTowerManager.syncStorylineProgressWithStorylines(workingChapter);

        // 确保静态数据是最新的
        const staticData = staticDataManager.loadStaticData(activeCharId);
        if (staticData) {
            workingChapter.staticMatrices = deepmerge(workingChapter.staticMatrices, staticData);
        }

        // V7.2: 提前获取目标消息引用（用于分两次写入）
        const targetPiece = this.USER.getContext().chat[endIndex];
        if (!targetPiece) {
            throw new Error(`无法找到索引 ${endIndex} 处的目标消息！`);
        }

        // 2. V7.2 增强：检查是否有未完成的过渡（支持分阶段断点恢复）
        let reviewDelta = null;
        let finalNarrativeFocus = "由AI自主创新。";
        let skipHistorian = false;

        if (this.LEADER.pendingTransition) {
            this.info("检测到未完成的章节转换进度，正在恢复...");
            loadingToast.find('.toast-message').text("恢复之前的进度...");

            const status = this.LEADER.pendingTransition.status;
            reviewDelta = this.LEADER.pendingTransition.historianReviewDelta;
            finalNarrativeFocus = this.LEADER.pendingTransition.playerNarrativeFocus || "由AI自主创新。";

            // V7.2: 如果史官已完成且已写入 leader，直接跳过史官
            if (status === 'awaiting_architect' || status === 'historian_saved') {
                skipHistorian = true;
                // 从 leader 读取史官已保存的结果
                if (targetPiece.leader && Chapter.isValidStructure(targetPiece.leader)) {
                    workingChapter = Chapter.fromJSON(targetPiece.leader);
                    this.narrativeControlTowerManager.syncStorylineProgressWithStorylines(workingChapter);
                    this.info("✓ 史官结果已从 leader 恢复，正在合并最新的前端数据...");

                    //【关键修复】在恢复中间状态后，必须重新合并最新的静态数据，以包含用户在重试期间可能做出的修改
                    const freshStaticData = staticDataManager.loadStaticData(activeCharId);
                    if (freshStaticData) {
                        workingChapter.staticMatrices = deepmerge(workingChapter.staticMatrices, freshStaticData);
                        this.info("✓ 最新的前端数据已合并，进入建筑师阶段。");
                    }
                }
            } else {
                workingChapter.playerNarrativeFocus = finalNarrativeFocus;
            }

            this.info(`断点恢复状态: ${status}, 跳过史官: ${skipHistorian}`);
        } else {
            skipHistorian = false;
        }

        if (!skipHistorian) {
            // 3. 获取史官的事务增量 (Delta)
            loadingToast.find('.toast-message').html(`
                史官正在复盘本章历史...<br>
                <div class="sbt-compact-toast-actions">
                    <button id="sbt-early-focus-btn" class="sbt-compact-focus-btn" title="提前规划下一章">
                        <i class="fa-solid fa-pen-ruler"></i> 规划
                    </button>
                    <button id="sbt-stop-transition-btn" class="sbt-compact-focus-btn sbt-stop-transition-btn" title="立即停止章节转换">    
                        <i class="fa-solid fa-octagon-exclamation"></i> 停止
                    </button>
                </div>
            `);
            this._bindStopButton('史官阶段');

            // 添加提前规划按钮的事件监听
            $('#sbt-early-focus-btn').off('click').on('click', async () => {
                if (this._earlyFocusPromise) {
                    this.info("已有一个提前规划弹窗在等待输入，忽略重复点击");
                    return;
                }

                const $btn = $('#sbt-early-focus-btn');
                const promise = this._captureEarlyFocusInput(workingChapter, $btn);
                this._earlyFocusPromise = promise;

                try {
                    await promise;
                } catch (error) {
                    this.warn("提前规划输入未能完成，将继续常规焦点弹窗流程", error);
                } finally {
                    this._earlyFocusPromise = null;
                }
            });

            reviewDelta = await this._runStrategicReview(workingChapter, lastAnchorIndex, endIndex, this.currentTaskAbortController.signal);

            if (!reviewDelta || (!reviewDelta.creations && !reviewDelta.updates)) {
                // 如果不是因为中止而失败，才显示错误
                if (!this.currentTaskAbortController.signal.aborted) {
                    this.toastr.error(
                        "史官在复盘本章历史时遇到严重错误（很可能是网络连接问题），章节转换已中止。<br><small>请检查您的网络和API设置后，前往叙事罗盘面板手动点击按钮重试。</small>",
                        "章节转换失败",
                        { timeOut: 15000, escapeHtml: false }
                    );
                }
                // 清除可能存在的错误临时状态
                this.LEADER.pendingTransition = null;
                this.LEADER.earlyPlayerInput = null;
                this.USER.saveChat();
                // 无论如何，中止流程
                throw new Error("史官复盘失败或被中止。");
            }

            // 【阶段1完成】保存史官分析结果到临时存储
            this.LEADER.pendingTransition = {
                historianReviewDelta: reviewDelta,
                playerNarrativeFocus: null,
                status: 'awaiting_focus'
            };
            this.USER.saveChat();
            this.info("史官复盘完成，中间结果已暂存（阶段1/3）。");

            // 4. 获取玩家的导演焦点
            let isFreeRoamMode = false;

            if (this._earlyFocusPromise) {
                this.info("使用玩家提前输入的焦点");
                finalNarrativeFocus = this.LEADER.earlyPlayerInput.focus;
                isFreeRoamMode = this.LEADER.earlyPlayerInput.freeRoam;
                this.LEADER.earlyPlayerInput = null; // 清除临时数据
                loadingToast.find('.toast-message').text("正在应用您的规划...");
            } else {
                loadingToast.find('.toast-message').text("等待导演（玩家）指示...");
                if (localStorage.getItem('sbt-focus-popup-enabled') !== 'false') {
                    this._setStatus(ENGINE_STATUS.BUSY_DIRECTING);
                    const popupResult = await this.deps.showNarrativeFocusPopup(workingChapter.playerNarrativeFocus);
                    if (popupResult.freeRoam) {
                        // 自由章模式
                        isFreeRoamMode = true;
                        finalNarrativeFocus = "[FREE_ROAM] " + (popupResult.value || "自由探索");
                        this.info("🎲 [自由章模式] 已激活：本章将跳过建筑师规划和回合执导，世界观档案将全部发送到前台");
                    } else if (popupResult.abc) {
                        // ABC沉浸流模式：添加[IMMERSION_MODE]标记
                        const userInput = popupResult.value || "";
                        finalNarrativeFocus = userInput ? `${userInput} [IMMERSION_MODE]` : "[IMMERSION_MODE]";
                    } else if (popupResult.confirmed && popupResult.value) {
                        finalNarrativeFocus = popupResult.value;
                    }
                }
            }

            // 【阶段2完成】更新玩家焦点到临时存储
            this.LEADER.pendingTransition.playerNarrativeFocus = finalNarrativeFocus;
            this.LEADER.pendingTransition.freeRoamMode = isFreeRoamMode;
            this.LEADER.pendingTransition.status = 'awaiting_architect';
            this.USER.saveChat();
            this.info("玩家焦点已捕获，中间结果已更新（阶段2/3）。");
        }

        // 5. 【核心】创建新章节实例并应用史官的事务增量
        const oldChapterUid = workingChapter.uid;
        const newChapterData = JSON.parse(JSON.stringify(workingChapter.toJSON()));
        delete newChapterData.uid;
        delete newChapterData.checksum;
        const newChapter = new Chapter(newChapterData);

        let updatedNewChapter = this._applyStateUpdates(newChapter, reviewDelta);
        updatedNewChapter.playerNarrativeFocus = finalNarrativeFocus;
        updatedNewChapter.meta.freeRoamMode = this.LEADER.pendingTransition.freeRoamMode || false;

        this.info(`✓ 已创建新章节实例（旧UID: ${oldChapterUid} → 新UID: ${updatedNewChapter.uid}）`);

        targetPiece.leader = updatedNewChapter.toJSON();
        this.USER.saveChat();
        this.info(`✓ [V7.2-阶段1/2] 史官分析结果已写入消息 #${endIndex} 的 leader（新章节UID: ${updatedNewChapter.uid}）`);

        // 6. 规划下一章节（使用新章节实例）
        if (updatedNewChapter.meta.freeRoamMode) {
            this.info("🎲 跳过建筑师规划，进入自由章模式");
            updatedNewChapter.chapter_blueprint = { title: "自由探索", emotional_arc: "自由发挥", plot_beats: [] };
            updatedNewChapter.activeChapterDesignNotes = null;
        } else {
            this._setStatus(ENGINE_STATUS.BUSY_PLANNING);
            loadingToast.find('.toast-message').text("建筑师正在规划新章节...");
            this._bindStopButton('建筑师阶段');
            const architectResult = await this._planNextChapter(false, updatedNewChapter, null, this.currentTaskAbortController.signal);    
            if (!architectResult || !architectResult.new_chapter_script) {
                throw new Error("建筑师未能生成新剧本。中间进度已保存，请点击按钮重试。");
            }

            loadingToast.find('.toast-message').text("正在固化记忆并刷新状态...");
            this._processStarMarkedBeats(architectResult.new_chapter_script);
            updatedNewChapter.chapter_blueprint = architectResult.new_chapter_script;
            updatedNewChapter.activeChapterDesignNotes = architectResult.design_notes;

            const chapterContextIds = architectResult.new_chapter_script.chapter_context_ids || [];
            this.debugGroup('[ENGINE-V3-DEBUG] 章节转换 - 章节上下文缓存');
            this.debugLog('建筑师返回的 chapter_context_ids:', chapterContextIds);
            updatedNewChapter.cachedChapterStaticContext = this.entityContextManager.generateChapterStaticContext(chapterContextIds, updatedNewChapter);        
            this.debugLog('缓存后 cachedChapterStaticContext 长度:', updatedNewChapter.cachedChapterStaticContext?.length || 0);
            this.debugGroupEnd();
            this.info(`章节转换: 章节级静态上下文已缓存（${chapterContextIds.length}个实体）。`);
        }

        updatedNewChapter.lastProcessedEventUid = eventUid;
        updatedNewChapter.checksum = simpleHash(JSON.stringify(updatedNewChapter) + Date.now());

        targetPiece.leader = updatedNewChapter.toJSON();
        this.USER.saveChat();
        this.info(`✓ [V7.2-阶段2/2] 建筑师规划已追加到消息 #${endIndex} 的 leader（完整状态：史官+建筑师）`);

        this.currentChapter = updatedNewChapter;
        this.isNewChapterPendingCommit = false;

        this.LEADER.pendingTransition = null;
        this.LEADER.earlyPlayerInput = null;

        this.info(`[V7.2] 新章节状态已完整保存（UID: ${updatedNewChapter.uid}），史官+建筑师结果已锚定到消息 #${endIndex}（阶段3/3完成）。`)

        try {
            this.eventBus.emit('CHAPTER_UPDATED', this.currentChapter);
            this.toastr.success("章节已更新，仪表盘已刷新！", "无缝衔接");
        } catch (uiError) {
            this.diagnose("UI更新操作失败，但这不会影响核心状态的保存。", uiError);
            this.toastr.warning("后台状态已更新，但UI刷新失败，请手动刷新页面。", "UI警告");
        }

    } catch (error) {
        if (error.name === 'AbortError' || error.code === 'SBT_TRANSITION_STOP') {
            this.warn('章节转换流程被强制中止。');
            this._cleanupAfterTransitionStop();
            this.toastr.info("章节转换已由用户成功中止。", "操作已取消");
        } else {
            this.diagnose("章节转换流程中发生严重错误:", error);
            this.toastr.error(`${error.message}`, "章节规划失败", { timeOut: 10000 });
        }
        this.LEADER.earlyPlayerInput = null;
    } finally {
        this._setStatus(ENGINE_STATUS.IDLE);
        this.currentTaskAbortController = null;
        if (loadingToast) {
            this.toastr.clear(loadingToast);
        }
        this.debugGroupEnd();
    }
}
async _runStrategicReview(chapterContext, startIndex, endIndex, abortSignal = null) {
    this.debugGroup("BRIDGE-PROBE [STRATEGIC-REVIEW]");
    this.info("史官正在复盘本章历史...");

    let reviewDelta = null;
    try {
        this._throwIfStopRequested('史官复盘准备阶段');
        const chat = this.USER.getContext().chat;
        const chapterMessages = [];
        const safeStartIndex = Math.max(0, startIndex + 1);
        for (let i = safeStartIndex; i <= endIndex; i++) {
            if(chat[i]) chapterMessages.push(chat[i]);
        }

        const chapterTranscript = chapterMessages.length > 0
            ? chapterMessages.map(msg => `[${msg.is_user ? "{{user}}" : "{{char}}"}]:\n${msg.mes}`).join('\n\n---\n\n')
            : "【本章无实质性对话】";

        const contextForHistorian = {
            chapterTranscript,
            chapter: chapterContext,
        };

        reviewDelta = await this.historianAgent.execute(contextForHistorian, abortSignal);
        this._throwIfStopRequested('史官复盘阶段');

    } catch (error) {
        if (error.name === 'AbortError') {
            throw error; // 向上抛出中止错误
        }
        this.diagnose("在 _runStrategicReview 过程中发生错误:", error);
        // 其他错误不抛出，让上层根据 reviewDelta === null 来处理
    } finally {
        this.debugGroupEnd();
        return reviewDelta;
    }
}


/**创世纪流程启动器。*/
async startGenesisProcess() {
    this.info("--- 用户通过UI启动创世纪流程 ---");

    // 【总开关保护】检查引擎是否已启用
    const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
    if (!isEngineEnabled) {
        this.toastr.warning('叙事流引擎已关闭，请先在设置中启用总开关', '功能已禁用');
        this.info('[Guard-MasterSwitch] 创世纪流程中止：引擎总开关已关闭。');
        return;
    }

    if (typeof TavernHelper?.setChatMessages !== 'function') {
        this.toastr.error("核心辅助插件 (TavernHelper) 未找到或版本不兼容。", "依赖缺失");
        this.diagnose("TavernHelper.setChatMessages 不是一个有效的函数。");
        return;
    }
    if (this.status !== ENGINE_STATUS.IDLE) {
        this.toastr.warning("引擎当前正忙，请稍后再试。", "操作繁忙");
        return;
    }


    // --- 核心逻辑分支 ---
    // 【V4.2】检查手动输入的开场白（优先级最高）
    const manualOpeningScene = $('#sbt-manual-opening-scene').val()?.trim();
    const chat = this.USER.getContext().chat;
    const hasExistingFirstMessage = chat.length > 0 && chat[0] && !chat[0].is_user;
    let firstMessageContent = null;

    if (manualOpeningScene) {
        // 使用手动输入的开场白（最高优先级）
        firstMessageContent = manualOpeningScene;
        this.info("检测到手动输入的开场白，将使用此内容作为故事起点。");
    } else if (hasExistingFirstMessage) {
        // 否则尝试从聊天记录中读取
        firstMessageContent = chat[0].mes;
        this.info("使用角色自带的开场白作为故事起点。");
    } else {
        // 完全没有开场白，AI将自由创作
        this.info("未检测到开场白，AI将自由创作开篇场景。");
    }

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
    this._setStatus(ENGINE_STATUS.BUSY_ANALYZING);
    this.toastr.info("正在加载当前状态并分析世界书...", "引擎工作中");
    const loadingToast = this.toastr.info("正在加载状态...", "引擎后台分析中...", { timeOut: 0, extendedTimeOut: 0 });

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
        
        loadingToast.find('.toast-message').text('正在重新分析世界书...');

        const activeCharId = this.currentChapter.characterId; 
        this.info(`--- 启动对角色 ${activeCharId} 的世界书热重载 ---`);

        const persona = window.personas?.[window.main_persona];
        const worldInfoEntries = await this.deps.getCharacterBoundWorldbookEntries(this.USER.getContext());
        
        this.diagnose("热重载: 调用 IntelligenceAgent...");
        const analysisResult = await this.intelligenceAgent.execute({ worldInfoEntries, persona });

        if (!analysisResult || !analysisResult.staticMatrices) {
            throw new Error("IntelligenceAgent未能返回有效的分析结果（缺少staticMatrices）。");
        }

        // 保存到缓存：StaticDataManager期望接收staticMatrices对象
        staticDataManager.saveStaticData(activeCharId, analysisResult.staticMatrices);
        this.info("热重载: 新的静态数据已分析并存入缓存。");

        // 完全替换当前Chapter的静态数据（不合并，以清除旧数据）
        if (analysisResult.staticMatrices) {
            this.currentChapter.staticMatrices = analysisResult.staticMatrices;
            this.info("热重载: 新的 staticMatrices (characters, worldview, storylines) 已完全替换旧数据。");
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
        this.diagnose("世界书热重载失败:", error);
        this.toastr.error(`操作失败: ${error.message.substring(0, 100)}...`, "内部错误");
    } finally {
        if (loadingToast) this.toastr.clear(loadingToast);
        this._setStatus(ENGINE_STATUS.IDLE);
        this.currentChapter = null; 
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
async _planNextChapter(isGenesis = false, chapterForPlanning = null, firstMessageContent = null, abortSignal = null) {
    this._setStatus(ENGINE_STATUS.BUSY_PLANNING);
    const action = isGenesis ? "开篇章节" : "下一章节";
    this.info(`--- 启动“章节建筑师”规划${action}...`);

    const chapterContext = chapterForPlanning || this.currentChapter;
    const contextForArchitect = {
        system_confidence: isGenesis ? 0.1 : 0.5,
        player_profile: { description: "暂无画像。" },
        chapter: chapterContext,
        firstMessageContent: firstMessageContent
    };

    this.debugGroup(`BRIDGE-PROBE [PLAN-CHAPTER]`);
    this.diagnose(`PLAN-1: 正在调用 ArchitectAgent (${isGenesis ? '创世纪模式' : '常规模式'})...`);
    this.debugGroupCollapsed("传递给 ArchitectAgent 的完整 'context' 对象:");
    console.dir(JSON.parse(JSON.stringify(contextForArchitect)));
    this.debugGroupEnd();

    try {
        const architectResult = await this.architectAgent.execute(contextForArchitect, abortSignal);
        if (architectResult && architectResult.new_chapter_script && architectResult.design_notes) {
            this.info("PLAN-2-SUCCESS: ArchitectAgent 成功生成新剧本及其设计笔记。");
            return architectResult;
        } else {
            this.warn("PLAN-2-FAIL: ArchitectAgent 未能返回有效的剧本和设计笔记。");
            this.diagnose("ArchitectAgent 返回了无效或不完整的结构:", architectResult);
            return null;
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            throw error; // 向上抛出中止错误
        }
        this.diagnose(`章节建筑师在规划时失败:`, error);
        return null;
    } finally {
        this.debugGroupEnd();
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
    

}
