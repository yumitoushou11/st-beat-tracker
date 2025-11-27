// ui/renderers/relationshipModal.js
// 关系图谱详情模态框

import { mapValueToHue } from '../../utils/colorUtils.js';

/**
 * 显示关系详情面板
 * @param {string} edgeId - 关系边ID
 * @param {object} chapterState - 完整的Chapter对象
 * @param {boolean} editMode - 是否为编辑模式
 */
export function showRelationshipDetailModal(edgeId, chapterState, editMode = false) {
    const relationshipGraph = chapterState?.staticMatrices?.relationship_graph;
    const edge = relationshipGraph?.edges?.find(e => e.id === edgeId);

    if (!edge) {
        console.error('[SBT] 找不到关系边:', edgeId);
        return;
    }

    // 获取角色名称
    const characters = chapterState.staticMatrices.characters || {};
    const getCharName = (charId) => {
        const char = characters[charId];
        return char?.core?.name || char?.name || charId.replace('char_', '');
    };

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
    let weightLabel = '较低';
    if (weight >= 9) {
        weightClass = 'weight-critical';
        weightLabel = '极高';
    } else if (weight >= 7) {
        weightClass = 'weight-high';
        weightLabel = '高';
    } else if (weight >= 4) {
        weightClass = 'weight-medium';
        weightLabel = '中等';
    }

    // 状态标签
    let statusHtml = '';
    if (edge.timeline?.reunion_pending) {
        statusHtml = '<span class="sbt-rel-status-badge reunion-pending"><i class="fa-solid fa-clock-rotate-left"></i> 待重逢</span>';
    } else if (!edge.narrative_status?.first_scene_together) {
        statusHtml = '<span class="sbt-rel-status-badge first-meeting"><i class="fa-solid fa-handshake"></i> 待初识</span>';
    } else if (edge.timeline?.separation_duration === 'none') {
        statusHtml = '<span class="sbt-rel-status-badge active"><i class="fa-solid fa-check"></i> 活跃</span>';
    } else {
        statusHtml = '<span class="sbt-rel-status-badge separated"><i class="fa-solid fa-user-clock"></i> 分离中</span>';
    }

    // 未解决张力
    let tensionsHtml = '';
    const tensions = edge.narrative_status?.unresolved_tension || [];
    if (tensions.length > 0 || editMode) {
        tensionsHtml = '<div class="sbt-rel-detail-field"><div class="sbt-rel-detail-label"><i class="fa-solid fa-bolt"></i> 未解张力</div><div class="sbt-rel-detail-value"><div class="sbt-rel-tension-tags">';

        if (editMode) {
            // 编辑模式：可编辑的标签
            tensions.forEach((tension, index) => {
                tensionsHtml += `
                    <span class="sbt-rel-tension-tag sbt-rel-tension-editable" contenteditable="true" data-tension-index="${index}">${tension}</span>
                    <i class="fa-solid fa-xmark sbt-tension-delete" data-tension-index="${index}"></i>
                `;
            });
            tensionsHtml += '<button class="sbt-add-tension-btn"><i class="fa-solid fa-plus fa-fw"></i> 添加张力</button>';
        } else {
            // 查看模式：只读标签
            tensions.forEach(tension => {
                tensionsHtml += `<span class="sbt-rel-tension-tag">${tension}</span>`;
            });
        }

        tensionsHtml += '</div></div></div>';
    }

    // 重大事件
    let eventsHtml = '';
    const events = edge.narrative_status?.major_events || [];
    if (events.length > 0) {
        eventsHtml = '<div class="sbt-rel-detail-field"><div class="sbt-rel-detail-label"><i class="fa-solid fa-bookmark"></i> 重大事件</div><div class="sbt-rel-detail-value">';
        events.forEach(event => {
            const impact = event.emotional_impact || 0;
            const impactColor = mapValueToHue(impact * 10);
            eventsHtml += `
                <div class="sbt-rel-event-card">
                    <div class="sbt-rel-event-content">${event.event}</div>
                    <div class="sbt-rel-event-meta">
                        <span class="sbt-rel-event-chapter">${event.chapter || '未知章节'}</span>
                        <span class="sbt-rel-event-impact" style="color: ${impactColor}">
                            <i class="fa-solid fa-heart"></i> ${impact}/10
                        </span>
                    </div>
                </div>
            `;
        });
        eventsHtml += '</div></div>';
    }

    // 编辑按钮HTML
    const editButtonsHtml = editMode ? `
        <div class="sbt-rel-modal-actions">
            <button class="sbt-save-relationship-btn" data-edge-id="${edgeId}">
                <i class="fa-solid fa-save fa-fw"></i> 保存
            </button>
            <button class="sbt-cancel-relationship-edit-btn" data-edge-id="${edgeId}">
                <i class="fa-solid fa-times fa-fw"></i> 取消
            </button>
        </div>
    ` : `
        <div class="sbt-rel-modal-actions">
            <button class="sbt-edit-relationship-mode-toggle" data-edge-id="${edgeId}">
                <i class="fa-solid fa-pen-to-square fa-fw"></i> 编辑
            </button>
        </div>
    `;

    // 构建详情HTML
    const detailHtml = `
        <div class="sbt-relationship-detail-modal">
            <div class="sbt-rel-modal-header">
                <div class="sbt-rel-modal-title-row">
                    <div class="sbt-rel-modal-title">
                        <span class="sbt-rel-participant">${participant1}</span>
                        <i class="fa-solid fa-heart" style="color: var(--sbt-primary-accent); font-size: 1.2em;"></i>
                        <span class="sbt-rel-participant">${participant2}</span>
                    </div>
                    ${editButtonsHtml}
                </div>
                <div class="sbt-rel-modal-meta">
                    <span class="sbt-rel-type-badge">${typeText}</span>
                    ${statusHtml}
                </div>
            </div>

            <div class="sbt-rel-modal-body">
                <!-- 情感权重 -->
                <div class="sbt-rel-detail-field sbt-rel-weight-field">
                    <div class="sbt-rel-detail-label">
                        <i class="fa-solid fa-chart-line"></i>
                        情感权重
                    </div>
                    <div class="sbt-rel-detail-value">
                        <div class="sbt-rel-weight-display">
                            ${editMode ? `
                                <input type="number"
                                       class="sbt-rel-weight-input"
                                       data-field="emotional_weight"
                                       value="${weight}"
                                       min="0"
                                       max="10"
                                       step="1" />
                                <span class="sbt-rel-weight-hint">输入 0-10 的数值</span>
                            ` : `
                                <div class="sbt-rel-weight-bar">
                                    <div class="sbt-rel-weight-fill ${weightClass}" style="width: ${weight * 10}%;"></div>
                                </div>
                                <div class="sbt-rel-weight-info">
                                    <span class="sbt-rel-weight-value">${weight}/10</span>
                                    <span class="sbt-rel-weight-label">${weightLabel}</span>
                                </div>
                            `}
                        </div>
                    </div>
                </div>

                <!-- 时间线信息 -->
                <div class="sbt-rel-timeline-section">
                    <div class="sbt-rel-section-title"><i class="fa-solid fa-timeline"></i> 时间线</div>
                    <div class="sbt-rel-timeline-grid">
                        <div class="sbt-rel-timeline-item">
                            <i class="fa-solid fa-calendar-days"></i>
                            <div class="sbt-rel-timeline-content">
                                <div class="sbt-rel-timeline-label">建立时间</div>
                                <div class="sbt-rel-timeline-value">${edge.timeline?.established || '未知'}</div>
                            </div>
                        </div>
                        <div class="sbt-rel-timeline-item">
                            <i class="fa-solid fa-hourglass-half"></i>
                            <div class="sbt-rel-timeline-content">
                                <div class="sbt-rel-timeline-label">分离时长</div>
                                <div class="sbt-rel-timeline-value">${separationText}</div>
                            </div>
                        </div>
                        <div class="sbt-rel-timeline-item">
                            <i class="fa-solid fa-clock"></i>
                            <div class="sbt-rel-timeline-content">
                                <div class="sbt-rel-timeline-label">最后互动</div>
                                <div class="sbt-rel-timeline-value">${edge.timeline?.last_interaction || '故事开始前'}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 未解张力 -->
                ${tensionsHtml}

                <!-- 重大事件 -->
                ${eventsHtml}
            </div>
        </div>
    `;

    // 渲染到内嵌面板并显示
    const $panel = $('#sbt-relationship-detail-panel');
    const $content = $('#sbt-relationship-detail-content');

    $content.attr('data-edge-id', edgeId);
    $content.html(detailHtml);
    $panel.show();

    // 滚动到详情面板
    $panel[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
