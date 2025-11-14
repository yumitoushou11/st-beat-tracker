// ui/uiManager.js
import { SbtPopupConfirm } from './SbtPopupConfirm.js';
import { updateDashboard, showCharacterDetailModal, showWorldviewDetailModal } from './renderers.js';
import applicationFunctionManager from '../manager.js';
import { getApiSettings, saveApiSettings} from '../stateManager.js';
import { mapValueToHue } from '../utils/colorUtils.js';

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
function populateSettingsUI() {
    try {
        const settings = getApiSettings();
        if (settings) {
            // 填充主API设置
            $('#sbt-api-url-input').val(settings.main.apiUrl);
            $('#sbt-api-key-input').val(settings.main.apiKey);
            $('#sbt-model-name-input').val(settings.main.modelName);
            // 填充回合裁判API设置
            $('#sbt-conductor-api-url-input').val(settings.conductor.apiUrl);
            $('#sbt-conductor-api-key-input').val(settings.conductor.apiKey);
            $('#sbt-conductor-model-name-input').val(settings.conductor.modelName);
            deps.info("[UIManager] 设置面板UI已根据已加载的配置完成填充。");
        }
    } catch (error) {
        deps.diagnose("[UIManager] 填充设置面板时发生错误:", error);
    }
}
async function showNsfwProposalPopup(proposals) {
    return new Promise(resolve => {
        let selectedValue = null;

        const proposalButtonsHtml = proposals.map((p, index) => `
            <button class="sbt-proposal-btn menu_button" data-value="${p.title}" title="${p.description}">
                <i class="fa-solid fa-lightbulb fa-fw"></i> ${p.title}
            </button>
        `).join('');

        const modalHtml = `
            <div id="sbt-nsfw-proposal-modal">
                <p class="sbt-instructions">首席史官基于当前剧情，为您推荐了以下几个可能的成人内容发展方向。请选择一个，或在下方输入您自己的想法：</p>
                <div class="sbt-proposal-buttons">${proposalButtonsHtml}</div>
                <hr style="margin: 15px 0; border-color: var(--sbt-border-color);">
                <textarea id="sbt-nsfw-custom-input" placeholder="或者... 在此输入您自己的详细想法..."></textarea>
            </div>
            <style>
                .sbt-proposal-buttons { display: flex; flex-direction: column; gap: 10px; }
                .sbt-proposal-btn.selected { background-color: var(--sbt-primary-accent); color: var(--sbt-bg-darker); border: 1px solid var(--sbt-primary-accent); }
                #sbt-nsfw-custom-input { width: 100%; height: 80px; margin-top: 10px; }
            </style>
        `;

        const { showHtmlModal } = applicationFunctionManager; 
        const dialog = showHtmlModal('章节走向确认：成人内容', modalHtml, {
            okText: '以此为目标，开始规划',
            cancelText: '暂时搁置',
            onOk: () => {
                const customInput = $('#sbt-nsfw-custom-input').val().trim();
                if (customInput) {
                    resolve(customInput);
                } else {
                    resolve(selectedValue);
                }
                return true;
            },
            onCancel: () => {
                resolve(null);
            },
            onShow: (dialogElement) => {
                dialogElement.find('.sbt-proposal-btn').on('click', function() {
                    $('.sbt-proposal-btn').removeClass('selected');
                    $(this).addClass('selected');
                    selectedValue = $(this).data('value');
                    $('#sbt-nsfw-custom-input').val('');
                });
                
                $('#sbt-nsfw-custom-input').on('input', function() {
                    if ($(this).val().trim()) {
                        $('.sbt-proposal-btn').removeClass('selected');
                        selectedValue = null;
                    }
                });
            }
        });
    });
}

async function showNarrativeFocusPopup(previousFocus = '') {
    const defaultChoice = "由AI自主创新。";
    const popup = new SbtPopupConfirm();
    
    const result = await popup.show({
        title: '导演，请指示',
        message: '在“建筑师”开始规划新章节前，您想为接下来的剧情提供什么样的灵感或焦点？',
        placeholder: '剧情？节奏？氛围？角色发展？\n或者，留空让AI自由发挥...',
        initialValue: previousFocus === defaultChoice ? '' : previousFocus,
        okText: '以此为焦点，开始规划',
        cancelText: '跳过 (由AI决定)',
        nsfwText: 'NSFW特化规划' 
    });

    return result;
}

async function showSagaFocusPopup() {
    const popup = new SbtPopupConfirm();
    
    const result = await popup.show({
        title: '史诗的开端：定义你的传奇',
        message: '你即将开始一段新的冒险。请用一句话描述你希望这个故事的【核心主题】或【最终走向】是什么？',
        placeholder: '例如：一个关于复仇与救赎的黑暗幻想故事...\n或：在赛博朋克都市中揭开巨型企业阴谋的侦探故事...',
        okText: '以此为蓝图，开启故事',
    });

    if (result.confirmed && !result.value) {
        return "一个充满未知与奇遇的自由冒险故事。";
    }
    return result.value;
}


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
                populateSettingsUI(); // 调用新函数
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
        // -- 设置面板: 密码可见性切换 --
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

        // -- 设置面板: 保存设置 --
        $wrapper.on('click', '#sbt-save-settings-btn', () => {
            let newSettings = {
                main: {
                    apiUrl: String($('#sbt-api-url-input').val()).trim(),
                    apiKey: String($('#sbt-api-key-input').val()).trim(),
                    modelName: String($('#sbt-model-name-input').val()).trim(),
                },
                conductor: {
                    apiUrl: String($('#sbt-conductor-api-url-input').val()).trim(),
                    apiKey: String($('#sbt-conductor-api-key-input').val()).trim(),
                    modelName: String($('#sbt-conductor-model-name-input').val()).trim(),
                }
            };

            // 智能填充：如果回合裁判的URL或Key为空，则自动使用主API的配置
            if (!newSettings.conductor.apiUrl || !newSettings.conductor.apiKey) {
                newSettings.conductor = { ...newSettings.main };
                // 将自动填充后的值更新回UI，让用户看到结果
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
        // -- 设置面板: 测试核心大脑API连接 --
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

        // -- 设置面板: 测试回合裁判API连接 --
        $wrapper.on('click', '#sbt-test-conductor-api-btn', async function() {
            const $btn = $(this);
            const originalText = $btn.html();
            // 使用 deps.conductorLlmService
            if (!deps.conductorLlmService) {
                deps.toastr.error("回合裁判服务未初始化，无法测试。", "内部错误");
                return;
            }
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin fa-fw"></i> 正在测试...');
            
            try {
                const tempConfig = {
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

        // -- 设置面板: 测试回合裁判API连接 --
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
                    apiUrl: String($('#sbt-conductor-api-url-input').val()).trim(),
                    apiKey: String($('#sbt-conductor-api-key-input').val()).trim(),
                    modelName: String($('#sbt-conductor-model-name-input').val()).trim(),
                };
                // 临时更新服务配置以进行测试
                deps.conductorLlmService.updateConfig(tempConfig);
                const successMessage = await deps.conductorLlmService.testConnection();
                deps.toastr.success(successMessage, "回合裁判API连接成功");
            } catch (error) {
                deps.toastr.error(`${error.message}`, "回合裁判API连接失败", { timeOut: 10000 });
            } finally {
                $btn.prop('disabled', false).html(originalText);
            }
        });

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