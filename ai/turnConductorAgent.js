// ai/turnConductorAgent.js 

import { Agent } from './Agent.js';
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';

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
        console.log(prompt);
        console.groupEnd();

        try {
            const responseText = await this.deps.conductorLlmService.callLLM(
                [{ role: 'user', content: prompt }]
            );

            const decision = this.extractJsonFromString(responseText);

            console.group('[CONDUCTOR-V9-OUTPUT] 极简输出结构');
            console.log('✓ status:', decision.status);
            console.log('✓ current_beat_idx:', decision.current_beat_idx);
            console.log('✓ narrative_hold:', decision.narrative_hold?.substring(0, 60) + '...');
            console.log('✓ realtime_context_ids:', decision.realtime_context_ids);
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
        console.log("[回合裁判] 使用自定义提示词");
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

**任务:** 分析最新对话，判断剧情进展到了剧本的哪一步。
**原则:** 仅仅定位，不要创作。

## 1. 当前章节剧本流程（你需要严格遵循的剧情节拍）
**重要说明:** 以下是本章节的完整剧本流程，前台AI必须按照这些节拍推进剧情。每个节拍的 \`physical_event\` 描述了该阶段应该发生的事件，\`exit_condition\` 描述了完成该节拍的条件。

\`\`\`json
${JSON.stringify(beats.map((b, i) => ({ index: i, event: b.physical_event || b.description, exit_condition: b.exit_condition })), null, 2)}
\`\`\`

**终章信标:** ${endgameBeacon}
**注意:** 前台AI在生成回复时，应该遵循当前剧本节拍的指引，确保剧情按照规划的流程推进。

## 2. 最新对话
${lastExchange}

## 3. 判定法则 (必须严格遵守)

**A. 节点判定 (宽容度 & 参与度)**
1. **语义匹配:** 只要玩家/AI的行为在*意图*上符合节拍描述即可，无需字面完全一致
2. **对话场景铁律:** 如果当前节拍包含 exit_condition，只有当**玩家做出了实质性回应**后，才算完成
3. **抢跑检测:** 如果完成当前节拍后，下一节拍是*单纯的AI描述/环境变化*，则自动合并进当前进度(index + 1)

**B. 剧透封锁 (Anti-Spoiler)**
- 查看**当前进度之后**的节拍
- 将后续才该出现的人/事/物列入 \`narrative_hold\`

**C. 终章检测**
- 如果所有节拍均已完成，且满足终章信标 → \`status: "TRIGGER_TRANSITION"\`

## 4. 输出格式 (JSON)

\`\`\`json
{
  "status": "[CONTINUE / TRIGGER_TRANSITION]",
  "current_beat_idx": [整数: 当前正在进行或刚刚完成的节拍索引],
  "narrative_hold": "[字符串: 列出禁止提及的后续关键名词，如'禁止描写地下室的尸体']",
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
        console.log(`✓ 角色数量: ${Object.keys(staticMatrices.characters).length}`);
    }

    // 地点清单
    if (staticMatrices.worldview?.locations) {
        manifestLines.push('\n**地点 (Locations):**');
        Object.entries(staticMatrices.worldview.locations).forEach(([id, data]) => {
            const name = data?.name || '未命名';
            manifestLines.push(`  - ${name} (ID: ${id})`);
            count++;
        });
        console.log(`✓ 地点数量: ${Object.keys(staticMatrices.worldview.locations).length}`);
    }

    // 物品清单
    if (staticMatrices.worldview?.items && Object.keys(staticMatrices.worldview.items).length > 0) {
        manifestLines.push('\n**物品 (Items):**');
        Object.entries(staticMatrices.worldview.items).forEach(([id, data]) => {
            const name = data?.name || '未命名';
            manifestLines.push(`  - ${name} (ID: ${id})`);
            count++;
        });
        console.log(`✓ 物品数量: ${Object.keys(staticMatrices.worldview.items).length}`);
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
        console.log(`✓ 故事线数量: ${count - manifestLines.filter(l => l.startsWith('**')).length + 1}`);
    }

    const content = manifestLines.length > 0
        ? manifestLines.join('\n')
        : '（当前世界无已注册实体）';

    console.log(`✓ 清单生成完成，共 ${count} 条实体`);
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
        console.log(`✓ 高频形容词: ${overusedAdj.length} 个`);
    }

    // 高频副词
    const overusedAdv = stylisticArchive?.frequent_descriptors?.adverbs
        ?.filter(item => item.count >= 3)
        .map(item => `"${item.word}"(${item.count}次)`) || [];

    if (overusedAdv.length > 0) {
        summary.push(`**高频副词（建议避免）：** ${overusedAdv.join(', ')}`);
        console.log(`✓ 高频副词: ${overusedAdv.length} 个`);
    }

    // 常用意象
    const recentImagery = stylisticArchive?.imagery_and_metaphors?.slice(-5) || [];
    if (recentImagery.length > 0) {
        summary.push(`**近期意象：** ${recentImagery.join(', ')}`);
        console.log(`✓ 近期意象: ${recentImagery.length} 个`);
    }

    const result = summary.length > 0 ? summary.join('\n') : '（暂无显著的文体模式）';
    console.log(`✓ 摘要生成完成`);
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
        console.log(`✓ 角色数量: ${Object.keys(staticMatrices.characters).length}`);
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
        console.log(`✓ 地点数量: ${Object.keys(staticMatrices.worldview.locations).length}`);
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
        console.log(`✓ 物品数量: ${Object.keys(staticMatrices.worldview.items).length}`);
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
            console.log(`✓ 故事线数据已注入`);
        }
    }

    const result = sections.length > 0 ? sections.join('\n') : '（当前世界无实体数据）';
    console.log(`✓ 完整实体数据注入完成`);
    console.groupEnd();

    return result;
}

}