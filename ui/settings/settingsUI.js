// ui/settings/settingsUI.js
// 设置面板相关的UI逻辑

import { getApiSettings, saveApiSettings, getNarrativeModeSettings, saveNarrativeModeToCharacter } from '../../stateManager.js';
import { promptManager } from '../../promptManager.js';
import { USER } from '../../src/engine-adapter.js';
import { fetchModels, cacheModels, getCachedModels } from '../../modelManager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('设置UI');

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

            // 填充模型名称（如果有缓存则填充下拉，否则显示输入框）
            populateModelDropdown('main', settings.main.modelName);

            // 填充回合裁判API设置
            $('#sbt-conductor-api-provider-select').val(settings.conductor.apiProvider || 'direct_openai');
            $('#sbt-conductor-api-url-input').val(settings.conductor.apiUrl);
            $('#sbt-conductor-api-key-input').val(settings.conductor.apiKey);

            // 填充回合裁判模型名称
            populateModelDropdown('conductor', settings.conductor.modelName);

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
 * V8.0: 绑定叙事模式切换处理器（角色卡专属版本）
 * @param {jQuery} $wrapper - 容器元素
 * @param {Object} deps - 依赖注入对象
 * @param {Function} getCurrentChapterFn - 获取当前章节的函数（可选，如果有章节则同步更新）
 */
export function bindNarrativeModeSwitchHandler($wrapper, deps, getCurrentChapterFn) {
    // 应用按钮点击处理
    $wrapper.on('click', '#sbt-apply-narrative-mode', async () => {
        const selectedMode = $('input[name="narrative_mode"]:checked').val();

        try {
            const context = USER.getContext();
            const character = context.characters?.[context.characterId];

            if (!character) {
                deps.toastr.warning('请先选择一个角色卡', '无法保存');
                return;
            }

            const modeIcon = selectedMode === 'web_novel' ? '🔥' : '🎭';
            const modeName = selectedMode === 'web_novel' ? '网文模式' : '正剧模式';

            // V8.0: 保存到角色卡
            const success = await saveNarrativeModeToCharacter({ default_mode: selectedMode });

            if (!success) {
                deps.toastr.error('保存到角色卡失败，请查看控制台日志', '保存失败');
                return;
            }

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
                    `${modeIcon} ${modeName}<br><small>已保存到角色卡「${character.name}」+ 当前章节</small>`,
                    "本卡叙事策略已设置",
                    { timeOut: 5000, escapeHtml: false }
                );
            } else {
                deps.toastr.success(
                    `${modeIcon} ${modeName}<br><small>已保存到角色卡「${character.name}」，将在创世纪时生效</small>`,
                    "本卡叙事策略已设置",
                    { timeOut: 5000, escapeHtml: false }
                );
            }

            deps.info(`[UIManager] 角色「${character.name}」的叙事模式已设置为 ${selectedMode}`);
        } catch (error) {
            deps.diagnose("[UIManager] 应用叙事模式时发生错误:", error);
            deps.toastr.error(`应用失败: ${error.message}`, "操作错误");
        }
    });
}

/**
 * 辅助函数：读取模型名称（优先从下拉选择器，如果是手动输入则从输入框）
 */
const getModelName = (selectId, inputId) => {
    const selectValue = String($(`#${selectId}`).val() || '').trim();
    if (selectValue && selectValue !== '__manual__') {
        return selectValue;
    }
    return String($(`#${inputId}`).val()).trim();
};

/**
 * 核心保存函数 - 从UI读取设置并保存
 * @returns {boolean} 保存是否成功
 */
