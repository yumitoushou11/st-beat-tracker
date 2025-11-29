// ui/renderers.js
import { mapValueToHue } from '../utils/colorUtils.js';
import { showCharacterDetailModal, showCharacterDetailPopup } from './renderers/characterModal.js';
import { showWorldviewDetailModal } from './renderers/worldviewModal.js';
import { showStorylineDetailModal } from './renderers/storylineModal.js';
import { showRelationshipDetailModal } from './renderers/relationshipModal.js';
import * as staticDataManager from '../src/StaticDataManager.js';

// 【调试模式辅助函数】
const debugLog = (...args) => {
    if (localStorage.getItem('sbt-debug-mode') === 'true') {
        console.log(...args);
    }
};
const debugGroup = (...args) => {
    if (localStorage.getItem('sbt-debug-mode') === 'true') {
        console.group(...args);
    }
};
const debugGroupEnd = () => {
    if (localStorage.getItem('sbt-debug-mode') === 'true') {
        console.groupEnd();
    }
};
const debugWarn = (...args) => {
    if (localStorage.getItem('sbt-debug-mode') === 'true') {
        console.warn(...args);
    }
};

function buildFallbackChapterStateFromStaticCache() {
    try {
        if (!staticDataManager || typeof staticDataManager.getFullDatabase !== 'function') {
            return null;
        }
        const db = staticDataManager.getFullDatabase() || {};
        const characterIds = Object.keys(db);
        if (characterIds.length === 0) return null;

        const firstCharId = characterIds[0];
        const cachedData = db[firstCharId];
        if (!cachedData) return null;

        const safeWorldview = cachedData.worldview || {};
        const safeStorylines = cachedData.storylines || {};

        const fallbackState = {
            uid: `static_cache_${firstCharId}`,
            characterId: firstCharId,
            staticMatrices: {
                characters: cachedData.characters || {},
                worldview: {
                    locations: safeWorldview.locations || {},
                    items: safeWorldview.items || {},
                    factions: safeWorldview.factions || {},
                    concepts: safeWorldview.concepts || {},
                    events: safeWorldview.events || {},
                    races: safeWorldview.races || {}
                },
                storylines: {
                    main_quests: safeStorylines.main_quests || {},
                    side_quests: safeStorylines.side_quests || {},
                    relationship_arcs: safeStorylines.relationship_arcs || {},
                    personal_arcs: safeStorylines.personal_arcs || {}
                },
                relationship_graph: cachedData.relationship_graph || { edges: [] }
            },
            dynamicState: {
                characters: {},
                worldview: {
                    locations: {},
                    items: {},
                    factions: {},
                    concepts: {},
                    events: {},
                    races: {}
                },
                storylines: {
                    main_quests: {},
                    side_quests: {},
                    relationship_arcs: {},
                    personal_arcs: {}
                }
            },
            meta: {
                longTermStorySummary: cachedData.longTermStorySummary || '（静态数据预览）',
                lastChapterHandoff: cachedData.lastChapterHandoff || null,
                narrative_control_tower: cachedData.narrative_control_tower || { storyline_progress: {} }
            },
            chapter_blueprint: cachedData.chapter_blueprint || {},
            activeChapterDesignNotes: cachedData.activeChapterDesignNotes || null
        };

        if (!fallbackState.meta.narrative_control_tower) {
            fallbackState.meta.narrative_control_tower = { storyline_progress: {} };
        }
        if (!fallbackState.meta.narrative_control_tower.storyline_progress) {
            fallbackState.meta.narrative_control_tower.storyline_progress = {};
        }

        fallbackState.__source = 'static_cache';
        return fallbackState;
    } catch (error) {
        console.warn('[Renderers] 读取静态数据库失败，无法构建预览章节状态', error);
        return null;
    }
}


/**
 * @description 渲染核心记忆列表。
 * @param {object} matrix 角色矩阵对象。
 * @param {JQuery<HTMLElement>} container 渲染的目标容器。
 */
function renderCoreMemories(matrix, container) {
       if (!matrix || !container || container.length === 0) return;

    const protagonistId = Object.keys(matrix).find(id => matrix[id].isProtagonist);
    const memories = (protagonistId && matrix[protagonistId]?.core_memories) ? matrix[protagonistId].core_memories : [];
    if (memories.length === 0) {
        container.html('<p class="sbt-instructions">尚未形成任何核心记忆。</p>');
        return;
    }
    let html = memories.map(mem => `
        <div class="sbt-memory-card">
            <div class="sbt-memory-header"><strong>${mem.emotional_peak}</strong> (烈度: ${mem.intensity}/10)</div>
            <p class="sbt-memory-trigger"><em>"${mem.trigger_event}"</em></p>
            <details class="sbt-memory-details">
                <summary>回忆场景细节</summary>
                <div class="sbt-memory-fulltext">${mem.full_text_snapshot.replace(/\n/g, '<br>')}</div>
            </details>
        </div>`).join('');
    container.html(html);
}

/**
 * @description 渲染故事线网络。
 * @param {object} matrix 故事线矩阵对象。
 * @param {JQuery<HTMLElement>} container 渲染的目标容器。
 */
