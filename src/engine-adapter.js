//  src/engine-adapter.js


import applicationFunctionManager from '../manager.js';

// 1. 内部工具函数
const createProxyWithUserSetting = (target, allowEmpty = false, userObject, editorObject) => {
    return new Proxy({}, {
        get: (_, property) => {
            const settings = userObject.getSettings();
            if (settings && settings[target] && property in settings[target]) {
                return settings[target][property];
            }
            if (allowEmpty) return undefined;
            console.warn(`[EngineAdapter] Setting '${target}.${property}' not found.`);
            return undefined;
        },
        set: (_, property, value) => {
            const settings = userObject.getSettings();
            if (!settings[target]) {
                settings[target] = {};
            }
            settings[target][property] = value;
            if (userObject.saveSettings) userObject.saveSettings();
            return true;
        },
    });
};


// 2. 构建并导出【EDITOR】对象
const { toastr, callGenericPopup, generateRaw } = applicationFunctionManager;

export const EDITOR = {
    info: (message, detail = '') => toastr.info(detail, message),
    success: (message, detail = '') => toastr.success(detail, message),
    warning: (message, detail = '') => toastr.warning(detail, message),
    error: (message, detail = '', error) => {
        console.error('[EngineAdapter-Error]', message, detail, error);
        toastr.error(`${detail}<br>${error?.message || ''}`, message);
    },
    generateRaw: generateRaw,
    callGenericPopup: callGenericPopup,
};

// 3. 构建并导出【USER】对象 (包含聊天记录操作方法)
function findLastMessageWithLeaderImpl({ deep = 0, cutoff = 1000 } = {}) {
    const chat = this.getContext().chat;
    if (!chat || !chat.length || deep >= chat.length) return { piece: null, deep: -1 };
    const startIndex = chat.length - 1 - deep;
    for (let i = startIndex; i >= 0 && i >= startIndex - cutoff; i--) {
        const piece = chat[i];
        if (piece?.is_user === true) continue;
        if (piece?.leader) {
            return { piece, deep: i };
        }
    }
    return { piece: null, deep: -1 };
}

function getChatPieceImpl(deep = 0) {
    const chat = this.getContext().chat;
    if (!chat || !chat.length) return { piece: null, deep: -1 };
    let count = 0;
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i]?.is_user === false) {
            if (count === deep) {
                return { piece: chat[i], deep: i };
            }
            count++;
        }
    }
    return { piece: null, deep: -1 };
}

const baseUserObject = {
    getContext: () => applicationFunctionManager.getContext(),
    getSettings: () => applicationFunctionManager.getContext(),
    saveSettings: () => applicationFunctionManager.saveSettings?.(),
    saveChat: () => applicationFunctionManager.saveChat?.(),
    findLastMessageWithLeader: findLastMessageWithLeaderImpl,
    getChatPiece: getChatPieceImpl,
};

export const USER = {
    ...baseUserObject,
    IMPORTANT_USER_PRIVACY_DATA: createProxyWithUserSetting('IMPORTANT_USER_PRIVACY_DATA', true, baseUserObject, EDITOR),
};
/**
 * LEADER 对象，使用Proxy模式封装对 chatMetadata.leader 的安全访问。
 * @type {object}
 */
export const LEADER = new Proxy({}, {
    get(target, property) {
        const context = applicationFunctionManager.getContext();
        if (!context.chatMetadata) {
            context.chatMetadata = {};
        }
        if (!context.chatMetadata.leader) {
            context.chatMetadata.leader = {};
        }
        return context.chatMetadata.leader[property];
    },
    set(target, property, value) {
        const context = applicationFunctionManager.getContext();
        if (!context.chatMetadata) {
            context.chatMetadata = {};
        }
        if (!context.chatMetadata.leader) {
            context.chatMetadata.leader = {};
        }
        context.chatMetadata.leader[property] = value;
        return true;
    }
});