export function saveSettings() {
    console.log('[SBT-DEBUG] saveSettings 被调用，版本: V8.1');

    let newSettings = {
        main: {
            apiProvider: String($('#sbt-api-provider-select').val()).trim(),
            apiUrl: String($('#sbt-api-url-input').val()).trim(),
            apiKey: String($('#sbt-api-key-input').val()).trim(),
            modelName: getModelName('sbt-model-name-select', 'sbt-model-name-input'),
            tavernProfile: String($('#sbt-preset-select').val() || '').trim(),
        },
        conductor: {
            apiProvider: String($('#sbt-conductor-api-provider-select').val()).trim(),
            apiUrl: String($('#sbt-conductor-api-url-input').val()).trim(),
            apiKey: String($('#sbt-conductor-api-key-input').val()).trim(),
            modelName: getModelName('sbt-conductor-model-name-select', 'sbt-conductor-model-name-input'),
            tavernProfile: String($('#sbt-conductor-preset-select').val() || '').trim(),
        }
    };

    // 智能填充：如果回合裁判未配置，则自动使用主API的配置
    let conductorNeedsAutoFill = false;

    if (newSettings.conductor.apiProvider === 'sillytavern_preset') {
        conductorNeedsAutoFill = !newSettings.conductor.tavernProfile;
    } else {
        conductorNeedsAutoFill = !newSettings.conductor.apiUrl || !newSettings.conductor.apiKey;
    }

    if (conductorNeedsAutoFill) {
        newSettings.conductor = { ...newSettings.main };
        // 将自动填充后的值更新回UI
        $('#sbt-conductor-api-provider-select').val(newSettings.conductor.apiProvider);
        $('#sbt-conductor-api-url-input').val(newSettings.conductor.apiUrl);
        $('#sbt-conductor-api-key-input').val(newSettings.conductor.apiKey);
        $('#sbt-conductor-model-name-input').val(newSettings.conductor.modelName);
        $('#sbt-conductor-preset-select').val(newSettings.conductor.tavernProfile || '');
    }

    // 检查主API配置是否完整
    if (newSettings.main.apiProvider === 'sillytavern_preset') {
        if (!newSettings.main.tavernProfile) {
            logger.warn('[自动保存] 预设模式未选择预设，跳过保存');
            return { success: false, reason: '预设模式未选择预设' };
        }
    } else {
        if (!newSettings.main.apiUrl || !newSettings.main.apiKey) {
            logger.warn('[自动保存] URL或Key为空，跳过保存');
            return { success: false, reason: 'API URL 或 API Key 为空' };
        }
        if (!newSettings.main.modelName) {
            logger.warn('[自动保存] 模型名称为空，跳过保存');
            return { success: false, reason: '模型名称为空' };
        }
    }

    // 保存设置
    saveApiSettings(newSettings);

    // 调试日志
    logger.debug('[自动保存] 主LLM配置:', {
        provider: newSettings.main.apiProvider,
        tavernProfile: newSettings.main.tavernProfile,
        modelName: newSettings.main.modelName || '(空)',
        hasUrl: !!newSettings.main.apiUrl,
        hasKey: !!newSettings.main.apiKey
    });
    logger.debug('[自动保存] 回合裁判配置:', {
        provider: newSettings.conductor.apiProvider,
        tavernProfile: newSettings.conductor.tavernProfile,
        modelName: newSettings.conductor.modelName || '(空)',
        hasUrl: !!newSettings.conductor.apiUrl,
        hasKey: !!newSettings.conductor.apiKey
    });

    $(document).trigger('sbt-api-settings-saved', [newSettings]);
    return { success: true };
}

/**
 * 绑定设置保存处理器
 * @param {jQuery} $wrapper - 容器元素
 * @param {Object} deps - 依赖注入对象
 */