function renderLineMatrix(matrix, container) {
    if (!container || container.length === 0) return;
    if (!matrix || Object.keys(matrix).length === 0) {
        container.html('<p class="sbt-instructions">故事线尚未形成。</p>');
        return;
    }
    let html = '';
    for (const lineId in matrix) {
        const line = matrix[lineId];
        const statusClass = line.status === 'active' ? 'status-active' : 'status-dormant';
        html += `
            <div class="sbt-storyline-item">
                <span class="sbt-status-badge ${statusClass}">${line.status}</span>
                <div class="sbt-storyline-details">
                    <strong>${line.title || '未知故事线'} (${line.type || '未知类型'})</strong>
                    <p>${line.summary || '暂无摘要。'}</p>
                </div>
            </div>`;
    }
    container.html(html);
}
function renderCharacterRelationships(chapterState, container) {
    try {
        if (!container || container.length === 0) {
            debugWarn("[关系渲染器] 探针报告：目标容器不存在，渲染中止。");
            return;
        }
            container.empty();

    const matrix = chapterState.staticMatrices.characters;
        debugGroup("[关系渲染器] 探针1号：输入数据检查");
        debugLog("收到的完整 chapterState:", chapterState);
        debugLog("提取的角色矩阵 (matrix):", matrix);
        debugGroupEnd();
    if (!matrix || Object.keys(matrix).length <= 1) {
        container.html('<p class="sbt-instructions">暂无其他角色可显示。</p>');
        return;
    }

    // 兼容新旧结构查找主角
    const protagonistId = Object.keys(matrix).find(id => {
        const char = matrix[id];
        return char?.core?.isProtagonist || char?.isProtagonist;
    });
        debugGroup("[关系渲染器] 探针2号：主角ID查找");
        debugLog("查找到的主角ID (protagonistId):", protagonistId);
        debugGroupEnd();

        if (!protagonistId) {
            container.html('<p class="sbt-instructions">错误：在角色档案中未找到主角 (isProtagonist: true)。</p>');
            console.error("[关系渲染器] 探针报告：关键错误！未能找到主角ID。请检查AI生成的角色档案中 'isProtagonist' 字段是否存在且为布尔值 true。");
            return;
        }
                debugLog("[关系渲染器] 探针报告：主角查找成功，准备进入渲染循环...");
    for (const charId in matrix) {
        if (charId === protagonistId) continue;
        const char = matrix[charId];
        // 兼容新旧结构
        const staticRel = char?.social?.relationships?.[protagonistId] || char?.relationships?.[protagonistId];
        const dynamicRel = chapterState.dynamicState.characters?.[charId]?.relationships?.[protagonistId];
        const newAffinity = parseInt(dynamicRel?.current_affinity ?? staticRel?.affinity ?? 0, 10);
        const cardSummaryText = staticRel?.description || "关系尚未建立";
        const historyLog = dynamicRel?.history || [];

        // V3.1: 使用latest_reasoning字段显示最新的史官推理，而不是遍历整个history
        const latestReasoning = dynamicRel?.latest_reasoning?.reasoning || "";
        const tooltipText = latestReasoning
            ? `【最新变化】\n(好感 ${dynamicRel.latest_reasoning.change || 'N/A'}) ${latestReasoning}\n\n【历史记录】\n` +
              historyLog.map(entry => `${entry.timestamp}: 好感${entry.change || '0'} → ${entry.final_affinity}`).join('\n')
            : historyLog.length > 0
                ? historyLog.map(entry => `${entry.timestamp}: 好感${entry.change || '0'} → ${entry.final_affinity}`).join('\n')
                : "暂无详细互动记录。";

        // 获取角色名字（兼容新旧结构）
        const charName = char?.core?.name || char?.name || charId;

        const cardHtml = `
             <div class="sbt-character-card sbt-clickable" data-char-id="${charId}" title="好感度变更历史：\n${tooltipText}">
                <h6>${charName}</h6>
                <p class="sbt-relationship-label sbt-affinity-label">好感度: ${newAffinity}</p>
                <div class="sbt-progress-bar">
                    <div class="sbt-progress-fill affinity"></div>
                    <span class="sbt-change-indicator"></span>
                </div>
                <p class="sbt-last-interaction-text">当前关系: ${cardSummaryText}</p>
            </div>`;
        container.append(cardHtml);
        const $card = container.find(`.sbt-character-card[data-char-id="${charId}"]`);
        const oldAffinity = parseFloat($card.attr('data-current-affinity')) || 0;
        const finalColor = mapValueToHue(newAffinity);

        $card.attr('data-current-affinity', newAffinity);
        $card.attr('data-old-affinity', oldAffinity);
        $card.attr('data-final-color', finalColor);
        $card.attr('data-affinity-tip-shown', 'false');

        const initialColor = mapValueToHue(oldAffinity); 
        const $affinityBar = $card.find('.sbt-progress-fill.affinity');
        $affinityBar.css({
            'backgroundColor': initialColor,
            'width': `${oldAffinity}%`
        });
    }
}catch (error) {
        console.error("[关系渲染器] 探针3号：在渲染过程中捕获到意外错误！", error);
        container.html('<p class="sbt-instructions">渲染角色关系时发生意外错误，请查看控制台获取详情。</p>');
    }
}
/**
 * @description 渲染世界档案面板 - 角色档案馆
 * @param {object} characters - 角色矩阵对象
 * @param {JQuery<HTMLElement>} container - 渲染的目标容器
 */
function renderArchiveCharacters(characters, container) {
    if (!container || container.length === 0) return;

    container.empty();

    if (!characters || Object.keys(characters).length === 0) {
        container.append('<p class="sbt-instructions">暂无角色档案。</p>');
        // 添加新建角色按钮
        const addBtnHtml = `
            <button class="sbt-add-character-btn" title="手动创建新角色档案">
                <i class="fa-solid fa-user-plus fa-fw"></i> 新建角色
            </button>
        `;
        container.append(addBtnHtml);
        return;
    }

    for (const charId in characters) {
        const char = characters[charId];

        // 兼容新旧结构
        const name = char.core?.name || char.name || charId;
        const identity = char.core?.identity || char.identity || '未知身份';
        const isProtagonist = char.core?.isProtagonist || char.isProtagonist || false;
        const age = char.core?.age || '';
        const gender = char.core?.gender || '';

        // 构建副标题
        let subtitle = identity;
        if (age || gender) {
            const details = [age, gender].filter(Boolean).join(' · ');
            subtitle = `${identity} · ${details}`;
        }

        // 【档案隐藏功能】检查是否被隐藏
        const isHidden = char.isHidden === true;
        const hiddenClass = isHidden ? 'sbt-item-hidden' : '';
        const eyeIcon = isHidden ? 'fa-eye-slash' : 'fa-eye';
        const eyeTitle = isHidden ? '显示此角色（当前已隐藏，不会被AI使用）' : '隐藏此角色（暂时不让AI使用）';

        const cardHtml = `
            <div class="sbt-archive-card ${hiddenClass}" data-char-id="${charId}">
                <div class="sbt-archive-card-icon">
                    <i class="fa-solid fa-user"></i>
                </div>
                <div class="sbt-archive-card-title">
                    ${name}
                    ${isProtagonist ? '<i class="fa-solid fa-crown" style="color: var(--sbt-warning-color);" title="主角"></i>' : ''}
                    ${isHidden ? '<span class="sbt-hidden-badge">已隐藏</span>' : ''}
                </div>
                <div class="sbt-archive-card-subtitle">
                    ${subtitle}
                </div>
                <div class="sbt-archive-card-actions">
                    <button class="sbt-character-toggle-visibility-btn" data-char-id="${charId}" title="${eyeTitle}">
                        <i class="fa-solid ${eyeIcon}"></i>
                    </button>
                </div>
            </div>
        `;
        container.append(cardHtml);
    }

    // 添加新建角色按钮（放在所有角色卡之后）
    const addBtnHtml = `
        <button class="sbt-add-character-btn" title="手动创建新角色档案">
            <i class="fa-solid fa-user-plus fa-fw"></i> 新建角色
        </button>
    `;
    container.append(addBtnHtml);
}

/**
 * @description 渲染世界档案面板 - 世界观元素
 * @param {object} worldviewData - 世界观数据对象
 * @param {string} category - 类别名称
 * @param {JQuery<HTMLElement>} container - 渲染的目标容器
 * @param {string} categoryKey - 类别的key（如 'locations', 'items'）
 */
