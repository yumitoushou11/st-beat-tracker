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
const { eventSource, event_types} = applicationFunctionManager;
applicationFunctionManager.eventSource.on(applicationFunctionManager.event_types.APP_READY, async () => {
    console.log(`[剧情节拍器] 正在启动... (SillyTavern应用已就绪)`);

    const applicationDependencies = {
        applicationFunctionManager,
        LLMApiService,
        toastr,
        ...stateManager,
        ...textUtils,
        ...jsonUtils,
        updateDashboard,
        getCharacterBoundWorldbookEntries,
        // 【调试模式】日志方法 - 只在调试模式开启时输出
        log: (message, ...args) => {
            const isDebugMode = localStorage.getItem('sbt-debug-mode') === 'true';
            if (isDebugMode) console.log(`[SBT-LOG] ${message}`, ...args);
        },
        info: (message, ...args) => {
            const isDebugMode = localStorage.getItem('sbt-debug-mode') === 'true';
            if (isDebugMode) console.info(`[SBT-INFO] ${message}`, ...args);
        },
        warn: (message, ...args) => {
            const isDebugMode = localStorage.getItem('sbt-debug-mode') === 'true';
            if (isDebugMode) console.warn(`[SBT-WARN] ${message}`, ...args);
        },
        // 【诊断日志】始终输出，用于错误追踪
        diagnose: (message, ...args) => console.error(`[SBT-DIAGNOSE] ${message}`, ...args),
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

    console.log(`[剧情节拍器] 引擎启动完成。`);
});