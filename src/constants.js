// src/constants.js

/**
 * 统一管理整个应用中使用的常量，避免“魔法字符串”，
 * 提高代码的可维护性和健壮性。
 */

// 业务事件类型
export const EVENT_TYPES = Object.freeze({
    PROMPT_BEFORE_SEND: 'prompt:before_send',
    RESPONSE_RECEIVED: 'response:received',
});

// 引擎的生命周期状态
export const ENGINE_STATUS = Object.freeze({
    IDLE: { text: '空闲', icon: 'fa-coffee' },
    BUSY_GENESIS: { text: '创世纪...', icon: 'fa-seedling' },
    BUSY_SYNCING: { text: '同步状态...', icon: 'fa-sync fa-spin' },
    BUSY_DIRECTING: { text: '导演决策中...', icon: 'fa-video fa-beat' },
    BUSY_ANALYZING: { text: '后台分析中...', icon: 'fa-magnifying-glass fa-beat' },
    BUSY_CONSOLIDATING: { text: '记忆固化中...', icon: 'fa-microchip fa-beat' },
    BUSY_PLANNING: { text: '规划新章节...', icon: 'fa-sitemap' },
        BUSY_TRANSITIONING: { text: '章节转换中...', icon: 'fa-hourglass-half fa-spin' },
});