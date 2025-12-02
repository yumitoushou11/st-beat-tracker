// ai/turnConductorAgent.js

import { Agent } from './Agent.js';
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('回合裁判');

export class TurnConductorAgent extends Agent {

    constructor(...args) {
        super(...args);
        // 获取promptManager实例
        this.promptManager = null;
    }

    /**
     * 注入promptManager实例
     * @param {PromptManager} manager - 提示词管理器实例
     */
    setPromptManager(manager) {
        this.promptManager = manager;
    }

    /**
     * 获取完整的默认提示词（包含示例数据，用于导出）
     * @returns {string} 完整的默认提示词
     */
    getCompleteDefaultPrompt() {
        // 创建示例上下文数据用于生成完整模板
        const exampleContext = {
            lastExchange: {
                user: '示例用户输入',
                assistant: '示例AI回复'
            },
            chapterBlueprint: {
                title: '示例章节',
                plot_beats: ['示例节拍1', '示例节拍2']
            },
            staticMatrices: {
                characters: {},
                worldview: {},
                items: {},
                locations: {}
            },
            stylisticArchive: {
                imagery_and_metaphors: [],
                frequent_descriptors: { adjectives: [], adverbs: [] },
                sensory_patterns: []
            },
            narrativeRhythmClock: {
                current_phase: "inhale",
                cycle_count: 0,
                current_phase_duration: 0
            }
        };

        // 调用_createPrompt生成完整模板（带示例数据）
        return this._createPrompt(exampleContext);
    }

