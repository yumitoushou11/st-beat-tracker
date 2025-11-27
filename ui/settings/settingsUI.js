// ui/settings/settingsUI.js
// 设置面板相关的UI逻辑

import { getApiSettings, saveApiSettings, getNarrativeModeSettings, saveNarrativeModeSettings } from '../../stateManager.js';

/**
 * 填充设置面板UI
 * @param {Object} deps - 依赖注入对象
 */
export function populateSettingsUI(deps) {
    try {
        const settings = getApiSettings();
        if (settings) {
            // 填充主API设置
            $('#sbt-api-provider-select').val(settings.main.apiProvider || 'direct_openai');
            $('#sbt-api-url-input').val(settings.main.apiUrl);
            $('#sbt-api-key-input').val(settings.main.apiKey);
            $('#sbt-model-name-input').val(settings.main.modelName);

            // 填充回合裁判API设置
            $('#sbt-conductor-api-provider-select').val(settings.conductor.apiProvider || 'direct_openai');
            $('#sbt-conductor-api-url-input').val(settings.conductor.apiUrl);
            $('#sbt-conductor-api-key-input').val(settings.conductor.apiKey);
            $('#sbt-conductor-model-name-input').val(settings.conductor.modelName);

            // 根据提供商显示/隐藏预设选择器
            const mainProvider = settings.main.apiProvider || 'direct_openai';
            const conductorProvider = settings.conductor.apiProvider || 'direct_openai';

            if (mainProvider === 'sillytavern_preset') {
                $('#sbt-preset-selector-wrapper').show();
                $('#sbt-api-url-wrapper').hide();
                $('#sbt-api-key-input').closest('.sbt-form-group').hide();
                $('#sbt-model-name-input').closest('.sbt-form-group').hide();
                loadSillyTavernPresets(deps);
            }

            if (conductorProvider === 'sillytavern_preset') {
                $('#sbt-conductor-preset-selector-wrapper').show();
                $('#sbt-conductor-api-url-wrapper').hide();
                $('#sbt-conductor-api-key-input').closest('.sbt-form-group').hide();
                $('#sbt-conductor-model-name-input').closest('.sbt-form-group').hide();
                loadSillyTavernPresets(deps);
            }

            deps.info("[UIManager] 设置面板UI已根据已加载的配置完成填充。");
        }
    } catch (error) {
        deps.diagnose("[UIManager] 填充设置面板时发生错误:", error);
    }
}

/**
 * 绑定密码可见性切换处理器
 * @param {jQuery} $wrapper - 容器元素
 */
export function bindPasswordToggleHandlers($wrapper) {
    $wrapper.on('click', '#sbt-toggle-api-key', function() {
        const input = $('#sbt-api-key-input');
        input.attr('type', input.attr('type') === 'password' ? 'text' : 'password');
        $(this).toggleClass('fa-eye fa-eye-slash');
    });

    $wrapper.on('click', '#sbt-toggle-conductor-api-key', function() {
        const input = $('#sbt-conductor-api-key-input');
        input.attr('type', input.attr('type') === 'password' ? 'text' : 'password');
        $(this).toggleClass('fa-eye fa-eye-slash');
    });
}

/**
 * V7.0: 填充叙事模式选择器（全局配置版本）
 * @param {Object} deps - 依赖注入对象
 */
export function populateNarrativeModeSelector(deps) {
    try {
        // V7.0: 从全局配置读取默认叙事模式
        const modeSettings = getNarrativeModeSettings();
        const currentMode = modeSettings.default_mode || 'classic_rpg';

        // 设置选中的模式
        $(`input[name="narrative_mode"][value="${currentMode}"]`).prop('checked', true);

        deps.info(`[UIManager] 叙事模式UI已填充: ${currentMode === 'web_novel' ? '🔥网文模式(全局默认)' : '🎭正剧模式(全局默认)'}`);
    } catch (error) {
        deps.diagnose("[UIManager] 填充叙事模式选择器时发生错误:", error);
    }
}

/**
 * V7.0: 绑定叙事模式切换处理器（全局配置版本）
 * @param {jQuery} $wrapper - 容器元素
 * @param {Object} deps - 依赖注入对象
 * @param {Function} getCurrentChapterFn - 获取当前章节的函数（可选，如果有章节则同步更新）
 */
