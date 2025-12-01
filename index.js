import applicationFunctionManager from './manager.js';
import { StoryBeatEngine } from './StoryBeatEngine.js';
import { LLMApiService } from './LLMApiService.js';
import * as stateManager from './stateManager.js';
import { eventBus } from './src/EventBus.js';
import * as textUtils from './utils/textUtils.js';
import * as jsonUtils from './utils/jsonExtractor.js';
import { updateDashboard } from './ui/renderers.js';
import { getCharacterBoundWorldbookEntries } from './worldbookManager.js';
import { ExecutionContext } from './src/ExecutionContext.js';
import { ENGINE_STATUS } from './src/constants.js';
import { setupUI, initializeUIManager, populateSettingsUI } from './ui/uiManager.js';
import { consoleManager } from './ui/ConsoleManager.js';
import { createLogger } from './utils/logger.js';

const { eventSource, event_types} = applicationFunctionManager;
const logger = createLogger('剧情节拍器');

applicationFunctionManager.eventSource.on(applicationFunctionManager.event_types.APP_READY, async () => {
    logger.info('正在启动... (SillyTavern应用已就绪)');

    // 初始化前端控制台
    consoleManager.init();

    // 暴露到全局，方便调试
    window.sbtConsoleManager = consoleManager;

    // 创建统一的日志实例供所有模块使用
    const sbtLogger = createLogger('SBT');

    const applicationDependencies = {
        applicationFunctionManager,
        LLMApiService,
        toastr,
        ...stateManager,
        ...textUtils,
        ...jsonUtils,
        updateDashboard,
        getCharacterBoundWorldbookEntries,
        // 统一日志接口 - 使用新的 Logger 类
        log: sbtLogger.debug.bind(sbtLogger),    // 调试日志
        info: sbtLogger.info.bind(sbtLogger),     // 重要信息
        warn: sbtLogger.warn.bind(sbtLogger),     // 警告
        error: sbtLogger.error.bind(sbtLogger),   // 错误
        // 【诊断日志】始终输出，用于错误追踪
        diagnose: (message, ...args) => sbtLogger.error(`[DIAGNOSE] ${message}`, ...args),
        eventBus: eventBus
    };

    stateManager.loadApiSettings();
    stateManager.loadNarrativeModeSettings(); // V7.0: 加载叙事模式全局配置

    // 1. 创建引擎实例
    const engine = new StoryBeatEngine(applicationDependencies);
    await engine.start();
    setTimeout(() => {
        populateSettingsUI(applicationDependencies);
    }, 0);
    window.storyBeatEngine = engine;

    const { eventSource, event_types } = applicationFunctionManager;

    // 2.将引擎的方法绑定到SillyTavern的事件上
    // 使用 .bind(engine) 来确保 onPromptReady 方法内部的 'this' 永远指向 engine 实例
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, engine.onPromptReady.bind(engine));

    logger.info('引擎启动完成');
});