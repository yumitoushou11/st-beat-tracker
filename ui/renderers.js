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
        const tooltipText = historyLog.length > 0
            ? historyLog.map(entry => `(好感 ${entry.change || 'N/A'}) ${entry.reasoning}`).join('\n---\n')
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
 * @description 显示角色详情面板（内嵌展开式）
 * @param {string} charId - 角色ID
 * @param {object} chapterState - 完整的Chapter对象
 * @param {boolean} editMode - 是否进入编辑模式
 * @param {boolean} isNew - 是否是新建角色
 */
function showCharacterDetailModal(charId, chapterState, editMode = false, isNew = false) {
    let char = chapterState.staticMatrices.characters[charId];

    // 如果是新建角色，创建空对象
    if (isNew) {
        char = {
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

    if (!char && !isNew) return;

    // 编辑模式状态
    const isEditMode = editMode || isNew;

    // 渲染标签（查看/编辑模式）
    const renderTag = (value, dataPath = '', index = null, editMode = false) => {
        if (editMode) {
            return `<span class="sbt-tag sbt-tag-editable" data-path="${dataPath}" data-index="${index}" contenteditable="true">${value}</span><i class="fa-solid fa-xmark sbt-tag-delete" data-path="${dataPath}" data-index="${index}"></i>`;
        }
        return `<span class="sbt-tag">${value}</span>`;
    };

    // 渲染添加按钮
    const renderAddButton = (dataPath) => {
        return `<button class="sbt-tag-add-btn" data-path="${dataPath}"><i class="fa-solid fa-plus"></i></button>`;
    };

    // 渲染字段容器
    const renderFieldContainer = (label, content, dataPath = '') => {
        return `<div class="sbt-field-container" data-path="${dataPath}"><div class="sbt-field-header"><span class="sbt-field-label">${label}</span></div><div class="sbt-field-value">${content}</div></div>`;
    };

    // 通用文本处理（查看/编辑模式）
    const safeText = (value, parentKey = '', basePath = '', depth = 0, inEditMode = false) => {
        if (!value && !inEditMode) return '<span class="sbt-empty-text">暂无信息</span>';

        const currentPath = basePath ? `${basePath}.${parentKey}` : parentKey;

        if (typeof value === 'string' || (inEditMode && !value)) {
            if (inEditMode) {
                const textValue = value || '';
                // 如果文本较长，使用textarea，否则使用contenteditable的div
                if (textValue.length > 100) {
                    return `<textarea class="sbt-editable-textarea" data-path="${currentPath}">${textValue}</textarea>`;
                } else {
                    return `<div class="sbt-editable-text" data-path="${currentPath}" contenteditable="true">${textValue}</div>`;
                }
            }
            return `<span class="sbt-text-content">${value}</span>`;
        }

        if (Array.isArray(value)) {
            if (value.length === 0 && !inEditMode) return '<span class="sbt-empty-text">暂无</span>';

            // 渲染为标签列表
            let html = '<div class="sbt-tag-list">';
            value.forEach((item, index) => {
                if (typeof item === 'string') {
                    html += renderTag(item, currentPath, index, inEditMode);
                } else {
                    html += `<span class="sbt-tag">${JSON.stringify(item)}</span>`;
                }
            });
            if (inEditMode) {
                html += renderAddButton(currentPath);
            }
            html += '</div>';
            return html;
        }

        if (typeof value === 'object') {
            // 紧凑的键值对显示
            let result = '<div class="sbt-compact-fields">';
            for (const [key, val] of Object.entries(value)) {
                const displayName = key;
                const valContent = safeText(val, key, currentPath, depth + 1, inEditMode);
                result += `<div class="sbt-field-row"><span class="sbt-field-key">${displayName}:</span> ${valContent}</div>`;
            }
            result += '</div>';
            return result;
        }

        return String(value);
    };

    // 获取角色基本信息（兼容新旧结构）
    const getName = () => char.core?.name || char.name || charId;
    const getIdentity = () => char.core?.identity || char.identity || '未知身份';
    const getAge = () => char.core?.age || '未知';
    const getGender = () => char.core?.gender || '未知';
    const isProtagonist = char.core?.isProtagonist || char.isProtagonist || false;
    const getRelationships = () => char.social?.relationships || char.relationships || {};

    // 构建关系网络
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

            // 查找该角色对主角的关系（兼容新旧结构）
            const staticRel = otherChar.social?.relationships?.[charId] || otherChar.relationships?.[charId];
            const dynamicRel = chapterState.dynamicState.characters?.[otherCharId]?.relationships?.[charId];

            if (staticRel || dynamicRel) {
                hasRelationships = true;
                const affinity = parseInt(dynamicRel?.current_affinity ?? staticRel?.affinity ?? 50, 10);
                const relationType = staticRel?.relation_type || staticRel?.description || '未知关系';
                const affinityColor = mapValueToHue(affinity);
                const otherCharName = otherChar?.core?.name || otherChar?.name || otherCharId;

                // 获取关系历史记录
                const historyLog = dynamicRel?.history || [];
                let historyHtml = '';
                if (historyLog.length > 0) {
                    historyHtml = '<div class="sbt-relationship-history"><div class="sbt-relationship-history-title"><i class="fa-solid fa-clock-rotate-left"></i> 关系变化历史</div>';
                    historyLog.forEach((entry, idx) => {
                        const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleString('zh-CN') : '未知时间';
                        // 安全处理 change 字段：可能是字符串、数字或空值
                        let change = entry.change;
                        if (change === null || change === undefined) {
                            change = '0';
                        } else if (typeof change === 'number') {
                            // 如果是数字，转换为带符号的字符串
                            change = change > 0 ? `+${change}` : String(change);
                        } else {
                            // 如果是字符串，确保正数有 + 号
                            change = String(change);
                            if (!change.startsWith('+') && !change.startsWith('-')) {
                                const numValue = parseFloat(change);
                                if (!isNaN(numValue) && numValue > 0) {
                                    change = `+${change}`;
                                }
                            }
                        }
                        const reasoning = entry.reasoning || '无记录';
                        historyHtml += `<div class="sbt-history-entry"><div class="sbt-history-entry-header"><span class="sbt-history-timestamp">${timestamp}</span><span class="sbt-history-change ${change.startsWith('+') ? 'positive' : change.startsWith('-') ? 'negative' : ''}">${change}</span></div><div class="sbt-history-reasoning">${reasoning}</div></div>`;
                    });
                    historyHtml += '</div>';
                }

                relationshipsHtml += `<div class="sbt-character-relationship-card" data-other-char-id="${otherCharId}"><div class="sbt-character-relationship-name">${otherCharName}</div><div class="sbt-character-relationship-type">${safeText(relationType, '', '', 0, false)}</div><div class="sbt-character-relationship-affinity">对主角好感: ${isEditMode ? `<input type="number" class="sbt-affinity-input" data-from-char="${otherCharId}" data-to-char="${charId}" value="${affinity}" min="0" max="100" />` : affinity}</div><div class="sbt-character-relationship-affinity-bar"><div class="sbt-character-relationship-affinity-fill" style="width: ${affinity}%; background-color: ${affinityColor};"></div></div>${historyHtml}</div>`;
            }
        }

        relationshipsHtml += '</div>';

        if (!hasRelationships) {
            relationshipsHtml = '<p style="color: var(--sbt-text-medium); margin: 0;">暂无其他角色对主角的关系记录</p>';
        }

    } else {
        // 非主角：显示该角色对其他人的好感度
        const charRelationships = getRelationships();
        if (charRelationships && Object.keys(charRelationships).length > 0) {
            relationshipsHtml = '<div class="sbt-character-relationship-grid">';

            for (const targetCharId in charRelationships) {
                const targetChar = chapterState.staticMatrices.characters[targetCharId];
                const staticRel = charRelationships[targetCharId];
                const dynamicRel = chapterState.dynamicState.characters?.[charId]?.relationships?.[targetCharId];

                const affinity = parseInt(dynamicRel?.current_affinity ?? staticRel?.affinity ?? 50, 10);
                const relationType = staticRel?.relation_type || staticRel?.description || '未知关系';
                const affinityColor = mapValueToHue(affinity);
                const targetCharName = targetChar?.core?.name || targetChar?.name || targetCharId;

                // 获取关系历史记录
                const historyLog = dynamicRel?.history || [];
                let historyHtml = '';
                if (historyLog.length > 0) {
                    historyHtml = '<div class="sbt-relationship-history"><div class="sbt-relationship-history-title"><i class="fa-solid fa-clock-rotate-left"></i> 关系变化历史</div>';
                    historyLog.forEach((entry, idx) => {
                        const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleString('zh-CN') : '未知时间';
                        // 安全处理 change 字段：可能是字符串、数字或空值
                        let change = entry.change;
                        if (change === null || change === undefined) {
                            change = '0';
                        } else if (typeof change === 'number') {
                            // 如果是数字，转换为带符号的字符串
                            change = change > 0 ? `+${change}` : String(change);
                        } else {
                            // 如果是字符串，确保正数有 + 号
                            change = String(change);
                            if (!change.startsWith('+') && !change.startsWith('-')) {
                                const numValue = parseFloat(change);
                                if (!isNaN(numValue) && numValue > 0) {
                                    change = `+${change}`;
                                }
                            }
                        }
                        const reasoning = entry.reasoning || '无记录';
                        historyHtml += `<div class="sbt-history-entry"><div class="sbt-history-entry-header"><span class="sbt-history-timestamp">${timestamp}</span><span class="sbt-history-change ${change.startsWith('+') ? 'positive' : change.startsWith('-') ? 'negative' : ''}">${change}</span></div><div class="sbt-history-reasoning">${reasoning}</div></div>`;
                    });
                    historyHtml += '</div>';
                }

                relationshipsHtml += `<div class="sbt-character-relationship-card" data-target-char-id="${targetCharId}"><div class="sbt-character-relationship-name">${targetCharName}</div><div class="sbt-character-relationship-type">${safeText(relationType, '', '', 0, false)}</div><div class="sbt-character-relationship-affinity">好感度: ${isEditMode ? `<input type="number" class="sbt-affinity-input" data-from-char="${charId}" data-to-char="${targetCharId}" value="${affinity}" min="0" max="100" />` : affinity}</div><div class="sbt-character-relationship-affinity-bar"><div class="sbt-character-relationship-affinity-fill" style="width: ${affinity}%; background-color: ${affinityColor};"></div></div>${historyHtml}</div>`;
            }
            relationshipsHtml += '</div>';
        } else {
            relationshipsHtml = '<p style="color: var(--sbt-text-medium); margin: 0;">暂无关系记录</p>';
        }
    }

    // 构建详细档案HTML（支持新旧结构）
    const detailHtml = `
        <div class="sbt-character-detail-header">
            <div class="sbt-character-detail-name">
                <i class="fa-solid fa-user"></i>
                ${isEditMode ? `<input type="text" class="sbt-name-input" data-path="core.name" value="${getName()}" placeholder="角色名称" />` : getName()}
                ${isProtagonist ? '<i class="fa-solid fa-crown" style="color: var(--sbt-warning-color);" title="主角"></i>' : ''}
            </div>
            <div class="sbt-character-detail-identity">
                ${isEditMode ? `
                    <input type="text" class="sbt-basic-input" data-path="core.identity" value="${getIdentity()}" placeholder="身份" />
                    ·
                    <input type="text" class="sbt-basic-input sbt-small-input" data-path="core.age" value="${getAge()}" placeholder="年龄" />
                    ·
                    <input type="text" class="sbt-basic-input sbt-small-input" data-path="core.gender" value="${getGender()}" placeholder="性别" />
                ` : `${getIdentity()} · ${getAge()} · ${getGender()}`}
                ${isNew ? ' <span style="color: var(--sbt-warning-color);">· 新建中</span>' : ''}
            </div>
            <div class="sbt-character-detail-actions">${isEditMode ? `<button class="sbt-save-character-btn" data-char-id="${charId}" data-is-new="${isNew}"><i class="fa-solid fa-save fa-fw"></i> ${isNew ? '创建角色' : '保存修改'}</button><button class="sbt-cancel-edit-btn" data-char-id="${charId}"><i class="fa-solid fa-times fa-fw"></i> 取消</button>${!isNew ? `<button class="sbt-delete-character-btn" data-char-id="${charId}"><i class="fa-solid fa-trash fa-fw"></i> 删除</button>` : ''}` : `<button class="sbt-edit-mode-toggle" data-char-id="${charId}"><i class="fa-solid fa-pen-to-square"></i> 编辑档案</button><button class="sbt-delete-character-btn" data-char-id="${charId}"><i class="fa-solid fa-trash"></i> 删除角色</button>`}</div>
        </div>

        ${char.appearance || isEditMode ? `<div class="sbt-character-detail-section"><div class="sbt-character-detail-section-title"><i class="fa-solid fa-eye"></i>外貌特征</div><div class="sbt-character-detail-section-content"><div class="sbt-content-wrapper">${safeText(char.appearance, 'appearance', '', 0, isEditMode)}</div></div></div>` : ''}
        ${char.personality || isEditMode ? `<div class="sbt-character-detail-section"><div class="sbt-character-detail-section-title"><i class="fa-solid fa-brain"></i>性格心理</div><div class="sbt-character-detail-section-content"><div class="sbt-content-wrapper">${safeText(char.personality, 'personality', '', 0, isEditMode)}</div></div></div>` : ''}
        ${char.background || isEditMode ? `<div class="sbt-character-detail-section"><div class="sbt-character-detail-section-title"><i class="fa-solid fa-book"></i>背景故事</div><div class="sbt-character-detail-section-content"><div class="sbt-content-wrapper">${safeText(char.background, 'background', '', 0, isEditMode)}</div></div></div>` : ''}
        ${char.goals || isEditMode ? `<div class="sbt-character-detail-section"><div class="sbt-character-detail-section-title"><i class="fa-solid fa-bullseye"></i>目标与动机</div><div class="sbt-character-detail-section-content"><div class="sbt-content-wrapper">${safeText(char.goals, 'goals', '', 0, isEditMode)}</div></div></div>` : ''}
        ${char.capabilities || isEditMode ? `<div class="sbt-character-detail-section"><div class="sbt-character-detail-section-title"><i class="fa-solid fa-wand-sparkles"></i>能力与技能</div><div class="sbt-character-detail-section-content"><div class="sbt-content-wrapper">${safeText(char.capabilities, 'capabilities', '', 0, isEditMode)}</div></div></div>` : ''}
        ${char.equipment || isEditMode ? `<div class="sbt-character-detail-section"><div class="sbt-character-detail-section-title"><i class="fa-solid fa-shield-halved"></i>装备资源</div><div class="sbt-character-detail-section-content"><div class="sbt-content-wrapper">${safeText(char.equipment, 'equipment', '', 0, isEditMode)}</div></div></div>` : ''}

        <div class="sbt-character-detail-section ${isProtagonist ? 'sbt-protagonist-relationship-section' : ''}"><div class="sbt-character-detail-section-title"><i class="fa-solid fa-users"></i>${relationshipSectionTitle}</div>${relationshipsHtml}</div>

        ${(char.social && (char.social.所属组织 || char.social.声望 || char.social.社会地位 || char.social.affiliations || char.social.reputation || char.social.social_status)) || isEditMode ? `<div class="sbt-character-detail-section"><div class="sbt-character-detail-section-title"><i class="fa-solid fa-flag"></i>归属与声望</div><div class="sbt-character-detail-section-content"><div class="sbt-content-wrapper"><div class="sbt-compact-fields">${(char.social?.所属组织 || char.social?.affiliations) || isEditMode ? `<div class="sbt-field-row"><span class="sbt-field-key">所属组织:</span> ${safeText(char.social?.所属组织 || char.social?.affiliations, 'social.所属组织', '', 0, isEditMode)}</div>` : ''}${(char.social?.声望 || char.social?.reputation) || isEditMode ? `<div class="sbt-field-row"><span class="sbt-field-key">声望:</span> ${safeText(char.social?.声望 || char.social?.reputation, 'social.声望', '', 0, isEditMode)}</div>` : ''}${(char.social?.社会地位 || char.social?.social_status) || isEditMode ? `<div class="sbt-field-row"><span class="sbt-field-key">社会地位:</span> ${safeText(char.social?.社会地位 || char.social?.social_status, 'social.社会地位', '', 0, isEditMode)}</div>` : ''}</div></div></div></div>` : ''}
        ${char.experiences || isEditMode ? `<div class="sbt-character-detail-section"><div class="sbt-character-detail-section-title"><i class="fa-solid fa-clock-rotate-left"></i>经历与成长</div><div class="sbt-character-detail-section-content"><div class="sbt-content-wrapper">${safeText(char.experiences, 'experiences', '', 0, isEditMode)}</div></div></div>` : ''}

        ${char.secrets || isEditMode ? `<div class="sbt-character-detail-section"><div class="sbt-character-detail-section-title"><i class="fa-solid fa-key"></i>秘密信息</div><div class="sbt-character-detail-section-content"><div class="sbt-content-wrapper">${safeText(char.secrets, 'secrets', '', 0, isEditMode)}</div></div></div>` : ''}
    `;

    // 渲染到内嵌面板并显示
    const $panel = $('#sbt-character-detail-panel');
    const $content = $('#sbt-character-detail-content');

    $content.attr('data-char-id', charId); // 保存角色ID供编辑功能使用
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
 * @description 显示世界观词条详情面板（内嵌展开式）
 * @param {string} itemId - 词条ID
 * @param {string} category - 类别（如 'locations', 'items'）
 * @param {string} categoryName - 类别中文名（如 '地点', '物品'）
 * @param {object} chapterState - 完整的Chapter对象
 * @param {boolean} editMode - 是否进入编辑模式
 * @param {boolean} isNew - 是否是新建词条
 */
function showWorldviewDetailModal(itemId, category, categoryName, chapterState, editMode = false, isNew = false) {
    let item = chapterState.staticMatrices.worldview[category]?.[itemId];

    // 如果是新建词条，创建空对象
    if (isNew) {
        item = {
            name: '',
            description: ''
        };
    }

    if (!item && !isNew) return;

    const isEditMode = editMode || isNew;

    // 获取分类图标
    const getCategoryIcon = () => {
        const iconMap = {
            'locations': 'map-location-dot',
            'items': 'box',
            'factions': 'flag',
            'concepts': 'lightbulb',
            'events': 'clock-rotate-left',
            'races': 'dragon'
        };
        return iconMap[category] || 'file-lines';
    };

    // 构建详细信息HTML
    const detailHtml = `
        <div class="sbt-character-detail-header">
            <div class="sbt-character-detail-name">
                <i class="fa-solid fa-${getCategoryIcon()}"></i>
                ${isEditMode ? `<input type="text" class="sbt-worldview-name-input" data-path="name" value="${item.name || ''}" placeholder="输入${categoryName}名称" />` : (item.name || itemId)}
            </div>
            <div class="sbt-character-detail-identity">
                <i class="fa-solid fa-tag"></i> ${categoryName}${isNew ? ' · 新建中' : ''}
            </div>
            <div class="sbt-character-detail-actions">${isEditMode ? `<button class="sbt-save-worldview-item-btn" data-item-id="${itemId}" data-category="${category}" data-is-new="${isNew}"><i class="fa-solid fa-save fa-fw"></i> ${isNew ? '创建' : '保存修改'}</button><button class="sbt-cancel-worldview-edit-btn" data-item-id="${itemId}"><i class="fa-solid fa-times fa-fw"></i> 取消</button>${!isNew ? `<button class="sbt-delete-worldview-item-btn" data-item-id="${itemId}" data-category="${category}"><i class="fa-solid fa-trash fa-fw"></i> 删除</button>` : ''}` : `<button class="sbt-edit-worldview-mode-toggle" data-item-id="${itemId}" data-category="${category}" data-category-name="${categoryName}"><i class="fa-solid fa-pen-to-square"></i> 编辑</button><button class="sbt-delete-worldview-item-btn" data-item-id="${itemId}" data-category="${category}"><i class="fa-solid fa-trash"></i> 删除</button>`}</div>
        </div>

        <div class="sbt-character-detail-section">
            <div class="sbt-character-detail-section-title"><i class="fa-solid fa-align-left"></i>详细描述</div>
            <div class="sbt-character-detail-section-content">${isEditMode ? `<div class="sbt-worldview-edit-wrapper"><textarea class="sbt-worldview-textarea" data-path="description" placeholder="请输入${categoryName}的详细描述信息...&#10;&#10;提示：&#10;- 可以包含外观、特点、历史背景等&#10;- 支持多行文本&#10;- 内容将用于AI角色扮演的参考">${item.description || item.summary || ''}</textarea><div class="sbt-worldview-edit-tips"><i class="fa-solid fa-circle-info"></i><span>编辑完成后记得点击保存按钮</span></div></div>` : `<div class="sbt-worldview-content">${item.description || item.summary ? `<p class="sbt-text-content">${(item.description || item.summary).replace(/\n/g, '<br>')}</p>` : '<p class="sbt-empty-text">暂无描述信息</p>'}</div>`}</div>
        </div>
    `;

    // 渲染到内嵌面板并显示
    const $panel = $('#sbt-worldview-detail-panel');
    const $content = $('#sbt-worldview-detail-content');

    $content.attr('data-item-id', itemId);
    $content.attr('data-category', category);
    $content.attr('data-category-name', categoryName);
    $content.html(detailHtml);
    $panel.show();

    // 滚动到详情面板
    $panel[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
export { showCharacterDetailModal, showWorldviewDetailModal };