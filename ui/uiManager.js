// ui/uiManager.js
import { SbtPopupConfirm } from './SbtPopupConfirm.js';
import { updateDashboard, showCharacterDetailModal, showWorldviewDetailModal, showStorylineDetailModal, showRelationshipDetailModal } from './renderers.js';
import applicationFunctionManager from '../manager.js';
import { getApiSettings, saveApiSettings} from '../stateManager.js';
import { mapValueToHue } from '../utils/colorUtils.js';
import { showNarrativeFocusPopup, showSagaFocusPopup } from './popups/proposalPopup.js';
import { populateSettingsUI, bindPasswordToggleHandlers, bindSettingsSaveHandler, bindAPITestHandlers, populateNarrativeModeSelector, bindNarrativeModeSwitchHandler, bindPresetSelectorHandlers, loadSillyTavernPresets } from './settings/settingsUI.js';
import * as staticDataManager from '../src/StaticDataManager.js';

const deps = {
    onReanalyzeWorldbook: () => console.warn("onReanalyzeWorldbook not injected"),
    onForceChapterTransition: () => console.warn("onForceChapterTransition not injected"),
    onStartGenesis: () => console.warn("onStartGenesis not injected"),
    onForceEndSceneClick: () => console.warn("onForceEndSceneClick not injected"),
    onSetNarrativeFocus: () => console.warn("onSetNarrativeFocus not injected"),
    onSaveCharacterEdit: () => console.warn("onSaveCharacterEdit not injected"),
    mainLlmService: null,
    conductorLlmService: null,
    eventBus: null,
    info: console.info,
    warn: console.warn,
    diagnose: console.error,
    toastr: {
        info: (msg, title) => console.info(`[Toast-Info: ${title}] ${msg}`),
        success: (msg, title) => console.log(`[Toast-Success: ${title}] ${msg}`),
        warning: (msg, title) => console.warn(`[Toast-Warning: ${title}] ${msg}`),
        error: (msg, title) => console.error(`[Toast-Error: ${title}] ${msg}`)
    }
};

export function initializeUIManager(dependencies) {
    Object.assign(deps, dependencies);

    deps.showSagaFocusPopup = showSagaFocusPopup;
    deps.showNarrativeFocusPopup = showNarrativeFocusPopup;
    
    if (deps.eventBus) {
        deps.eventBus.on('CHAPTER_UPDATED', (chapterState) => {
            deps.info("[UIManager] 接收到 'CHAPTER_UPDATED' 事件，正在刷新仪表盘...");
            if (chapterState) {
                updateDashboard(chapterState);
            }
        });
        deps.info("[UIManager] 已成功订阅 'CHAPTER_UPDATED' 事件。");
    } else {
        deps.diagnose("[UIManager] EventBus 实例未被正确注入，UI将无法自动刷新！");
    }

    deps.info("[UIManager] UI管理器初始化完成，所有交互函数已注入。");
    return deps; // 返回最终的依赖对象
}