function renderArchiveWorldview(worldviewData, category, container, categoryKey) {
    if (!container || container.length === 0) return;

    container.empty();

    // 添加新建按钮
    const addBtnHtml = `
        <button class="sbt-add-worldview-btn" data-category="${categoryKey}" data-category-name="${category}">
            <i class="fa-solid fa-plus fa-fw"></i> 新建${category}
        </button>
    `;
    container.append(addBtnHtml);

    if (!worldviewData || Object.keys(worldviewData).length === 0) {
        container.append(`<p class="sbt-instructions">暂无${category}记录。</p>`);
        return;
    }

    for (const id in worldviewData) {
        const item = worldviewData[id];

        // 安全地获取描述文本
        let descText = '暂无描述';
        const desc = item.description || item.summary;
        if (desc) {
            descText = typeof desc === 'string' ? desc : JSON.stringify(desc);
        }

        // 【档案隐藏功能】检查是否被隐藏
        const isHidden = item.isHidden === true;
        const hiddenClass = isHidden ? 'sbt-item-hidden' : '';
        const eyeIcon = isHidden ? 'fa-eye-slash' : 'fa-eye';
        const eyeTitle = isHidden ? '显示此档案（当前已隐藏，不会被AI使用）' : '隐藏此档案（暂时不让AI使用）';

        const itemHtml = `
            <div class="sbt-archive-item sbt-worldview-card ${hiddenClass}" data-item-id="${id}" data-category="${categoryKey}">
                <div class="sbt-worldview-card-content">
                    <div class="sbt-archive-item-title">
                        ${item.name || id}
                        ${isHidden ? '<span class="sbt-hidden-badge">已隐藏</span>' : ''}
                    </div>
                    <div class="sbt-archive-item-desc">${descText}</div>
                </div>
                <div class="sbt-worldview-card-actions">
                    <button class="sbt-worldview-toggle-visibility-btn" data-item-id="${id}" data-category="${categoryKey}" title="${eyeTitle}">
                        <i class="fa-solid ${eyeIcon}"></i>
                    </button>
                    <button class="sbt-worldview-edit-btn" data-item-id="${id}" data-category="${categoryKey}" data-category-name="${category}" title="编辑${category}">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                </div>
            </div>
        `;
        container.append(itemHtml);
    }
}

/**
 * @description 渲染世界档案面板 - 故事线（V8.0 可编辑版本）
 * @param {object} storylineData - 故事线数据对象
 * @param {JQuery<HTMLElement>} container - 渲染的目标容器
 * @param {string} category - 故事线分类（main_quests/side_quests/relationship_arcs/personal_arcs）
 * @param {string} categoryName - 分类显示名称
 * @param {object} storylineProgress - 叙事控制塔记录的故事线进度
 */
function renderArchiveStorylines(storylineData, container, category, categoryName, storylineProgress = {}) {
    if (!container || container.length === 0) return;

    container.empty();

    const stageLabelMap = {
        setup: '铺垫阶段',
        inciting_incident: '激励事件',
        catalyst: '触发事件',
        debate: '抉择阶段',
        first_turning_point: '第一次转折',
        fun_and_games: '探索阶段',
        midpoint: '中期节点',
        bad_guys_close_in: '逆境逼近',
        climax_approach: '高潮前奏',
        all_is_lost: '至暗时刻',
        dark_night: '黑夜反思',
        finale: '终章',
        resolution: '结局阶段',
        deepening: '关系深化',
        discovery: '发现阶段',
        confrontation: '对峙阶段',
        aftermath: '余波阶段',
        unknown: '阶段未记录'
    };

    const formatStageLabel = (stage) => {
        if (!stage) return '阶段未记录';
        return stageLabelMap[stage] || stage;
    };
    const clampProgressValue = (value) => {
        const num = Number(value);
        if (Number.isNaN(num)) return 0;
        if (num < 0) return 0;
        if (num > 100) return 100;
        return num;
    };

    const resolveProgressState = (line, fallbackId) => {
        const candidates = [
            line?.storyline_id,
            line?.id,
            line?.uid,
            fallbackId
        ].filter(Boolean);

        for (const key of candidates) {
            if (storylineProgress && Object.prototype.hasOwnProperty.call(storylineProgress, key)) {
                return storylineProgress[key];
            }
        }
        return null;
    };

    // 添加新建故事线按钮
    const addBtnHtml = `
        <button class="sbt-add-storyline-btn" data-category="${category}" data-category-name="${categoryName}">
            <i class="fa-solid fa-plus fa-fw"></i> 新建${categoryName}
        </button>
    `;
    container.append(addBtnHtml);

    if (!storylineData || Object.keys(storylineData).length === 0) {
        container.append(`<p class="sbt-instructions">暂无${categoryName}。</p>`);
        return;
    }

    for (const id in storylineData) {
        const line = storylineData[id];

        // 【修复】优先使用动态状态，回退到静态
        const status = line.current_status || line.status || 'dormant';
        const statusText = status === 'active' ? '进行中' : status === 'completed' ? '已完成' : '休眠';

        // 【修复】优先显示当前进展摘要，回退到基础摘要
        let descText = '暂无描述';
        const desc = line.current_summary || line.summary || line.initial_summary || line.description;
        if (desc) {
            descText = typeof desc === 'string' ? desc : JSON.stringify(desc);
        }

        // 【新增】显示历史记录（可编辑）
        let historyHtml = '';
        if (line.history && Array.isArray(line.history) && line.history.length > 0) {
            historyHtml = '<div class="sbt-storyline-history"><div class="sbt-storyline-history-title">📜 历史变化记录（可编辑）</div>';

            // 获取最近3条记录及其原始索引
            const recentEntries = line.history.slice(-3);
            const startIndex = Math.max(0, line.history.length - 3);

            recentEntries.reverse().forEach((entry, displayIndex) => {  // 倒序显示
                // 【修复】过滤掉模板占位符（如 {{engine_generated_timestamp}}）
                let timestamp = entry.timestamp || '未知时间';
                if (timestamp.includes('{{') || timestamp.includes('}}')) {
                    timestamp = '系统自动记录';
                }

                // 计算实际索引（考虑倒序显示）
                const actualIndex = startIndex + (recentEntries.length - 1 - displayIndex);
                const update = entry.summary_update || entry.status_change || '无更新';

                historyHtml += `<div class="sbt-storyline-history-entry">
                    <span class="sbt-storyline-timestamp">${timestamp}</span>:
                    <span class="sbt-history-content" contenteditable="true" data-history-index="${actualIndex}">${update}</span>
                </div>`;
            });
            historyHtml += '</div>';
        }

        // 【档案隐藏功能】检查是否被隐藏
        const isHidden = line.isHidden === true;
        const hiddenClass = isHidden ? 'sbt-item-hidden' : '';
        const eyeIcon = isHidden ? 'fa-eye-slash' : 'fa-eye';
        const eyeTitle = isHidden ? '显示此故事线（当前已隐藏，不会被AI使用）' : '隐藏此故事线（暂时不让AI使用）';

        const progressState = resolveProgressState(line, id);
        let progressHtml = '';

        if (progressState) {
            const progressValue = clampProgressValue(progressState.current_progress);
            const stageLabel = formatStageLabel(progressState.current_stage);
            const displayValue = Math.round(progressValue);
            const deltaValue = Number(progressState.last_increment);
            const hasDelta = Number.isFinite(deltaValue) && deltaValue !== 0;
            const deltaText = hasDelta
                ? `<div class="sbt-storyline-progress-delta">本章推进 ${deltaValue > 0 ? '+' : ''}${deltaValue}%</div>`
                : '';

            progressHtml = `
                <div class="sbt-storyline-progress">
                    <div class="sbt-storyline-progress-header">
                        <span class="sbt-storyline-stage">${stageLabel}</span>
                        <span class="sbt-storyline-progress-value">${displayValue}%</span>
                    </div>
                    <div class="sbt-progress-bar storyline">
                        <div class="sbt-progress-fill storyline" style="width: ${progressValue}%;"></div>
                    </div>
                    ${deltaText}
                </div>
            `;
        } else {
            progressHtml = '<div class="sbt-storyline-progress sbt-storyline-progress-empty">尚未记录进度</div>';
        }

        const itemHtml = `
            <div class="sbt-archive-item sbt-storyline-card ${hiddenClass}" data-storyline-id="${id}" data-category="${category}">
                <div class="sbt-archive-item-header">
                    <div class="sbt-archive-item-title">
                        ${line.title || id}
                        <span class="sbt-archive-status ${status}">${statusText}</span>
                        ${isHidden ? '<span class="sbt-hidden-badge">已隐藏</span>' : ''}
                    </div>
                    <div class="sbt-storyline-actions">
                        <button class="sbt-storyline-toggle-visibility-btn" data-storyline-id="${id}" data-category="${category}" title="${eyeTitle}">
                            <i class="fa-solid ${eyeIcon}"></i>
                        </button>
                        <button class="sbt-storyline-edit-btn" data-storyline-id="${id}" data-category="${category}" data-category-name="${categoryName}" title="编辑${categoryName}">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="sbt-storyline-delete-btn" data-storyline-id="${id}" data-category="${category}" title="删除${categoryName}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="sbt-archive-item-desc">${descText}</div>
                ${progressHtml}
                ${line.type ? `<div class="sbt-archive-item-meta">类型: ${line.type}</div>` : ''}
                ${historyHtml}
            </div>
        `;
        container.append(itemHtml);
    }
}