export function bindSettingsSaveHandler($wrapper, deps) {
    // 调试：确认函数被调用
    console.log('[SBT-DEBUG] bindSettingsSaveHandler 被调用，版本: V8.1-修复失焦保存');
    console.log('[SBT-DEBUG] $wrapper 元素数量:', $wrapper.length);

    // V8.0: 失焦即保存 - 监听所有输入框和下拉框的变化
    const apiInputSelectors = [
        '#sbt-api-provider-select',
        '#sbt-api-url-input',
        '#sbt-api-key-input',
        '#sbt-model-name-select',
        '#sbt-model-name-input',
        '#sbt-preset-select',
        '#sbt-conductor-api-provider-select',
        '#sbt-conductor-api-url-input',
        '#sbt-conductor-api-key-input',
        '#sbt-conductor-model-name-select',
        '#sbt-conductor-model-name-input',
        '#sbt-conductor-preset-select'
    ];

    // 为所有输入框和下拉框绑定失焦自动保存
    apiInputSelectors.forEach(selector => {
        $wrapper.on('blur change', selector, function() {
            console.log(`[SBT-DEBUG] ${selector} 触发了 blur/change 事件`);
            // V8.0修正: 立即保存，不使用防抖延迟（避免用户改完立即测试时配置还没生效）
            const result = saveSettings();
            if (result.success) {
                logger.info('[自动保存] API设置已自动保存');
                console.log('[SBT-DEBUG] 保存成功');
            } else {
                // 失焦保存失败时，给用户一个友好的提示
                logger.debug(`[自动保存] 配置不完整，未保存: ${result.reason}`);
                console.warn(`[SBT-DEBUG] 保存失败: ${result.reason}`);
                // 不显示 toastr，避免打扰用户输入，只在控制台记录
            }
        });
    });

    console.log('[SBT-DEBUG] 已为', apiInputSelectors.length, '个选择器绑定事件');

    // 保留原有的保存按钮功能（手动保存+显示提示）
    $wrapper.on('click', '#sbt-save-settings-btn', () => {
        const result = saveSettings();
        if (result.success) {
            deps.toastr.success("所有API设置已保存并应用！", "操作成功");
        } else {
            deps.toastr.warning(`请检查设置是否完整：${result.reason}`, "保存失败");
        }
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
            // V8.0修正: 测试前先强制保存配置，确保测试和实际调用使用相同配置
            const result = saveSettings();
            if (!result.success) {
                throw new Error(`配置不完整，无法测试：${result.reason}\n\n请检查所有必填项：\n- API URL\n- API Key\n- 模型名称`);
            }

            console.log('[SBT-DEBUG] 配置已保存，正在直接更新 mainLlmService 配置...');

            // 直接更新 LLM 服务的配置（不依赖事件监听器的异步延迟）
            const settings = getApiSettings();
            deps.mainLlmService.updateConfig({
                apiProvider: settings.main.apiProvider,
                apiUrl: settings.main.apiUrl,
                apiKey: settings.main.apiKey,
                modelName: settings.main.modelName,
                tavernProfile: settings.main.tavernProfile
            });

            console.log('[SBT-DEBUG] mainLlmService 配置已更新:', {
                provider: settings.main.apiProvider,
                url: settings.main.apiUrl,
                model: settings.main.modelName
            });

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
                modelName: getModelName('sbt-conductor-model-name-select', 'sbt-conductor-model-name-input'), // 修复：使用和保存时相同的逻辑
                tavernProfile: String($('#sbt-conductor-preset-select').val() || '').trim(),
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
 * @param {Object} deps - 依赖注入对象（可选，不再需要）
 */
export function loadSillyTavernPresets(deps) {
    logger.debug('[预设] 正在加载 SillyTavern 预设列表');

    try {
        // 直接使用导入的 USER 对象获取上下文
        const context = USER.getContext();
        const tavernProfiles = context.extensionSettings?.connectionManager?.profiles || [];

        if (!tavernProfiles || tavernProfiles.length === 0) {
            logger.warn('[预设] 未找到 SillyTavern 预设');
            deps?.toastr?.warning('未找到可用的 SillyTavern 预设。请先在连接管理器中配置预设。', '预设加载失败');
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

        logger.info(`[预设] 已加载 ${tavernProfiles.length} 个预设`);
    } catch (error) {
        logger.error('[预设] 加载预设失败:', error);
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

/**
 * 填充提示词管理UI
 * @param {Object} deps - 依赖注入对象
 */
export function populatePromptManagerUI(deps) {
    try {
        // 加载建筑师提示词
        if (promptManager.hasCustomArchitectPrompt()) {
            const architectPrompt = promptManager.getArchitectPrompt();
            $('#sbt-architect-prompt').val(architectPrompt);
        } else {
            $('#sbt-architect-prompt').attr('placeholder', '当前使用系统默认提示词（约600行）。\n\n💡 如需查看完整内容，请点击"导出"按钮。\n📝 如需自定义，请在此编辑后点击"保存"。\n\n建议：先导出查看默认内容，再基于默认内容进行修改。');
        }

        // 加载回合执导提示词
        if (promptManager.hasCustomConductorPrompt()) {
            const conductorPrompt = promptManager.getConductorPrompt();
            $('#sbt-conductor-prompt').val(conductorPrompt);
        } else {
            $('#sbt-conductor-prompt').attr('placeholder', '当前使用系统默认提示词（约200行）。\n\n💡 如需查看完整内容，请点击"导出"按钮。\n📝 如需自定义，请在此编辑后点击"保存"。\n\n建议：先导出查看默认内容，再基于默认内容进行修改。');
        }

        deps.info("[UIManager] 提示词管理UI已加载");
    } catch (error) {
        deps.diagnose("[UIManager] 填充提示词管理UI时发生错误:", error);
    }
}

/**
 * 绑定提示词管理事件处理器
 * @param {jQuery} $wrapper - 容器元素
 * @param {Object} deps - 依赖注入对象
 */
export function bindPromptManagerHandlers($wrapper, deps) {
    // 保存建筑师提示词
    $wrapper.on('click', '#sbt-save-architect-prompt', function() {
        try {
            const prompt = $('#sbt-architect-prompt').val();
            promptManager.saveArchitectPrompt(prompt);

            if (deps.toastr) {
                deps.toastr.success('建筑师提示词已保存', '保存成功');
            }
            deps.info("[UIManager] 建筑师提示词已保存");
        } catch (error) {
            if (deps.toastr) {
                deps.toastr.error('保存失败: ' + error.message, '错误');
            }
            deps.diagnose("[UIManager] 保存建筑师提示词时发生错误:", error);
        }
    });

    // 导出建筑师提示词
    $wrapper.on('click', '#sbt-export-architect-prompt', function() {
        try {
            promptManager.exportArchitectPrompt();
            if (deps.toastr) {
                deps.toastr.info('建筑师提示词已导出', '导出');
            }
        } catch (error) {
            if (deps.toastr) {
                deps.toastr.error('导出失败: ' + error.message, '错误');
            }
            deps.diagnose("[UIManager] 导出建筑师提示词时发生错误:", error);
        }
    });

    // 导入建筑师提示词
    $wrapper.on('click', '#sbt-import-architect-prompt', async function() {
        try {
            const content = await promptManager.importArchitectPrompt();
            if (content) {
                $('#sbt-architect-prompt').val(content);
                if (deps.toastr) {
                    deps.toastr.success('建筑师提示词已导入', '导入成功');
                }
                deps.info("[UIManager] 建筑师提示词已导入");
            }
        } catch (error) {
            if (deps.toastr) {
                deps.toastr.error('导入失败: ' + error.message, '错误');
            }
            deps.diagnose("[UIManager] 导入建筑师提示词时发生错误:", error);
        }
    });

    // 重置建筑师提示词
    $wrapper.on('click', '#sbt-reset-architect-prompt', function() {
        if (confirm('确定要恢复建筑师提示词为默认值吗?这将清除您的自定义修改。')) {
            try {
                promptManager.resetArchitectPrompt();
                const defaultPrompt = promptManager.getArchitectPrompt();
                $('#sbt-architect-prompt').val(defaultPrompt);

                if (deps.toastr) {
                    deps.toastr.success('建筑师提示词已恢复为默认值', '重置成功');
                }
                deps.info("[UIManager] 建筑师提示词已重置");
            } catch (error) {
                if (deps.toastr) {
                    deps.toastr.error('重置失败: ' + error.message, '错误');
                }
                deps.diagnose("[UIManager] 重置建筑师提示词时发生错误:", error);
            }
        }
    });

    // 保存回合执导提示词
    $wrapper.on('click', '#sbt-save-conductor-prompt', function() {
        try {
            const prompt = $('#sbt-conductor-prompt').val();
            promptManager.saveConductorPrompt(prompt);

            if (deps.toastr) {
                deps.toastr.success('回合执导提示词已保存', '保存成功');
            }
            deps.info("[UIManager] 回合执导提示词已保存");
        } catch (error) {
            if (deps.toastr) {
                deps.toastr.error('保存失败: ' + error.message, '错误');
            }
            deps.diagnose("[UIManager] 保存回合执导提示词时发生错误:", error);
        }
    });

    // 导出回合执导提示词
    $wrapper.on('click', '#sbt-export-conductor-prompt', function() {
        try {
            promptManager.exportConductorPrompt();
            if (deps.toastr) {
                deps.toastr.info('回合执导提示词已导出', '导出');
            }
        } catch (error) {
            if (deps.toastr) {
                deps.toastr.error('导出失败: ' + error.message, '错误');
            }
            deps.diagnose("[UIManager] 导出回合执导提示词时发生错误:", error);
        }
    });

    // 导入回合执导提示词
    $wrapper.on('click', '#sbt-import-conductor-prompt', async function() {
        try {
            const content = await promptManager.importConductorPrompt();
            if (content) {
                $('#sbt-conductor-prompt').val(content);
                if (deps.toastr) {
                    deps.toastr.success('回合执导提示词已导入', '导入成功');
                }
                deps.info("[UIManager] 回合执导提示词已导入");
            }
        } catch (error) {
            if (deps.toastr) {
                deps.toastr.error('导入失败: ' + error.message, '错误');
            }
            deps.diagnose("[UIManager] 导入回合执导提示词时发生错误:", error);
        }
    });

    // 重置回合执导提示词
    $wrapper.on('click', '#sbt-reset-conductor-prompt', function() {
        if (confirm('确定要恢复回合执导提示词为默认值吗?这将清除您的自定义修改。')) {
            try {
                promptManager.resetConductorPrompt();
                const defaultPrompt = promptManager.getConductorPrompt();
                $('#sbt-conductor-prompt').val(defaultPrompt);

                if (deps.toastr) {
                    deps.toastr.success('回合执导提示词已恢复为默认值', '重置成功');
                }
                deps.info("[UIManager] 回合执导提示词已重置");
            } catch (error) {
                if (deps.toastr) {
                    deps.toastr.error('重置失败: ' + error.message, '错误');
                }
                deps.diagnose("[UIManager] 重置回合执导提示词时发生错误:", error);
            }
        }
    });
}

/**
 * 填充模型下拉选择器
 * @param {string} type - 'main' 或 'conductor'
 * @param {string} currentModel - 当前选中的模型名称
 */
function populateModelDropdown(type, currentModel = '') {
    const prefix = type === 'main' ? 'sbt' : 'sbt-conductor';
    const $select = $(`#${prefix}-model-name-select`);
    const $input = $(`#${prefix}-model-name-input`);
    const cacheKey = `sbt_cached_models_${type}`;

    // 尝试从缓存加载模型列表
    const cachedModels = getCachedModels(cacheKey);

    if (cachedModels && cachedModels.length > 0) {
        // 有缓存：填充下拉选择器
        $select.empty();
        $select.append(new Option('-- 请选择模型 --', ''));

        cachedModels.forEach(model => {
            $select.append(new Option(model, model));
        });

        $select.append(new Option('手动输入...', '__manual__'));

        // 设置当前选中的模型
        if (currentModel && cachedModels.includes(currentModel)) {
            $select.val(currentModel);
            $select.show();
            $input.hide();
        } else if (currentModel) {
            // 模型不在列表中，切换到手动输入
            $select.val('__manual__');
            $input.val(currentModel).show();
            $select.show();
        } else {
            $select.show();
            $input.hide();
        }
    } else {
        // 无缓存：显示手动输入框
        $select.val('__manual__');
        $select.show(); // 修复：确保select也显示出来
        $input.val(currentModel).show();
    }
}

/**
 * 绑定模型刷新按钮的事件处理器
 * @param {jQuery} $wrapper - 容器元素
 * @param {Object} deps - 依赖注入对象
 */
export function bindModelRefreshHandlers($wrapper, deps) {
    // 主 LLM 刷新模型按钮
    $wrapper.on('click', '#sbt-refresh-models-btn', async function() {
        const $btn = $(this);
        const originalHtml = $btn.html();

        try {
            // 禁用按钮并显示加载动画
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i>');

            // 读取当前配置
            const apiProvider = String($('#sbt-api-provider-select').val()).trim();
            const apiUrl = String($('#sbt-api-url-input').val()).trim();
            const apiKey = String($('#sbt-api-key-input').val()).trim();
            const tavernProfile = String($('#sbt-preset-select').val() || '').trim();

            logger.info('[模型刷新] 主LLM - 提供商:', apiProvider);

            // 调用 modelManager 获取模型列表
            const models = await fetchModels(apiProvider, apiUrl, apiKey, tavernProfile);

            if (models.length === 0) {
                deps.toastr.warning('未获取到模型列表，请手动输入模型名称', '提示');
                return;
            }

            // 缓存模型列表
            cacheModels('sbt_cached_models_main', models);

            // 获取当前的模型名称（可能在输入框中，或之前选择的）
            const currentModel = String($('#sbt-model-name-input').val() || $('#sbt-model-name-select').val()).trim();

            // 填充下拉选择器
            const $select = $('#sbt-model-name-select');
            $select.empty();
            $select.append(new Option('-- 请选择模型 --', ''));

            models.forEach(model => {
                $select.append(new Option(model, model));
            });

            $select.append(new Option('手动输入...', '__manual__'));

            // 如果当前模型在列表中，自动选中
            if (currentModel && models.includes(currentModel)) {
                $select.val(currentModel);
                $select.show();
                $('#sbt-model-name-input').hide();
            } else if (currentModel) {
                // 如果当前模型不在列表中，切换到手动输入模式
                $select.val('__manual__');
                $('#sbt-model-name-input').val(currentModel).show();
                $select.show();
            } else {
                // 没有当前模型，显示下拉选择器
                $select.show();
                $('#sbt-model-name-input').hide();
            }

            deps.toastr.success(`成功获取 ${models.length} 个模型`, '刷新成功');

        } catch (error) {
            logger.error('[模型刷新] 失败:', error);
            deps.toastr.error(error.message, '刷新失败', { timeOut: 8000 });
        } finally {
            $btn.prop('disabled', false).html(originalHtml);
        }
    });

    // 回合裁判 LLM 刷新模型按钮
    $wrapper.on('click', '#sbt-refresh-conductor-models-btn', async function() {
        const $btn = $(this);
        const originalHtml = $btn.html();

        try {
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i>');

            const apiProvider = String($('#sbt-conductor-api-provider-select').val()).trim();
            const apiUrl = String($('#sbt-conductor-api-url-input').val()).trim();
            const apiKey = String($('#sbt-conductor-api-key-input').val()).trim();
            const tavernProfile = String($('#sbt-conductor-preset-select').val() || '').trim();

            logger.info('[模型刷新] 回合裁判 - 提供商:', apiProvider);

            const models = await fetchModels(apiProvider, apiUrl, apiKey, tavernProfile);

            if (models.length === 0) {
                deps.toastr.warning('未获取到模型列表，请手动输入模型名称', '提示');
                return;
            }

            cacheModels('sbt_cached_models_conductor', models);

            // 获取当前的模型名称（可能在输入框中，或之前选择的）
            const currentModel = String($('#sbt-conductor-model-name-input').val() || $('#sbt-conductor-model-name-select').val()).trim();

            const $select = $('#sbt-conductor-model-name-select');
            $select.empty();
            $select.append(new Option('-- 请选择模型 --', ''));

            models.forEach(model => {
                $select.append(new Option(model, model));
            });

            $select.append(new Option('手动输入...', '__manual__'));

            // 如果当前模型在列表中，自动选中
            if (currentModel && models.includes(currentModel)) {
                $select.val(currentModel);
                $select.show();
                $('#sbt-conductor-model-name-input').hide();
            } else if (currentModel) {
                // 如果当前模型不在列表中，切换到手动输入模式
                $select.val('__manual__');
                $('#sbt-conductor-model-name-input').val(currentModel).show();
                $select.show();
            } else {
                // 没有当前模型，显示下拉选择器
                $select.show();
                $('#sbt-conductor-model-name-input').hide();
            }

            deps.toastr.success(`成功获取 ${models.length} 个模型`, '刷新成功');

        } catch (error) {
            logger.error('[模型刷新] 失败:', error);
            deps.toastr.error(error.message, '刷新失败', { timeOut: 8000 });
        } finally {
            $btn.prop('disabled', false).html(originalHtml);
        }
    });

    // 主 LLM 模型选择器变化
    $wrapper.on('change', '#sbt-model-name-select', function() {
        const value = $(this).val();
        const $input = $('#sbt-model-name-input');

        if (value === '__manual__') {
            // 切换到手动输入模式
            $input.show().focus();
        } else {
            // 选中了某个模型
            $input.hide();
        }
    });

    // 回合裁判 LLM 模型选择器变化
    $wrapper.on('change', '#sbt-conductor-model-name-select', function() {
        const value = $(this).val();
        const $input = $('#sbt-conductor-model-name-input');

        if (value === '__manual__') {
            $input.show().focus();
        } else {
            $input.hide();
        }
    });
}
