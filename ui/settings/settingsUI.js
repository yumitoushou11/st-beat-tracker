// ui/settings/settingsUI.js
// 设置面板相关的UI逻辑

import { getApiSettings, saveApiSettings, getNarrativeModeSettings, saveNarrativeModeToCharacter } from '../../stateManager.js';
import { promptManager } from '../../promptManager.js';
import { USER } from '../../src/engine-adapter.js';
import { fetchModels, cacheModels, getCachedModels } from '../../modelManager.js';

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
 * 绑定设置保存处理器
 * @param {jQuery} $wrapper - 容器元素
 * @param {Object} deps - 依赖注入对象
 */
export function bindSettingsSaveHandler($wrapper, deps) {
    $wrapper.on('click', '#sbt-save-settings-btn', () => {
        // 辅助函数：读取模型名称（优先从下拉选择器，如果是手动输入则从输入框）
        const getModelName = (selectId, inputId) => {
            const selectValue = String($(`#${selectId}`).val() || '').trim();
            if (selectValue && selectValue !== '__manual__') {
                return selectValue;
            }
            return String($(`#${inputId}`).val()).trim();
        };

        let newSettings = {
            main: {
                apiProvider: String($('#sbt-api-provider-select').val()).trim(),
                apiUrl: String($('#sbt-api-url-input').val()).trim(),
                apiKey: String($('#sbt-api-key-input').val()).trim(),
                modelName: getModelName('sbt-model-name-select', 'sbt-model-name-input'),
                tavernProfile: String($('#sbt-preset-select').val() || '').trim(), // 新增：预设 ID
            },
            conductor: {
                apiProvider: String($('#sbt-conductor-api-provider-select').val()).trim(),
                apiUrl: String($('#sbt-conductor-api-url-input').val()).trim(),
                apiKey: String($('#sbt-conductor-api-key-input').val()).trim(),
                modelName: getModelName('sbt-conductor-model-name-select', 'sbt-conductor-model-name-input'),
                tavernProfile: String($('#sbt-conductor-preset-select').val() || '').trim(), // 新增：预设 ID
            }
        };

        // 智能填充：如果回合裁判未配置，则自动使用主API的配置
        let conductorNeedsAutoFill = false;

        if (newSettings.conductor.apiProvider === 'sillytavern_preset') {
            // 预设模式：检查是否选择了预设
            conductorNeedsAutoFill = !newSettings.conductor.tavernProfile;
        } else {
            // 其他模式：检查 URL 和 Key
            conductorNeedsAutoFill = !newSettings.conductor.apiUrl || !newSettings.conductor.apiKey;
        }

        if (conductorNeedsAutoFill) {
            newSettings.conductor = { ...newSettings.main };
            // 将自动填充后的值更新回UI，让用户看到结果
            $('#sbt-conductor-api-provider-select').val(newSettings.conductor.apiProvider);
            $('#sbt-conductor-api-url-input').val(newSettings.conductor.apiUrl);
            $('#sbt-conductor-api-key-input').val(newSettings.conductor.apiKey);
            $('#sbt-conductor-model-name-input').val(newSettings.conductor.modelName);
            $('#sbt-conductor-preset-select').val(newSettings.conductor.tavernProfile || '');
            deps.toastr.info("回合裁判API未配置，将自动使用核心大脑的设置。", "自动填充");
        }

        // 检查主API配置是否完整（根据提供商类型检查）
        if (newSettings.main.apiProvider === 'sillytavern_preset') {
            // 预设模式：检查是否选择了预设
            if (!newSettings.main.tavernProfile) {
                deps.toastr.warning("请先选择一个 SillyTavern 预设。", "设置不完整");
                return;
            }
        } else {
            // 其他模式：检查 URL 和 Key
            if (!newSettings.main.apiUrl || !newSettings.main.apiKey) {
                deps.toastr.warning("核心大脑的 API URL 和 API Key 不能为空。", "设置不完整");
                return;
            }
        }

        // 保存设置
        saveApiSettings(newSettings);

        // 调试日志：显示保存的配置
        console.log('[SBT-设置保存] 主LLM配置:', {
            provider: newSettings.main.apiProvider,
            tavernProfile: newSettings.main.tavernProfile,
            hasUrl: !!newSettings.main.apiUrl,
            hasKey: !!newSettings.main.apiKey
        });
        console.log('[SBT-设置保存] 回合裁判配置:', {
            provider: newSettings.conductor.apiProvider,
            tavernProfile: newSettings.conductor.tavernProfile,
            hasUrl: !!newSettings.conductor.apiUrl,
            hasKey: !!newSettings.conductor.apiKey
        });

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
                tavernProfile: String($('#sbt-preset-select').val() || '').trim(), // 新增：读取预设 ID
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
                tavernProfile: String($('#sbt-conductor-preset-select').val() || '').trim(), // 新增：读取预设 ID
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
    console.log('[SBT-预设] 正在加载 SillyTavern 预设列表');

    try {
        // 直接使用导入的 USER 对象获取上下文
        const context = USER.getContext();
        const tavernProfiles = context.extensionSettings?.connectionManager?.profiles || [];

        if (!tavernProfiles || tavernProfiles.length === 0) {
            console.warn('[SBT-预设] 未找到 SillyTavern 预设');
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

            console.log('[模型刷新] 主LLM - 提供商:', apiProvider);

            // 调用 modelManager 获取模型列表
            const models = await fetchModels(apiProvider, apiUrl, apiKey, tavernProfile);

            if (models.length === 0) {
                deps.toastr.warning('未获取到模型列表，请手动输入模型名称', '提示');
                return;
            }

            // 缓存模型列表
            cacheModels('sbt_cached_models_main', models);

            // 填充下拉选择器
            const $select = $('#sbt-model-name-select');
            $select.empty();
            $select.append(new Option('-- 请选择模型 --', ''));

            models.forEach(model => {
                $select.append(new Option(model, model));
            });

            $select.append(new Option('手动输入...', '__manual__'));

            // 显示下拉选择器，隐藏输入框
            $select.show();
            $('#sbt-model-name-input').hide();

            deps.toastr.success(`成功获取 ${models.length} 个模型`, '刷新成功');

        } catch (error) {
            console.error('[模型刷新] 失败:', error);
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

            console.log('[模型刷新] 回合裁判 - 提供商:', apiProvider);

            const models = await fetchModels(apiProvider, apiUrl, apiKey, tavernProfile);

            if (models.length === 0) {
                deps.toastr.warning('未获取到模型列表，请手动输入模型名称', '提示');
                return;
            }

            cacheModels('sbt_cached_models_conductor', models);

            const $select = $('#sbt-conductor-model-name-select');
            $select.empty();
            $select.append(new Option('-- 请选择模型 --', ''));

            models.forEach(model => {
                $select.append(new Option(model, model));
            });

            $select.append(new Option('手动输入...', '__manual__'));

            $select.show();
            $('#sbt-conductor-model-name-input').hide();

            deps.toastr.success(`成功获取 ${models.length} 个模型`, '刷新成功');

        } catch (error) {
            console.error('[模型刷新] 失败:', error);
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