/**
 * @description 渲染关系图谱
 * @param {object} chapterState - 完整的Chapter对象
 */
function renderRelationshipGraph(chapterState) {
    const container = $('#sbt-relationship-graph-container');
    if (!container || container.length === 0) return;

    container.empty();

    const relationshipGraph = chapterState?.staticMatrices?.relationship_graph;
    const edges = relationshipGraph?.edges || [];

    if (edges.length === 0) {
        container.html('<p class="sbt-instructions">暂无关系图谱数据。创世后将自动生成角色关系网络。</p>');
        return;
    }

    // 获取角色名称映射
    const characters = chapterState.staticMatrices.characters || {};
    const getCharName = (charId) => {
        const char = characters[charId];
        return char?.core?.name || char?.name || charId.replace('char_', '');
    };

    // 统计信息
    const reunionPendingCount = edges.filter(e => e.timeline?.reunion_pending).length;
    const firstMeetingCount = edges.filter(e => !e.narrative_status?.first_scene_together).length;

    // 渲染统计信息
    const statsHtml = `
        <div class="sbt-relationship-stats">
            <div class="sbt-relationship-stat-item">
                <i class="fa-solid fa-link"></i>
                <span>关系总数: <span class="sbt-relationship-stat-value">${edges.length}</span></span>
            </div>
            <div class="sbt-relationship-stat-item">
                <i class="fa-solid fa-clock-rotate-left" style="color: #f39c12;"></i>
                <span>待重逢: <span class="sbt-relationship-stat-value">${reunionPendingCount}</span></span>
            </div>
            <div class="sbt-relationship-stat-item">
                <i class="fa-solid fa-handshake" style="color: #3498db;"></i>
                <span>待初识: <span class="sbt-relationship-stat-value">${firstMeetingCount}</span></span>
            </div>
        </div>
    `;
    container.append(statsHtml);

    // 渲染每条关系边
    edges.forEach((edge, index) => {
        const participant1 = getCharName(edge.participants[0]);
        const participant2 = getCharName(edge.participants[1]);

        // 关系类型翻译
        const typeTranslations = {
            'childhood_friends': '童年玩伴',
            'family_siblings': '兄弟姐妹',
            'family_parent': '父母子女',
            'romantic_interest': '恋慕关系',
            'rivals': '竞争对手',
            'mentor_student': '师生关系',
            'allies': '盟友关系',
            'enemies': '敌对关系',
            'colleagues': '同事关系',
            'friends': '朋友关系'
        };
        const typeText = typeTranslations[edge.type] || edge.type || '未知关系';

        // 分离时长翻译
        const separationTranslations = {
            'none': '无分离',
            'days': '数天',
            'weeks': '数周',
            'months': '数月',
            'years': '数年',
            'unknown': '未知'
        };
        const separationText = separationTranslations[edge.timeline?.separation_duration] || edge.timeline?.separation_duration || '未知';

        // 计算情感权重等级
        const weight = edge.emotional_weight || 0;
        let weightClass = 'weight-low';
        if (weight >= 9) weightClass = 'weight-critical';
        else if (weight >= 7) weightClass = 'weight-high';
        else if (weight >= 4) weightClass = 'weight-medium';

        // 确定卡片样式
        let cardClass = 'sbt-relationship-edge-card';
        if (edge.timeline?.reunion_pending) cardClass += ' reunion-pending';
        else if (!edge.narrative_status?.first_scene_together) cardClass += ' first-meeting-pending';

        // 时间线状态标签
        let timelineStatusHtml = '';
        if (edge.timeline?.reunion_pending) {
            timelineStatusHtml = '<span class="sbt-timeline-status reunion-pending"><i class="fa-solid fa-clock-rotate-left"></i> 待重逢</span>';
        } else if (!edge.narrative_status?.first_scene_together) {
            timelineStatusHtml = '<span class="sbt-timeline-status first-meeting"><i class="fa-solid fa-handshake"></i> 待初识</span>';
        } else if (edge.timeline?.separation_duration === 'none') {
            timelineStatusHtml = '<span class="sbt-timeline-status active"><i class="fa-solid fa-check"></i> 活跃</span>';
        } else {
            timelineStatusHtml = '<span class="sbt-timeline-status separated"><i class="fa-solid fa-user-clock"></i> 分离中</span>';
        }

        // 未解决张力标签
        let tensionsHtml = '';
        const tensions = edge.narrative_status?.unresolved_tension || [];
        if (tensions.length > 0) {
            tensionsHtml = '<div class="sbt-unresolved-tensions">';
            tensions.forEach(tension => {
                tensionsHtml += `<span class="sbt-tension-tag">${tension}</span>`;
            });
            tensionsHtml += '</div>';
        }

        // 重大事件列表
        let eventsHtml = '';
        const events = edge.narrative_status?.major_events || [];
        if (events.length > 0) {
            eventsHtml = '<div class="sbt-major-events-list">';
            events.forEach(event => {
                const impact = event.emotional_impact || 0;
                eventsHtml += `
                    <div class="sbt-major-event-item">
                        <i class="fa-solid fa-bookmark sbt-major-event-icon"></i>
                        <div class="sbt-major-event-content">
                            ${event.event}
                            <div class="sbt-major-event-impact">情感冲击: ${impact}/10</div>
                        </div>
                    </div>
                `;
            });
            eventsHtml += '</div>';
        }

        const cardHtml = `
            <div class="${cardClass} sbt-relationship-card-clickable" data-edge-id="${edge.id}">
                <div class="sbt-relationship-card-content">
                    <div class="sbt-relationship-card-left">
                        <div class="sbt-relationship-participants">
                            <span class="sbt-participant-name">${participant1}</span>
                            <i class="fa-solid fa-heart sbt-heart-icon"></i>
                            <span class="sbt-participant-name">${participant2}</span>
                        </div>
                        <div class="sbt-relationship-meta-row">
                            <span class="sbt-relationship-type-badge">${typeText}</span>
                            ${timelineStatusHtml}
                        </div>
                    </div>
                    <div class="sbt-relationship-card-right">
                        <i class="fa-solid fa-chevron-right sbt-card-arrow"></i>
                    </div>
                </div>
            </div>
        `;
        container.append(cardHtml);
    });

    // 添加点击事件打开详情模态框
    container.off('click', '.sbt-relationship-card-clickable');
    container.on('click', '.sbt-relationship-card-clickable', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const edgeId = $(this).data('edge-id');
        debugLog('[SBT] Opening relationship details:', edgeId);
        showRelationshipDetailModal(edgeId, chapterState);
    });
}

