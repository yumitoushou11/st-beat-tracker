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
    if (!container || container.length === 0) return;
    container.empty();

    const matrix = chapterState.staticMatrices.characterMatrix;

    if (!matrix || Object.keys(matrix).length <= 1) {
        container.html('<p class="sbt-instructions">暂无其他角色可显示。</p>');
        return;
    }

    const protagonistId = Object.keys(matrix).find(id => matrix[id]?.isProtagonist);
    if (!protagonistId) {
        container.html('<p class="sbt-instructions">错误：在角色档案中未找到主角。</p>');
        return;
    }
    
    const dynamicState = chapterState.calculateCurrentDynamicState();
    
    for (const charId in matrix) {
        if (matrix[charId].isProtagonist) continue;

        const dynamicRel = dynamicState.relationshipMatrix[charId]?.[protagonistId];
        const staticRel = matrix[charId]?.relationships?.[protagonistId];
        
        const relData = dynamicRel || staticRel || { affinity: 0, reputation: "关系尚未建立" };
        const newAffinity = parseInt(relData.affinity, 10) || 0;
        
        // 1. 用于“悬浮提示”的文本：优先使用最详细的 history，其次是 reputation。
        const tooltipText = relData.history || relData.reputation || "暂无详细互动记录。";
        
        // 2. 用于“卡片显示”的文本：只使用最简短的 reputation。
        const cardSummaryText = relData.reputation || "暂无状态描述";

        const cardHtml = `
             <div class="sbt-character-card sbt-clickable" data-char-id="${charId}" title="裁决详情：\n${tooltipText}">
                <h6>${charId}</h6>
                <p class="sbt-relationship-label sbt-affinity-label">好感度: ${newAffinity}</p>
                <div class="sbt-progress-bar">
                    <div class="sbt-progress-fill affinity"></div>
                    <span class="sbt-change-indicator"></span>
                </div>
                <p class="sbt-last-interaction-text">当前状态: ${cardSummaryText}</p>
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
}
/**
 * [V12.0] 更新整个仪表盘UI，现在传递整个 Chapter 对象
 */
export function updateDashboard(chapterState) {
    // 【【【 在这里添加探针 C 】】】
    console.groupCollapsed('🕵️‍♂️ [RENDER-PROBE-C] Data Received by updateDashboard');
    if (!chapterState) {
        console.warn("updateDashboard 接收到的 chapterState 为 null 或 undefined!");
    } else {
        console.log("接收到的 chapterState 对象快照:");
        console.dir(JSON.parse(JSON.stringify(chapterState)));
    }
    console.groupEnd();

    if (!chapterState || $('#beat-tracker-component-wrapper').length === 0) return;

    const summaryContainer = $('#sbt-story-summary-content'); 
    if(summaryContainer.length > 0) {
        summaryContainer.text(chapterState.longTermStorySummary || "暂无故事摘要。");
    }
    // 渲染当前激活的剧本
    const scriptContainer = $('#sbt-active-script-content'); 
    if(scriptContainer.length > 0) {
        // 使用 <pre> 标签来保留格式
        scriptContainer.html(`<pre><code>${chapterState.activeChapterScript || "当前没有激活的剧本。"}</code></pre>`);
    }

// 渲染建筑师设计笔记
const notesContainer = $('#sbt-design-notes-content');
if (notesContainer.length > 0) {
    const notes = chapterState.activeChapterDesignNotes;
    if (notes && typeof notes === 'object') {
        const notesHtml = `
            <strong><i class="fa-solid fa-bullseye fa-fw"></i> 核心概念与戏剧化:</strong>
            <p style="margin-top: 5px; margin-bottom: 15px; padding-left: 10px; border-left: 2px solid var(--sbt-border-color);">${notes.focus_dramatization || '未阐述'}</p>
            
            <strong><i class="fa-solid fa-bolt fa-fw"></i> 冲突与爽点设计:</strong>
            <p style="margin-top: 5px; margin-bottom: 15px; padding-left: 10px; border-left: 2px solid var(--sbt-border-color);">${notes.conflict_and_payoff || '未阐述'}</p>
            
            <strong><i class="fa-solid fa-link fa-fw"></i> 承上启下与钩子:</strong>
            <p style="margin-top: 5px; margin-bottom: 10px; padding-left: 10px; border-left: 2px solid var(--sbt-border-color);">${notes.connection_and_hook || '未阐述'}</p>
        `;
        notesContainer.html(notesHtml);
    } else {
        notesContainer.html('<p class="sbt-instructions">当前章节没有可用的设计笔记。</p>');
    }
}

    // 调用所有子渲染函数，传递完整的 chapterState
    renderCharacterRelationships(chapterState, $('#sbt-character-chart'));
    renderLineMatrix(chapterState.lineMatrix, $('#sbt-line-matrix-list'));
     renderCoreMemories(chapterState.staticMatrices.characterMatrix, $('#sbt-core-memories-list'));}
/**
 * [新增] 渲染并显示角色详情的弹窗。
 * @param {string} charId - 要显示详情的角色ID。
 * @param {Chapter} chapterState - 完整的Chapter对象。
 */
function showCharacterDetailPopup(charId, chapterState) {
    const characterData = chapterState.staticMatrices.characterMatrix[charId];
    if (!characterData) return;

    // --- 准备数据 ---
    // 1. 动态关系 (用于显示最新好感度)
    const dynamicState = chapterState.calculateCurrentDynamicState();
    
    // 2. 静态关系 (用于显示初始设定)
    const staticRelationships = characterData.relationships || {};

    // --- 构建HTML ---
    let relationshipsHtml = '<div class="sbt-popup-subtitle">关系网络</div>';
    const allChars = chapterState.staticMatrices.characterMatrix;

    for (const targetCharId in allChars) {
        if (targetCharId === charId) continue; // 不显示对自己
        
        // 优先显示动态更新后的关系，如果不存在，则显示静态初始关系
        const dynamicRel = dynamicState.relationshipMatrix[charId]?.[targetCharId];
        const staticRel = staticRelationships[targetCharId];
        
        const relData = dynamicRel || staticRel;
        const affinity = relData?.affinity ?? '??';
        const reputation = relData?.reputation ?? '关系未建立';

        relationshipsHtml += `
            <div class="sbt-popup-relation-item">
                <span>对 <strong>${targetCharId}</strong> 的看法:</span>
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
                <h4>角色档案: ${charId}</h4>
                <p>${characterData.personality.split(' | ')[0]} | ${characterData.appearance.split(' | ')[0]}岁</p>
            </div>
            <div class="sbt-popup-content">
                <div class="sbt-popup-section">
                    <div class="sbt-popup-subtitle">核心性格</div>
                    <p>${characterData.personality}</p>
                </div>
                <div class="sbt-popup-section">
                    <div class="sbt-popup-subtitle">背景故事</div>
                    <ul>
                        ${(characterData.background || []).map(b => `<li>${b}</li>`).join('')}
                    </ul>
                </div>
                <div class="sbt-popup-section">${relationshipsHtml}</div>
            </div>
        </div>
    `;

    // 使用 SillyTavern 的 callGenericPopup 显示
    applicationFunctionManager.callGenericPopup(modalHtml, 'html', null, { wide: true, fullscreen: false });
}