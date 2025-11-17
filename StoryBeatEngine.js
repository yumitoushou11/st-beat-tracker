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
        this.lastExecutionTimestamp = 0;
        this.intelligenceAgent = null;
        this.architectAgent = null;
        this.historianAgent = null;
        this.mainLlmService = null; // 主服务
        this.conductorLlmService = null; // 回合裁判专用服务
        this.turnConductorAgent = null;

        // V2.0: 实体清单缓存
        this.entityManifestCache = null; // 缓存生成的实体清单
        this.lastStaticMatricesChecksum = null; // 用于检测 staticMatrices 是否变化
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
    _getOrGenerateEntityManifest() {
        console.group('[ENGINE-V2-PROBE] 实体清单缓存管理');

        if (!this.currentChapter || !this.currentChapter.staticMatrices) {
            console.warn('⚠️ Chapter 或 staticMatrices 不存在，无法生成清单');
            console.groupEnd();
            return { content: '', totalCount: 0 };
        }

        // 计算当前 staticMatrices 的简单校验和
        const currentChecksum = simpleHash(JSON.stringify(this.currentChapter.staticMatrices));

        // 如果缓存存在且校验和匹配，直接返回缓存
        if (this.entityManifestCache && this.lastStaticMatricesChecksum === currentChecksum) {
            console.log('✓ 缓存命中，直接返回已缓存的实体清单');
            console.groupEnd();
            return this.entityManifestCache;
        }

        // 否则，重新生成清单
        console.log('✓ 缓存失效或不存在，正在重新生成实体清单...');
        const manifest = this._generateEntityManifest(this.currentChapter.staticMatrices);

        // 更新缓存
        this.entityManifestCache = manifest;
        this.lastStaticMatricesChecksum = currentChecksum;

        console.log(`✓ 清单已生成并缓存，共 ${manifest.totalCount} 条实体`);
        console.groupEnd();

        return manifest;
    }

    /**
     * [V2.0 辅助方法] 从 staticMatrices 生成轻量级实体清单
     */
    _generateEntityManifest(staticMatrices) {
        const manifestLines = [];
        let count = 0;

        // 1. 角色
        if (staticMatrices.characters) {
            for (const charId in staticMatrices.characters) {
                const char = staticMatrices.characters[charId];
                const keywords = char.core?.keywords || char.keywords || [];
                manifestLines.push(`- ${charId}: ${char.core?.name || char.name || '未命名'} (${keywords.join(', ')})`);
                count++;
            }
        }

        // 2. 世界观实体
        if (staticMatrices.worldview) {
            ['locations', 'items', 'factions', 'concepts', 'events', 'races'].forEach(category => {
                if (staticMatrices.worldview[category]) {
                    for (const entityId in staticMatrices.worldview[category]) {
                        const entity = staticMatrices.worldview[category][entityId];
                        const keywords = entity.keywords || [];
                        const name = entity.name || entity.title || '未命名';
                        manifestLines.push(`- ${entityId}: ${name} (${keywords.join(', ')})`);
                        count++;
                    }
                }
            });
        }

        // 3. 故事线
        if (staticMatrices.storylines) {
            ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs'].forEach(category => {
                if (staticMatrices.storylines[category]) {
                    for (const storylineId in staticMatrices.storylines[category]) {
                        const storyline = staticMatrices.storylines[category][storylineId];
                        manifestLines.push(`- ${storylineId}: ${storyline.title || '未命名'}`);
                        count++;
                    }
                }
            });
        }

        return {
            content: manifestLines.join('\n'),
            totalCount: count
        };
    }

    /**
     * [V2.0 辅助方法] 根据 ID 列表从 staticMatrices 中提取完整实体数据
     * @param {string[]} entityIds - 实体ID数组
     * @returns {string} 格式化的实体详细信息
     */
    _retrieveEntitiesByIds(entityIds) {
        console.group('[ENGINE-V2-PROBE] 动态上下文召回');
        console.log('需要召回的实体ID列表:', entityIds);

        if (!entityIds || entityIds.length === 0) {
            console.log('✓ 无需召回');
            console.groupEnd();
            return '';
        }

        const staticMatrices = this.currentChapter.staticMatrices;
        const retrievedEntities = [];

        for (const entityId of entityIds) {
            let entity = null;
            let category = '';

            // 1. 在角色中查找
            if (staticMatrices.characters?.[entityId]) {
                entity = staticMatrices.characters[entityId];
                category = 'characters';
            }
            // 2. 在世界观中查找
            else if (staticMatrices.worldview) {
                for (const worldCategory of ['locations', 'items', 'factions', 'concepts', 'events', 'races']) {
                    if (staticMatrices.worldview[worldCategory]?.[entityId]) {
                        entity = staticMatrices.worldview[worldCategory][entityId];
                        category = `worldview.${worldCategory}`;
                        break;
                    }
                }
            }
            // 3. 在故事线中查找
            else if (staticMatrices.storylines) {
                for (const storylineCategory of ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs']) {
                    if (staticMatrices.storylines[storylineCategory]?.[entityId]) {
                        entity = staticMatrices.storylines[storylineCategory][entityId];
                        category = `storylines.${storylineCategory}`;
                        break;
                    }
                }
            }

            if (entity) {
                console.log(`✓ 找到实体: ${entityId} (${category})`);
                retrievedEntities.push({
                    id: entityId,
                    category: category,
                    data: entity
                });
            } else {
                console.warn(`⚠️ 未找到实体: ${entityId}`);
            }
        }

        console.log(`✓ 成功召回 ${retrievedEntities.length}/${entityIds.length} 个实体`);
        console.groupEnd();

        // 格式化输出
        if (retrievedEntities.length === 0) {
            return '';
        }

        const formattedContent = retrievedEntities.map(({ id, category, data }) => {
            return `### ${id} (${category})\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
        }).join('\n\n');

        return `# **【实时召回的上下文】**\n以下是玩家提到但未在预加载上下文中的实体：\n\n${formattedContent}`;
    }

onPromptReady = async (eventData) => {
        const WATCHDOG_DELAY = 1000; // 看门狗延迟，单位：毫秒 (1秒)
    const now = Date.now();

       const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
    if (!isEngineEnabled) {
        // 我们只在控制台打印信息，避免打扰用户。
        this.info('[Guard-MasterSwitch] 流程中止：叙事流引擎总开关已关闭。');
        return;
    }
    this.diagnose(`PROBE [PROMPT-READY-ENTRY]: onPromptReady 事件触发。当前锁状态: ${this.isConductorActive}`);
    if (this.currentChapter) {
    console.log('%c[SBE DEBUG] Chapter State Snapshot (Before Turn):', 'color: #7f00ff; font-weight: bold;', JSON.parse(JSON.stringify(this.currentChapter)));
}
    if (this.isConductorActive) {
        this.info(`[Guard-Lock] 流程中止：注入处理正在进行中。`);
        return;
    }

    if (now - this.lastExecutionTimestamp < WATCHDOG_DELAY) {
        this.info(`[Guard-Watchdog] 流程中止：距离上次成功注入不足 ${WATCHDOG_DELAY / 1000} 秒，已拦截重复触发。`);
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
            console.group('[ENGINE-V2-PROBE] 准备 TurnConductor 输入上下文');
            const conductorContext = {
                lastExchange: lastExchange,
                chapterBlueprint: this.currentChapter.chapter_blueprint,
                chapter: this.currentChapter // V2.0: 传递完整的 chapter 实例
            };
            console.log('✓ chapter 实例已传递（包含 staticMatrices 和 stylistic_archive）');
            console.groupEnd();

            const conductorDecision = await this.turnConductorAgent.execute(conductorContext);

            this.diagnose('[PROBE][CONDUCTOR-DECISION] 收到回合指挥官的完整决策:', JSON.parse(JSON.stringify(conductorDecision)));
            if (conductorDecision.decision === 'TRIGGER_TRANSITION' || conductorDecision.decision === 'TRIGGER_EMERGENCY_TRANSITION') {
                const reason = conductorDecision.decision === 'TRIGGER_EMERGENCY_TRANSITION' ? "【紧急熔断】" : "【常规】";
                this.info(`PROBE [PENDING-TRANSITION]: 回合指挥官已发出${reason}章节转换的后台密令。`);
                this.isTransitionPending = true;
                this.pendingTransitionPayload = { decision: conductorDecision.decision };
            }

            // V2.0: 处理实时上下文召回
            let dynamicContextInjection = '';
            if (conductorDecision.realtime_context_ids && conductorDecision.realtime_context_ids.length > 0) {
                console.group('[ENGINE-V2-PROBE] 实时上下文召回流程');
                this.info(`检测到 ${conductorDecision.realtime_context_ids.length} 个需要实时召回的实体`);
                console.log('实体ID列表:', conductorDecision.realtime_context_ids);

                dynamicContextInjection = this._retrieveEntitiesByIds(conductorDecision.realtime_context_ids);

                if (dynamicContextInjection) {
                    this.info('✓ 动态上下文已生成，将注入到 Prompt');
                } else {
                    this.warn('⚠️ 动态上下文生成失败或为空');
                }
                console.groupEnd();
            } else {
                this.info('[ENGINE-V2] 本回合无需实时上下文召回');
            }

if (this.currentChapter.chapter_blueprint) {
    const formattedInstruction = this._formatMicroInstruction(conductorDecision.micro_instruction);
    instructionPlaceholder.content = `# **【最高优先级：本回合导演微指令 (Turn Instruction)】**\n---\n${formattedInstruction}`;

    // 【V2.0 适配】构建脚本内容，包含蓝图和动态上下文
    const blueprintAsString = JSON.stringify(this.currentChapter.chapter_blueprint, null, 2);
    let scriptContent = `# **【参考资料1：本章创作蓝图 (Chapter Blueprint)】**\n---\n\`\`\`json\n${blueprintAsString}\n\`\`\``;

    // V2.0: 如果有动态召回的上下文，追加到脚本内容中
    if (dynamicContextInjection) {
        scriptContent += `\n\n---\n\n${dynamicContextInjection}`;
        this.info('✓ 动态上下文已追加到脚本注入内容');
    }

    scriptPlaceholder.content = scriptContent;

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
                `\`\`\`json\n${blueprintAsString}\n\`\`\``
            ].join('\n\n');

    scriptPlaceholder.content = classicPrompt;
    instructionPlaceholder.content = "【回合裁判已禁用。请根据创作蓝图自由演绎。】";
    this.info("✅ 经典模式注入成功。");
}
    this.lastExecutionTimestamp = Date.now();
        this.info("[Watchdog] 成功注入，已更新执行时间戳。");
    } catch (error) {
        this.diagnose("在 onPromptReady 异步流程中发生严重错误:", error);
        // 出错时，将两个占位符都更新为错误信息，避免注入不完整
        scriptPlaceholder.content = "【SBT 引擎在处理剧本时发生错误。】";
        instructionPlaceholder.content = "【SBT 引擎在处理指令时发生错误，本次将使用常规Prompt。】";
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
                                targetRel.history.push(relUpdate.history_entry);
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
                                targetRel.history.push(relUpdate.history_entry);
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
                console.group('[SBE-PROBE] 故事线更新流程启动');
                this.info(`检测到故事线更新请求，分类数量: ${Object.keys(updates.storylines).length}`);
                console.log('史官输出的完整 updates.storylines:', JSON.parse(JSON.stringify(updates.storylines)));

                for (const category in updates.storylines) { // main_quests, side_quests...
                    console.group(`[SBE-PROBE] 处理分类: ${category}`);
                    this.info(`  -> 当前分类: ${category}, 故事线数量: ${Object.keys(updates.storylines[category]).length}`);

                    if (!workingChapter.dynamicState.storylines[category]) {
                        workingChapter.dynamicState.storylines[category] = {};
                        this.info(`  -> 已初始化 dynamicState.storylines.${category}`);
                    }
                    if (!workingChapter.staticMatrices.storylines[category]) {
                        workingChapter.staticMatrices.storylines[category] = {};
                        this.info(`  -> 已初始化 staticMatrices.storylines.${category}`);
                    }

                    console.log(`现有的 staticMatrices.storylines.${category} 故事线:`, Object.keys(workingChapter.staticMatrices.storylines[category]));

                    for (const storylineId in updates.storylines[category]) {
                        console.group(`[SBE-PROBE] 处理故事线: ${storylineId}`);
                        const storylineUpdate = updates.storylines[category][storylineId];
                        this.info(`  -> 正在处理故事线: ${category}/${storylineId}`);
                        console.log('史官提供的更新内容:', JSON.parse(JSON.stringify(storylineUpdate)));

                        // 确保故事线在 staticMatrices 中存在
                        if (!workingChapter.staticMatrices.storylines[category][storylineId]) {
                            this.warn(`❌ 警告：尝试更新不存在的故事线 ${category}/${storylineId}，跳过此更新`);
                            console.log('现有故事线列表:', Object.keys(workingChapter.staticMatrices.storylines[category]));
                            console.groupEnd();
                            continue;
                        }

                        // 更新动态状态
                        if (!workingChapter.dynamicState.storylines[category][storylineId]) {
                            workingChapter.dynamicState.storylines[category][storylineId] = { history: [] };
                            this.info(`  -> 已初始化 dynamicState.storylines.${category}.${storylineId}`);
                        }
                        const dynamicStoryline = workingChapter.dynamicState.storylines[category][storylineId];
                        console.log('更新前的动态状态:', JSON.parse(JSON.stringify(dynamicStoryline)));

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
                            dynamicStoryline.history.push(storylineUpdate.history_entry);
                            this.info(`    ✓ 已添加历史记录条目`);
                            dynamicUpdated = true;
                        }

                        // 【关键修复】更新静态字段
                        const staticStoryline = workingChapter.staticMatrices.storylines[category][storylineId];
                        console.log('更新前的静态状态:', JSON.parse(JSON.stringify(staticStoryline)));

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

                        console.log('更新后的动态状态:', JSON.parse(JSON.stringify(dynamicStoryline)));
                        console.log('更新后的静态状态:', JSON.parse(JSON.stringify(staticStoryline)));
                        console.groupEnd();
                    }
                    console.groupEnd();
                }
                console.groupEnd();
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

        // V2.0 步骤四：更新宏观叙事弧光
        if (delta.updates?.meta?.active_narrative_arcs) {
            console.group('[ENGINE-V2-PROBE] 宏观叙事弧光更新流程');
            this.info(" -> 检测到宏观叙事弧光更新请求...");

            if (!workingChapter.meta.active_narrative_arcs) {
                workingChapter.meta.active_narrative_arcs = [];
                this.info(" -> 已初始化 meta.active_narrative_arcs 数组");
            }

            const arcUpdates = delta.updates.meta.active_narrative_arcs;
            console.log(`收到 ${arcUpdates.length} 条弧光更新`, arcUpdates);

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

            console.log(`当前活跃弧光数量: ${workingChapter.meta.active_narrative_arcs.length}`);
            console.groupEnd();
        }

        // V2.0 步骤五：合并文体档案更新
        if (delta.stylistic_analysis_delta) {
            console.group('[ENGINE-V2-PROBE] 文体档案合并流程');
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

            console.groupEnd();
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
        console.group(`BRIDGE-PROBE [GENESIS-FLOW-ECI]`);
        const loadingToast = this.toastr.info(
            "正在初始化...", "创世纪...",
            { timeOut: 0, extendedTimeOut: 0, closeButton: false, progressBar: true, tapToDismiss: false }
        );

        try {
            const context = this.deps.applicationFunctionManager.getContext();
            const activeCharId = context?.characterId;
            if (!activeCharId) throw new Error("无法获取 activeCharId，创世纪中止。");

            // 1. 创建空的ECI Chapter实例
            this.currentChapter = new Chapter({ characterId: activeCharId });
            this.info("GENESIS: 已为新篇章创建空的ECI Chapter实例。");
            
            // 2. 获取静态数据库 (缓存优先)
            loadingToast.find('.toast-message').text("正在分析世界观与角色设定...");
            let staticDb = staticDataManager.loadStaticData(activeCharId);

            if (!staticDb) {
                this.info("GENESIS: 未找到缓存，正在实时分析世界书...");
                const persona = window.personas?.[window.main_persona];
                const worldInfoEntries = await this.deps.getCharacterBoundWorldbookEntries(context);
                const agentOutput = await this.intelligenceAgent.execute({ worldInfoEntries, persona });

                if (agentOutput && agentOutput.staticMatrices) {
                    staticDb = agentOutput.staticMatrices;
                    staticDataManager.saveStaticData(activeCharId, staticDb);
                    this.info("GENESIS: AI分析成功，新的ECI静态数据库已存入缓存。");
                } else {
                    throw new Error("IntelligenceAgent未能返回有效数据，且无可用缓存。");
                }
            } else {
                this.info("GENESIS: 已从缓存加载ECI静态数据。");
            }

            // 3. 将获取到的静态数据库注入Chapter实例
            // 【【【 这里是唯一的数据注入点，不再有后续的错误覆盖 】】】
            this.currentChapter.staticMatrices = staticDb;
            this.info("GENESIS: ECI静态数据库已成功注入当前Chapter实例。");

            // 4. 【验证日志】
            console.groupCollapsed('[SBE-DIAGNOSE] Chapter state before planning:');
            console.dir(JSON.parse(JSON.stringify(this.currentChapter)));
            console.groupEnd();

            // 5. 获取玩家导演焦点
            this._setStatus(ENGINE_STATUS.BUSY_DIRECTING);
            // ... (后续流程与之前版本一致)
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

            // 6. 规划开篇剧本
            this._setStatus(ENGINE_STATUS.BUSY_PLANNING);
            loadingToast.find('.toast-message').text("建筑师正在构思开篇剧本...");
            const architectResult = await this._planNextChapter(true, this.currentChapter, firstMessageContent);    
            if (architectResult && architectResult.new_chapter_script) {
                this.currentChapter.chapter_blueprint = architectResult.new_chapter_script;
                this.currentChapter.activeChapterDesignNotes = architectResult.design_notes;
                this.info("GENESIS: 建筑师成功生成开篇创作蓝图及设计笔记。");
            } else {
                throw new Error("建筑师未能生成有效的开篇创作蓝图。");
            }

        } catch (error) {
            this.diagnose("创世纪流程中发生严重错误:", error);
            this.toastr.error(`创世纪失败: ${error.message}`, "引擎严重错误");
            this.currentChapter = null; 
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
            "正在启动章节转换流程...", "章节转换中...",
            { timeOut: 0, extendedTimeOut: 0, closeButton: false, progressBar: true, tapToDismiss: false }
        );
        this.info(`--- 章节转换流程启动 (ECI事务模型 V3.1 - 断点恢复增强版) ---`);
        console.group(`BRIDGE-PROBE [CHAPTER-TRANSITION-RESILIENT]: ${eventUid}`);

        try {
            const activeCharId = this.USER.getContext()?.characterId;
            if (!activeCharId) throw new Error("无法获取 activeCharId。");

            // 1. 加载当前状态
            const { piece: lastStatePiece, deep: lastAnchorIndex } = this.USER.findLastMessageWithLeader({ deep: (this.USER.getContext().chat.length - 1 - endIndex) });

            let workingChapter = (lastStatePiece && Chapter.isValidStructure(lastStatePiece.leader))
                ? Chapter.fromJSON(lastStatePiece.leader)
                : new Chapter({ characterId: activeCharId });

            // 确保静态数据是最新的
            const staticData = staticDataManager.loadStaticData(activeCharId);
            if (staticData) {
                workingChapter.staticMatrices = deepmerge(workingChapter.staticMatrices, staticData);
            }

            // 2. 【断点恢复机制】检查是否有未完成的过渡
            let reviewDelta = null;
            let finalNarrativeFocus = "由AI自主创新。";

            if (this.LEADER.pendingTransition) {
                this.info("检测到未完成的章节转换进度，正在恢复...");
                loadingToast.find('.toast-message').text("恢复之前的进度...");

                reviewDelta = this.LEADER.pendingTransition.historianReviewDelta;
                finalNarrativeFocus = this.LEADER.pendingTransition.playerNarrativeFocus || "由AI自主创新。";
                workingChapter.playerNarrativeFocus = finalNarrativeFocus;

                this.info("史官分析结果和玩家焦点已从临时存储中恢复。");
            } else {
                // 3. 获取史官的事务增量 (Delta)
                loadingToast.find('.toast-message').text("史官正在复盘本章历史...");
                reviewDelta = await this._runStrategicReview(workingChapter, lastAnchorIndex, endIndex);

                if (!reviewDelta || (!reviewDelta.creations && !reviewDelta.updates)) {
                    this.toastr.error(
                        "史官在复盘本章历史时遇到严重错误（很可能是网络连接问题），章节转换已中止。<br><small>请检查您的网络和API设置后，前往叙事罗盘面板手动点击按钮重试。</small>",
                        "章节转换失败",
                        { timeOut: 15000, escapeHtml: false }
                    );

                    // 清除可能存在的错误临时状态
                    this.LEADER.pendingTransition = null;
                    this.USER.saveChat();

                    this._setStatus(ENGINE_STATUS.IDLE);
                    if (loadingToast) this.toastr.clear(loadingToast);
                    console.groupEnd();
                    return;
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
                loadingToast.find('.toast-message').text("等待导演（玩家）指示...");
                if (localStorage.getItem('sbt-focus-popup-enabled') !== 'false') {
                    this._setStatus(ENGINE_STATUS.BUSY_DIRECTING);
                    const popupResult = await this.deps.showNarrativeFocusPopup(workingChapter.playerNarrativeFocus);
                    if (popupResult.nsfw) {
                        finalNarrativeFocus = "nsfw: " + (popupResult.value || "请AI自主设计成人情节");
                    } else if (popupResult.confirmed && popupResult.value) {
                        finalNarrativeFocus = popupResult.value;
                    }
                }

                // 【阶段2完成】更新玩家焦点到临时存储
                this.LEADER.pendingTransition.playerNarrativeFocus = finalNarrativeFocus;
                this.LEADER.pendingTransition.status = 'awaiting_architect';
                this.USER.saveChat();
                this.info("玩家焦点已捕获，中间结果已更新（阶段2/3）。");
            }

            // 5. 【核心】应用史官的事务增量
            workingChapter = this._applyStateUpdates(workingChapter, reviewDelta);
            workingChapter.playerNarrativeFocus = finalNarrativeFocus;

            // 6. 规划下一章节
            this._setStatus(ENGINE_STATUS.BUSY_PLANNING);
            loadingToast.find('.toast-message').text("建筑师正在规划新章节...");
            const architectResult = await this._planNextChapter(false, workingChapter);
            if (!architectResult || !architectResult.new_chapter_script) {
                throw new Error("建筑师未能生成新剧本。中间进度已保存，请点击按钮重试。");
            }

            // 7. 最终化并持久化新状态
            loadingToast.find('.toast-message').text("正在固化记忆并刷新状态...");
            const finalChapterState = workingChapter;
            finalChapterState.chapter_blueprint = architectResult.new_chapter_script;
            finalChapterState.activeChapterDesignNotes = architectResult.design_notes;
            finalChapterState.lastProcessedEventUid = eventUid;
            finalChapterState.checksum = simpleHash(JSON.stringify(finalChapterState) + Date.now());

            const targetPiece = this.USER.getContext().chat[endIndex];
            if (targetPiece) {
                targetPiece.leader = finalChapterState.toJSON();

                // 【阶段3完成】清除临时状态
                this.LEADER.pendingTransition = null;
                this.USER.saveChat();

                this.currentChapter = finalChapterState;
                this.info("新章节状态已成功写入聊天记录，临时状态已清除（阶段3/3完成）。");

                try {
                    this.eventBus.emit('CHAPTER_UPDATED', this.currentChapter);
                    this.toastr.success("章节已更新，仪表盘已刷新！", "无缝衔接");
                } catch (uiError) {
                    this.diagnose("UI更新操作失败，但这不会影响核心状态的保存。", uiError);
                    this.toastr.warning("后台状态已更新，但UI刷新失败，请手动刷新页面。", "UI警告");
                }
            } else {
                throw new Error(`最终写入失败！索引 ${endIndex} 处无目标消息。`);
            }

        } catch (error) {
            this.diagnose("章节转换流程中发生严重错误:", error);
            this.toastr.error(`${error.message}`, "章节规划失败", { timeOut: 10000 });
        } finally {
            this._setStatus(ENGINE_STATUS.IDLE);
            if (loadingToast) {
                this.toastr.clear(loadingToast);
            }
            console.groupEnd();
        }
    }
    async _runStrategicReview(chapterContext, startIndex, endIndex) {
        console.group("BRIDGE-PROBE [STRATEGIC-REVIEW | ECI-MODE]");
        let reviewDelta = null;
        try {
            const chat = this.USER.getContext().chat;
            const chapterMessages = [];
            // 安全地提取消息，即使startIndex为-1（表示新游戏）
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

            reviewDelta = await this.historianAgent.execute(contextForHistorian);

        } catch (error) {
            this.diagnose("在 _runStrategicReview 过程中发生错误:", error);
        } finally {
            console.groupEnd();
            return reviewDelta;
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
     const contextForArchitect = {
        system_confidence: isGenesis ? 0.1 : 0.5,
        player_profile: { description: "暂无画像。" },
        chapter: chapterContext,
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

    async saveCharacterEdit(charId, updatedChapterState) {
        this.info(`--- 保存角色 ${charId} 的编辑内容 ---`);

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