/**
 * @description 更新世界档案面板
 * @param {Chapter} chapterState - 完整的Chapter对象
 */
function updateArchivePanel(chapterState) {
    if (!chapterState || $('#sbt-archive-panel').length === 0) return;

    // 渲染角色档案馆
    renderArchiveCharacters(
        chapterState.staticMatrices.characters,
        $('#sbt-archive-characters')
    );

    // V3.0: 渲染关系图谱
    renderRelationshipGraph(chapterState);

    // 渲染世界观元素
    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.locations,
        '地点',
        $('#sbt-archive-locations'),
        'locations'
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.items,
        '物品',
        $('#sbt-archive-items'),
        'items'
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.factions,
        '势力',
        $('#sbt-archive-factions'),
        'factions'
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.concepts,
        '概念',
        $('#sbt-archive-concepts'),
        'concepts'
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.events,
        '历史事件',
        $('#sbt-archive-events'),
        'events'
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.races,
        '种族',
        $('#sbt-archive-races'),
        'races'
    );

    // 【修复】渲染故事线 - 合并静态和动态数据
    // 辅助函数：合并故事线的静态和动态数据
    const mergeStorylineData = (category) => {
        const staticData = chapterState.staticMatrices.storylines[category] || {};
        const dynamicData = chapterState.dynamicState.storylines[category] || {};
        const merged = {};

        // 遍历所有静态故事线
        for (const id in staticData) {
            merged[id] = {
                ...staticData[id],  // 静态字段：title, summary, type, trigger, involved_chars
                ...dynamicData[id]  // 动态字段：current_status, current_summary, history
            };
        }

        return merged;
    };

    const storylineProgress = chapterState.meta?.narrative_control_tower?.storyline_progress || {};

    renderArchiveStorylines(
        mergeStorylineData('main_quests'),
        $('#sbt-archive-main-quests'),
        'main_quests',
        '主线任务',
        storylineProgress
    );

    renderArchiveStorylines(
        mergeStorylineData('side_quests'),
        $('#sbt-archive-side-quests'),
        'side_quests',
        '支线任务',
        storylineProgress
    );

    renderArchiveStorylines(
        mergeStorylineData('relationship_arcs'),
        $('#sbt-archive-relationship-arcs'),
        'relationship_arcs',
        '关系弧光',
        storylineProgress
    );

    renderArchiveStorylines(
        mergeStorylineData('personal_arcs'),
        $('#sbt-archive-personal-arcs'),
        'personal_arcs',
        '个人成长',
        storylineProgress
    );
}

/**更新整个仪表盘UI，现在传递整个 Chapter 对象 */

/**
 * @description [V3.5] 渲染章节剧本 - 分层卡片式布局
 * @param {object} blueprint - 章节剧本对象
 * @returns {string} HTML字符串
 */