    async execute(context) {
        this.diagnose(`--- 回合裁判 V9.0 (极简GPS模式) 启动 ---`);

        const { lastExchange, chapterBlueprint, chapter } = context;

        const prompt = this._createPrompt({
            lastExchange,
            chapterBlueprint,
            staticMatrices: chapter?.staticMatrices || {},
        });

        console.groupCollapsed('[SBT-DIAGNOSE] TurnConductor Prompt V9.0 (极简GPS)');
        logger.debug(prompt);
        console.groupEnd();

        try {
            const responseText = await this.deps.conductorLlmService.callLLM(
                [{ role: 'user', content: prompt }]
            );

            const decision = this.extractJsonFromString(responseText);

            console.group('[CONDUCTOR-V9-OUTPUT] 极简输出结构');
            logger.debug('✓ status:', decision.status);
            logger.debug('✓ current_beat_idx:', decision.current_beat_idx);
            logger.debug('✓ narrative_hold:', decision.narrative_hold?.substring(0, 60) + '...');
            logger.debug('✓ realtime_context_ids:', decision.realtime_context_ids);
            console.groupEnd();

            // 确保必要字段存在
            if (!decision.status || decision.current_beat_idx === undefined) {
                throw new Error("裁判AI返回的JSON缺少必要字段 (status 或 current_beat_idx)");
            }

            // 确保 realtime_context_ids 存在
            if (!decision.realtime_context_ids) {
                decision.realtime_context_ids = [];
            }

            this.info("--- 回合裁判 V9.0 --- GPS定位完成");
            return decision;

        } catch (error) {
            this.diagnose("--- 回合裁判 V9.0 执行失败 ---", error);
            if (this.toastr) {
                this.toastr.error(`裁判执行失败: ${error.message}`, "裁判AI错误");
            }
            // 降级策略：默认继续当前，无特殊限制
            return {
                status: "CONTINUE",
                current_beat_idx: 0,
                narrative_hold: "无",
                realtime_context_ids: []
            };
        }
    }

// ai/turnConductorAgent.js

_createPrompt(context) {
    // 如果有自定义提示词，直接使用
    if (this.promptManager && this.promptManager.hasCustomConductorPrompt()) {
        const customPrompt = this.promptManager.getConductorPrompt();
        logger.info("[回合裁判] 使用自定义提示词");
        return BACKEND_SAFE_PASS_PROMPT + customPrompt;
    }

    // 极简模式：只提取必要数据
    const { lastExchange, chapterBlueprint, staticMatrices } = context;
    const beats = chapterBlueprint?.plot_beats || [];
    const endgameBeacon = chapterBlueprint?.endgame_beacons?.[0] || chapterBlueprint?.endgame_beacon || "无";

    // 【实体召回开关检测】默认关闭
    const isEntityRecallEnabled = localStorage.getItem('sbt-entity-recall-enabled') === 'true';
    let entityManifestContent = '';
    let chapterContextIds = [];

    if (isEntityRecallEnabled) {
        const entityData = this._generateEntityManifest(staticMatrices);
        entityManifestContent = entityData.content;
        chapterContextIds = chapterBlueprint?.chapter_context_ids || [];
    }

    // 极简Prompt V9.0：只做GPS定位和剧透封锁
    return BACKEND_SAFE_PASS_PROMPT + `
# 指令：剧情状态定位 (Plot State Navigation) V9.0

任务:通过分析对话内容，判断剧情当前处于剧本的哪个节拍。
**原则:** 仅仅定位，不要创作。

## 1. 当前章节剧本流程（你需要严格遵循的剧情节拍）
以下是本章节的完整剧本流程。每个节拍的 \`event\` 描述了该阶段应该发生的事件，\`exit_condition\` 描述了完成该节拍的条件。

\`\`\`json
${JSON.stringify(beats.map((b, i) => ({ index: i, event: b.physical_event || b.description, exit_condition: b.exit_condition })), null, 2)}
\`\`\`

**终章信标:** ${endgameBeacon}

## 2. 最新对话内容
${lastExchange}

## 3. 节点定位流程（必须严格执行）

步骤1：确定当前所在节拍
- 仔细阅读"最新对话"中的 AI 情境描述
- 逐一对比 AI 已经描写的内容与剧本中各节拍的 \`event\` 字段
- 找出哪些节拍已经在对话中完成，哪些还未开始

步骤2：设置 current_beat_idx

情况A：存在未完成的节拍
- 将第一个未完成节拍的 index 设为 \`current_beat_idx\`
- 检查玩家最新行动是否满足该节拍的 \`exit_condition\`（如果有）
- 如果玩家输入仅为"继续"等无实质内容 → 保持在当前节拍

情况B：所有节拍都已完成（进入终章）
- 这意味着 AI 已完成最后一个节拍，现在应该输出终章信标内容
- 设置 \`current_beat_idx = 节拍总数\`（超出索引范围）
- 在步骤4中必须输出 \`status: "TRIGGER_TRANSITION"\`

## 4. 决策判定（按顺序检查）

检查1：是否已到达终点？
- 如果 \`current_beat_idx >= 节拍总数\` → 所有节拍已完成
-输出 \`status: "TRIGGER_TRANSITION"\`
- 本回合 AI 应该描写终章信标的内容

检查2：以上皆否？
- \`status: "CONTINUE"\`
- **剧透封锁铁则**：扫描 \`current_beat_idx\` 之后的所有节拍，将后续才会出现的角色、地点、物品、事件列入 \`narrative_hold\`，使用**绝对严格禁止**的语气

语义匹配原则：
- 判断节拍是否完成时，使用**意图匹配**而非字面匹配
- 只要 AI 描写的事件在语义上对应节拍内容，即视为完成
- 如果节拍有 \`exit_condition\`，必须等玩家做出实质性回应后才算完成

## 5. 输出格式 (JSON)

\`\`\`json
{
  "status": "[CONTINUE / TRIGGER_TRANSITION]",
  "current_beat_idx": [整数: 当前正在进行或刚刚完成的节拍索引],
  "narrative_hold": "[字符串: 使用'严格禁止'的强硬语气列出后续内容。格式：'严格禁止提及角色[名称]、严格禁止描写[事件]、严格禁止暗示[剧情]']",
  "realtime_context_ids": [${isEntityRecallEnabled ? '"[规划外实体ID列表]"' : ''}]
}
\`\`\`
${isEntityRecallEnabled ? `
## 5. 实体召回 (Entity Recall - 规划外实体检索)

**任务:** 识别本回合涉及的**规划外**实体（不在chapter_context_ids中的实体）

**世界实体清单:**
<entity_manifest>
${entityManifestContent}
</entity_manifest>

**本章规划内实体 (无需标记):**
\`\`\`json
${JSON.stringify(chapterContextIds, null, 2)}
\`\`\`

**检索规则:**
1. 从对话中提取所有实体关键词
2. 与世界实体清单匹配ID
3. **过滤掉**已在chapter_context_ids中的实体
4. 将规划外的实体ID输出到 \`realtime_context_ids\`
5. 如果本回合只涉及规划内实体，输出空数组 \`[]\`
` : ''}
`;
}


/**
 * V2.0: 生成轻量级实体清单 (Manifest)
 * @param {object} staticMatrices - 静态实体数据库
 * @returns {object} 包含 content 和 totalCount 的清单对象
 */
_generateEntityManifest(staticMatrices) {
    if (!staticMatrices) {
        this.diagnose('[V2.0-MANIFEST] staticMatrices 为空，返回空清单');
        return { content: '（当前世界无已注册实体）', totalCount: 0 };
    }

    let manifestLines = [];
    let count = 0;

    // 探针：开始生成清单
    console.group('[CONDUCTOR-V2-PROBE] 实体清单生成');

    // 角色清单
    if (staticMatrices.characters) {
        manifestLines.push('**角色 (Characters):**');
        Object.entries(staticMatrices.characters).forEach(([id, data]) => {
            const name = data?.core?.name || data?.name || '未命名';
            manifestLines.push(`  - ${name} (ID: ${id})`);
            count++;
        });
        logger.debug(`✓ 角色数量: ${Object.keys(staticMatrices.characters).length}`);
    }

    // 地点清单
    if (staticMatrices.worldview?.locations) {
        manifestLines.push('\n**地点 (Locations):**');
        Object.entries(staticMatrices.worldview.locations).forEach(([id, data]) => {
            const name = data?.name || '未命名';
            manifestLines.push(`  - ${name} (ID: ${id})`);
            count++;
        });
        logger.debug(`✓ 地点数量: ${Object.keys(staticMatrices.worldview.locations).length}`);
    }

    // 物品清单
    if (staticMatrices.worldview?.items && Object.keys(staticMatrices.worldview.items).length > 0) {
        manifestLines.push('\n**物品 (Items):**');
        Object.entries(staticMatrices.worldview.items).forEach(([id, data]) => {
            const name = data?.name || '未命名';
            manifestLines.push(`  - ${name} (ID: ${id})`);
            count++;
        });
        logger.debug(`✓ 物品数量: ${Object.keys(staticMatrices.worldview.items).length}`);
    }

    // 故事线清单
    if (staticMatrices.storylines) {
        manifestLines.push('\n**故事线 (Storylines):**');
        Object.entries(staticMatrices.storylines).forEach(([category, quests]) => {
            if (quests && Object.keys(quests).length > 0) {
                Object.entries(quests).forEach(([id, data]) => {
                    const title = data?.title || '未命名';
                    manifestLines.push(`  - ${title} (ID: ${id}, 分类: ${category})`);
                    count++;
                });
            }
        });
        logger.debug(`✓ 故事线数量: ${count - manifestLines.filter(l => l.startsWith('**')).length + 1}`);
    }

    const content = manifestLines.length > 0
        ? manifestLines.join('\n')
        : '（当前世界无已注册实体）';

    logger.debug(`✓ 清单生成完成，共 ${count} 条实体`);
    console.groupEnd();

    return { content, totalCount: count };
}

/**
 * V2.0: 提取文体档案摘要
 * @param {object} stylisticArchive - 文体档案对象
 * @returns {string} 格式化的摘要文本
 */
_extractStylisticSummary(stylisticArchive) {
    if (!stylisticArchive || Object.keys(stylisticArchive).length === 0) {
        this.diagnose('[V2.0-STYLISTIC] 文体档案为空');
        return '（暂无文体档案数据）';
    }

    // 探针：开始提取摘要
    console.group('[CONDUCTOR-V2-PROBE] 文体档案摘要提取');

    let summary = [];

    // 高频形容词
    const overusedAdj = stylisticArchive?.frequent_descriptors?.adjectives
        ?.filter(item => item.count >= 3)
        .map(item => `"${item.word}"(${item.count}次)`) || [];

    if (overusedAdj.length > 0) {
        summary.push(`**高频形容词（建议避免）：** ${overusedAdj.join(', ')}`);
        logger.debug(`✓ 高频形容词: ${overusedAdj.length} 个`);
    }

    // 高频副词
    const overusedAdv = stylisticArchive?.frequent_descriptors?.adverbs
        ?.filter(item => item.count >= 3)
        .map(item => `"${item.word}"(${item.count}次)`) || [];

    if (overusedAdv.length > 0) {
        summary.push(`**高频副词（建议避免）：** ${overusedAdv.join(', ')}`);
        logger.debug(`✓ 高频副词: ${overusedAdv.length} 个`);
    }

    // 常用意象
    const recentImagery = stylisticArchive?.imagery_and_metaphors?.slice(-5) || [];
    if (recentImagery.length > 0) {
        summary.push(`**近期意象：** ${recentImagery.join(', ')}`);
        logger.debug(`✓ 近期意象: ${recentImagery.length} 个`);
    }

    const result = summary.length > 0 ? summary.join('\n') : '（暂无显著的文体模式）';
    logger.debug(`✓ 摘要生成完成`);
    console.groupEnd();

    return result;
}

/**
 * 生成完整的实体数据（用于非召回模式）
 * @param {object} staticMatrices - 静态实体数据库
 * @returns {string} 格式化的完整实体数据文本
 */
_generateFullEntityData(staticMatrices) {
    if (!staticMatrices) {
        this.diagnose('[完整注入] staticMatrices 为空，返回空数据');
        return '（当前世界无实体数据）';
    }

    let sections = [];

    console.group('[CONDUCTOR-FULL-INJECT] 完整实体数据注入');

    // 角色数据
    if (staticMatrices.characters && Object.keys(staticMatrices.characters).length > 0) {
        sections.push('**=== 角色档案 (Characters) ===**\n');
        Object.entries(staticMatrices.characters).forEach(([id, data]) => {
            sections.push(`### ${data?.core?.name || data?.name || '未命名'} (ID: ${id})`);
            sections.push('```json');
            sections.push(JSON.stringify(data, null, 2));
            sections.push('```\n');
        });
        logger.debug(`✓ 角色数量: ${Object.keys(staticMatrices.characters).length}`);
    }

    // 地点数据
    if (staticMatrices.worldview?.locations && Object.keys(staticMatrices.worldview.locations).length > 0) {
        sections.push('**=== 地点档案 (Locations) ===**\n');
        Object.entries(staticMatrices.worldview.locations).forEach(([id, data]) => {
            sections.push(`### ${data?.name || '未命名'} (ID: ${id})`);
            sections.push('```json');
            sections.push(JSON.stringify(data, null, 2));
            sections.push('```\n');
        });
        logger.debug(`✓ 地点数量: ${Object.keys(staticMatrices.worldview.locations).length}`);
    }

    // 物品数据
    if (staticMatrices.worldview?.items && Object.keys(staticMatrices.worldview.items).length > 0) {
        sections.push('**=== 物品档案 (Items) ===**\n');
        Object.entries(staticMatrices.worldview.items).forEach(([id, data]) => {
            sections.push(`### ${data?.name || '未命名'} (ID: ${id})`);
            sections.push('```json');
            sections.push(JSON.stringify(data, null, 2));
            sections.push('```\n');
        });
        logger.debug(`✓ 物品数量: ${Object.keys(staticMatrices.worldview.items).length}`);
    }

    // 故事线数据
    if (staticMatrices.storylines) {
        let hasStorylines = false;
        for (const category in staticMatrices.storylines) {
            if (staticMatrices.storylines[category] && Object.keys(staticMatrices.storylines[category]).length > 0) {
                hasStorylines = true;
                break;
            }
        }

        if (hasStorylines) {
            sections.push('**=== 故事线档案 (Storylines) ===**\n');
            for (const [category, quests] of Object.entries(staticMatrices.storylines)) {
                if (quests && Object.keys(quests).length > 0) {
                    sections.push(`#### 分类: ${category}\n`);
                    Object.entries(quests).forEach(([id, data]) => {
                        sections.push(`##### ${data?.title || '未命名'} (ID: ${id})`);
                        sections.push('```json');
                        sections.push(JSON.stringify(data, null, 2));
                        sections.push('```\n');
                    });
                }
            }
            logger.debug(`✓ 故事线数据已注入`);
        }
    }

    const result = sections.length > 0 ? sections.join('\n') : '（当前世界无实体数据）';
    logger.debug(`✓ 完整实体数据注入完成`);
    console.groupEnd();

    return result;
}

}