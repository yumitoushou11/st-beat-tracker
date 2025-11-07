const API_SETTINGS_KEY = 'sbt-api-settings-v2';
let apiSettings = {
    main: { apiUrl: '', apiKey: '', modelName: 'gemini-pro' },
    conductor: { apiUrl: '', apiKey: '', modelName: 'gemini-1.5-flash' }
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