export function bindNarrativeModeSwitchHandler($wrapper, deps, getCurrentChapterFn) {
    // 应用按钮点击处理
    $wrapper.on('click', '#sbt-apply-narrative-mode', () => {
        const selectedMode = $('input[name="narrative_mode"]:checked').val();

        try {
            const modeSettings = getNarrativeModeSettings();
            const oldMode = modeSettings.default_mode;

            // V7.0: 保存到全局配置
            saveNarrativeModeSettings({ default_mode: selectedMode });

            const modeIcon = selectedMode === 'web_novel' ? '🔥' : '🎭';
            const modeName = selectedMode === 'web_novel' ? '网文模式' : '正剧模式';

            // 如果当前有活跃章节，同步更新章节的模式配置
            const currentChapter = getCurrentChapterFn?.();
            if (currentChapter) {
                if (!currentChapter.meta.narrative_control_tower.narrative_mode) {
                    currentChapter.meta.narrative_control_tower.narrative_mode = {
                        current_mode: 'classic_rpg',
                        mode_config: {}
                    };
                }
                currentChapter.meta.narrative_control_tower.narrative_mode.current_mode = selectedMode;
                deps.saveChapterToStorage?.(currentChapter);

                deps.toastr.success(
                    `${modeIcon} ${modeName}<br><small>已应用到全局设置 + 当前章节</small>`,
                    "叙事模式已切换",
                    { timeOut: 5000, escapeHtml: false }
                );
            } else {
                deps.toastr.success(
                    `${modeIcon} ${modeName}<br><small>已保存为全局默认，将在创世纪时生效</small>`,
                    "叙事模式已设置",
                    { timeOut: 5000, escapeHtml: false }
                );
            }

            deps.info(`[UIManager] 叙事模式全局默认已从 ${oldMode} 切换到 ${selectedMode}`);
        } catch (error) {
            deps.diagnose("[UIManager] 应用叙事模式时发生错误:", error);
            deps.toastr.error(`应用失败: ${error.message}`, "操作错误");
        }
    });
}

/**
 * 绑定设置保存处理器
 * @param {jQuery} $wrapper - 容器元素
 * @param {Object} deps - 依赖注入对象
 */
export function bindSettingsSaveHandler($wrapper, deps) {
    $wrapper.on('click', '#sbt-save-settings-btn', () => {
        let newSettings = {
            main: {
                apiProvider: String($('#sbt-api-provider-select').val()).trim(),
                apiUrl: String($('#sbt-api-url-input').val()).trim(),
                apiKey: String($('#sbt-api-key-input').val()).trim(),
                modelName: String($('#sbt-model-name-input').val()).trim(),
                tavernProfile: String($('#sbt-preset-select').val() || '').trim(), // 新增：预设 ID
            },
            conductor: {
                apiProvider: String($('#sbt-conductor-api-provider-select').val()).trim(),
                apiUrl: String($('#sbt-conductor-api-url-input').val()).trim(),
                apiKey: String($('#sbt-conductor-api-key-input').val()).trim(),
                modelName: String($('#sbt-conductor-model-name-input').val()).trim(),
                tavernProfile: String($('#sbt-conductor-preset-select').val() || '').trim(), // 新增：预设 ID
            }
        };

        // 智能填充：如果回合裁判的URL或Key为空，则自动使用主API的配置
        if (!newSettings.conductor.apiUrl || !newSettings.conductor.apiKey) {
            newSettings.conductor = { ...newSettings.main };
            // 将自动填充后的值更新回UI，让用户看到结果
            $('#sbt-conductor-api-provider-select').val(newSettings.conductor.apiProvider);
            $('#sbt-conductor-api-url-input').val(newSettings.conductor.apiUrl);
            $('#sbt-conductor-api-key-input').val(newSettings.conductor.apiKey);
            $('#sbt-conductor-model-name-input').val(newSettings.conductor.modelName);
            deps.toastr.info("回合裁判API未配置，将自动使用核心大脑的设置。", "自动填充");
        }

        // 检查主API配置是否完整
        if (!newSettings.main.apiUrl || !newSettings.main.apiKey) {
            deps.toastr.warning("核心大脑的 API URL 和 API Key 不能为空。", "设置不完整");
            return;
        }

        saveApiSettings(newSettings);
        $(document).trigger('sbt-api-settings-saved', [newSettings]);
        deps.toastr.success("所有API设置已保存并应用！", "操作成功");
    });
}

/**
 * 绑定API测试处理器
 * @param {jQuery} $wrapper - 容器元素
 * @param {Object} deps - 依赖注入对象
 */
export function bindAPITestHandlers($wrapper, deps) {
    // 测试核心大脑API连接
    $wrapper.on('click', '#sbt-test-api-btn', async function() {
        const $btn = $(this);
        const originalText = $btn.html();
        if (!deps.mainLlmService) {
            deps.toastr.error("核心大脑服务未初始化，无法测试。", "内部错误");
            return;
        }
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i> 正在测试...');

        try {
            const tempConfig = {
                apiProvider: String($('#sbt-api-provider-select').val()).trim(),
                apiUrl: String($('#sbt-api-url-input').val()).trim(),
                apiKey: String($('#sbt-api-key-input').val()).trim(),
                modelName: String($('#sbt-model-name-input').val()).trim(),
            };
            deps.mainLlmService.updateConfig(tempConfig);
            const successMessage = await deps.mainLlmService.testConnection();
            deps.toastr.success(successMessage, "核心大脑API连接成功");
        } catch (error) {
            deps.toastr.error(`${error.message}`, "核心大脑API连接失败", { timeOut: 10000 });
        } finally {
            $btn.prop('disabled', false).html(originalText);
        }
    });

    // 测试回合裁判API连接
    $wrapper.on('click', '#sbt-test-conductor-api-btn', async function() {
        const $btn = $(this);
        const originalText = $btn.html();
        if (!deps.conductorLlmService) {
            deps.toastr.error("回合裁判服务未初始化，无法测试。", "内部错误");
            return;
        }
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i> 正在测试...');

        try {
            const tempConfig = {
                apiProvider: String($('#sbt-conductor-api-provider-select').val()).trim(),
                apiUrl: String($('#sbt-conductor-api-url-input').val()).trim(),
                apiKey: String($('#sbt-conductor-api-key-input').val()).trim(),
                modelName: String($('#sbt-conductor-model-name-input').val()).trim(),
            };
            deps.conductorLlmService.updateConfig(tempConfig);
            const successMessage = await deps.conductorLlmService.testConnection();
            deps.toastr.success(successMessage, "回合裁判API连接成功");
        } catch (error) {
            deps.toastr.error(`${error.message}`, "回合裁判API连接失败", { timeOut: 10000 });
        } finally {
            $btn.prop('disabled', false).html(originalText);
        }
    });
}