export async function setupUI() {
    const PLUGIN_FOLDER_NAME = 'st-beat-tracker';
    const PLUGIN_PATH = `third-party/${PLUGIN_FOLDER_NAME}`;
    
    const { renderExtensionTemplateAsync } = applicationFunctionManager;
const html = await renderExtensionTemplateAsync(PLUGIN_PATH, 'drawer-component');
$('#extensions-settings-button').after(html);
    setTimeout(() => {
        deps.info("[UIManager] DOM 就绪，开始绑定UI事件...");

    const $wrapper = $('#beat-tracker-component-wrapper');
        if ($wrapper.length === 0) {
            deps.diagnose("[UIManager] 严重错误：无法找到顶层容器 #beat-tracker-component-wrapper！UI将完全失效。");
            return;
        }
    // -- 维护当前章节状态的全局引用 --
    let currentChapterState = null;

    // 监听CHAPTER_UPDATED事件，保存最新的章节状态
    if (deps.eventBus) {
        deps.eventBus.on('CHAPTER_UPDATED', (chapterState) => {
            currentChapterState = chapterState;
        });
    }

    // -- 加载缓存的静态数据并显示 --
    function loadAndDisplayCachedStaticData() {
        try {
            const db = staticDataManager.getFullDatabase();
            const characterIds = Object.keys(db);

            if (characterIds.length === 0) {
                deps.info('[UIManager] 静态数据库为空，无缓存数据可加载');
                return;
            }

            // 取第一个角色的数据（或者可以根据某种优先级选择）
            const firstCharId = characterIds[0];
            const cachedData = db[firstCharId];

            if (!cachedData || !cachedData.characters || !cachedData.worldview) {
                deps.info('[UIManager] 缓存数据结构不完整，跳过加载');
                return;
            }

            deps.info(`[UIManager] 找到缓存数据，正在加载角色: ${firstCharId}`);

            // 构造一个临时的 chapterState 对象
            const tempChapterState = {
                uid: 'temp_cached_view',
                staticMatrices: {
                    characters: cachedData.characters || {},
                    worldview: cachedData.worldview || {
                        locations: {},
                        items: {},
                        factions: {},
                        concepts: {},
                        events: {},
                        races: {}
                    },
                    storylines: cachedData.storylines || {
                        main_quests: {},
                        side_quests: {},
                        relationship_arcs: {},
                        personal_arcs: {}
                    },
                    relationship_graph: cachedData.relationship_graph || { edges: [] }
                },
                dynamicState: {
                    characters: {},
                    worldview: {},
                    storylines: {
                        main_quests: {},
                        side_quests: {},
                        relationship_arcs: {},
                        personal_arcs: {}
                    }
                },
                meta: {
                    longTermStorySummary: '（缓存数据预览）',
                    lastChapterHandoff: null
                },
                chapter_blueprint: {}
            };

            // 更新当前状态引用
            currentChapterState = tempChapterState;

            // 调用 updateDashboard 显示数据
            updateDashboard(tempChapterState);

            deps.toastr.info(`已加载缓存数据: ${firstCharId}`, '静态数据');

        } catch (error) {
            deps.diagnose('[UIManager] 加载缓存静态数据时出错:', error);
        }
    }

    // -- 主抽屉开关 --
    $wrapper.find('.drawer-toggle').on('click', () => {
        $('#beat-tracker-icon').toggleClass('closedIcon openIcon');
        $('#beat-tracker-content-panel').toggleClass('closedDrawer openDrawer');
            if ($('#beat-tracker-content-panel').hasClass('openDrawer')) {
                populateSettingsUI(deps); // 传递 deps 参数
                populateNarrativeModeSelector(deps); // V7.0: 填充叙事模式选择器（全局配置版）

                // 【新增】加载并显示静态数据缓存（如果存在）
                loadAndDisplayCachedStaticData();
            }
    });
    
        $wrapper.on('click', '#sbt-tab-nav .sbt-tab-btn', function() {
        const $button = $(this);
        const targetPanelId = $button.data('panel');

        // 1. 处理按钮的 active 状态 (这部分不变，因为它工作正常)
        $wrapper.find('.sbt-tab-btn').removeClass('active');
        $button.addClass('active');

  
            // 2. 在面板包装器内部处理面板的显隐
            // 这是最关键的一步：确保我们只隐藏目标容器内的面板
            $('.sbt-panels-wrapper .sbt-tab-panel').hide();
            $(`#${targetPanelId}`).show();
            
            deps.info(`切换到面板: #${targetPanelId}`);
        });

    // -- 通用: 所有面板的分类折叠逻辑（世界档案 + 创作工坊）--
    $wrapper.on('click', '.sbt-category-header', function() {
        const $header = $(this);
        const $content = $header.next('.sbt-library-items');
        $header.toggleClass('collapsed');
        $content.toggleClass('collapsed');
    });

    // -- [V3.5] 章节剧本: 折叠/展开交互 --
    $wrapper.on('click', '.sbt-blueprint-section-title.sbt-collapsible', function() {
        const $title = $(this);
        const $section = $title.closest('.sbt-blueprint-section');
        const $content = $section.find('.sbt-blueprint-section-content');
        const $icon = $title.find('.sbt-collapse-icon');

        // 切换展开/折叠状态
        $content.toggleClass('collapsed');
        $icon.toggleClass('collapsed');
    });

    // -- [V3.5] 章节剧本: 编辑功能 --
    // 处理概览字段编辑（title, emotional_arc, core_conflict）
    $wrapper.on('blur', '.sbt-blueprint-field-value[contenteditable="true"]', function() {
        const $field = $(this);
        const fieldPath = $field.data('field');
        const newValue = $field.text().trim();

        if (!currentChapterState || !fieldPath) return;

        // 更新chapter_blueprint中的对应字段
        const pathParts = fieldPath.split('.');
        let target = currentChapterState.chapter_blueprint;

        // 导航到目标对象
        for (let i = 0; i < pathParts.length - 1; i++) {
            if (!target[pathParts[i]]) {
                target[pathParts[i]] = {};
            }
            target = target[pathParts[i]];
        }

        // 更新最终字段
        const finalKey = pathParts[pathParts.length - 1];
        const oldValue = target[finalKey];

        if (oldValue !== newValue) {
            target[finalKey] = newValue;

            // 保存并触发更新
            if (typeof deps.onSaveCharacterEdit === 'function') {
                deps.onSaveCharacterEdit('blueprint_updated', currentChapterState);
            }

            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
            }

            deps.toastr.success(`已更新"${fieldPath}"`, '保存成功');
        }
    });

    // 处理节拍描述编辑
    $wrapper.on('blur', '.sbt-beat-description[contenteditable="true"]', function() {
        const $field = $(this);
        const beatIndex = parseInt($field.data('beat-index'), 10);
        const newValue = $field.text().trim();

        if (!currentChapterState || isNaN(beatIndex)) return;

        const beat = currentChapterState.chapter_blueprint?.plot_beats?.[beatIndex];
        if (beat && beat.description !== newValue) {
            beat.description = newValue;

            // 保存并触发更新
            if (typeof deps.onSaveCharacterEdit === 'function') {
                deps.onSaveCharacterEdit('blueprint_updated', currentChapterState);
            }

            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
            }

            deps.toastr.success(`已更新节拍 ${beatIndex + 1}`, '保存成功');
        }
    });

    // 处理节拍退出条件编辑
    $wrapper.on('blur', '.sbt-beat-exit-condition span[contenteditable="true"]', function() {
        const $field = $(this);
        const beatIndex = parseInt($field.data('beat-index'), 10);
        const newValue = $field.text().trim();

        if (!currentChapterState || isNaN(beatIndex)) return;

        const beat = currentChapterState.chapter_blueprint?.plot_beats?.[beatIndex];
        if (beat && beat.exit_condition !== newValue) {
            beat.exit_condition = newValue;

            // 保存并触发更新
            if (typeof deps.onSaveCharacterEdit === 'function') {
                deps.onSaveCharacterEdit('blueprint_updated', currentChapterState);
            }

            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
            }

            deps.toastr.success(`已更新节拍 ${beatIndex + 1} 的退出条件`, '保存成功');
        }
    });

    // 处理终章信标编辑
    $wrapper.on('blur', '.sbt-beacon-item span[contenteditable="true"]', function() {
        const $field = $(this);
        const beaconIndex = parseInt($field.data('beacon-index'), 10);
        const newValue = $field.text().trim();

        if (!currentChapterState || isNaN(beaconIndex)) return;

        const blueprint = currentChapterState.chapter_blueprint;
        if (!blueprint) return;

        // 兼容单数和复数格式
        let beacons;
        if (blueprint.endgame_beacons && Array.isArray(blueprint.endgame_beacons)) {
            beacons = blueprint.endgame_beacons;
        } else if (blueprint.endgame_beacon && typeof blueprint.endgame_beacon === 'string') {
            // 转换为数组格式
            beacons = [blueprint.endgame_beacon];
            blueprint.endgame_beacons = beacons;
            delete blueprint.endgame_beacon;
        }

        if (beacons && beacons[beaconIndex] !== newValue) {
            beacons[beaconIndex] = newValue;

            // 保存并触发更新
            if (typeof deps.onSaveCharacterEdit === 'function') {
                deps.onSaveCharacterEdit('blueprint_updated', currentChapterState);
            }

            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
            }

            deps.toastr.success(`已更新终章信标 ${beaconIndex + 1}`, '保存成功');
        }
    });

    $wrapper.on('click', '#sbt-archive-characters .sbt-archive-card', function() {
        const charId = $(this).data('char-id');
        if (charId && currentChapterState) {
            showCharacterDetailModal(charId, currentChapterState, false, false);
        }
    });

    // -- 世界档案面板: 新建角色 --
    $wrapper.on('click', '.sbt-add-character-btn', function() {
        if (!currentChapterState) return;

        // 生成临时ID
        const tempId = `char_new_${Date.now()}`;

        // 打开详情面板（新建模式）
        showCharacterDetailModal(tempId, currentChapterState, true, true);
    });

    // -- 世界档案面板: 关闭角色详情 --
    $wrapper.on('click', '#sbt-close-character-detail', function() {
        $('#sbt-character-detail-panel').hide();
    });

    // -- 角色详情: 编辑模式切换 --
    $wrapper.on('click', '.sbt-edit-mode-toggle', function() {
        const $btn = $(this);
        const charId = $btn.data('char-id');

        if (charId && currentChapterState) {
            // 重新渲染为编辑模式
            showCharacterDetailModal(charId, currentChapterState, true);
        }
    });

    // -- 角色详情: 取消编辑 --
    $wrapper.on('click', '.sbt-cancel-edit-btn', function() {
        const $btn = $(this);
        const charId = $btn.data('char-id');

        // 检查是否是新建模式（charId以char_new_开头）
        if (charId.startsWith('char_new_')) {
            // 新建模式取消直接关闭面板
            $('#sbt-character-detail-panel').hide();
        } else {
            if (charId && currentChapterState) {
                // 重新渲染为查看模式
                showCharacterDetailModal(charId, currentChapterState, false, false);
            }
        }
    });

    // -- 角色详情: 删除角色 --
    $wrapper.on('click', '.sbt-delete-character-btn', function() {
        const $btn = $(this);
        const charId = $btn.data('char-id');

        if (!currentChapterState) return;

        const char = currentChapterState.staticMatrices.characters[charId];
        if (!char) {
            deps.toastr.error('找不到该角色', '错误');
            return;
        }

        const charName = char.core?.name || char.name || charId;
        const isProtagonist = char.core?.isProtagonist || char.isProtagonist || false;

        // 禁止删除主角
        if (isProtagonist) {
            deps.toastr.error('不能删除主角！', '操作被拒绝');
            return;
        }

        // 确认删除
        if (!confirm(`确定要删除角色"${charName}"吗？此操作无法撤销。`)) {
            return;
        }

        // 删除角色
        delete currentChapterState.staticMatrices.characters[charId];

        // 同时删除动态状态
        if (currentChapterState.dynamicState.characters?.[charId]) {
            delete currentChapterState.dynamicState.characters[charId];
        }

        // 关闭详情面板
        $('#sbt-character-detail-panel').hide();

        // 保存并刷新
        if (typeof deps.onSaveCharacterEdit === 'function') {
            deps.onSaveCharacterEdit('character_deleted', currentChapterState);
        }

        // 触发更新事件
        if (deps.eventBus) {
            deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
        }

        deps.toastr.success(`角色"${charName}"已删除`, '删除成功');
    });

    // -- 角色详情: 保存修改 --
    $wrapper.on('click', '.sbt-save-character-btn', async function() {
        const $btn = $(this);
        const oldCharId = $btn.data('char-id');
        const isNew = $btn.data('is-new') === 'true' || $btn.data('is-new') === true;

        if (!oldCharId || !currentChapterState) return;

        try {
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i> 保存中...');

            // 收集所有可编辑字段的数据
            const $panel = $('#sbt-character-detail-content');
            const updatedData = {};

            // 收集基本信息输入框的数据
            $panel.find('.sbt-name-input, .sbt-basic-input').each(function() {
                const $field = $(this);
                const path = $field.data('path');
                let value = $field.val().trim();

                if (path && value) {
                    updatedData[path] = value;
                }
            });

            // 收集 textarea 和 contenteditable 的数据
            $panel.find('.sbt-editable-textarea, .sbt-editable-text').each(function() {
                const $field = $(this);
                const path = $field.data('path');
                let value = $field.is('textarea') ? $field.val() : $field.text();
                value = value.trim();

                if (path && value) {
                    updatedData[path] = value;
                }
            });

            // 收集标签数据
            const tagLists = {};
            $panel.find('.sbt-tag-list').each(function(listIndex) {
                const $tagList = $(this);
                const tags = [];
                let listPath = null;

                console.log(`[标签收集] 第 ${listIndex} 个标签列表:`);

                $tagList.find('.sbt-tag-editable').each(function(tagIndex) {
                    const $tag = $(this);
                    const tag = $tag.text().trim();
                    const path = $tag.data('path');

                    console.log(`  标签 ${tagIndex}: text="${tag}", path="${path}"`);

                    // 记录路径
                    if (!listPath && path) {
                        listPath = path;
                    }

                    // 只收集非空标签
                    if (tag && tag !== '新标签') {
                        tags.push(tag);
                    }
                });

                console.log(`  最终路径: "${listPath}", 标签数组:`, tags);

                // 如果找到路径，保存这个标签列表
                if (listPath) {
                    tagLists[listPath] = tags.length > 0 ? tags : [];
                }
            });

            // 合并标签数据
            Object.assign(updatedData, tagLists);

            // 收集好感度数据
            const affinityUpdates = [];
            $panel.find('.sbt-affinity-input').each(function() {
                const $input = $(this);
                const fromCharId = $input.data('from-char');
                const toCharId = $input.data('to-char');
                const newAffinity = parseInt($input.val(), 10);

                if (!isNaN(newAffinity) && newAffinity >= 0 && newAffinity <= 100) {
                    affinityUpdates.push({
                        fromCharId,
                        toCharId,
                        affinity: newAffinity
                    });
                }
            });

            // 调试日志
            console.group('[编辑保存] 数据收集分析');
            console.log('收集到的更新数据:', JSON.parse(JSON.stringify(updatedData)));
            console.log('收集到的好感度更新:', affinityUpdates);
            console.log('是否新建:', isNew);

            // 如果是新建，需要验证必填字段并生成新ID
            let newCharId = oldCharId;
            if (isNew) {
                const charName = updatedData['core.name'];
                if (!charName) {
                    deps.toastr.error('角色名称不能为空', '保存失败');
                    $btn.prop('disabled', false).html(`<i class="fa-solid fa-save fa-fw"></i> 创建角色`);
                    console.groupEnd();
                    return;
                }

                // 生成新的角色ID（基于名称和时间戳）
                const timestamp = Date.now().toString(36);
                const namePart = charName.replace(/\s+/g, '_').toLowerCase();
                newCharId = `char_${namePart}_${timestamp}`;

                console.log(`新建角色，生成ID: ${newCharId}`);

                // 创建新角色对象
                currentChapterState.staticMatrices.characters[newCharId] = {
                    core: {
                        name: '',
                        identity: '',
                        age: '',
                        gender: '',
                        isProtagonist: false
                    },
                    appearance: '',
                    personality: '',
                    background: '',
                    goals: '',
                    capabilities: '',
                    equipment: '',
                    social: {
                        relationships: {}
                    }
                };
            }

            // 更新角色数据
            const char = currentChapterState.staticMatrices.characters[newCharId];
            if (!char) {
                throw new Error('角色数据未找到');
            }

            console.log('修改前的角色数据:', JSON.parse(JSON.stringify(char)));

            // 应用更新 - 支持嵌套路径
            for (const [path, value] of Object.entries(updatedData)) {
                // 处理嵌套路径，如 "personality.traits"
                const pathParts = path.split('.');
                let target = char;

                // 导航到最后一个属性之前
                for (let i = 0; i < pathParts.length - 1; i++) {
                    const part = pathParts[i];
                    if (!target[part]) {
                        target[part] = {};
                    }
                    target = target[part];
                }

                // 设置最后一个属性
                const lastPart = pathParts[pathParts.length - 1];
                const oldValue = target[lastPart];
                target[lastPart] = value;

                console.log(`路径 "${path}": "${oldValue}" -> "${value}"`);
            }

            console.log('修改后的角色数据:', JSON.parse(JSON.stringify(char)));

            // 更新好感度
            for (const update of affinityUpdates) {
                const { fromCharId, toCharId, affinity } = update;

                // 确保 dynamicState.characters 存在
                if (!currentChapterState.dynamicState) {
                    currentChapterState.dynamicState = { characters: {}, worldview: {}, storylines: {} };
                }
                if (!currentChapterState.dynamicState.characters) {
                    currentChapterState.dynamicState.characters = {};
                }
                if (!currentChapterState.dynamicState.characters[fromCharId]) {
                    currentChapterState.dynamicState.characters[fromCharId] = { relationships: {} };
                }
                if (!currentChapterState.dynamicState.characters[fromCharId].relationships) {
                    currentChapterState.dynamicState.characters[fromCharId].relationships = {};
                }
                if (!currentChapterState.dynamicState.characters[fromCharId].relationships[toCharId]) {
                    currentChapterState.dynamicState.characters[fromCharId].relationships[toCharId] = { history: [] };
                }

                // 更新好感度值
                currentChapterState.dynamicState.characters[fromCharId].relationships[toCharId].current_affinity = affinity;

                console.log(`好感度已更新: ${fromCharId} 对 ${toCharId} = ${affinity}`);
            }

            console.groupEnd();

            // 如果有保存回调函数，调用它
            if (typeof deps.onSaveCharacterEdit === 'function') {
                await deps.onSaveCharacterEdit(newCharId, currentChapterState);
            }

            deps.toastr.success(isNew ? '角色已成功创建！' : '角色档案已成功更新！', '保存成功');

            // 触发更新事件
            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
            }

            // 如果是新建，关闭面板；如果是编辑，返回查看模式
            if (isNew) {
                $('#sbt-character-detail-panel').hide();
            } else {
                showCharacterDetailModal(newCharId, currentChapterState, false, false);
            }

        } catch (error) {
            deps.diagnose('[UIManager] 保存角色修改时发生错误:', error);
            deps.toastr.error(`保存失败: ${error.message}`, '错误');
            $btn.prop('disabled', false).html(`<i class="fa-solid fa-save fa-fw"></i> ${isNew ? '创建角色' : '保存修改'}`);
        }
    });

    // -- 角色详情: 添加标签 --
    $wrapper.on('click', '.sbt-tag-add-btn', function() {
        const $btn = $(this);
        const path = $btn.data('path');
        const $tagList = $btn.closest('.sbt-tag-list');

        // 创建新标签输入（空白内容）
        const newTagHtml = `
            <span class="sbt-tag sbt-tag-editable" data-path="${path}" contenteditable="true" placeholder="输入标签..."></span>
            <i class="fa-solid fa-xmark sbt-tag-delete"></i>
        `;
        $btn.before(newTagHtml);

        // 聚焦到新标签
        const $newTag = $tagList.find('.sbt-tag-editable').last();
        $newTag.focus();
    });

    // -- 角色详情: 删除标签 --
    $wrapper.on('click', '.sbt-tag-delete', function() {
        const $deleteBtn = $(this);
        $deleteBtn.prev('.sbt-tag-editable').remove();
        $deleteBtn.remove();
    });

    // -- 世界观: 点击词条卡片内容区域显示详情 --
    $wrapper.on('click', '.sbt-worldview-card-content', function() {
        const $card = $(this).closest('.sbt-worldview-card');
        const itemId = $card.data('item-id');
        const category = $card.data('category');

        if (!currentChapterState) return;

        // 获取类别中文名
        const categoryNames = {
            'locations': '地点',
            'items': '物品',
            'factions': '势力',
            'concepts': '概念',
            'events': '历史事件',
            'races': '种族'
        };
        const categoryName = categoryNames[category] || '词条';

        showWorldviewDetailModal(itemId, category, categoryName, currentChapterState, false, false);
    });

    // -- 世界观: 点击卡片上的编辑按钮直接进入编辑模式 --
    $wrapper.on('click', '.sbt-worldview-edit-btn', function(e) {
        e.stopPropagation(); // 防止触发卡片点击事件
        const $btn = $(this);
        const itemId = $btn.data('item-id');
        const category = $btn.data('category');
        const categoryName = $btn.data('category-name');

        if (!currentChapterState) return;

        // 直接打开编辑模式
        showWorldviewDetailModal(itemId, category, categoryName, currentChapterState, true, false);
    });

    // -- 世界观: 新建词条 --
    $wrapper.on('click', '.sbt-add-worldview-btn', function() {
        const $btn = $(this);
        const category = $btn.data('category');
        const categoryName = $btn.data('category-name');

        if (!currentChapterState) return;

        // 生成临时ID
        const tempId = `new_${Date.now()}`;

        // 打开详情面板（新建模式）
        showWorldviewDetailModal(tempId, category, categoryName, currentChapterState, true, true);
    });

    // -- 世界观: 关闭详情面板 --
    $wrapper.on('click', '#sbt-close-worldview-detail', function() {
        $('#sbt-worldview-detail-panel').hide();
    });

    // -- 故事线详情: 关闭详情面板 --
    $wrapper.on('click', '#sbt-close-storyline-detail', function() {
        $('#sbt-storyline-detail-panel').hide();
    });

    // -- 关系图谱: 关闭详情面板 --
    $wrapper.on('click', '#sbt-close-relationship-detail', function() {
        $('#sbt-relationship-detail-panel').hide();
    });

    // -- 关系图谱: 编辑模式切换 --
    $wrapper.on('click', '.sbt-edit-relationship-mode-toggle', function() {
        const edgeId = $(this).data('edge-id');
        if (!currentChapterState) return;

        showRelationshipDetailModal(edgeId, currentChapterState, true);
    });

    // -- 关系图谱: 取消编辑 --
    $wrapper.on('click', '.sbt-cancel-relationship-edit-btn', function() {
        const edgeId = $(this).data('edge-id');
        if (!currentChapterState) return;

        showRelationshipDetailModal(edgeId, currentChapterState, false);
    });

    // -- 关系图谱: 保存修改 --
    $wrapper.on('click', '.sbt-save-relationship-btn', function() {
        const edgeId = $(this).data('edge-id');
        if (!currentChapterState) return;

        try {
            const $panel = $('#sbt-relationship-detail-content');

            // 获取relationship_graph中的edge
            const relationshipGraph = currentChapterState.staticMatrices.relationship_graph;
            const edge = relationshipGraph?.edges?.find(e => e.id === edgeId);

            if (!edge) {
                deps.toastr.error('找不到该关系边', '错误');
                return;
            }

            // 更新情感权重
            const newWeight = parseInt($panel.find('.sbt-rel-weight-input').val(), 10);
            if (!isNaN(newWeight) && newWeight >= 0 && newWeight <= 10) {
                edge.emotional_weight = newWeight;
            }

            // 更新未解张力
            const newTensions = [];
            $panel.find('.sbt-rel-tension-editable').each(function() {
                const text = $(this).text().trim();
                if (text) newTensions.push(text);
            });

            if (!edge.narrative_status) edge.narrative_status = {};
            edge.narrative_status.unresolved_tension = newTensions;

            // 保存
            if (typeof deps.onSaveCharacterEdit === 'function') {
                deps.onSaveCharacterEdit('relationship_updated', currentChapterState);
            }

            // 触发更新事件
            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
            }

            deps.toastr.success('关系已更新', '保存成功');

            // 返回查看模式
            showRelationshipDetailModal(edgeId, currentChapterState, false);

        } catch (error) {
            deps.diagnose('[UIManager] 保存关系修改时发生错误:', error);
            deps.toastr.error(`保存失败: ${error.message}`, '错误');
        }
    });

    // -- 关系图谱: 添加张力标签 --
    $wrapper.on('click', '.sbt-add-tension-btn', function() {
        const $tensionTags = $(this).closest('.sbt-rel-tension-tags');

        const newTagHtml = `
            <span class="sbt-rel-tension-tag sbt-rel-tension-editable" contenteditable="true" data-tension-index="new">新张力</span>
            <i class="fa-solid fa-xmark sbt-tension-delete" data-tension-index="new"></i>
        `;
        $(this).before(newTagHtml);

        // 聚焦到新标签
        $tensionTags.find('.sbt-rel-tension-editable[data-tension-index="new"]').focus().select();
    });

    // -- 关系图谱: 删除张力标签 --
    $wrapper.on('click', '.sbt-tension-delete', function() {
        const $deleteBtn = $(this);
        $deleteBtn.prev('.sbt-rel-tension-editable').remove();
        $deleteBtn.remove();
    });

    // -- 世界观详情: 编辑模式切换 --
    $wrapper.on('click', '.sbt-edit-worldview-mode-toggle', function() {
        const $btn = $(this);
        const itemId = $btn.data('item-id');
        const category = $btn.data('category');
        const categoryName = $btn.data('category-name');

        if (currentChapterState) {
            showWorldviewDetailModal(itemId, category, categoryName, currentChapterState, true, false);
        }
    });

    // -- 世界观详情: 取消编辑 --
    $wrapper.on('click', '.sbt-cancel-worldview-edit-btn', function() {
        const $btn = $(this);
        const itemId = $btn.data('item-id');

        const $content = $('#sbt-worldview-detail-content');
        const category = $content.attr('data-category');
        const categoryName = $content.attr('data-category-name');

        // 检查是否是新建模式（itemId以new_开头）
        if (itemId.startsWith('new_')) {
            // 新建模式取消直接关闭面板
            $('#sbt-worldview-detail-panel').hide();
        } else {
            // 编辑模式返回查看模式
            if (currentChapterState) {
                showWorldviewDetailModal(itemId, category, categoryName, currentChapterState, false, false);
            }
        }
    });

    // -- 世界观详情: 删除词条 --
    $wrapper.on('click', '.sbt-delete-worldview-item-btn', function() {
        const $btn = $(this);
        const itemId = $btn.data('item-id');
        const category = $btn.data('category');

        if (!currentChapterState) return;

        const item = currentChapterState.staticMatrices.worldview[category]?.[itemId];
        if (!item) {
            deps.toastr.error('找不到该词条', '错误');
            return;
        }

        // 确认删除
        if (!confirm(`确定要删除"${item.name || itemId}"吗？此操作无法撤销。`)) {
            return;
        }

        // 删除词条
        delete currentChapterState.staticMatrices.worldview[category][itemId];

        // 关闭详情面板
        $('#sbt-worldview-detail-panel').hide();

        // 保存并刷新
        saveWorldviewChanges();
        deps.toastr.success('词条已删除', '删除成功');
    });

    // -- 世界观详情: 保存修改 --
    $wrapper.on('click', '.sbt-save-worldview-item-btn', async function() {
        const $btn = $(this);
        const oldItemId = $btn.data('item-id');
        const category = $btn.data('category');
        const isNew = $btn.data('is-new') === 'true' || $btn.data('is-new') === true;

        if (!currentChapterState) return;

        try {
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i> 保存中...');

            // 收集数据
            const $panel = $('#sbt-worldview-detail-content');
            const name = $panel.find('.sbt-worldview-name-input[data-path="name"]').val().trim();
            const description = $panel.find('.sbt-worldview-textarea[data-path="description"]').val().trim();

            if (!name) {
                deps.toastr.error('名称不能为空', '保存失败');
                $btn.prop('disabled', false).html(`<i class="fa-solid fa-save fa-fw"></i> 保存${isNew ? '并创建' : '修改'}`);
                return;
            }

            // 生成新的ID（基于名称）
            const newItemId = name.replace(/\s+/g, '_');

            // 确保category存在
            if (!currentChapterState.staticMatrices.worldview[category]) {
                currentChapterState.staticMatrices.worldview[category] = {};
            }

            // 如果是编辑且ID改变了，删除旧词条
            if (!isNew && oldItemId !== newItemId) {
                delete currentChapterState.staticMatrices.worldview[category][oldItemId];
            }

            // 创建或更新词条
            currentChapterState.staticMatrices.worldview[category][newItemId] = {
                name: name,
                description: description || '暂无描述'
            };

            // 保存并刷新
            await saveWorldviewChanges();

            deps.toastr.success(isNew ? '词条已创建！' : '词条已更新！', '保存成功');

            // 关闭详情面板
            $('#sbt-worldview-detail-panel').hide();

        } catch (error) {
            deps.diagnose('[UIManager] 保存世界观词条时发生错误:', error);
            deps.toastr.error(`保存失败: ${error.message}`, '错误');
            $btn.prop('disabled', false).html(`<i class="fa-solid fa-save fa-fw"></i> 保存${isNew ? '并创建' : '修改'}`);
        }
    });

    // 保存世界观修改的辅助函数
    async function saveWorldviewChanges() {
        try {
            if (typeof deps.onSaveCharacterEdit === 'function') {
                await deps.onSaveCharacterEdit('worldview', currentChapterState);
            }

            // 触发更新事件
            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
            }

            // 重新渲染世界档案面板
            updateDashboard(currentChapterState);
        } catch (error) {
            deps.diagnose('[UIManager] 保存世界观修改时发生错误:', error);
            deps.toastr.error(`保存失败: ${error.message}`, '错误');
        }
    }

    // -- 监控面板: 日志清空 --
    $wrapper.on('click', '#sbt-clear-log-btn', () => {
        $('#sbt-debug-log-output').empty();
        deps.info('日志已清空。');
    });

    // -- 叙事罗盘: 创世纪按钮 --
    $wrapper.on('click', '#sbt-start-genesis-btn', function() {
        const $btn = $(this);
        $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i> 正在构思世界...');
        deps.onStartGenesis().finally(() => {
            $btn.prop('disabled', false).html('<i class="fa-solid fa-book-sparkles fa-fw"></i> 开始新的叙事篇章');
        });
    });

    // -- 叙事罗盘: 高级控制按钮 --
    $wrapper.on('click', '#sbt-reanalyze-worldbook-btn', () => deps.onReanalyzeWorldbook());
    $wrapper.on('click', '#sbt-force-transition-btn', () => deps.onForceChapterTransition());
    
    // -- 叙事罗盘: 功能开关 --
      const $masterToggle = $('#sbt-master-enable-toggle');
        // 默认设置为开启 (true)。只有当localStorage明确存为'false'时才关闭。
        const isEngineEnabled = localStorage.getItem('sbt-engine-enabled') !== 'false';
        $masterToggle.prop('checked', isEngineEnabled);
        
        $wrapper.on('change', '#sbt-master-enable-toggle', function() {
            const isChecked = $(this).is(':checked');
            localStorage.setItem('sbt-engine-enabled', isChecked);
            deps.toastr.info(`叙事流引擎已 ${isChecked ? '开启' : '关闭'}`, "引擎状态切换");
        });
    const $toggle = $('#sbt-enable-focus-popup-toggle');
   const isFocusPopupEnabled = localStorage.getItem('sbt-focus-popup-enabled') !== 'false';
    $toggle.prop('checked', isFocusPopupEnabled);
    $wrapper.on('change', '#sbt-enable-focus-popup-toggle', function() {
        const isChecked = $(this).is(':checked');
        localStorage.setItem('sbt-focus-popup-enabled', isChecked);
        deps.toastr.info(`章节转换时询问焦点功能已 ${isChecked ? '开启' : '关闭'}`, "设置已更新");
    });
    const $conductorToggle = $('#sbt-enable-conductor-toggle');
    const isConductorEnabled = localStorage.getItem('sbt-conductor-enabled') !== 'false';
    $conductorToggle.prop('checked', isConductorEnabled);

    $wrapper.on('change', '#sbt-enable-conductor-toggle', function() {
        const isChecked = $(this).is(':checked');
        localStorage.setItem('sbt-conductor-enabled', isChecked);
        deps.toastr.info(`回合裁判模式已 ${isChecked ? '开启' : '关闭'}`, "模式已切换");
    });

    // -- V3.1: 流式显示回合裁判 --
    const $conductorStreamToggle = $('#sbt-enable-conductor-stream-toggle');
    const isConductorStreamEnabled = localStorage.getItem('sbt-conductor-stream-enabled') !== 'false';
    $conductorStreamToggle.prop('checked', isConductorStreamEnabled);

    $wrapper.on('change', '#sbt-enable-conductor-stream-toggle', function() {
        const isChecked = $(this).is(':checked');
        localStorage.setItem('sbt-conductor-stream-enabled', isChecked);
        deps.toastr.info(`流式显示回合裁判分析已 ${isChecked ? '开启' : '关闭'}`, "设置已更新");
    });

    // -- V4.2: 章节节拍数量区间控制 --
    const $beatCountRange = $('#sbt-beat-count-range');
    const savedBeatCountRange = localStorage.getItem('sbt-beat-count-range') || '8-10';
    $beatCountRange.val(savedBeatCountRange);

    $wrapper.on('change', '#sbt-beat-count-range', function() {
        const selectedRange = $(this).val();
        localStorage.setItem('sbt-beat-count-range', selectedRange);
        deps.toastr.info(`章节节拍数量区间已设置为：${selectedRange}`, "设置已更新");
    });

    // -- V3.1: 流式面板折叠/展开 --
    $wrapper.on('click', '#sbt-stream-toggle', function(e) {
        e.stopPropagation();
        const $panel = $('#sbt-conductor-stream-panel');
        $panel.toggleClass('collapsed');
        $(this).text($panel.hasClass('collapsed') ? '展开' : '折叠');
    });

    // -- V3.1: EventBus 监听流式事件 --
    if (deps.eventBus) {
        // 流式开始
        deps.eventBus.on('CONDUCTOR_STREAM_START', () => {
            const $panel = $('#sbt-conductor-stream-panel');
            const $content = $('#sbt-stream-content');
            const $status = $('#sbt-stream-status');

            $panel.show().removeClass('collapsed');
            $content.empty();
            $status.text('正在分析...').addClass('streaming');

            deps.info('[StreamUI] 回合裁判流式输出已开始');
        });

        // 流式块接收 - 直接追加原始内容
        deps.eventBus.on('CONDUCTOR_STREAM_CHUNK', ({ chunk }) => {
            const $content = $('#sbt-stream-content');
            const $status = $('#sbt-stream-status');

            // 直接追加 chunk，不做任何延迟处理
            $content.append(chunk);

            // 自动滚动到底部
            $content.scrollTop($content[0].scrollHeight);

            // 更新状态显示当前长度
            const currentLength = $content.text().length;
            $status.text(`正在分析... (已接收 ${currentLength} 字符)`);
        });

        // 流式结束
        deps.eventBus.on('CONDUCTOR_STREAM_END', () => {
            const $status = $('#sbt-stream-status');
            const finalLength = $('#sbt-stream-content').text().length;
            $status.text(`分析完成 (共 ${finalLength} 字符)`).removeClass('streaming');

            deps.info('[StreamUI] 回合裁判流式输出已结束');
        });
    }

    // -- V8.0: 故事线追踪 - 查看故事线详情 --
    $wrapper.on('click', '.sbt-storyline-card', function(e) {
        // 如果点击的是编辑或删除按钮，不触发查看详情
        if ($(e.target).closest('.sbt-storyline-edit-btn, .sbt-storyline-delete-btn').length > 0) {
            return;
        }

        const lineId = $(this).data('storyline-id');
        const category = $(this).data('category');
        const categoryName = $(this).data('category-name');

        if (!currentChapterState || !lineId || !category) return;

        showStorylineDetailModal(lineId, category, categoryName, currentChapterState, false, false);
    });

    // -- V8.0: 故事线追踪 - 新建故事线 --
    $wrapper.on('click', '.sbt-add-storyline-btn', function() {
        if (!currentChapterState) {
            deps.toastr.warning('请先开始一个故事', '操作失败');
            return;
        }

        const category = $(this).data('category');
        const categoryName = $(this).data('category-name');

        // 生成临时ID
        const tempId = `temp_${Date.now()}`;

        // 确保 storylines 结构存在
        if (!currentChapterState.staticMatrices.storylines) {
            currentChapterState.staticMatrices.storylines = {
                main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
            };
        }
        if (!currentChapterState.dynamicState.storylines) {
            currentChapterState.dynamicState.storylines = {
                main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
            };
        }

        // 显示新建模态框
        showStorylineDetailModal(tempId, category, categoryName, currentChapterState, true, true);
    });

    // -- V8.0: 故事线追踪 - 编辑故事线按钮 --
    $wrapper.on('click', '.sbt-storyline-edit-btn', function(e) {
        e.stopPropagation(); // 防止触发卡片点击

        const lineId = $(this).data('storyline-id');
        const category = $(this).data('category');
        const categoryName = $(this).data('category-name');

        if (!currentChapterState || !lineId || !category) return;

        showStorylineDetailModal(lineId, category, categoryName, currentChapterState, true, false);
    });

    // -- V8.0: 故事线追踪 - 模态框内的编辑模式切换 --
    $wrapper.on('click', '.sbt-edit-storyline-mode-toggle', function() {
        const lineId = $(this).data('line-id');
        const category = $(this).data('category');
        const categoryName = $(this).data('category-name');

        if (!currentChapterState || !lineId || !category) return;

        showStorylineDetailModal(lineId, category, categoryName, currentChapterState, true, false);
    });

    // -- V8.0: 故事线追踪 - 保存故事线 --
    $wrapper.on('click', '.sbt-save-storyline-btn', function() {
        const lineId = $(this).data('line-id');
        const category = $(this).data('category');
        const isNew = $(this).data('is-new');
        const $panel = $('#sbt-storyline-detail-panel');

        if (!currentChapterState) return;

        // 确保结构存在
        if (!currentChapterState.staticMatrices.storylines) {
            currentChapterState.staticMatrices.storylines = {
                main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
            };
        }
        if (!currentChapterState.dynamicState.storylines) {
            currentChapterState.dynamicState.storylines = {
                main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
            };
        }
        if (!currentChapterState.staticMatrices.storylines[category]) {
            currentChapterState.staticMatrices.storylines[category] = {};
        }
        if (!currentChapterState.dynamicState.storylines[category]) {
            currentChapterState.dynamicState.storylines[category] = {};
        }

        // 收集表单数据
        const title = $panel.find('.sbt-storyline-name-input').val()?.trim();
        const summary = $panel.find('textarea[data-path="summary"]').val()?.trim();
        const currentSummary = $panel.find('textarea[data-path="current_summary"]').val()?.trim();
        const trigger = $panel.find('.sbt-storyline-trigger-input').val()?.trim();
        const currentStatus = $panel.find('.sbt-storyline-status-select').val();

        // 验证必填字段
        if (!title) {
            deps.toastr.error('请输入故事线标题', '验证失败');
            return;
        }

        // 收集涉及角色
        const involvedChars = [];
        $panel.find('.sbt-involved-chars .sbt-tag-editable').each(function() {
            const charId = $(this).data('char-id');
            if (charId) involvedChars.push(charId);
        });

        // 生成最终ID（如果是新建）
        let finalLineId = lineId;
        if (isNew) {
            const timestamp = Date.now().toString(36);
            const titlePart = title.replace(/\s+/g, '_').toLowerCase();
            finalLineId = `line_${titlePart}_${timestamp}`;
        }

        // 保存静态数据
        currentChapterState.staticMatrices.storylines[category][finalLineId] = {
            title: title,
            summary: summary || '',
            trigger: trigger || '玩家主动触发',
            type: category,
            involved_chars: involvedChars
        };

        // 保存动态数据
        if (!currentChapterState.dynamicState.storylines[category][finalLineId]) {
            currentChapterState.dynamicState.storylines[category][finalLineId] = {
                current_status: currentStatus || 'active',
                current_summary: currentSummary || summary || '故事线刚刚创建',
                history: []
            };
        } else {
            currentChapterState.dynamicState.storylines[category][finalLineId].current_status = currentStatus || 'active';
            currentChapterState.dynamicState.storylines[category][finalLineId].current_summary = currentSummary || summary || '';
        }

        // 保存
        if (typeof deps.onSaveCharacterEdit === 'function') {
            deps.onSaveCharacterEdit(isNew ? 'storyline_added' : 'storyline_updated', currentChapterState);
        }

        // 触发更新
        if (deps.eventBus) {
            deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
        }

        // 隐藏面板
        $panel.hide();

        deps.toastr.success(`故事线"${title}"已${isNew ? '创建' : '保存'}！`, isNew ? '创建成功' : '保存成功');
    });

    // -- V8.0: 故事线追踪 - 取消编辑 --
    $wrapper.on('click', '.sbt-cancel-storyline-edit-btn', function() {
        const $panel = $('#sbt-storyline-detail-panel');
        $panel.hide();
    });

    // -- V8.0: 故事线追踪 - 删除故事线 --
    $wrapper.on('click', '.sbt-storyline-delete-btn', function(e) {
        e.stopPropagation(); // 防止触发卡片点击

        const lineId = $(this).data('storyline-id') || $(this).data('line-id');
        const category = $(this).data('category');

        if (!currentChapterState || !lineId || !category) return;

        const staticLine = currentChapterState.staticMatrices.storylines?.[category]?.[lineId];
        if (!staticLine) {
            deps.toastr.error('找不到该故事线', '错误');
            return;
        }

        if (!confirm(`确定要删除故事线"${staticLine.title}"吗？此操作无法撤销。`)) {
            return;
        }

        // 删除静态部分
        delete currentChapterState.staticMatrices.storylines[category][lineId];

        // 删除动态部分
        if (currentChapterState.dynamicState.storylines?.[category]?.[lineId]) {
            delete currentChapterState.dynamicState.storylines[category][lineId];
        }

        // 保存
        if (typeof deps.onSaveCharacterEdit === 'function') {
            deps.onSaveCharacterEdit('storyline_deleted', currentChapterState);
        }

        // 触发更新
        if (deps.eventBus) {
            deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
        }

        // 隐藏详情面板（如果正在显示）
        $('#sbt-storyline-detail-panel').hide();

        deps.toastr.success(`故事线"${staticLine.title}"已删除`, '删除成功');
    });

    // -- V8.0: 故事线追踪 - 添加涉及角色 --
    $wrapper.on('click', '.sbt-char-tag-add-btn', function() {
        if (!currentChapterState) return;

        const allChars = currentChapterState.staticMatrices.characters || {};
        const charOptions = Object.keys(allChars).map(charId => {
            const charData = allChars[charId];
            const charName = charData?.core?.name || charData?.name || charId;
            return `${charName} (${charId})`;
        });

        if (charOptions.length === 0) {
            deps.toastr.warning('当前没有可用的角色', '提示');
            return;
        }

        const selection = prompt(`选择要添加的角色（输入编号）:\n${charOptions.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}`);
        if (!selection) return;

        const index = parseInt(selection, 10) - 1;
        const charIds = Object.keys(allChars);
        if (index >= 0 && index < charIds.length) {
            const charId = charIds[index];
            const charData = allChars[charId];
            const charName = charData?.core?.name || charData?.name || charId;

            // 检查是否已存在
            const $container = $(this).closest('.sbt-involved-chars');
            const existing = $container.find(`.sbt-tag-editable[data-char-id="${charId}"]`);
            if (existing.length > 0) {
                deps.toastr.warning('该角色已在列表中', '提示');
                return;
            }

            // 添加标签
            const $newTag = $(`<span class="sbt-tag sbt-tag-editable" data-char-id="${charId}">${charName}<i class="fa-solid fa-xmark sbt-char-tag-delete" data-char-id="${charId}"></i></span>`);
            $(this).before($newTag);
        }
    });

    // -- V8.0: 故事线追踪 - 删除涉及角色 --
    $wrapper.on('click', '.sbt-char-tag-delete', function(e) {
        e.stopPropagation();
        $(this).closest('.sbt-tag-editable').remove();
    });

    // -- V8.0: 故事线追踪 - 编辑历史记录 --
    $wrapper.on('blur', '.sbt-history-content', function() {
        const $this = $(this);
        const newContent = $this.text().trim();
        const historyIndex = parseInt($this.data('history-index'), 10);

        if (isNaN(historyIndex) || !currentChapterState) return;

        // 找到对应的故事线
        const $card = $this.closest('.sbt-storyline-card');
        const lineId = $card.data('storyline-id');
        const category = $card.data('category');

        if (!lineId || !category) return;

        // 获取动态状态中的历史记录
        const dynamicLine = currentChapterState.dynamicState.storylines?.[category]?.[lineId];
        if (!dynamicLine || !dynamicLine.history || !dynamicLine.history[historyIndex]) {
            deps.toastr.warning('无法找到对应的历史记录', '保存失败');
            return;
        }

        // 更新历史记录
        const historyEntry = dynamicLine.history[historyIndex];
        historyEntry.summary_update = newContent;

        // 保存到后端
        if (typeof deps.onSaveCharacterEdit === 'function') {
            deps.onSaveCharacterEdit('storyline_history_updated', currentChapterState);
        }

        // 触发更新事件
        if (deps.eventBus) {
            deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
        }

        deps.toastr.success('历史记录已更新', '保存成功');
    });

    // -- V5.2: 故事梗概和章节衔接点编辑功能 --
    $wrapper.on('click', '.sbt-edit-summary-btn', function() {
        const field = $(this).data('field');

        if (!currentChapterState) {
            deps.toastr.warning('当前没有活跃章节', '操作失败');
            return;
        }

        if (field === 'longTermStorySummary') {
            // 编辑故事梗概
            const currentValue = currentChapterState.meta?.longTermStorySummary || '';

            const newValue = prompt('编辑故事梗概:\n(这是史官维护的故事概要,会随着章节推进自动更新)', currentValue);

            if (newValue !== null && newValue.trim() !== currentValue) {
                currentChapterState.meta.longTermStorySummary = newValue.trim();

                // 保存
                if (typeof deps.onSaveCharacterEdit === 'function') {
                    deps.onSaveCharacterEdit('summary_updated', currentChapterState);
                }

                // 触发更新
                if (deps.eventBus) {
                    deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
                }

                deps.toastr.success('故事梗概已更新', '保存成功');
            }
        } else if (field === 'lastChapterHandoff') {
            // 编辑章节衔接点
            const handoffMemo = currentChapterState.meta?.lastChapterHandoff || {};

            // 创建一个简单的表单来编辑两个字段
            const endingSnapshot = handoffMemo.ending_snapshot || '';
            const actionHandoff = handoffMemo.action_handoff || '';

            const newEndingSnapshot = prompt('编辑【结束快照】:\n(描述上一章节结束时的场景和状态)', endingSnapshot);

            if (newEndingSnapshot === null) return; // 用户取消

            const newActionHandoff = prompt('编辑【下章起点】:\n(描述下一章节应该从哪里开始)', actionHandoff);

            if (newActionHandoff === null) return; // 用户取消

            // 更新数据
            if (!currentChapterState.meta.lastChapterHandoff) {
                currentChapterState.meta.lastChapterHandoff = {};
            }

            currentChapterState.meta.lastChapterHandoff.ending_snapshot = newEndingSnapshot.trim();
            currentChapterState.meta.lastChapterHandoff.action_handoff = newActionHandoff.trim();

            // 保存
            if (typeof deps.onSaveCharacterEdit === 'function') {
                deps.onSaveCharacterEdit('handoff_updated', currentChapterState);
            }

            // 触发更新
            if (deps.eventBus) {
                deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
            }

            deps.toastr.success('章节衔接点已更新', '保存成功');
        }
    });

    // -- 设置面板: 绑定所有设置相关处理器 --
    bindPasswordToggleHandlers($wrapper);
    bindSettingsSaveHandler($wrapper, deps);
    bindAPITestHandlers($wrapper, deps);
    bindPresetSelectorHandlers($wrapper, deps);
    // V7.0: 叙事模式切换 - 传入获取当前章节的函数
    bindNarrativeModeSwitchHandler($wrapper, deps, () => currentChapterState);

    // -- 数据库管理: 绑定数据库管理相关处理器 --
    bindDatabaseManagementHandlers($wrapper, deps);

    deps.info("[UIManager] 所有UI事件已成功绑定。");

    }, 0); 
    
    // -- 引擎状态变更监听 --
    $(document).on('sbt-engine-status-changed', (event, newStatus) => {
        const $icon = $('#sbt-engine-status-icon');
        const $text = $('#sbt-engine-status-text');
        if (newStatus && newStatus.text && newStatus.icon) {
            $icon.removeClass((index, className) => (className.match(/(^|\s)fa-\S+/g) || []).join(' '));
            $icon.addClass(`fa-solid ${newStatus.icon}`);
            $text.text(newStatus.text);
        }
    });
}
/**
 * 绑定数据库管理相关的事件处理器
 */
