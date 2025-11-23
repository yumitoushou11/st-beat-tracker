const API_SETTINGS_KEY = 'sbt-api-settings-v2';
const NARRATIVE_MODE_KEY = 'sbt-narrative-mode-v7'; // V7.0: 叙事模式全局配置

let apiSettings = {
    main: { apiUrl: '', apiKey: '', modelName: 'gemini-pro' },
    conductor: { apiUrl: '', apiKey: '', modelName: 'gemini-1.5-flash' }
};

// V7.0: 叙事模式全局配置（用于创世纪时的默认值）
let narrativeModeSettings = {
    default_mode: 'classic_rpg' // 默认为正剧模式
};

export function saveApiSettings(settings) {
    try {
        localStorage.setItem(API_SETTINGS_KEY, JSON.stringify(settings));
        apiSettings = settings;
        console.info("[SBE-INFO] 双轨制API设置已成功保存。");
    } catch (e) {
        console.error("[SBE-DIAGNOSE] 保存API设置失败！", e);
    }
}

export function loadApiSettings() {
    try {
        const storedSettings = localStorage.getItem(API_SETTINGS_KEY);
        if (storedSettings) {
            const parsed = JSON.parse(storedSettings);
            apiSettings.main = { ...apiSettings.main, ...parsed.main };
            apiSettings.conductor = { ...apiSettings.conductor, ...parsed.conductor };
            console.info("[SBE-INFO] 已成功加载双轨制API设置。");
        }
    } catch (e) {
        console.error("[SBE-DIAGNOSE] 加载API设置失败！", e);
    }
}

export const getApiSettings = () => apiSettings;

// V7.0: 叙事模式全局配置管理
export function saveNarrativeModeSettings(settings) {
    try {
        localStorage.setItem(NARRATIVE_MODE_KEY, JSON.stringify(settings));
        narrativeModeSettings = settings;
        console.info("[SBE-INFO] 叙事模式全局配置已保存:", settings.default_mode);
    } catch (e) {
        console.error("[SBE-DIAGNOSE] 保存叙事模式配置失败！", e);
    }
}

export function loadNarrativeModeSettings() {
    try {
        const storedSettings = localStorage.getItem(NARRATIVE_MODE_KEY);
        if (storedSettings) {
            narrativeModeSettings = JSON.parse(storedSettings);
            console.info("[SBE-INFO] 已加载叙事模式全局配置:", narrativeModeSettings.default_mode);
        }
    } catch (e) {
        console.error("[SBE-DIAGNOSE] 加载叙事模式配置失败！", e);
    }
}

export const getNarrativeModeSettings = () => narrativeModeSettings;