/**
 * 加载 SillyTavern 预设列表
 * @param {Object} deps - 依赖注入对象
 */
export function loadSillyTavernPresets(deps) {
    console.log('[SBT-预设] 正在加载 SillyTavern 预设列表');

    try {
        const context = deps.USER.getContext();
        const tavernProfiles = context.extensionSettings?.connectionManager?.profiles || [];

        if (!tavernProfiles || tavernProfiles.length === 0) {
            console.warn('[SBT-预设] 未找到 SillyTavern 预设');
            return;
        }

        const settings = getApiSettings();

        // 填充主 LLM 预设选择器
        const $mainSelect = $('#sbt-preset-select');
        $mainSelect.empty().append(new Option('-- 请选择预设 --', ''));

        // 填充回合裁判预设选择器
        const $conductorSelect = $('#sbt-conductor-preset-select');
        $conductorSelect.empty().append(new Option('-- 请选择预设 --', ''));

        tavernProfiles.forEach(profile => {
            if (profile.api && profile.preset) {
                const option = new Option(profile.name || profile.id, profile.id);
                $mainSelect.append(option.cloneNode(true));
                $conductorSelect.append(option);
            }
        });

        // 设置当前选中的预设
        if (settings.main.tavernProfile) {
            $mainSelect.val(settings.main.tavernProfile);
        }
        if (settings.conductor.tavernProfile) {
            $conductorSelect.val(settings.conductor.tavernProfile);
        }

        console.log(`[SBT-预设] 已加载 ${tavernProfiles.length} 个预设`);
    } catch (error) {
        console.error('[SBT-预设] 加载预设失败:', error);
    }
}

/**
 * 绑定预设选择器和提供商切换的事件处理器
 * @param {jQuery} $wrapper - 容器元素
 * @param {Object} deps - 依赖注入对象
 */
export function bindPresetSelectorHandlers($wrapper, deps) {
    // 主 LLM 提供商切换时，显示/隐藏相关字段
    $wrapper.on('change', '#sbt-api-provider-select', function() {
        const provider = $(this).val();
        const $presetWrapper = $('#sbt-preset-selector-wrapper');
        const $urlWrapper = $('#sbt-api-url-wrapper');
        const $keyInput = $('#sbt-api-key-input').closest('.sbt-form-group');
        const $modelInput = $('#sbt-model-name-input').closest('.sbt-form-group');

        if (provider === 'sillytavern_preset') {
            // 使用预设模式：只显示预设选择器
            $presetWrapper.show();
            $urlWrapper.hide();
            $keyInput.hide();
            $modelInput.hide();
            loadSillyTavernPresets(deps);
        } else {
            // 其他模式：显示 URL/Key/Model
            $presetWrapper.hide();
            $urlWrapper.show();
            $keyInput.show();
            $modelInput.show();
        }
    });

    // 回合裁判 LLM 提供商切换
    $wrapper.on('change', '#sbt-conductor-api-provider-select', function() {
        const provider = $(this).val();
        const $presetWrapper = $('#sbt-conductor-preset-selector-wrapper');
        const $urlWrapper = $('#sbt-conductor-api-url-wrapper');
        const $keyInput = $('#sbt-conductor-api-key-input').closest('.sbt-form-group');
        const $modelInput = $('#sbt-conductor-model-name-input').closest('.sbt-form-group');

        if (provider === 'sillytavern_preset') {
            $presetWrapper.show();
            $urlWrapper.hide();
            $keyInput.hide();
            $modelInput.hide();
            loadSillyTavernPresets(deps);
        } else {
            $presetWrapper.hide();
            $urlWrapper.show();
            $keyInput.show();
            $modelInput.show();
        }
    });

    // 主 LLM 预设选择时
    $wrapper.on('change', '#sbt-preset-select', function() {
        const profileId = $(this).val();
        console.log(`[SBT-预设] 主 LLM 预设已选择: ${profileId}`);
    });

    // 回合裁判预设选择时
    $wrapper.on('change', '#sbt-conductor-preset-select', function() {
        const profileId = $(this).val();
        console.log(`[SBT-预设] 回合裁判预设已选择: ${profileId}`);
    });
}
