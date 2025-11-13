// ui/renderers.js
import { mapValueToHue } from '../utils/colorUtils.js';


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

    const protagonistId = Object.keys(matrix).find(id => matrix[id]?.isProtagonist);
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
        const staticRel = matrix[charId]?.relationships?.[protagonistId];
        const dynamicRel = chapterState.dynamicState.characters?.[charId]?.relationships?.[protagonistId];
        const newAffinity = parseInt(dynamicRel?.current_affinity ?? staticRel?.affinity ?? 0, 10);
        const cardSummaryText = staticRel?.description || "关系尚未建立";
        const historyLog = dynamicRel?.history || [];
        const tooltipText = historyLog.length > 0
            ? historyLog.map(entry => `(好感 ${entry.change || 'N/A'}) ${entry.reasoning}`).join('\n---\n')
            : "暂无详细互动记录。";

        const cardHtml = `
             <div class="sbt-character-card sbt-clickable" data-char-id="${charId}" title="好感度变更历史：\n${tooltipText}">
                <h6>${matrix[charId].name || charId}</h6>
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
        container.html('<p class="sbt-instructions">暂无角色档案。</p>');
        return;
    }

    for (const charId in characters) {
        const char = characters[charId];

        const cardHtml = `
            <div class="sbt-archive-card" data-char-id="${charId}">
                <div class="sbt-archive-card-icon">
                    <i class="fa-solid fa-user"></i>
                </div>
                <div class="sbt-archive-card-title">
                    ${char.name || charId}
                    ${char.isProtagonist ? '<i class="fa-solid fa-crown" style="color: var(--sbt-warning-color);" title="主角"></i>' : ''}
                </div>
                <div class="sbt-archive-card-subtitle">
                    ${char.identity || '未知身份'}
                </div>
            </div>
        `;
        container.append(cardHtml);
    }
}

/**
 * @description 显示角色详情面板（内嵌展开式）
 * @param {string} charId - 角色ID
 * @param {object} chapterState - 完整的Chapter对象
 */
function showCharacterDetailModal(charId, chapterState) {
    const char = chapterState.staticMatrices.characters[charId];
    if (!char) return;

    // 优雅地处理性格字段
    const formatPersonality = (personality) => {
        if (!personality) return '暂无信息';

        if (typeof personality === 'string') {
            return personality;
        }

        if (typeof personality === 'object') {
            let result = '';

            // 处理traits数组
            if (personality.traits && Array.isArray(personality.traits)) {
                result += '<div style="margin-bottom: 10px;"><strong>性格特质：</strong></div>';
                result += '<ul style="margin: 5px 0; padding-left: 20px;">';
                personality.traits.forEach(trait => {
                    result += `<li>${trait}</li>`;
                });
                result += '</ul>';
            }

            // 处理description
            if (personality.description) {
                if (personality.traits) result += '<div style="margin-top: 15px;"></div>';
                result += `<div>${personality.description}</div>`;
            }

            return result || JSON.stringify(personality, null, 2);
        }

        return '暂无信息';
    };

    // 优雅地处理背景故事
    const formatBackground = (background) => {
        if (!background) return '暂无信息';

        if (typeof background === 'string') {
            return background;
        }

        if (typeof background === 'object') {
            let result = '';

            if (background.summary) {
                result += `<div>${background.summary}</div>`;
            }

            return result || JSON.stringify(background, null, 2);
        }

        return '暂无信息';
    };

    // 通用安全文本处理
    const safeText = (value) => {
        if (!value) return '暂无信息';
        return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    };

    // 构建关系网络
    const isProtagonist = char.isProtagonist === true;
    let relationshipsHtml = '';
    let relationshipSectionTitle = '关系网络';

    if (isProtagonist) {
        // 主角：显示其他角色对主角的好感度（反向查询）
        relationshipSectionTitle = '角色关系图谱';
        relationshipsHtml = '<div class="sbt-protagonist-relationship-notice">以下是其他角色对主角的看法和好感度</div>';
        relationshipsHtml += '<div class="sbt-character-relationship-grid sbt-protagonist-grid">';

        const allCharacters = chapterState.staticMatrices.characters;
        let hasRelationships = false;

        for (const otherCharId in allCharacters) {
            if (otherCharId === charId) continue; // 跳过主角自己

            const otherChar = allCharacters[otherCharId];

            // 查找该角色对主角的关系
            const staticRel = otherChar.relationships?.[charId];
            const dynamicRel = chapterState.dynamicState.characters?.[otherCharId]?.relationships?.[charId];

            if (staticRel || dynamicRel) {
                hasRelationships = true;
                const affinity = parseInt(dynamicRel?.current_affinity ?? staticRel?.affinity ?? 50, 10);
                const relationType = staticRel?.relation_type || staticRel?.description || '未知关系';
                const affinityColor = mapValueToHue(affinity);

                relationshipsHtml += `
                    <div class="sbt-character-relationship-card">
                        <div class="sbt-character-relationship-name">${otherChar?.name || otherCharId}</div>
                        <div class="sbt-character-relationship-type">${safeText(relationType)}</div>
                        <div class="sbt-character-relationship-affinity">对主角好感: ${affinity}</div>
                        <div class="sbt-character-relationship-affinity-bar">
                            <div class="sbt-character-relationship-affinity-fill" style="width: ${affinity}%; background-color: ${affinityColor};"></div>
                        </div>
                    </div>
                `;
            }
        }

        relationshipsHtml += '</div>';

        if (!hasRelationships) {
            relationshipsHtml = '<p style="color: var(--sbt-text-medium); margin: 0;">暂无其他角色对主角的关系记录</p>';
        }

    } else {
        // 非主角：显示该角色对其他人的好感度
        if (char.relationships && Object.keys(char.relationships).length > 0) {
            relationshipsHtml = '<div class="sbt-character-relationship-grid">';

            for (const targetCharId in char.relationships) {
                const targetChar = chapterState.staticMatrices.characters[targetCharId];
                const staticRel = char.relationships[targetCharId];
                const dynamicRel = chapterState.dynamicState.characters?.[charId]?.relationships?.[targetCharId];

                const affinity = parseInt(dynamicRel?.current_affinity ?? staticRel?.affinity ?? 50, 10);
                const relationType = staticRel?.relation_type || staticRel?.description || '未知关系';
                const affinityColor = mapValueToHue(affinity);

                relationshipsHtml += `
                    <div class="sbt-character-relationship-card">
                        <div class="sbt-character-relationship-name">${targetChar?.name || targetCharId}</div>
                        <div class="sbt-character-relationship-type">${safeText(relationType)}</div>
                        <div class="sbt-character-relationship-affinity">好感度: ${affinity}</div>
                        <div class="sbt-character-relationship-affinity-bar">
                            <div class="sbt-character-relationship-affinity-fill" style="width: ${affinity}%; background-color: ${affinityColor};"></div>
                        </div>
                    </div>
                `;
            }
            relationshipsHtml += '</div>';
        } else {
            relationshipsHtml = '<p style="color: var(--sbt-text-medium); margin: 0;">暂无关系记录</p>';
        }
    }

    const detailHtml = `
        <div class="sbt-character-detail-header">
            <div class="sbt-character-detail-name">
                <i class="fa-solid fa-user"></i>
                ${char.name || charId}
                ${char.isProtagonist ? '<i class="fa-solid fa-crown" style="color: var(--sbt-warning-color);" title="主角"></i>' : ''}
            </div>
            <div class="sbt-character-detail-identity">${char.identity || '未知身份'}</div>
        </div>

        <div class="sbt-character-detail-section">
            <div class="sbt-character-detail-section-title">
                <i class="fa-solid fa-brain"></i>
                核心性格
            </div>
            <div class="sbt-character-detail-section-content">${formatPersonality(char.personality)}</div>
        </div>

        <div class="sbt-character-detail-section">
            <div class="sbt-character-detail-section-title">
                <i class="fa-solid fa-book"></i>
                背景故事
            </div>
            <div class="sbt-character-detail-section-content">${formatBackground(char.background)}</div>
        </div>

        <div class="sbt-character-detail-section ${isProtagonist ? 'sbt-protagonist-relationship-section' : ''}">
            <div class="sbt-character-detail-section-title">
                <i class="fa-solid fa-users"></i>
                ${relationshipSectionTitle}
            </div>
            ${relationshipsHtml}
        </div>

        ${char.goals ? `
            <div class="sbt-character-detail-section">
                <div class="sbt-character-detail-section-title">
                    <i class="fa-solid fa-bullseye"></i>
                    目标与动机
                </div>
                <div class="sbt-character-detail-section-content">${safeText(char.goals)}</div>
            </div>
        ` : ''}

        ${char.secrets ? `
            <div class="sbt-character-detail-section">
                <div class="sbt-character-detail-section-title">
                    <i class="fa-solid fa-key"></i>
                    秘密与隐藏信息
                </div>
                <div class="sbt-character-detail-section-content">${safeText(char.secrets)}</div>
            </div>
        ` : ''}
    `;

    // 渲染到内嵌面板并显示
    const $panel = $('#sbt-character-detail-panel');
    const $content = $('#sbt-character-detail-content');

    $content.html(detailHtml);
    $panel.show();

    // 滚动到详情面板
    $panel[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * @description 渲染世界档案面板 - 世界观元素
 * @param {object} worldviewData - 世界观数据对象
 * @param {string} category - 类别名称
 * @param {JQuery<HTMLElement>} container - 渲染的目标容器
 */
function renderArchiveWorldview(worldviewData, category, container) {
    if (!container || container.length === 0) return;

    container.empty();

    if (!worldviewData || Object.keys(worldviewData).length === 0) {
        container.html(`<p class="sbt-instructions">暂无${category}记录。</p>`);
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
            <div class="sbt-archive-item">
                <div class="sbt-archive-item-title">${item.name || id}</div>
                <div class="sbt-archive-item-desc">${descText}</div>
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
        const status = line.status || 'dormant';
        const statusText = status === 'active' ? '进行中' : status === 'completed' ? '已完成' : '休眠';

        // 安全地获取描述文本
        let descText = '暂无描述';
        const desc = line.summary || line.description;
        if (desc) {
            descText = typeof desc === 'string' ? desc : JSON.stringify(desc);
        }

        const itemHtml = `
            <div class="sbt-archive-item">
                <div class="sbt-archive-item-title">
                    ${line.title || id}
                    <span class="sbt-archive-status ${status}">${statusText}</span>
                </div>
                <div class="sbt-archive-item-desc">${descText}</div>
                ${line.type ? `<div class="sbt-archive-item-meta">类型: ${line.type}</div>` : ''}
            </div>
        `;
        container.append(itemHtml);
    }
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

    // 渲染世界观元素
    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.locations,
        '地点',
        $('#sbt-archive-locations')
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.items,
        '物品',
        $('#sbt-archive-items')
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.factions,
        '势力',
        $('#sbt-archive-factions')
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.concepts,
        '概念',
        $('#sbt-archive-concepts')
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.events,
        '历史事件',
        $('#sbt-archive-events')
    );

    renderArchiveWorldview(
        chapterState.staticMatrices.worldview.races,
        '种族',
        $('#sbt-archive-races')
    );

    // 渲染故事线
    renderArchiveStorylines(
        chapterState.staticMatrices.storylines.main_quests,
        $('#sbt-archive-main-quests')
    );

    renderArchiveStorylines(
        chapterState.staticMatrices.storylines.side_quests,
        $('#sbt-archive-side-quests')
    );

    renderArchiveStorylines(
        chapterState.staticMatrices.storylines.relationship_arcs,
        $('#sbt-archive-relationship-arcs')
    );

    renderArchiveStorylines(
        chapterState.staticMatrices.storylines.personal_arcs,
        $('#sbt-archive-personal-arcs')
    );
}

/**更新整个仪表盘UI，现在传递整个 Chapter 对象 */
export function updateDashboard(chapterState) {
    if (!chapterState || $('#beat-tracker-component-wrapper').length === 0) return;

    // --- 1. 渲染故事摘要 (不变) ---
    const summaryContainer = $('#sbt-story-summary-content'); 
    if(summaryContainer.length > 0) {
        summaryContainer.text(chapterState.longTermStorySummary || "暂无故事摘要。");
    }

    // --- 2. 【革新】渲染全新的“创作蓝图”对象 ---
    const scriptContainer = $('#sbt-active-script-content'); 
    if(scriptContainer.length > 0) {
        if (chapterState.chapter_blueprint && typeof chapterState.chapter_blueprint === 'object') {
            // 使用 JSON.stringify 将对象格式化为带缩进的字符串，并放入 <pre><code> 标签中
            const blueprintString = JSON.stringify(chapterState.chapter_blueprint, null, 2);
            scriptContainer.html(`<pre><code>${blueprintString}</code></pre>`);
        } else {
            scriptContainer.html('<p class="sbt-instructions">当前没有激活的创作蓝图。</p>');
        }
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

    // --- 4. 渲染角色关系图谱 ---
    const relationshipContainer = $('#sbt-character-chart');
    if (relationshipContainer.length > 0) {
        renderCharacterRelationships(chapterState, relationshipContainer);
    }

    // --- 5. 渲染故事线网络 ---
    const allStorylines = {
        ...(chapterState.staticMatrices.storylines.main_quests || {}),
        ...(chapterState.staticMatrices.storylines.side_quests || {}),
        ...(chapterState.staticMatrices.storylines.relationship_arcs || {}),
        ...(chapterState.staticMatrices.storylines.personal_arcs || {})
    };
    renderLineMatrix(allStorylines, $('#sbt-line-matrix-list'));

    // --- 6. 更新世界档案面板 ---
    updateArchivePanel(chapterState);
}/**
 * [新增] 渲染并显示角色详情的弹窗。
 * @param {string} charId - 要显示详情的角色ID。
 * @param {Chapter} chapterState - 完整的Chapter对象。
 */
function showCharacterDetailPopup(charId, chapterState) {
    const characterData = chapterState.staticMatrices.characters[charId];
    if (!characterData) return;

    // --- 准备数据 ---
    const staticRelationships = characterData.relationships || {};

    // --- 构建HTML ---
    let relationshipsHtml = '<div class="sbt-popup-subtitle">关系网络</div>';
    const allChars = chapterState.staticMatrices.characters;

    for (const targetCharId in allChars) {
        if (targetCharId === charId) continue; // 不显示对自己

        // 优先显示动态更新后的关系，如果不存在，则显示静态初始关系
        const dynamicRel = chapterState.dynamicState.characters?.[charId]?.relationships?.[targetCharId];
        const staticRel = staticRelationships[targetCharId];

        // 优先使用动态数据
        const currentAffinity = dynamicRel?.current_affinity ?? staticRel?.affinity;
        const affinity = currentAffinity ?? '??';
        const reputation = staticRel?.relation_type || staticRel?.description || '关系未建立';

        relationshipsHtml += `
            <div class="sbt-popup-relation-item">
                <span>对 <strong>${allChars[targetCharId]?.name || targetCharId}</strong> 的看法:</span>
                <span class="sbt-popup-relation-value">${reputation} (好感: ${affinity})</span>
            </div>
        `;
    }
    if (Object.keys(allChars).length <= 1) {
        relationshipsHtml += '<p>暂无其他角色可建立关系。</p>';
    }

    const modalHtml = `
        <div id="sbt-character-detail-popup">
            <div class="sbt-popup-header">
                <h4>角色档案: ${characterData.name || charId}</h4>
                <p>${characterData.identity || '未知身份'}</p>
            </div>
            <div class="sbt-popup-content">
                <div class="sbt-popup-section">
                    <div class="sbt-popup-subtitle">核心性格</div>
                    <p>${characterData.personality || '暂无性格描述'}</p>
                </div>
                <div class="sbt-popup-section">
                    <div class="sbt-popup-subtitle">背景故事</div>
                    <p>${characterData.background || '暂无背景故事'}</p>
                </div>
                <div class="sbt-popup-section">${relationshipsHtml}</div>
            </div>
        </div>
    `;

    // 使用 SillyTavern 的 callGenericPopup 显示
    applicationFunctionManager.callGenericPopup(modalHtml, 'html', null, { wide: true, fullscreen: false });
}

// 导出新的角色详情弹窗函数，供外部使用
export { showCharacterDetailModal };