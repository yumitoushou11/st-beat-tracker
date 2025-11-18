// ui/uiManager.js
import { SbtPopupConfirm } from './SbtPopupConfirm.js';
import { updateDashboard, showCharacterDetailModal, showWorldviewDetailModal } from './renderers.js';
import applicationFunctionManager from '../manager.js';
import { getApiSettings, saveApiSettings} from '../stateManager.js';
import { mapValueToHue } from '../utils/colorUtils.js';
import { showNsfwProposalPopup, showNarrativeFocusPopup, showSagaFocusPopup } from './popups/proposalPopup.js';
import { populateSettingsUI, bindPasswordToggleHandlers, bindSettingsSaveHandler, bindAPITestHandlers } from './settings/settingsUI.js';

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
    deps.showNsfwProposalPopup = showNsfwProposalPopup;
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
    // -- 主抽屉开关 --
    $wrapper.find('.drawer-toggle').on('click', () => {
        $('#beat-tracker-icon').toggleClass('closedIcon openIcon');
        $('#beat-tracker-content-panel').toggleClass('closedDrawer openDrawer');
            if ($('#beat-tracker-content-panel').hasClass('openDrawer')) {
                populateSettingsUI(deps); // 传递 deps 参数
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

    // -- 世界档案面板: 角色卡片点击 --
    let currentChapterState = null;

    // 监听CHAPTER_UPDATED事件，保存最新的章节状态
    if (deps.eventBus) {
        deps.eventBus.on('CHAPTER_UPDATED', (chapterState) => {
            currentChapterState = chapterState;
        });
    }

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

    // -- V2.0: 故事大纲 - 新增弧光 --
    $wrapper.on('click', '.sbt-add-arc-btn', function() {
        if (!currentChapterState) {
            deps.toastr.warning('请先开始一个故事', '操作失败');
            return;
        }

        // 显示弹窗收集弧光信息
        const arcTitle = prompt('请输入弧光标题:');
        if (!arcTitle || !arcTitle.trim()) return;

        const longTermGoal = prompt('请输入长期目标:');
        const currentStage = prompt('请输入当前阶段标识 (如: initial, development, climax):') || 'initial';
        const stageDescription = prompt('请输入阶段描述:') || '';

        // 生成弧光ID
        const timestamp = Date.now().toString(36);
        const titlePart = arcTitle.trim().replace(/\s+/g, '_').toLowerCase();
        const arcId = `arc_${titlePart}_${timestamp}`;

        // 确保 meta.active_narrative_arcs 存在
        if (!currentChapterState.meta) {
            currentChapterState.meta = {};
        }
        if (!currentChapterState.meta.active_narrative_arcs) {
            currentChapterState.meta.active_narrative_arcs = [];
        }

        // 创建新弧光
        const newArc = {
            arc_id: arcId,
            title: arcTitle.trim(),
            long_term_goal: longTermGoal?.trim() || '',
            current_stage: currentStage.trim(),
            stage_description: stageDescription.trim(),
            involved_entities: [],
            created_at: new Date().toISOString(),
            last_updated: new Date().toISOString(),
            progression_history: []
        };

        currentChapterState.meta.active_narrative_arcs.push(newArc);

        // 保存
        if (typeof deps.onSaveCharacterEdit === 'function') {
            deps.onSaveCharacterEdit('narrative_arc_added', currentChapterState);
        }

        // 触发更新
        if (deps.eventBus) {
            deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
        }

        deps.toastr.success(`弧光"${arcTitle}"已创建！`, '创建成功');
    });

    // -- V2.0: 故事大纲 - 编辑弧光 --
    $wrapper.on('click', '.sbt-edit-arc-btn', function() {
        const arcId = $(this).data('arc-id');
        if (!currentChapterState || !arcId) return;

        const arc = currentChapterState.meta.active_narrative_arcs?.find(a => a.arc_id === arcId);
        if (!arc) {
            deps.toastr.error('找不到该弧光', '错误');
            return;
        }

        // 显示编辑弹窗
        const newTitle = prompt('弧光标题:', arc.title);
        if (newTitle === null) return; // 用户取消

        const newGoal = prompt('长期目标:', arc.long_term_goal);
        const newStage = prompt('当前阶段:', arc.current_stage);
        const newStageDesc = prompt('阶段描述:', arc.stage_description);

        // 更新弧光
        if (newTitle && newTitle.trim()) arc.title = newTitle.trim();
        if (newGoal !== null) arc.long_term_goal = newGoal.trim();
        if (newStage !== null) arc.current_stage = newStage.trim();
        if (newStageDesc !== null) arc.stage_description = newStageDesc.trim();
        arc.last_updated = new Date().toISOString();

        // 保存
        if (typeof deps.onSaveCharacterEdit === 'function') {
            deps.onSaveCharacterEdit('narrative_arc_updated', currentChapterState);
        }

        // 触发更新
        if (deps.eventBus) {
            deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
        }

        deps.toastr.success('弧光已更新！', '更新成功');
    });

    // -- V2.0: 故事大纲 - 删除弧光 --
    $wrapper.on('click', '.sbt-delete-arc-btn', function() {
        const arcId = $(this).data('arc-id');
        if (!currentChapterState || !arcId) return;

        const arcIndex = currentChapterState.meta.active_narrative_arcs?.findIndex(a => a.arc_id === arcId);
        if (arcIndex === -1) {
            deps.toastr.error('找不到该弧光', '错误');
            return;
        }

        const arc = currentChapterState.meta.active_narrative_arcs[arcIndex];
        if (!confirm(`确定要删除弧光"${arc.title}"吗？此操作无法撤销。`)) {
            return;
        }

        // 删除弧光
        currentChapterState.meta.active_narrative_arcs.splice(arcIndex, 1);

        // 保存
        if (typeof deps.onSaveCharacterEdit === 'function') {
            deps.onSaveCharacterEdit('narrative_arc_deleted', currentChapterState);
        }

        // 触发更新
        if (deps.eventBus) {
            deps.eventBus.emit('CHAPTER_UPDATED', currentChapterState);
        }

        deps.toastr.success(`弧光"${arc.title}"已删除`, '删除成功');
    });

    // -- 设置面板: 绑定所有设置相关处理器 --
    bindPasswordToggleHandlers($wrapper);
    bindSettingsSaveHandler($wrapper, deps);
    bindAPITestHandlers($wrapper, deps);

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
export { populateSettingsUI };