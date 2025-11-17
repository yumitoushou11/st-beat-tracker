// ui/popups/proposalPopup.js
// 提案和焦点相关的弹窗逻辑

import { SbtPopupConfirm } from '../SbtPopupConfirm.js';
import applicationFunctionManager from '../../manager.js';

/**
 * 显示NSFW内容提案弹窗
 * @param {Array} proposals - 提案列表
 * @returns {Promise<string|null>} 用户选择的提案或自定义输入，取消则返回null
 */
export async function showNsfwProposalPopup(proposals) {
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

/**
 * 显示叙事焦点输入弹窗
 * @param {string} previousFocus - 之前的焦点内容
 * @returns {Promise<Object>} 包含 confirmed 和 value 的结果对象
 */
export async function showNarrativeFocusPopup(previousFocus = '') {
    const defaultChoice = "由AI自主创新。";
    const popup = new SbtPopupConfirm();

    const result = await popup.show({
        title: '导演，请指示',
        message: '在"建筑师"开始规划新章节前，您想为接下来的剧情提供什么样的灵感或焦点？',
        placeholder: '剧情？节奏？氛围？角色发展？\n或者，留空让AI自由发挥...',
        initialValue: previousFocus === defaultChoice ? '' : previousFocus,
        okText: '以此为焦点，开始规划',
        cancelText: '跳过 (由AI决定)',
        nsfwText: 'NSFW特化规划'
    });

    return result;
}

/**
 * 显示史诗焦点输入弹窗
 * @returns {Promise<string>} 用户输入的史诗焦点或默认值
 */
export async function showSagaFocusPopup() {
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