function renderChapterBlueprint(blueprint) {
    if (!blueprint || typeof blueprint !== 'object') {
        return '<p class="sbt-instructions">当前没有激活的创作蓝图。</p>';
    }

    // V4.2 节拍类型映射（扩展）
    const beatTypeMap = {
        'Action': '动作',
        'Dialogue Scene': '对话',
        'Transition': '过渡',
        'Internal Transition': '内部转场',
        'Reflection': '反思'
    };

    // V4.2 节拍类型样式类映射（扩展）
    const beatTypeClassMap = {
        'Action': 'action',
        'Dialogue Scene': 'dialogue',
        'Transition': 'transition',
        'Internal Transition': 'internal-transition',
        'Reflection': 'reflection'
    };

    let html = '';

    // === 第1层：章节概览卡片 ===
    html += '<div class="sbt-blueprint-overview-card">';
    html += '<div class="sbt-blueprint-section-title">';
    html += '<i class="fa-solid fa-book-open"></i> 章节概览';
    html += '</div>';

    // 章节标题
    if (blueprint.title) {
        html += `<div class="sbt-blueprint-field">
            <div class="sbt-blueprint-field-label">章节标题</div>
            <div class="sbt-blueprint-field-value" contenteditable="true" data-field="title">${blueprint.title}</div>
        </div>`;
    }

    // 情感弧光
    if (blueprint.emotional_arc) {
        html += `<div class="sbt-blueprint-field">
            <div class="sbt-blueprint-field-label">情感弧光</div>
            <div class="sbt-blueprint-field-value" contenteditable="true" data-field="emotional_arc">${blueprint.emotional_arc}</div>
        </div>`;
    }

    // 核心冲突
    if (blueprint.core_conflict) {
        html += `<div class="sbt-blueprint-field">
            <div class="sbt-blueprint-field-label">核心冲突</div>
            <div class="sbt-blueprint-field-value" contenteditable="true" data-field="core_conflict">${blueprint.core_conflict}</div>
        </div>`;
    }

    // 玩家补充（绝对优先级）
    const playerSupplement = blueprint.player_supplement || '';
    html += `<div class="sbt-blueprint-field sbt-player-supplement-field">
        <div class="sbt-blueprint-field-label">
            玩家补充 <span style="font-size: 0.8em; color: var(--sbt-text-dim);">(优先级最高)</span>
        </div>
        <div class="sbt-blueprint-field-value sbt-player-supplement-input" contenteditable="true" data-field="player_supplement" placeholder="补充说明...">${playerSupplement}</div>
    </div>`;

    html += '</div>'; // 结束概览卡片

    // === 第2层：情节节拍列表 ===
    if (blueprint.plot_beats && Array.isArray(blueprint.plot_beats) && blueprint.plot_beats.length > 0) {
        html += '<div class="sbt-blueprint-section">';
        html += '<div class="sbt-blueprint-section-title sbt-collapsible">';
        html += '<i class="fa-solid fa-chevron-down sbt-collapse-icon"></i>';
        html += '<i class="fa-solid fa-list-ol"></i> 情节节拍';
        html += `<span class="sbt-beat-count">${blueprint.plot_beats.length} 个节拍</span>`;
        html += '</div>';
        html += '<div class="sbt-blueprint-section-content">';

        blueprint.plot_beats.forEach((beat, index) => {
            const beatNum = index + 1;
            const beatType = beat.type || 'Action';
            const beatTypeChinese = beatTypeMap[beatType] || beatType;
            const beatTypeClass = beatTypeClassMap[beatType] || 'action';
            const isHighlight = beat.is_highlight || false;

            html += `<div class="sbt-beat-card ${isHighlight ? 'highlight' : ''}" data-beat-index="${index}">`;

            // 节拍头部
            html += '<div class="sbt-beat-header">';
            html += `<span class="sbt-beat-number">${beatNum}</span>`;
            html += `<span class="sbt-beat-type-badge ${beatTypeClass}">${beatTypeChinese}</span>`;
            if (isHighlight) {
                html += '<i class="fa-solid fa-star sbt-highlight-star" title="高光节拍"></i>';
            }
            html += '</div>';

            // 物理事件（新格式必填字段）
            if (beat.physical_event) {
                html += `<div class="sbt-beat-field">
                    <div class="sbt-beat-field-label"><i class="fa-solid fa-bolt"></i> 物理事件</div>
                    <div class="sbt-beat-field-value" contenteditable="true" data-beat-index="${index}" data-field="physical_event">${beat.physical_event}</div>
                </div>`;
            }

            // 环境状态（可选）
            if (beat.environment_state) {
                html += `<div class="sbt-beat-field">
                    <div class="sbt-beat-field-label"><i class="fa-solid fa-cloud-sun"></i> 环境状态</div>
                    <div class="sbt-beat-field-value" contenteditable="true" data-beat-index="${index}" data-field="environment_state">${beat.environment_state}</div>
                </div>`;
            }

            // 状态变更（可选）
            if (beat.state_change) {
                html += `<div class="sbt-beat-field">
                    <div class="sbt-beat-field-label"><i class="fa-solid fa-exchange-alt"></i> 状态变更</div>
                    <div class="sbt-beat-field-value" contenteditable="true" data-beat-index="${index}" data-field="state_change">${beat.state_change}</div>
                </div>`;
            }

            // 退出条件（Dialogue Scene必填）
            if (beat.exit_condition) {
                html += `<div class="sbt-beat-field">
                    <div class="sbt-beat-field-label"><i class="fa-solid fa-door-open"></i> 退出条件</div>
                    <div class="sbt-beat-field-value" contenteditable="true" data-beat-index="${index}" data-field="exit_condition">${beat.exit_condition}</div>
                </div>`;
            }

            // 向后兼容：如果还有旧的description字段
            if (beat.description && !beat.physical_event) {
                html += `<div class="sbt-beat-description" contenteditable="true" data-beat-index="${index}" data-field="description">${beat.description}</div>`;
            }

            html += '</div>'; // 结束节拍卡片
        });

        html += '</div>'; // 结束section-content
        html += '</div>'; // 结束section
    }

    // === 第3层：高光时刻设计 ===
    if (blueprint.highlight_moment_design) {
        const highlight = blueprint.highlight_moment_design;
        html += '<div class="sbt-blueprint-section">';
        html += '<div class="sbt-blueprint-section-title sbt-collapsible">';
        html += '<i class="fa-solid fa-chevron-down sbt-collapse-icon"></i>';
        html += '<i class="fa-solid fa-star"></i> 高光时刻设计';
        html += '</div>';
        html += '<div class="sbt-blueprint-section-content">';
        html += '<div class="sbt-highlight-card">';

        // 高光类型
        if (highlight.type) {
            html += `<div class="sbt-blueprint-field">
                <div class="sbt-blueprint-field-label"><i class="fa-solid fa-tag"></i> 高光类型</div>
                <div class="sbt-blueprint-field-value" contenteditable="true" data-field="highlight_moment_design.type">${highlight.type}</div>
            </div>`;
        }

        // 目标节拍
        if (highlight.target_beat !== undefined) {
            html += `<div class="sbt-blueprint-field">
                <div class="sbt-blueprint-field-label"><i class="fa-solid fa-bullseye"></i> 目标节拍</div>
                <div class="sbt-blueprint-field-value">节拍 ${highlight.target_beat + 1}</div>
            </div>`;
        }

        // 设计意图
        if (highlight.design_rationale) {
            html += `<div class="sbt-blueprint-field">
                <div class="sbt-blueprint-field-label"><i class="fa-solid fa-lightbulb"></i> 设计意图</div>
                <div class="sbt-blueprint-field-value" contenteditable="true" data-field="highlight_moment_design.design_rationale">${highlight.design_rationale}</div>
            </div>`;
        }

        html += '</div>'; // 结束highlight-card
        html += '</div>'; // 结束section-content
        html += '</div>'; // 结束section
    }

    // === 第4层：终章信标 ===
    // 兼容两种格式：endgame_beacon (单数字符串) 和 endgame_beacons (复数数组)
    let beacons = [];
    if (blueprint.endgame_beacon && typeof blueprint.endgame_beacon === 'string') {
        beacons = [blueprint.endgame_beacon];
    } else if (blueprint.endgame_beacons && Array.isArray(blueprint.endgame_beacons)) {
        beacons = blueprint.endgame_beacons;
    }

    if (beacons.length > 0) {
        html += '<div class="sbt-blueprint-section">';
        html += '<div class="sbt-blueprint-section-title sbt-collapsible">';
        html += '<i class="fa-solid fa-chevron-down sbt-collapse-icon"></i>';
        html += '<i class="fa-solid fa-flag-checkered"></i> 终章信标';
        html += `<span class="sbt-beat-count">${beacons.length} 个信标</span>`;
        html += '</div>';
        html += '<div class="sbt-blueprint-section-content">';

        beacons.forEach((beacon, index) => {
            html += `<div class="sbt-beacon-item">
                <i class="fa-solid fa-circle-dot"></i>
                <span contenteditable="true" data-beacon-index="${index}">${beacon}</span>
            </div>`;
        });

        html += '</div>'; // 结束section-content
        html += '</div>'; // 结束section
    }

    return html;
}

