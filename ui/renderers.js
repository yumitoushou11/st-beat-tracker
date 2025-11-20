// ui/renderers.js
import { mapValueToHue } from '../utils/colorUtils.js';
import { showCharacterDetailModal, showCharacterDetailPopup } from './renderers/characterModal.js';
import { showWorldviewDetailModal } from './renderers/worldviewModal.js';


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
            console.warn("[关系渲染器] 探针报告：目标容器不存在，渲染中止。");
            return;
        }
            container.empty();

    const matrix = chapterState.staticMatrices.characters;
        console.group("[关系渲染器] 探针1号：输入数据检查");
        console.log("收到的完整 chapterState:", chapterState);
        console.log("提取的角色矩阵 (matrix):", matrix);
        console.groupEnd();
    if (!matrix || Object.keys(matrix).length <= 1) {
        container.html('<p class="sbt-instructions">暂无其他角色可显示。</p>');
        return;
    }

    // 兼容新旧结构查找主角
    const protagonistId = Object.keys(matrix).find(id => {
        const char = matrix[id];
        return char?.core?.isProtagonist || char?.isProtagonist;
    });
        console.group("[关系渲染器] 探针2号：主角ID查找");
        console.log("查找到的主角ID (protagonistId):", protagonistId);
        console.groupEnd();

        if (!protagonistId) {
            container.html('<p class="sbt-instructions">错误：在角色档案中未找到主角 (isProtagonist: true)。</p>');
            console.error("[关系渲染器] 探针报告：关键错误！未能找到主角ID。请检查AI生成的角色档案中 'isProtagonist' 字段是否存在且为布尔值 true。");
            return;
        }
                console.log("[关系渲染器] 探针报告：主角查找成功，准备进入渲染循环...");
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

    // 添加新建角色按钮
    const addBtnHtml = `
        <button class="sbt-add-character-btn" title="手动创建新角色档案">
            <i class="fa-solid fa-user-plus fa-fw"></i> 新建角色
        </button>
    `;
    container.append(addBtnHtml);

    if (!characters || Object.keys(characters).length === 0) {
        container.append('<p class="sbt-instructions">暂无角色档案。</p>');
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

        const cardHtml = `
            <div class="sbt-archive-card" data-char-id="${charId}">
                <div class="sbt-archive-card-icon">
                    <i class="fa-solid fa-user"></i>
                </div>
                <div class="sbt-archive-card-title">
                    ${name}
                    ${isProtagonist ? '<i class="fa-solid fa-crown" style="color: var(--sbt-warning-color);" title="主角"></i>' : ''}
                </div>
                <div class="sbt-archive-card-subtitle">
                    ${subtitle}
                </div>
            </div>
        `;
        container.append(cardHtml);
    }
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

        const itemHtml = `
            <div class="sbt-archive-item sbt-worldview-card" data-item-id="${id}" data-category="${categoryKey}">
                <div class="sbt-worldview-card-content">
                    <div class="sbt-archive-item-title">${item.name || id}</div>
                    <div class="sbt-archive-item-desc">${descText}</div>
                </div>
                <div class="sbt-worldview-card-actions">
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
 * @description 渲染世界档案面板 - 故事线
 * @param {object} storylineData - 故事线数据对象
 * @param {JQuery<HTMLElement>} container - 渲染的目标容器
 */
function renderArchiveStorylines(storylineData, container) {
    if (!container || container.length === 0) return;

    container.empty();

    if (!storylineData || Object.keys(storylineData).length === 0) {
        container.html('<p class="sbt-instructions">暂无相关故事线。</p>');
        return;
    }

    for (const id in storylineData) {
        const line = storylineData[id];

        // 【修复】优先使用动态状态，回退到静态
        const status = line.current_status || line.status || 'dormant';
        const statusText = status === 'active' ? '进行中' : status === 'completed' ? '已完成' : '休眠';

        // 【修复】优先显示当前进展摘要，回退到基础摘要
        let descText = '暂无描述';
        const desc = line.current_summary || line.summary || line.description;
        if (desc) {
            descText = typeof desc === 'string' ? desc : JSON.stringify(desc);
        }

        // 【新增】显示历史记录
        let historyHtml = '';
        if (line.history && Array.isArray(line.history) && line.history.length > 0) {
            historyHtml = '<div class="sbt-storyline-history"><div class="sbt-storyline-history-title">📜 历史变化记录</div>';
            line.history.slice(-3).reverse().forEach(entry => {  // 只显示最近3条，倒序
                const timestamp = entry.timestamp || '未知时间';
                const update = entry.summary_update || entry.status_change || '无更新';
                historyHtml += `<div class="sbt-storyline-history-entry"><span class="sbt-storyline-timestamp">${timestamp}</span>: ${update}</div>`;
            });
            historyHtml += '</div>';
        }

        const itemHtml = `<div class="sbt-archive-item"><div class="sbt-archive-item-title">${line.title || id}<span class="sbt-archive-status ${status}">${statusText}</span></div><div class="sbt-archive-item-desc">${descText}</div>${line.type ? `<div class="sbt-archive-item-meta">类型: ${line.type}</div>` : ''}${historyHtml}</div>`;
        container.append(itemHtml);
    }
}

/**
 * @description [V3.0] 渲染关系图谱
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
            <div class="${cardClass}" data-edge-id="${edge.id}">
                <div class="sbt-relationship-edge-header">
                    <div class="sbt-relationship-participants">
                        <i class="fa-solid fa-heart"></i>
                        <span>${participant1}</span>
                        <i class="fa-solid fa-arrows-left-right" style="opacity: 0.5; font-size: 0.8em;"></i>
                        <span>${participant2}</span>
                    </div>
                    <div class="sbt-relationship-indicators">
                        ${timelineStatusHtml}
                        <span class="sbt-relationship-type-badge">${typeText}</span>
                    </div>
                </div>
                <div class="sbt-relationship-edge-details" id="edge-details-${index}">
                    <div class="sbt-relationship-detail-row">
                        <div class="sbt-relationship-detail-label">情感权重</div>
                        <div class="sbt-relationship-detail-value">
                            <div class="sbt-emotional-weight-bar">
                                <div class="sbt-emotional-weight-track">
                                    <div class="sbt-emotional-weight-fill ${weightClass}" style="width: ${weight * 10}%;"></div>
                                </div>
                                <span class="sbt-emotional-weight-value">${weight}/10</span>
                            </div>
                        </div>
                    </div>
                    <div class="sbt-relationship-detail-row">
                        <div class="sbt-relationship-detail-label">建立时间</div>
                        <div class="sbt-relationship-detail-value">${edge.timeline?.established || '未知'}</div>
                    </div>
                    <div class="sbt-relationship-detail-row">
                        <div class="sbt-relationship-detail-label">分离时长</div>
                        <div class="sbt-relationship-detail-value">${separationText}</div>
                    </div>
                    <div class="sbt-relationship-detail-row">
                        <div class="sbt-relationship-detail-label">最后互动</div>
                        <div class="sbt-relationship-detail-value">${edge.timeline?.last_interaction || '故事开始前'}</div>
                    </div>
                    ${tensions.length > 0 ? `
                    <div class="sbt-relationship-detail-row">
                        <div class="sbt-relationship-detail-label">未解张力</div>
                        <div class="sbt-relationship-detail-value">${tensionsHtml}</div>
                    </div>
                    ` : ''}
                    ${events.length > 0 ? `
                    <div class="sbt-relationship-detail-row">
                        <div class="sbt-relationship-detail-label">重大事件</div>
                        <div class="sbt-relationship-detail-value">${eventsHtml}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        container.append(cardHtml);
    });

    // 添加点击展开/折叠功能
    container.on('click', '.sbt-relationship-edge-header', function() {
        const card = $(this).closest('.sbt-relationship-edge-card');
        const details = card.find('.sbt-relationship-edge-details');
        details.toggleClass('expanded');
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

    renderArchiveStorylines(
        mergeStorylineData('main_quests'),
        $('#sbt-archive-main-quests')
    );

    renderArchiveStorylines(
        mergeStorylineData('side_quests'),
        $('#sbt-archive-side-quests')
    );

    renderArchiveStorylines(
        mergeStorylineData('relationship_arcs'),
        $('#sbt-archive-relationship-arcs')
    );

    renderArchiveStorylines(
        mergeStorylineData('personal_arcs'),
        $('#sbt-archive-personal-arcs')
    );
}

/**更新整个仪表盘UI，现在传递整个 Chapter 对象 */
/**
 * @description [V2.0] 渲染故事大纲 - 宏观叙事弧光列表
 * @param {object} chapterState - 章节状态对象
 */
function renderNarrativeArcs(chapterState) {
    console.group('[RENDERER-V2-PROBE] 故事大纲渲染流程');

    const container = $('#sbt-arc-list');
    if (!container || container.length === 0) {
        console.warn('⚠️ 故事大纲容器未找到');
        console.groupEnd();
        return;
    }

    const activeArcs = chapterState?.meta?.active_narrative_arcs || [];
    console.log(`检测到 ${activeArcs.length} 条活跃弧光`);

    if (activeArcs.length === 0) {
        container.html('<p class="sbt-instructions">当前没有活跃的叙事弧光。</p>');
        console.groupEnd();
        return;
    }

    let html = '';
    activeArcs.forEach((arc, index) => {
        const arcTitle = arc.title || '未命名弧光';
        const arcId = arc.arc_id || `arc_${index}`;
        const currentStage = arc.current_stage || 'unknown';
        const stageDescription = arc.stage_description || '暂无描述';
        const longTermGoal = arc.long_term_goal || '暂无目标';
        const createdAt = arc.created_at ? new Date(arc.created_at).toLocaleDateString('zh-CN') : '未知';
        const lastUpdated = arc.last_updated ? new Date(arc.last_updated).toLocaleDateString('zh-CN') : '未知';

        html += `
            <div class="sbt-arc-card" data-arc-id="${arcId}">
                <div class="sbt-arc-header">
                    <h6 class="sbt-arc-title">
                        <i class="fa-solid fa-book fa-fw"></i> ${arcTitle}
                    </h6>
                    <div class="sbt-arc-actions">
                        <button class="sbt-icon-btn sbt-edit-arc-btn" data-arc-id="${arcId}" title="编辑弧光">
                            <i class="fa-solid fa-edit fa-fw"></i>
                        </button>
                        <button class="sbt-icon-btn sbt-delete-arc-btn" data-arc-id="${arcId}" title="删除弧光">
                            <i class="fa-solid fa-trash fa-fw"></i>
                        </button>
                    </div>
                </div>
                <div class="sbt-arc-body">
                    <div class="sbt-arc-field">
                        <strong><i class="fa-solid fa-bullseye fa-fw"></i> 长期目标:</strong>
                        <p>${longTermGoal}</p>
                    </div>
                    <div class="sbt-arc-field">
                        <strong><i class="fa-solid fa-map-signs fa-fw"></i> 当前阶段:</strong>
                        <p><span class="sbt-arc-stage-badge">${currentStage}</span></p>
                    </div>
                    <div class="sbt-arc-field">
                        <strong><i class="fa-solid fa-info-circle fa-fw"></i> 阶段描述:</strong>
                        <p>${stageDescription}</p>
                    </div>
                    <div class="sbt-arc-meta">
                        <span class="sbt-meta-item"><i class="fa-solid fa-calendar-plus fa-fw"></i> 创建: ${createdAt}</span>
                        <span class="sbt-meta-item"><i class="fa-solid fa-clock fa-fw"></i> 更新: ${lastUpdated}</span>
                    </div>
                </div>
            </div>
        `;
    });

    container.html(html);
    console.log('✓ 故事大纲渲染完成');
    console.groupEnd();
}

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

            // 节拍描述
            if (beat.description) {
                html += `<div class="sbt-beat-description" contenteditable="true" data-beat-index="${index}" data-field="description">${beat.description}</div>`;
            }

            // 对话场景的退出条件
            if (beatType === 'Dialogue Scene' && beat.exit_condition) {
                html += `<div class="sbt-beat-exit-condition">
                    <i class="fa-solid fa-door-open"></i>
                    <span>退出条件：</span>
                    <span contenteditable="true" data-beat-index="${index}" data-field="exit_condition">${beat.exit_condition}</span>
                </div>`;
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
    if (blueprint.endgame_beacons && Array.isArray(blueprint.endgame_beacons) && blueprint.endgame_beacons.length > 0) {
        html += '<div class="sbt-blueprint-section">';
        html += '<div class="sbt-blueprint-section-title sbt-collapsible">';
        html += '<i class="fa-solid fa-chevron-down sbt-collapse-icon"></i>';
        html += '<i class="fa-solid fa-flag-checkered"></i> 终章信标';
        html += `<span class="sbt-beat-count">${blueprint.endgame_beacons.length} 个信标</span>`;
        html += '</div>';
        html += '<div class="sbt-blueprint-section-content">';

        blueprint.endgame_beacons.forEach((beacon, index) => {
            html += `<div class="sbt-beacon-item">
                <i class="fa-solid fa-circle-dot"></i>
                <span contenteditable="true" data-beacon-index="${index}">${beacon}</span>
            </div>`;
        });

        html += '</div>'; // 结束section-content
        html += '</div>'; // 结束section
    }

    // === 导演简报 (如果存在) ===
    if (blueprint.director_brief) {
        html += '<div class="sbt-blueprint-section">';
        html += '<div class="sbt-blueprint-section-title sbt-collapsible">';
        html += '<i class="fa-solid fa-chevron-down sbt-collapse-icon"></i>';
        html += '<i class="fa-solid fa-bullhorn"></i> 导演简报';
        html += '</div>';
        html += '<div class="sbt-blueprint-section-content">';
        html += `<div class="sbt-blueprint-field-value" contenteditable="true" data-field="director_brief">${blueprint.director_brief}</div>`;
        html += '</div>'; // 结束section-content
        html += '</div>'; // 结束section
    }

    return html;
}

export function updateDashboard(chapterState) {
    if (!chapterState || $('#beat-tracker-component-wrapper').length === 0) return;

    // --- 1. 【V3.6 革新】渲染双轨制故事摘要（编年史+衔接点） ---
    const summaryContainer = $('#sbt-story-summary-content');
    if(summaryContainer.length > 0) {
        const longTermSummary = chapterState.meta?.longTermStorySummary || chapterState.longTermStorySummary || "暂无故事摘要。";
        const handoffMemo = chapterState.meta?.lastChapterHandoff;

        let html = '';

        // 第一部分：编年史家视角（概要）
        html += '<div class="sbt-summary-section">';
        html += '<div class="sbt-summary-section-title">';
        html += '<i class="fa-solid fa-book"></i> 故事梗概';
        html += '</div>';
        html += `<div class="sbt-summary-content">${longTermSummary}</div>`;
        html += '</div>';

        // 第二部分：章节交接备忘录（衔接点）
        if (handoffMemo && typeof handoffMemo === 'object') {
            html += '<div class="sbt-summary-section sbt-handoff-section">';
            html += '<div class="sbt-summary-section-title">';
            html += '<i class="fa-solid fa-link"></i> 章节衔接点';
            html += '<span class="sbt-handoff-badge">关键</span>';
            html += '</div>';

            // 结束快照
            if (handoffMemo.ending_snapshot) {
                html += '<div class="sbt-handoff-block">';
                html += '<div class="sbt-handoff-block-title"><i class="fa-solid fa-camera"></i> 结束快照</div>';
                html += `<div class="sbt-handoff-content">${handoffMemo.ending_snapshot}</div>`;
                html += '</div>';
            }

            // 动作交接
            if (handoffMemo.action_handoff) {
                html += '<div class="sbt-handoff-block">';
                html += '<div class="sbt-handoff-block-title"><i class="fa-solid fa-arrow-right"></i> 下章起点</div>';
                html += `<div class="sbt-handoff-content sbt-action-handoff">${handoffMemo.action_handoff}</div>`;
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

    // --- 3. 【革新】渲染全新的“自省式”设计笔记 ---
    const notesContainer = $('#sbt-design-notes-content');
    if (notesContainer.length > 0) {
        const notes = chapterState.activeChapterDesignNotes;
        if (notes && typeof notes === 'object') {
            // 内部函数，用于安全地渲染报告的每个条目
            const renderScrutinyItem = (report, key, title) => {
                if (report && report[key]) {
                    return `
                        <p style="margin-top: 10px; margin-bottom: 5px;"><strong>${title}:</strong></p>
                        <p style="margin-top: 0; margin-bottom: 15px; padding-left: 10px; border-left: 2px solid var(--sbt-border-color); font-style: italic;">${report[key]}</p>
                    `;
                }
                return '';
            };

            const report = notes.self_scrutiny_report || {};
            const notesHtml = `
                <strong><i class="fa-solid fa-diagram-project fa-fw"></i> 故事线编织:</strong>
                <p style="margin-top: 5px; margin-bottom: 15px; padding-left: 10px; border-left: 2px solid var(--sbt-border-color);">${notes.storyline_weaving || '未阐述'}</p>
                
                <strong><i class="fa-solid fa-link fa-fw"></i> 承上启下与钩子:</strong>
                <p style="margin-top: 5px; margin-bottom: 15px; padding-left: 10px; border-left: 2px solid var(--sbt-border-color);">${notes.connection_and_hook || '未阐述'}</p>
                <strong><i class="fa-solid fa-link fa-fw"></i> 导演高光设计思路:</strong>
                <p style="margin-top: 5px; margin-bottom: 15px; padding-left: 10px; border-left: 2px solid var(--sbt-border-color);">${notes.highlight_design_rationale || '未阐述'}</p>

                <hr style="margin: 20px 0; border-color: var(--sbt-border-color);">

                <h6 style="font-size: 1.1em; margin-bottom: 15px; color: var(--sbt-primary-accent);"><i class="fa-solid fa-magnifying-glass-chart fa-fw"></i> AI自我审查报告</h6>
                ${renderScrutinyItem(report, 'avoiding_thematic_greed', '1. 关于“主题贪婪”')}
                ${renderScrutinyItem(report, 'avoiding_setting_driven_performance', '2. 关于“设定驱动”')}
                ${renderScrutinyItem(report, 'avoiding_storyline_overload', '3. 关于“叙事线过载”')}
                ${renderScrutinyItem(report, 'avoiding_premature_suspense', '4. 关于“悬念前置”')}
            `;
            notesContainer.html(notesHtml);
        } else {
            notesContainer.html('<p class="sbt-instructions">当前章节没有可用的设计笔记。</p>');
        }
    }

    // --- V2.0: 渲染故事大纲 (宏观叙事弧光) ---
    renderNarrativeArcs(chapterState);

    // --- V4.0: 渲染叙事控制塔 ---
    renderNarrativeControlTower(chapterState);

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

/**
 * V4.0 渲染叙事控制塔
 */
function renderNarrativeControlTower(chapterState) {
    const tower = chapterState?.meta?.narrative_control_tower;
    if (!tower) return;

    // === 1. 渲染节奏指令 ===
    const directiveContainer = $('#sbt-rhythm-directive-content');
    if (directiveContainer.length > 0) {
        const directive = tower.rhythm_directive;
        let html = '';

        // 强制约束
        if (directive.mandatory_constraints && directive.mandatory_constraints.length > 0) {
            html += '<div class="sbt-rhythm-constraint">';
            html += '<div class="sbt-rhythm-label"><i class="fa-solid fa-ban"></i> 强制约束</div>';
            directive.mandatory_constraints.forEach(c => {
                const label = c === 'cooldown_required' ? '强制冷却' :
                              c === 'spotlight_forbidden' ? '禁用聚光灯' : c;
                html += `<span class="sbt-constraint-badge">${label}</span>`;
            });
            html += '</div>';
        }

        // 建议章节类型
        html += '<div class="sbt-rhythm-field">';
        html += '<span class="sbt-rhythm-label"><i class="fa-solid fa-theater-masks"></i> 建议类型:</span>';
        html += `<span class="sbt-rhythm-value">${directive.suggested_chapter_type || 'Scene'}</span>`;
        html += '</div>';

        // 强度范围
        html += '<div class="sbt-rhythm-field">';
        html += '<span class="sbt-rhythm-label"><i class="fa-solid fa-heart-pulse"></i> 强度范围:</span>';
        html += `<span class="sbt-rhythm-value">${directive.intensity_range?.min || 1} ~ ${directive.intensity_range?.max || 10}</span>`;
        html += '</div>';

        // 即将触发的阈值
        if (directive.impending_thresholds && directive.impending_thresholds.length > 0) {
            html += '<div class="sbt-rhythm-threshold">';
            html += '<div class="sbt-rhythm-label"><i class="fa-solid fa-triangle-exclamation"></i> 阈值预警</div>';
            directive.impending_thresholds.forEach(t => {
                html += `<div class="sbt-threshold-item">${t.storyline_id}: ${t.threshold} (${t.progress}% → ${t.trigger_at}%)</div>`;
            });
            html += '</div>';
        }

        // 节奏错位机会
        if (directive.rhythm_dissonance_opportunities && directive.rhythm_dissonance_opportunities.length > 0) {
            html += '<div class="sbt-rhythm-opportunity">';
            html += '<div class="sbt-rhythm-label"><i class="fa-solid fa-lightbulb"></i> 错位机会</div>';
            directive.rhythm_dissonance_opportunities.forEach(opp => {
                html += `<div class="sbt-opportunity-item">${opp.description}</div>`;
            });
            html += '</div>';
        }

        if (!html) {
            html = '<p class="sbt-instructions">当前无特殊节奏约束</p>';
        }

        directiveContainer.html(html);
    }

    // === 2. 渲染故事线进度 ===
    const progressContainer = $('#sbt-storyline-progress-content');
    if (progressContainer.length > 0) {
        const storylines = tower.storyline_progress;
        const entries = Object.entries(storylines || {});

        if (entries.length === 0) {
            progressContainer.html('<p class="sbt-instructions">暂无活跃故事线</p>');
        } else {
            let html = '';
            entries.forEach(([id, data]) => {
                const progress = data.current_progress || 0;
                const stage = data.current_stage || 'unknown';
                const hue = mapValueToHue(progress, 0, 100);

                html += '<div class="sbt-storyline-progress-item">';
                html += `<div class="sbt-progress-header">`;
                html += `<span class="sbt-progress-title">${id}</span>`;
                html += `<span class="sbt-progress-percent">${progress}%</span>`;
                html += `</div>`;
                html += `<div class="sbt-progress-bar-wrapper">`;
                html += `<div class="sbt-progress-bar" style="width: ${progress}%; background-color: hsl(${hue}, 70%, 50%);"></div>`;
                html += `</div>`;
                html += `<div class="sbt-progress-meta">`;
                html += `<span class="sbt-progress-stage">阶段: ${stage}</span>`;
                if (data.last_increment) {
                    html += `<span class="sbt-progress-delta">上章: +${data.last_increment}%</span>`;
                }
                html += `</div>`;
                html += '</div>';
            });
            progressContainer.html(html);
        }
    }

    // === 3. 渲染情感强度曲线 ===
    const curveContainer = $('#sbt-intensity-curve-content');
    if (curveContainer.length > 0) {
        const intensity = tower.recent_chapters_intensity || [];

        if (intensity.length === 0) {
            curveContainer.html('<p class="sbt-instructions">暂无章节数据</p>');
        } else {
            let html = '<div class="sbt-intensity-chart">';

            intensity.forEach((chapter, index) => {
                const value = chapter.emotional_intensity || 5;
                const type = chapter.chapter_type || 'Scene';
                const hue = mapValueToHue(value, 1, 10);
                const height = (value / 10) * 100;

                html += '<div class="sbt-intensity-bar-wrapper">';
                html += `<div class="sbt-intensity-bar" style="height: ${height}%; background-color: hsl(${hue}, 70%, 50%);" title="${type}: ${value}/10"></div>`;
                html += `<div class="sbt-intensity-label">${index + 1}</div>`;
                html += '</div>';
            });

            html += '</div>';

            // 上一章信息
            if (tower.last_chapter_rhythm) {
                const last = tower.last_chapter_rhythm;
                html += '<div class="sbt-last-rhythm">';
                html += `<div class="sbt-last-rhythm-item">上章类型: <strong>${last.chapter_type}</strong></div>`;
                html += `<div class="sbt-last-rhythm-item">情感强度: <strong>${last.emotional_intensity}/10</strong></div>`;
                if (last.requires_cooldown) {
                    html += `<div class="sbt-last-rhythm-item sbt-cooldown-required">`;
                    html += `<i class="fa-solid fa-snowflake"></i> 需要冷却`;
                    html += `</div>`;
                }
                html += '</div>';
            }

            curveContainer.html(html);
        }
    }
}

// 导出模态框函数，供外部使用
export { showCharacterDetailModal, showCharacterDetailPopup, showWorldviewDetailModal };