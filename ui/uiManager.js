// ui/uiManager.js
import { SbtPopupConfirm } from './SbtPopupConfirm.js';
import { updateDashboard } from './renderers.js';
import applicationFunctionManager from '../manager.js';
import { getApiSettings, saveApiSettings} from '../stateManager.js';
import { mapValueToHue } from '../utils/colorUtils.js';

const deps = {
    onReanalyzeWorldbook: () => console.warn("onReanalyzeWorldbook not injected"),
    onForceChapterTransition: () => console.warn("onForceChapterTransition not injected"),
    onStartGenesis: () => console.warn("onStartGenesis not injected"),
    onForceEndSceneClick: () => console.warn("onForceEndSceneClick not injected"),
    onSetNarrativeFocus: () => console.warn("onSetNarrativeFocus not injected"),
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
        message: '上一章节已结束。在“建筑师”开始规划新章节前，您想为接下来的剧情提供什么样的灵感或焦点？',
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

    // -- 监控面板: 手风琴折叠 --
    $wrapper.on('click', '.sbt-accordion-header', function() {
        const $header = $(this);
        const $content = $header.next('.sbt-accordion-content');
        $header.toggleClass('active');
        $content.toggleClass('active');

        const isCharacterChart = $content.find('#sbt-character-chart').length > 0;
        const isOpening = $content.hasClass('active');
    
        if (isCharacterChart) {
            if (isOpening) {
                setTimeout(() => {
                    $content.find('.sbt-character-card').each(function() {
                        const $card = $(this);
                        const currentAffinity = parseFloat($card.attr('data-current-affinity')) || 0;
                        const finalColor = $card.attr('data-final-color');
                        const $affinityBar = $card.find('.sbt-progress-fill.affinity');
                        $affinityBar.css('transition', 'background-color 0s');
                        $affinityBar.css('background-color', finalColor);
                        $affinityBar[0].offsetHeight;
                        $affinityBar.css('transition', '');
                        $affinityBar.css('width', `${currentAffinity}%`);
                    });
                }, 50);
            } else {
                $content.find('.sbt-character-card').each(function() {
                    const $card = $(this);
                    const oldAffinity = parseFloat($card.attr('data-old-affinity')) || 0;
                    const affinityColor = mapValueToHue(oldAffinity);
                    const $affinityBar = $card.find('.sbt-progress-fill.affinity');
                    $affinityBar.css('transition', 'none');
                    $affinityBar.css({
                        'width': `${oldAffinity}%`,
                        'background-color': affinityColor
                    });
                    $affinityBar.removeClass('is-maxed');
                    $card.find('.sbt-change-indicator').removeClass('show');
                });
            }
        }
    });
 
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
    const isFocusPopupEnabled = localStorage.getItem('sbt-focus-popup-enabled') === 'false';
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