export function updateDashboard(chapterState) {
    if ($('#beat-tracker-component-wrapper').length === 0) return;

    if (!chapterState || !chapterState.staticMatrices) {
        const fallbackState = buildFallbackChapterStateFromStaticCache();
        if (fallbackState) {
            debugWarn('[Renderers] 未检测到 Leader 章节，使用静态数据库预览。');
            chapterState = fallbackState;
        }
    }

    if (!chapterState) return;

    // V4.2 调试：验证UI收到的章节数据
    debugGroup('[RENDERERS-V4.2-DEBUG] updateDashboard 收到数据');
    debugLog('章节UID:', chapterState.uid);
    debugLog('终章信标:', chapterState.chapter_blueprint?.endgame_beacons);
    debugLog('章节衔接点:', chapterState.meta?.lastChapterHandoff);
    debugGroupEnd();

    // --- 1. 【V3.6 革新】渲染双轨制故事摘要（编年史+衔接点） ---
    const summaryContainer = $('#sbt-story-summary-content');
    if(summaryContainer.length > 0) {
        const longTermSummary = chapterState.meta?.longTermStorySummary || "暂无故事摘要。";
        const handoffMemo = chapterState.meta?.lastChapterHandoff;

        let html = '';

        // 第一部分：编年史家视角（概要）
        html += '<div class="sbt-summary-section">';
        html += '<div class="sbt-summary-section-title">';
        html += '<i class="fa-solid fa-book"></i> 故事梗概';
        html += '<button class="sbt-edit-summary-btn" data-field="longTermStorySummary" title="编辑故事梗概"><i class="fa-solid fa-pen-to-square"></i></button>';
        html += '</div>';
        html += `<div class="sbt-summary-content" id="sbt-summary-display">${longTermSummary}</div>`;
        html += '</div>';

        // 第二部分：章节交接备忘录（衔接点）
        if (handoffMemo && typeof handoffMemo === 'object') {
            html += '<div class="sbt-summary-section sbt-handoff-section">';
            html += '<div class="sbt-summary-section-title">';
            html += '<i class="fa-solid fa-link"></i> 章节衔接点';
            html += '<span class="sbt-handoff-badge">关键</span>';
            html += '<button class="sbt-edit-summary-btn" data-field="lastChapterHandoff" title="编辑章节衔接点"><i class="fa-solid fa-pen-to-square"></i></button>';
            html += '</div>';

            // 结束快照
            if (handoffMemo.ending_snapshot) {
                html += '<div class="sbt-handoff-block">';
                html += '<div class="sbt-handoff-block-title"><i class="fa-solid fa-camera"></i> 结束快照</div>';
                html += `<div class="sbt-handoff-content" id="sbt-handoff-ending-display">${handoffMemo.ending_snapshot}</div>`;
                html += '</div>';
            }

            // 动作交接
            if (handoffMemo.action_handoff) {
                html += '<div class="sbt-handoff-block">';
                html += '<div class="sbt-handoff-block-title"><i class="fa-solid fa-arrow-right"></i> 下章起点</div>';
                html += `<div class="sbt-handoff-content sbt-action-handoff" id="sbt-handoff-action-display">${handoffMemo.action_handoff}</div>`;
                html += '</div>';
            }

            html += '</div>'; // 结束handoff-section
        }

        summaryContainer.html(html);
    }

    // --- 2. 【V3.5 革新】渲染章节剧本 - 使用新的卡片式布局 ---
    const scriptContainer = $('#sbt-active-script-content');
    if(scriptContainer.length > 0) {
        const blueprintHtml = renderChapterBlueprint(chapterState.chapter_blueprint);
        scriptContainer.html(blueprintHtml);
    }

    // --- 3. 【革新】渲染全新的"自省式"设计笔记 ---
    const notesContainer = $('#sbt-design-notes-content');
    if (notesContainer.length > 0) {
        const notes = chapterState.activeChapterDesignNotes;
        if (notes && typeof notes === 'object') {
            // 通用渲染函数（极简紧凑版）
            const renderField = (icon, label, content) => {
                if (!content || content === 'N/A') return '';
                return `<div style="margin: 3px 0;"><strong><i class="${icon} fa-fw"></i> ${label}:</strong> <span style="margin-left: 6px;">${content}</span></div>`;
            };

            // 渲染玩家焦点执行报告（简洁版）
            let playerFocusHtml = '';
            if (notes.player_focus_execution && typeof notes.player_focus_execution === 'object') {
                const focusExec = notes.player_focus_execution;
                const hasContent = focusExec.player_instruction || focusExec.execution_logic || focusExec.conflict_resolution;

                if (hasContent) {
                    playerFocusHtml = `
                        <div style="background: var(--sbt-background-dark); padding: 10px; border-radius: 6px; margin-bottom: 10px; border-left: 3px solid #FFD700;">
                            <h6 style="margin: 0 0 6px 0; color: #FFD700;"><i class="fa-solid fa-crown fa-fw"></i> 玩家意见执行</h6>
                            ${focusExec.player_instruction ? `<div style="margin: 3px 0;"><strong>指令:</strong> <span style="margin-left: 6px;">${focusExec.player_instruction}</span></div>` : ''}
                            ${focusExec.execution_logic ? `<div style="margin: 3px 0;"><strong>逻辑:</strong> <span style="margin-left: 6px;">${focusExec.execution_logic}</span></div>` : ''}
                            ${focusExec.conflict_resolution ? `<div style="margin: 3px 0;"><strong>冲突:</strong> <span style="margin-left: 6px; font-style: italic;">${focusExec.conflict_resolution}</span></div>` : ''}
                        </div>
                    `;
                }
            }

            // 渲染满足感蓝图（网文模式KPI）- 极简版
            let satisfactionHtml = '';
            if (notes.satisfaction_blueprint && typeof notes.satisfaction_blueprint === 'object') {
                const blueprint = notes.satisfaction_blueprint;
                const isWebNovelMode = blueprint.core_pleasure_source && blueprint.core_pleasure_source !== 'N/A';

                if (isWebNovelMode) {
                    satisfactionHtml = `
                        <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid var(--sbt-warning-color);">
                            <h6 style="margin: 0 0 4px 0; color: var(--sbt-warning-color); font-size: 0.95em;"><i class="fa-solid fa-fire fa-fw"></i> 网文模式</h6>
                            ${renderField('fa-solid fa-heart-pulse', '核心快感', blueprint.core_pleasure_source)}
                            ${renderField('fa-solid fa-arrow-down-up-across-line', '预期差', blueprint.expectation_setup)}
                            ${renderField('fa-solid fa-burst', '高潮', blueprint.climax_payoff)}
                            ${renderField('fa-solid fa-gift', '奖励', blueprint.tangible_rewards)}
                            ${renderField('fa-solid fa-fish-fins', '钩子', blueprint.hook_design)}
                        </div>
                    `;
                }
            }

            // 渲染正剧模式呼吸节奏 - 极简版
            let classicRpgHtml = '';
            if (notes.classic_rpg_breath && typeof notes.classic_rpg_breath === 'object') {
                const breath = notes.classic_rpg_breath;
                const isClassicMode = breath.current_phase && breath.current_phase !== 'N/A';

                if (isClassicMode) {
                    classicRpgHtml = `
                        <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid var(--sbt-primary-accent);">
                            <h6 style="margin: 0 0 4px 0; color: var(--sbt-primary-accent); font-size: 0.95em;"><i class="fa-solid fa-masks-theater fa-fw"></i> 正剧模式</h6>
                            ${renderField('fa-solid fa-wind', '呼吸', breath.current_phase)}
                            ${renderField('fa-solid fa-film', '类型', breath.scene_sequel_type)}
                            ${renderField('fa-solid fa-gauge', '理由', breath.pacing_rationale)}
                            ${renderField('fa-solid fa-cloud', '氛围', breath.atmospheric_focus)}
                        </div>
                    `;
                }
            }

            // 渲染沉浸模式设计逻辑 - 极简版
            let elevationHtml = '';
            if (notes.elevation_design_logic && typeof notes.elevation_design_logic === 'object') {
                const elevation = notes.elevation_design_logic;
                const hasContent = elevation.unique_spark && elevation.unique_spark !== 'N/A';

                if (hasContent) {
                    elevationHtml = `
                        <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #e91e63;">
                            <h6 style="margin: 0 0 4px 0; color: #e91e63; font-size: 0.95em;"><i class="fa-solid fa-heart-pulse fa-fw"></i> 沉浸模式</h6>
                            ${renderField('fa-solid fa-lightbulb', '创意', elevation.unique_spark)}
                            ${renderField('fa-solid fa-shield-halved', '自辩', elevation.irreplaceability_defense)}
                            ${renderField('fa-solid fa-book-open', '策略', elevation.reference_strategy)}
                        </div>
                    `;
                }
            }

            // 渲染情感基调策略 - 极简版
            let emotionalToneHtml = '';
            if (notes.emotional_tone_strategy && typeof notes.emotional_tone_strategy === 'object') {
                const strategy = notes.emotional_tone_strategy;
                const hasContent = strategy.core_emotional_tone || strategy.chosen_storylines_and_reasoning || strategy.compatibility_check;

                if (hasContent) {
                    emotionalToneHtml = `
                        <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #9b59b6;">
                            <h6 style="margin: 0 0 4px 0; color: #9b59b6; font-size: 0.95em;"><i class="fa-solid fa-heart fa-fw"></i> 情感基调</h6>
                            ${renderField('fa-solid fa-palette', '基调', strategy.core_emotional_tone)}
                            ${renderField('fa-solid fa-diagram-project', '故事线', strategy.chosen_storylines_and_reasoning)}
                            ${renderField('fa-solid fa-circle-check', '相容性', strategy.compatibility_check)}
                        </div>
                    `;
                }
            }

            // 渲染自我审查报告 - 极简版
            const report = notes.self_scrutiny_report || {};
            let scrutinyHtml = '';
            if (report.anti_performance || report.anti_thematic_greed || report.ending_safety_check) {
                scrutinyHtml = `
                    <div style="background: var(--sbt-background-dark); padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid var(--sbt-primary-accent);">
                        <h6 style="margin: 0 0 4px 0; color: var(--sbt-primary-accent); font-size: 0.95em;"><i class="fa-solid fa-magnifying-glass-chart fa-fw"></i> 自我审查</h6>
                        ${renderField('fa-solid fa-user-check', '去表演化', report.anti_performance)}
                        ${renderField('fa-solid fa-filter', '主题聚焦', report.anti_thematic_greed)}
                        ${renderField('fa-solid fa-flag-checkered', '终章检查', report.ending_safety_check)}
                    </div>
                `;
            }

            // 组装最终HTML - 紧凑版，只显示存在的部分
            const notesHtml = `
                ${playerFocusHtml}
                ${emotionalToneHtml}
                ${satisfactionHtml}
                ${classicRpgHtml}
                ${elevationHtml}
                ${renderField('fa-solid fa-diagram-project', '故事线编织', notes.storyline_weaving)}
                ${renderField('fa-solid fa-link', '承上启下', notes.connection_and_hook)}
                ${renderField('fa-solid fa-palette', '美学创新', notes.aesthetic_innovation_report)}
                ${scrutinyHtml}
            `;
            notesContainer.html(notesHtml);
        } else {
            notesContainer.html('<p class="sbt-instructions">当前章节没有可用的设计笔记。</p>');
        }
    }

    // --- 4. 渲染角色关系图谱 ---
    const relationshipContainer = $('#sbt-character-chart');
    if (relationshipContainer.length > 0) {
        renderCharacterRelationships(chapterState, relationshipContainer);
    }

    // --- 5. 渲染故事线网络 ---
    // 【修复】合并所有分类的静态和动态故事线数据
    const allStorylines = {};
    const categories = ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs'];

    for (const category of categories) {
        const staticData = chapterState.staticMatrices.storylines[category] || {};
        const dynamicData = chapterState.dynamicState.storylines[category] || {};

        for (const id in staticData) {
            allStorylines[id] = {
                ...staticData[id],  // 静态字段
                ...dynamicData[id]  // 动态字段
            };
        }
    }

    renderLineMatrix(allStorylines, $('#sbt-line-matrix-list'));

    // --- 6. 更新世界档案面板 ---
    updateArchivePanel(chapterState);
}

// 导出模态框函数，供外部使用
export { showCharacterDetailModal, showCharacterDetailPopup, showWorldviewDetailModal, showStorylineDetailModal, showRelationshipDetailModal };