function bindDatabaseManagementHandlers($wrapper, deps) {
    // 刷新数据库列表
    function refreshDatabaseList() {
        const $list = $wrapper.find('#sbt-static-db-list');
        const db = staticDataManager.getFullDatabase();
        const characterIds = Object.keys(db);

        if (characterIds.length === 0) {
            $list.html('<p class="sbt-instructions">数据库为空，尚未缓存任何角色数据。</p>');
            return;
        }

        let html = '';
        characterIds.forEach(charId => {
            const data = db[charId];

            // 统计各分类的实体
            const charCount = data?.characters ? Object.keys(data.characters).length : 0;
            const worldviewData = data?.worldview || {};
            const locationCount = worldviewData.locations ? Object.keys(worldviewData.locations).length : 0;
            const itemCount = worldviewData.items ? Object.keys(worldviewData.items).length : 0;
            const factionCount = worldviewData.factions ? Object.keys(worldviewData.factions).length : 0;
            const conceptCount = worldviewData.concepts ? Object.keys(worldviewData.concepts).length : 0;
            const eventCount = worldviewData.events ? Object.keys(worldviewData.events).length : 0;
            const raceCount = worldviewData.races ? Object.keys(worldviewData.races).length : 0;

            const totalCount = charCount + locationCount + itemCount + factionCount + conceptCount + eventCount + raceCount;

            html += `
                <div class="sbt-db-item" data-char-id="${charId}">
                    <div class="sbt-db-item-header">
                        <div class="sbt-db-item-info">
                            <i class="fa-solid fa-chevron-right sbt-db-expand-icon"></i>
                            <span class="sbt-db-item-name">${charId}</span>
                            <span class="sbt-db-item-stats">共 ${totalCount} 个实体</span>
                        </div>
                        <button class="sbt-db-item-delete sbt-icon-btn" title="删除此角色数据">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                    <div class="sbt-db-item-details" style="display: none;">
                        ${charCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-user"></i> 角色 (${charCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(data.characters).map(id => {
                                    const char = data.characters[id];
                                    const name = char?.core?.name || char?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${locationCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-map-marker-alt"></i> 地点 (${locationCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(worldviewData.locations).map(id => {
                                    const name = worldviewData.locations[id]?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${itemCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-box"></i> 物品 (${itemCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(worldviewData.items).map(id => {
                                    const name = worldviewData.items[id]?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${factionCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-flag"></i> 势力 (${factionCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(worldviewData.factions).map(id => {
                                    const name = worldviewData.factions[id]?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${conceptCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-lightbulb"></i> 概念 (${conceptCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(worldviewData.concepts).map(id => {
                                    const name = worldviewData.concepts[id]?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${eventCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-calendar"></i> 历史事件 (${eventCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(worldviewData.events).map(id => {
                                    const name = worldviewData.events[id]?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${raceCount > 0 ? `
                        <div class="sbt-db-category">
                            <div class="sbt-db-category-title">
                                <i class="fa-solid fa-dragon"></i> 种族 (${raceCount})
                            </div>
                            <div class="sbt-db-entity-list">
                                ${Object.keys(worldviewData.races).map(id => {
                                    const name = worldviewData.races[id]?.name || id;
                                    return `<span class="sbt-db-entity-tag">${name}</span>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${totalCount === 0 ? '<p class="sbt-instructions">此角色暂无缓存数据</p>' : ''}
                    </div>
                </div>
            `;
        });

        $list.html(html);
    }

    // 展开/折叠详情
    $wrapper.find('#sbt-static-db-list').on('click', '.sbt-db-item-header', function(e) {
        // 如果点击的是删除按钮，不展开
        if ($(e.target).closest('.sbt-db-item-delete').length > 0) return;

        const $item = $(this).closest('.sbt-db-item');
        const $details = $item.find('.sbt-db-item-details');
        const $icon = $item.find('.sbt-db-expand-icon');

        if ($details.is(':visible')) {
            $details.slideUp(200);
            $icon.removeClass('expanded');
        } else {
            $details.slideDown(200);
            $icon.addClass('expanded');
        }
    });

    // 初始加载
    refreshDatabaseList();

    // 刷新按钮
    $wrapper.find('#sbt-refresh-db-btn').on('click', () => {
        refreshDatabaseList();
        deps.toastr.info('数据库列表已刷新', '刷新');
    });

    // 清空全部按钮
    $wrapper.find('#sbt-clear-all-db-btn').on('click', async () => {
        const confirm = new SbtPopupConfirm();
        const result = await confirm.show({
            title: '确认清空',
            message: '确定要清空所有角色的静态数据吗？\n\n此操作不可撤销，所有角色的世界观数据都将被删除。下次启动章节时将重新分析世界书。',
            confirmText: '清空全部',
            cancelText: '取消',
            isDangerous: true
        });

        if (result) {
            staticDataManager.clearAllStaticData();
            refreshDatabaseList();
            deps.toastr.success('所有静态数据已清空', '清空成功');
        }
    });

    // 单个删除按钮（事件委托）
    $wrapper.find('#sbt-static-db-list').on('click', '.sbt-db-item-delete', async function() {
        const $item = $(this).closest('.sbt-db-item');
        const charId = $item.data('char-id');

        const confirm = new SbtPopupConfirm();
        const result = await confirm.show({
            title: '确认删除',
            message: `确定要删除角色 "${charId}" 的静态数据吗？\n\n下次启动该角色的章节时将重新分析其世界书。`,
            confirmText: '删除',
            cancelText: '取消',
            isDangerous: true
        });

        if (result) {
            staticDataManager.deleteStaticData(charId);
            refreshDatabaseList();
            deps.toastr.success(`角色 "${charId}" 的数据已删除`, '删除成功');
        }
    });
}

export { populateSettingsUI };