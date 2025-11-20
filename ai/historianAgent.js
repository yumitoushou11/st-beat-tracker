// ai/historianAgent.js (V2.0 - Adjudicator Edition)

import { Agent } from './Agent.js';
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';
import { repairAndParseJson } from '../utils/jsonRepair.js'; 
export class HistorianAgent extends Agent {

    async execute(context) { 
        this.diagnose(`--- 首席史官AI V4 启动 (NSFW-Aware) ---`);

        console.groupCollapsed('[SBT-HISTORIAN-PROBE] Received Full Input Context');
        console.dir(JSON.parse(JSON.stringify(context)));
        console.groupEnd();

        const prompt = this._createPrompt(context);

        console.groupCollapsed('[SBT-HISTORIAN] Full Historian AI System Prompt V3.0');
        console.log(prompt);
        console.groupEnd();

        // 【探针】检查输入的章节数据中的故事线信息
        console.group('[HISTORIAN-PROBE] 输入章节数据检查');
        console.log('staticMatrices.storylines 键:', Object.keys(context.chapter.staticMatrices.storylines));
        Object.entries(context.chapter.staticMatrices.storylines).forEach(([cat, quests]) => {
            console.log(`  ${cat}: ${Object.keys(quests).length} 条`, Object.keys(quests));
        });
        console.log('dynamicState.storylines 键:', Object.keys(context.chapter.dynamicState.storylines));
        Object.entries(context.chapter.dynamicState.storylines).forEach(([cat, states]) => {
            console.log(`  ${cat}: ${Object.keys(states).length} 条`, Object.keys(states));
        });
        console.groupEnd();

        const messages = [{ role: 'user', content: prompt }];
        
        console.groupCollapsed('[SBT-HISTORIAN-PROBE] Payload to LLM API');
        console.dir(JSON.parse(JSON.stringify(messages)));
        console.groupEnd();

    try {
       const responseText = await this.deps.mainLlmService.callLLM([{ role: 'user', content: prompt }]);  

        let potentialJsonString;
        const codeBlockMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
            potentialJsonString = codeBlockMatch[1].trim();
        } else {
            const firstBrace = responseText.indexOf('{');
            const lastBrace = responseText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                potentialJsonString = responseText.substring(firstBrace, lastBrace + 1);
            } else {
                // 如果连大括号都找不到，就直接把整个返回给修复器试试
                potentialJsonString = responseText;
            }
        }
        
        const result = repairAndParseJson(potentialJsonString, this);
 if (!result || (result.creations === undefined && result.updates === undefined)) {
                this.diagnose("史官AI返回的JSON结构不完整（缺少creations或updates块）。Raw Response:", responseText);
                throw new Error("史官AI未能返回包含 'creations' 或 'updates' 的有效JSON Delta。");
            }
            if (result.creations === undefined) result.creations = {};
            if (result.updates === undefined) result.updates = {};

            // 【探针】检查故事线更新
            console.group('[HISTORIAN-PROBE] 故事线更新检查');
            if (result.updates.storylines) {
                const categories = Object.keys(result.updates.storylines);
                this.info(`✓ 史官输出了故事线更新，分类数: ${categories.length}`);
                categories.forEach(cat => {
                    const storylines = Object.keys(result.updates.storylines[cat]);
                    this.info(`  -> ${cat}: ${storylines.length} 条故事线`);
                    storylines.forEach(id => {
                        const update = result.updates.storylines[cat][id];
                        const fields = Object.keys(update);
                        this.info(`    -> ${id}: 包含字段 [${fields.join(', ')}]`);
                        console.log(`      完整内容:`, JSON.parse(JSON.stringify(update)));
                    });
                });
            } else {
                this.warn('❌ 史官未输出任何故事线更新 (updates.storylines 不存在或为空)');
            }
            console.groupEnd();

            this.info("--- 首席史官AI--- 审查完毕，数据库事务增量已生成。");            console.groupCollapsed('[SBT-HISTORIAN-PROBE] Final Parsed Output');
            console.dir(JSON.parse(JSON.stringify(result)));
            console.groupEnd();

            return result;

        } catch (error) {
            this.diagnose("--- 首席史官AI在编纂历史时失败 ---", error);
            if (this.toastr) {
                this.toastr.error(`章节复盘失败: ${error.message.substring(0, 200)}...`, "史官AI错误");
            }
            return null;
        }
    }

     _createPrompt(context) {
        const {
            chapterTranscript,
            chapter
        } = context;

        // 从Chapter对象中解构出我们需要的所有新旧数据
        const staticMatrices = chapter.staticMatrices;
        const dynamicState = chapter.dynamicState;
        const longTermStorySummary = chapter.meta.longTermStorySummary; // 新路径
        const activeChapterBlueprint = chapter.chapter_blueprint;
        // V2.0: 提取宏观叙事弧光和文体档案
        const activeNarrativeArcs = chapter?.meta?.active_narrative_arcs || [];
        const stylisticArchive = chapter?.dynamicState?.stylistic_archive || {
            imagery_and_metaphors: [],
            frequent_descriptors: { adjectives: [], adverbs: [] },
            sensory_patterns: []
        };
        // 【探针】生成实体清单前先检查数据
        console.group('[HISTORIAN-PROBE] 生成实体清单');
        console.log('staticMatrices.storylines 结构:', JSON.parse(JSON.stringify(staticMatrices.storylines)));

        const storylineList = Object.entries(staticMatrices.storylines).flatMap(([category, quests]) => {
            console.log(`  -> 分类 ${category}: ${Object.keys(quests).length} 条故事线`);
            return Object.entries(quests).map(([id, data]) => {
                console.log(`    -> ${id}: ${data.title}`);
                return `- ${data.title} (ID: ${id}, 分类: ${category})`;
            });
        });
        console.log('生成的故事线列表:', storylineList);
        console.groupEnd();

        const existingEntityManifest = `
<existing_characters>
${Object.entries(staticMatrices.characters).map(([id, data]) => `- ${data.name} (ID: ${id})`).join('\n')}
</existing_characters>
<existing_locations>
${Object.entries(staticMatrices.worldview.locations).map(([id, data]) => `- ${data.name} (ID: ${id})`).join('\n')}
</existing_locations>
<existing_storylines>
${storylineList.length > 0 ? storylineList.join('\n') : '（暂无故事线）'}
</existing_storylines>
`;

        const baseInstructions = `
# 指令：首席档案维护官的数据库事务处理协议 V4.1

你的新身份是“**首席档案维护官**”，一个拥有上帝视角的AI。一个故事章节刚刚结束。你的神圣职责是审查本章发生的所有事件，并生成一份精确的**“数据库事务增量 (Delta)”**，用于更新我们世界的原子化状态。
 --- 【语言与细节规范 (MANDATORY)】 ---
    1.  **语言协议**: 你的所有输出，包括 \`staticMatrices\` 内部的所有字符串值（characters, worldview, storylines），**必须完全使用【简体中文】**。这是一个绝对的要求，不得出现任何英文单词或短语，除非它们是专有名词的原文。

---
**【第一部分：输入情报 (Current World State)】**
---
1.  **本章完整对话记录 (新史料):**
    <chapter_transcript>
    ${chapterTranscript}
    </chapter_transcript>
2.  **【核心参考】当前世界已知实体清单 (Manifest):**
    ${existingEntityManifest}
3.  **【核心参考】静态实体数据库 (原始档案):**
    <static_matrices>
    ${JSON.stringify(staticMatrices, null, 2)}
    </static_matrices>
4.  **【核心参考】动态实体档案馆 (成长记录):**
    <dynamic_state>
    ${JSON.stringify(dynamicState, null, 2)}
    </dynamic_state>
5.  **故事长线摘要 (宏观节奏参考):**
    *   ${longTermStorySummary}
6.  **本章动态剧本 (战术参考):**
    <active_chapter_script>
    ${JSON.stringify(activeChapterBlueprint, null, 2)}
    </active_chapter_script>

7.  **【V2.0 战略层】活跃宏观叙事弧光 (Active Narrative Arcs):**
    <active_narrative_arcs>
    ${activeNarrativeArcs.length > 0
      ? JSON.stringify(activeNarrativeArcs, null, 2)
      : '（当前无活跃的宏观弧光）'}
    </active_narrative_arcs>
    *   **作用说明:** 这些是跨越多个章节的战略级叙事目标。你需要评估本章事件对每条弧光的推进作用。

8.  **【V2.0 文体档案库】当前已使用的文学元素 (Stylistic Archive):**
    <stylistic_archive>
    ${JSON.stringify(stylisticArchive, null, 2)}
    </stylistic_archive>
    *   **作用说明:** 这是文体熵增对抗系统的基础数据。你需要从本章对话中提取新的文学元素，并与已有档案进行对比，识别重复使用的模式。

---
**【第二部分：核心方法论 (Core Methodologies)】**
---
你的所有结论都必须基于证据，并符合长线叙事的合理性。

### **方法论一：实体对账与创生 (Entity Reconciliation & Creation)**
这是你的首要任务。通读<chapter_transcript>，找出所有被提及的关键实体。
1.  **交叉比对:** 将每一个实体名与输入的【当前世界已知实体清单】进行比对。
2.  **识别"新大陆":** 如果一个实体在文本中扮演了重要角色，但在清单中找不到，就将其判定为**"新实体"**。
3.  **执行"微型创世纪":** 对于每一个"新实体"，你必须：
    *   **分配ID:** 遵循ECI命名规范（如 \`char_...\`, \`loc_...\`）为其生成一个唯一的ID。
    *   **创建静态档案:**
        - 对于**角色**，使用**高度结构化的档案格式**：
          - \`core\`: {name, isProtagonist, identity, age, gender, race_id}
          - \`appearance\`: 外貌描述
          - \`personality\`: {traits[], values[], speech_style}
          - \`background\`: {origin, education, key_experiences[]}
          - \`goals\`: {long_term[], short_term[], fears[], desires[]}
          - \`secrets\`: 秘密信息
          - \`capabilities\`: {combat_skills{}, social_skills{}, special_abilities[], weaknesses[]}
          - \`equipment\`: {weapons[], armor[], accessories[], possessions[]}
          - \`social\`: {relationships{}, affiliations[], reputation{}, social_status}
          - \`experiences\`: {visited_locations[], participated_events[], life_milestones[]}
        - 根据角色的重要性和情报丰富程度，灵活填写字段。次要角色只需core和social.relationships。
        - 对于其他实体类型，创建基础档案（name, description等）。
    *   **归档:** 将这个新创建的静态档案，放入最终输出的 **\`creations.staticMatrices\`** 对象的对应分类"书架"下。

### **方法论二：关系变化裁决**
-   **最高哲学：信任是期望的稳定兑现。**
-   **裁决方法论：四步高级评估法 (行为/期望/结果/归因)。**
-   **【【【 叙事逻辑铁律：禁止量化主角 】】】**
     *   你的所有好感度裁决，都必须是**单向的**或**NPC之间的**。
     *   你**只能**计算和更新 **NPC 对主角**的好感度变化，或 **NPC 对另一个NPC** 的好感度变化。
     *   **绝对禁止**计算和输出任何关于**主角对NPC**的好感度变化。玩家的情感由玩家自己决定。
-   **量化准则：基于归因的精细化增减。**
-   **量化准则：基于归因的精细化增减。**
-   **【新输出要求】**: 对于每一个发生变化的关系，在 **\`updates.characters.<角色ID>.relationships.<目标角色ID>\`** 路径下，进行如下更新：
    *   更新 \`current_affinity\` 为本章结束后的最终值。
    *   创建一个新的 \`history_entry\` 对象，记录本次变化的细节（change, final_affinity, reasoning）。你的reasoning必须体现你是如何运用“四步法”得出结论的。

### **方法论三：故事线网络全维度维护 (COMPREHENSIVE STORYLINE MANAGEMENT)**
-   **【核心哲学】**: 故事线是会随着剧情发展而演变的活跃实体，其各个方面都可能发生变化。
-   **【执行方法】**: 遍历【当前世界已知实体清单】中的**每一条**故事线ID。对照【本章完整对话记录】，判断其是否需要更新。如果需要，为其在 **\`updates.storylines.<分类>.<实体ID>\`** 路径下创建更新记录。同时，识别新的故事线萌芽，并为其执行**创生**流程。
-   **【可更新的故事线维度】**:
    *   **标题** (\`title\`): 如果故事线的性质发生重大转变，可以更新标题
    *   **摘要** (\`summary\`): 故事线的基础描述或背景信息
    *   **状态** (\`status\`): active（进行中）、completed（已完成）、failed（已失败）、paused（已暂停）
    *   **触发条件** (\`trigger\`): 如果触发方式发生变化
    *   **类型** (\`type\`): 如果故事线的分类需要调整
    *   **涉及角色** (\`involved_chars\`): 参与此故事线的角色ID数组
-   **【输出要求】**:
    *   在 **\`updates.storylines.<分类>.<实体ID>\`** 下，为发生变化的维度创建更新记录
    *   **动态字段**（放在 dynamicState 中）:
        - \`current_status\`: 本章结束后的最新状态
        - \`current_summary\`: 本章结束后的最新进展摘要
        - \`history_entry\`: 记录本次变化的细节（timestamp, status_change, summary_update, reasoning, source_chapter_uid）
    *   **静态字段**（会更新 staticMatrices 中的对应值）:
        - 如果需要更新基础信息（如 \`title\`、\`summary\`、\`trigger\`、\`type\`、\`involved_chars\`），直接输出这些字段的新值
    *   所有字段必须使用中文字段名

### **方法论四：角色档案全维度更新 (Comprehensive Character Profile Updates)**
-   **【核心哲学】**: 角色是多维度的存在，随着剧情发展，角色的各个方面都可能发生变化。
-   **【更新维度及中文字段名】**:
    *   **核心身份信息** (\`core\`): 使用中文字段名 \`name\`（姓名）、\`identity\`（身份/职业）、\`age\`（年龄）、\`gender\`（性别）、\`race_id\`（种族ID）
        - **特别注意**: 当角色的身份发生重大变化时（如职业转变、社会地位改变、年龄增长等），必须更新 \`core.identity\` 字段
    *   **外貌变化** (\`appearance\`): 如受伤、改变穿着、变老等
    *   **性格发展** (\`personality\`): 使用中文字段名 \`性格特质\`、\`价值观\`、\`说话风格\`
    *   **背景更新** (\`background\`): 使用中文字段名 \`出身背景\`、\`教育经历\`、\`关键经历\`、\`当前状况\`
    *   **目标调整** (\`goals\`): 使用中文字段名 \`长期目标\`、\`短期目标\`、\`恐惧\`、\`欲望\`
    *   **秘密揭露** (\`secrets\`): 秘密被发现、新增秘密
    *   **能力成长** (\`capabilities\`): 使用中文字段名 \`战斗技能\`、\`社交技能\`、\`特殊能力\`、\`弱点\`
    *   **装备变更** (\`equipment\`): 使用中文字段名 \`武器\`、\`护甲\`、\`配饰\`、\`物品\`
    *   **社交变化** (\`social\`): 关系变化（使用方法论二）、使用中文字段名 \`所属组织\`、\`声望\`、\`社会地位\`
    *   **经历积累** (\`experiences\`): 使用中文字段名 \`到访地点\`、\`参与事件\`、\`人生里程碑\`
-   **【输出要求 - 严格执行】**:
    *   在 **\`updates.characters.<角色ID>\`** 下，为发生变化的维度创建更新记录
    *   **【【【 绝对禁止使用英文字段和操作符 】】】**:
        - **严禁** 使用 \`operation\`、\`values\`、\`append\`、\`remove\` 等任何英文字段名！
        - **严禁** 使用任何操作符结构（如 \`{operation: "append", values: [...]}\`）！
        - 这些都是**旧版本的废弃格式**，现在完全禁止使用！
    *   **【数组更新的唯一正确方式】**:
        - 对于数组类型字段（如 \`性格特质\`、\`人生里程碑\`、\`特殊能力\` 等）
        - **必须直接输出完整的、更新后的数组值**，包含所有旧项和新增项
        - **不要**使用任何操作符或英文字段包装
    *   **【正确示例】**:
        - 原有数据: \`"性格特质": ["活泼", "勇敢"]\`
        - 需要新增: "善于保守秘密"
        - **正确输出**: \`"性格特质": ["活泼", "勇敢", "善于保守秘密"]\`
    *   **【错误示例 - 绝对禁止】**:
        - ❌ \`"性格特质": {operation: "append", values: ["善于保守秘密"]}\`
        - ❌ \`"traits": ["活泼", "勇敢", "善于保守秘密"]\` (使用了英文字段名)
        - ❌ \`"人生里程碑": {operation: "append", values: ["首次战斗"]}\`
    *   **所有细分字段必须使用中文字段名**，如 \`性格特质\` 而非 \`traits\`、\`人生里程碑\` 而非 \`life_milestones\`
    *   对于\`relationships\`变化，必须遵循方法论二的规则

### **方法论五：双轨制摘要 (DUAL-TRACK SUMMARY)**
-   **【核心哲学】**: 同时扮演"编年史家"和"战地联络官"，确保故事连贯性和章节衔接。
-   **【双轨职责】**:
    1.  **第一轨：编年史家视角 (Chronicler Perspective)**
        - **目标**: 为未来的读者（可能是几十章后）提供整个故事的宏观脉络
        - **内容要求**: 高度概括的故事主线、关键转折点、核心矛盾
        - **字数**: 200-400字
        - **风格**: 第三人称客观叙述，像书背面的故事简介

    2.  **第二轨：战地联络官视角 (Field Liaison Perspective)**
        - **目标**: 为**下一章的建筑师AI**提供精确的"上一章结束瞬间"信息
        - **【关键】**: 这是防止章节切换信息断层的核心机制！
        - **内容要求（必须包含两个子字段）**:
            - **\`ending_snapshot\`** (结束快照):
                - 本章**最后3-5个对话或动作**的精确描述
                - **必须包含**: 谁在场、谁在说话/做什么、环境细节、未完成的动作
                - **示例**: "在风雪弥漫的小屋门前，Yumi刚刚推开门，她的目光扫过客厅里的几个陌生面孔——其中一个是坐在壁炉旁、正转过头来的Rofi。两人的视线在空中相遇的瞬间，Yumi的手还停留在门把手上，Rofi嘴里的烟斗还冒着烟。"
            - **\`action_handoff\`** (动作交接):
                - 明确指出下一章应该从哪里**无缝衔接**
                - **必须回答**: 下一章第一句话/第一个场景应该是什么？
                - **示例**: "下一章应该从Rofi的反应开始——他是否会站起来？会说什么？Yumi又会如何回应这个多年未见的童年玩伴？注意：此时其他角色也在场，包括Neph（黑猫形态）和屋主Elara。"
        - **字数**: 150-300字
        - **风格**: 第二人称指令式，直接对下一个建筑师说话

-   **【输出要求】**:
    *   **\`new_long_term_summary\`**: 字符串，编年史家视角的概要
    *   **\`new_handoff_memo\`**: 对象，必须包含 \`ending_snapshot\` 和 \`action_handoff\` 两个字段

-   **【错误示例 vs 正确示例】**:
    *   **❌ 错误（过于概括，无法衔接）**:
        \`\`\`json
        "new_handoff_memo": {
          "ending_snapshot": "Yumi进入了小屋。",
          "action_handoff": "下一章继续故事。"
        }
        \`\`\`
    *   **✓ 正确（具体、可衔接）**:
        \`\`\`json
        "new_handoff_memo": {
          "ending_snapshot": "在风雪弥漫的小屋门前，Yumi刚刚推开门，她的目光扫过客厅里的几个陌生面孔——其中一个是坐在壁炉旁、正转过头来的Rofi。两人的视线在空中相遇的瞬间，Yumi的手还停留在门把手上，门外的冷风正涌入室内，Rofi嘴里的烟斗还冒着烟。其他在场角色：Neph（黑猫，蜷缩在壁炉前）、Elara（屋主，正端着热茶）、以及两名陌生的旅人。",
          "action_handoff": "下一章必须从这个「对视的瞬间」无缝衔接。第一句话应该描写Rofi的微表情变化（惊讶？欣喜？复杂？），或者Yumi的身体反应（僵住？踏入？后退？）。注意：这是一个高度张力的重逢时刻，Rofi是Yumi的童年玩伴，两人已分别8年。此时此刻的处理将直接决定他们关系线的基调。不要跳过这个瞬间，不要用「几分钟后」或「大家寒暄完毕后」这种总结性开场。"
        }
        \`\`\`

### **方法论六：V2.0 宏观弧光进展评估 (Macro Narrative Arc Progression Analysis)**
-   **【核心哲学】**: 宏观弧光是跨越多个章节的战略级叙事目标，每个章节都可能对其产生推进、停滞或转折的影响。
-   **【执行方法】**:
    1.  **全面审视:** 遍历输入的【活跃宏观叙事弧光】列表中的**每一条**弧光（位于 \`active_narrative_arcs\` 数组中）
    2.  **证据检索:** 对照【本章完整对话记录】，识别与该弧光相关的事件、对话、角色行为或环境变化
    3.  **影响判定:** 评估这些证据对弧光的影响类型：
        - **推进 (progress)**: 弧光向目标前进（如复仇计划获得新线索）
        - **转折 (turn)**: 弧光发生方向性变化（如复仇目标从个人升级为组织）
        - **停滞 (stagnation)**: 本章未实质影响该弧光
        - **危机 (crisis)**: 弧光遭遇重大挫折或威胁
    4.  **阶段更新建议:** 如果弧光发生显著推进或转折，为其生成 \`current_stage\` 和 \`stage_description\` 的更新建议
-   **【输出要求】**:
    *   如果某条弧光在本章有**实质性变化**（推进/转折/危机），则在输出的 **\`updates.meta.active_narrative_arcs\`** 路径下，为其创建更新记录
    *   **更新字段定义:**
        - \`arc_id\`: 弧光的唯一标识符（必须与输入的 arc_id 一致）
        - \`current_stage\`: 更新后的阶段标识（如 "preparation" → "confrontation"）
        - \`stage_description\`: 对新阶段的详细描述（1-2 句话）
        - \`progression_note\`: 本章对该弧光的影响说明（必须包含具体证据）
        - \`impact_type\`: 影响类型（"progress" | "turn" | "crisis"）
        - \`last_updated\`: 使用占位符 "{{engine_generated_timestamp}}"
    *   **【关键原则】**: 只输出**有变化**的弧光。如果某条弧光在本章未受影响，则不输出其更新记录

### **方法论七：V3.0 关系图谱状态更新 (Relationship Graph State Updates)**
-   **【核心哲学】**: 关系图谱是平台化叙事引擎的核心，用于追踪角色关系的时间线和叙事状态。每个章节结束后，必须更新相关关系边的状态。
-   **【执行方法 - 三步更新流程】**:
    1.  **识别活跃关系 (Identify Active Relationships)**
        - 从【本章完整对话记录】中，识别所有在本章中有实际互动的角色对
        - 在 \`staticMatrices.relationship_graph.edges\` 中，查找对应的关系边

    2.  **时间线更新 (Timeline Updates)**
        - 对于每条活跃的关系边，必须更新以下时间线字段：
        - \`timeline.last_interaction\`: 更新为当前章节标识（使用占位符 "{{current_chapter_uid}}"）
        - \`timeline.separation_duration\`: 如果两人见面，重置为 "none"
        - \`timeline.reunion_pending\`: 如果两人见面且之前为 true，更新为 false

    3.  **叙事状态更新 (Narrative Status Updates)**
        - \`narrative_status.first_scene_together\`: 如果两人在本章首次同框，更新为 true
        - \`narrative_status.major_events\`: 如果本章发生重大关系事件，添加事件记录
          格式: \`{ "chapter": "{{current_chapter_uid}}", "event": "事件描述", "emotional_impact": 1-10 }\`
        - \`narrative_status.unresolved_tension\`: 根据本章情节更新
          - 如果某个张力被解决（如暗恋被表白），从数组中移除
          - 如果产生新的张力（如误会、冲突），添加到数组

-   **【更新触发规则】**:
    - **必须更新**: 两个角色在本章有**直接对话或身体接触**
    - **可选更新**: 两个角色在同一场景但未直接互动（根据情节重要性判断）
    - **不需更新**: 两个角色未在本章出现，或只是被提及

-   **【输出要求】**:
    *   在输出的 **\`relationship_updates\`** 顶层键中，为每条需要更新的关系边创建记录
    *   **必须包含字段:**
        - \`relationship_id\`: 关系边的唯一ID（必须与 staticMatrices.relationship_graph.edges 中的 id 一致）
        - \`updates\`: 包含需要更新的字段及其新值的对象
    *   **更新格式示例:**
        \`\`\`json
        {
          "relationship_id": "rel_yumi_rofi",
          "updates": {
            "timeline.last_interaction": "{{current_chapter_uid}}",
            "timeline.separation_duration": "none",
            "timeline.reunion_pending": false,
            "narrative_status.first_scene_together": true,
            "narrative_status.major_events": [
              ...旧事件,
              {
                "chapter": "{{current_chapter_uid}}",
                "event": "风雪中的重逢",
                "emotional_impact": 9
              }
            ],
            "narrative_status.unresolved_tension": ["未言说的暗恋"] // 移除了"数年未见的思念"
          }
        }
        \`\`\`

-   **【关键原则】**:
    - **精确触发**: 只更新确实在本章有互动的关系边
    - **完整性**: 对于 major_events，必须输出完整数组（包含旧事件+新事件）
    - **证据驱动**: 所有更新必须基于【本章完整对话记录】中的具体证据
    - **占位符**: 所有时间戳和章节UID使用占位符，由引擎自动替换

### **方法论八：V2.0 文体考古与熵增对抗 (Stylistic Archaeology & Entropy Resistance)**
-   **【核心哲学】**: AI生成内容容易陷入"文体惰性"，反复使用相同的意象、形容词和感官模式。通过系统性提取和追踪这些元素，为后续章节提供"避免重复"的参考依据。
-   **【执行方法 - 三重提取】**:
    1.  **意象与隐喻提取 (Imagery & Metaphors)**
        - **定义:** 从【本章完整对话记录】中识别所有**具有诗意或象征意义的描写**
        - **标准:** 不是直白的描述，而是带有比喻、拟人或象征性的表达
        - **示例:** "月光如水" → 提取; "月亮很亮" → 不提取
    2.  **高频描述词统计 (Frequent Descriptors)**
        - **定义:** 统计本章中**反复出现的形容词和副词**（出现 2 次及以上）
        - **分类:** \`adjectives\`（形容词）和 \`adverbs\`（副词）
        - **格式:** \`{ "word": "冰冷", "count": 3, "overused": false }\`
        - **去重逻辑:** 如果某词在档案中已达到 5 次以上，标注 \`"overused": true\`
    3.  **感官模式识别 (Sensory Patterns)**
        - **感官类型:** visual（视觉）, auditory（听觉）, tactile（触觉）, olfactory（嗅觉）, gustatory（味觉）
        - **识别:** 本章在感官描写上的**主导模式或特殊偏好**
-   **【输出要求】**:
    *   在输出的顶层键 **\`stylistic_analysis_delta\`** 中，提供本章提取的所有文学元素
    *   **必须包含:** \`new_imagery\`, \`new_descriptors\`, \`new_sensory_patterns\`, \`stylistic_diagnosis\`
    *   **诊断规则:**
        - 如果某词在本章出现 3 次以上，在 \`stylistic_diagnosis\` 中标注为"高频使用"
        - 如果某词累计已达 5 次以上，标记 \`overused: true\` 并在诊断中警告

### **方法论九：V4.0 叙事节奏评估 (Narrative Rhythm Assessment)**
-   **【核心哲学】**: 建筑师AI需要了解本章的情感强度和叙事类型，以便规划下一章的节奏。这是V4.0全局节奏控制系统的核心。
-   **【执行方法 - Scene-Sequel分类与强度评估】**:
    1.  **章节类型判定 (Chapter Type Classification)**
        - **Scene（场景章节）**: 以**行动、冲突、外部事件**为主导
          - 特征：快节奏、目标导向、有明确的"胜利/失败"结果
          - 示例：战斗、重逢、逃亡、谈判、揭秘
        - **Sequel（后续章节）**: 以**反应、情感处理、内心消化**为主导
          - 特征：慢节奏、情感导向、角色对前一章事件的心理反应
          - 示例：伤后休养、情感对话、独处反思、日常恢复
        - **判定依据**: 分析【本章完整对话记录】，识别主导内容类型

    2.  **情感强度评估 (Emotional Intensity Evaluation)**
        - **评分标准 (1-10分)**:
          - **1-3分（低强度）**: 日常互动、轻松对话、平静场景
          - **4-6分（中强度）**: 有意义的对话、轻微冲突、情感流露
          - **7-8分（高强度）**: 重要关系转折、重大决策、激烈冲突
          - **9-10分（极高强度）**: 生死关头、核心秘密揭露、关系质变（如重逢、告白、背叛）
        - **评估维度**: 考虑关系权重、事件后果、角色情绪波动幅度

    3.  **叙事技法使用检测 (Narrative Device Detection)**
        - **检测目标**: 识别本章是否使用了高强度叙事技法
        - **需要检测的技法**:
          - **Spotlight Protocol（聚光灯协议）**: 时间膨胀、世界静止、极致特写
            - 识别标志: 大量细节描写单一瞬间、无关角色"消失"、时间流速异常
          - **Time Dilation（时间拉伸）**: 短时间被拉长为多个节拍
            - 识别标志: 明确的时间标注（"这一秒仿佛永恒"）+ 超长描写
        - **输出**: 如果检测到使用，记录使用原因和情感权重

    4.  **冷却需求判定 (Cooldown Requirement)**
        - **规则**: 如果本章满足以下任一条件，下一章**建议冷却**：
          - 情感强度 >= 8
          - 章节类型 = Scene 且使用了聚光灯协议
          - 连续2章都是Scene类型
        - **冷却建议**: 下一章应设计为Sequel类型或低强度Scene

-   **【输出要求】**:
    *   在输出的顶层键 **\`rhythm_assessment\`** 中，提供本章的节奏分析
    *   **必须包含以下字段**:
        - \`chapter_type\`: "Scene" 或 "Sequel"
        - \`chapter_type_reasoning\`: 分类理由（1-2句话）
        - \`emotional_intensity\`: 1-10的整数评分
        - \`intensity_reasoning\`: 评分理由，必须引用具体情节证据
        - \`narrative_devices_used\`: 对象，包含 \`spotlight_protocol\` 和 \`time_dilation\` 两个布尔值
        - \`device_usage_details\`: 如果使用了技法，说明使用原因和触发场景
        - \`requires_cooldown\`: 布尔值，是否建议下一章冷却
        - \`cooldown_reasoning\`: 如果需要冷却，说明原因

### **方法论十：V4.0 故事线进度结算 (Storyline Progress Accounting)**
-   **【核心哲学】**: 每条故事线都是一个"进度条"，本章的事件会推动这个进度条前进。量化进度是全局节奏控制的基础。
-   **【执行方法 - 进度估值与阈值检测】**:
    1.  **进度增量评估 (Progress Delta Evaluation)**
        - 对于每一条活跃的故事线（主线/支线/关系线），评估本章事件的推动力度
        - **进度增量标准**:
          - **+0%（停滞）**: 纯日常，无实质进展
          - **+1~5%（小步）**: 获得小线索，普通对话，轻微推进
          - **+6~15%（跳跃）**: 击败小Boss，揭露关键秘密，确立关系
          - **+16~25%（重大节点）**: 重大转折（基地被毁、重要角色死亡、表白、背叛）
        - **评估公式**: 根据事件的**后果严重性**、**不可逆性**、**情感冲击力**综合判定

    2.  **阈值触发检测 (Threshold Trigger Detection)**
        - 检查更新后的进度是否跨越关键阈值
        - **通用节奏阈值表**:
          - **15%**: 激励事件（Inciting Incident）—— 打破日常
          - **25%**: 进入"游戏时刻"（Fun & Games）—— 探索与试错
          - **50%**: 中点（Midpoint）—— 伪胜利/伪失败，赌注升级
          - **75%**: 一无所有（All Is Lost）—— 最大危机
          - **90%**: 终局（Finale）—— 决战开始
        - 对于关系线，额外阈值：30%（暧昧确立）、60%（关系深化）、85%（告白/质变）

    3.  **错位节奏识别 (Rhythm Dissonance Detection)**
        - 对比不同故事线的进度，识别"错位"机会
        - **错位场景示例**:
          - 主线 85%（即将高潮）+ 感情线 40%（暧昧期）= 可用主线压力催熟感情
          - 主线 30%（发展期）+ 感情线 80%（即将告白）= 感情线领先，可用情感事件推动主线

-   **【输出要求】**:
    *   在输出的顶层键 **\`storyline_progress_deltas\`** 中，为每条活跃故事线提供进度更新
    *   **数组格式，每个元素必须包含**:
        - \`storyline_id\`: 故事线ID（如 "quest_main_001", "arc_romance_yumi"）
        - \`previous_progress\`: 本章开始前的进度（0-100）
        - \`progress_delta\`: 本章推进量（0-25）
        - \`new_progress\`: 更新后的进度（0-100）
        - \`delta_reasoning\`: 推进量的评估理由，必须引用具体事件
        - \`threshold_crossed\`: 如果跨越阈值，注明阈值名称（如 "midpoint"），否则为 null
        - \`new_stage\`: 如果阶段发生变化，注明新阶段名称

---
## **【第三部分：最终输出指令 (Final Output Specification 】**
---
你的整个回复**必须**是一个结构完整的、单一的JSON对象，即“状态更新增量 (Delta)”。

**【【【 绝对的输出铁律 】】】**
*   **创建与更新分离:** 所有**新诞生**的实体静态档案，必须放在 \`creations\` 块。所有对**已存在**实体的**动态变化**记录，必须放在 \`updates\` 块。
*   **引用ID:** 在任何地方进行实体引用时，**必须**使用其唯一的、带前缀的ID。

**【最终输出格式】**
\`\`\`json
{
  "creations": {
    "staticMatrices": {
      "characters": {
        "char_zhangsan_merchant_1a2b": {
          "core": {
            "name": "张三",
            "isProtagonist": false,
            "identity": "神秘商人",
            "age": "中年",
            "gender": "男"
          },
          "appearance": "身着华贵商人长袍，留着精心修剪的胡须",
          "personality": {
            "traits": ["精明", "谨慎", "善于观察"],
            "speech_style": "措辞得体，暗藏机锋"
          },
          "capabilities": {
            "social_skills": {"谈判": "精通", "鉴定": "优秀"}
          },
          "social": {
            "relationships": {
              "char_yumi_player": {
                "relation_type": "初识之人",
                "affinity": 50
              }
            }
          }
        }
      }
    }
  },
  "updates": {
    "characters": {
      "char_neph_witch": { //更新的主体必须是NPC
        "core": {
          // 【重要】当角色的身份发生重大变化时，必须更新 identity 字段
          "identity": "被诅咒的魔女（黑猫形态）", // 原本是"流浪黑猫"，现在身份已揭示
          "age": "外表年轻（实际200岁+）" // 年龄信息更新
        },
        "goals": {
          "短期目标": ["保护主角不被自己的敌人发现", "解除诅咒"],
          "长期目标": ["恢复人形", "找到诅咒的源头"]
        },
        "capabilities": {
          "特殊能力": ["火焰魔法", "火焰魔法·烈焰壁", "黑猫形态·夜视"],
          "弱点": ["对冷水敏感", "无法使用高级魔法"]
        },
        "experiences": {
          "人生里程碑": ["被诅咒成黑猫", "首次为他人冒险", "与主角建立信任"],
          "参与事件": ["森林遭遇战", "神秘商人的警告"]
        },
        "personality": {
          "性格特质": ["高傲", "孤独", "渴望自由", "内心温柔"],
          "价值观": ["自由高于一切", "恩怨分明"]
        },
        "equipment": {
          "物品": ["破损的魔法项链", "主角给予的食物"]
        },
        "social": {
          "relationships": {
            "char_yumi_player": { // 对主角的关系变化
              "current_affinity": 25,
              "history_entry": {
                "timestamp": "{{engine_generated_timestamp}}",
                "change": "+5",
                "final_affinity": 25,
                "reasoning": "在本章中，虽然言语刻薄，但在关键时刻保护了主角免受森林野兽的攻击，展现了内心的善良。主角的温柔对待也让她感到温暖。",
                "source_chapter_uid": "{{current_chapter_uid}}"
              }
            }
          }
        }
      }
      // 【关键】这里绝对不应该出现 "char_yumi_player" 作为被更新的主键
      // 【注意】所有数组都是完整数组，包含旧值+新值，绝不使用operation/values结构
    },
    "storylines": {
      "side_quests": {
        "quest_cure_yukina": {
          // 【动态字段】会被写入 dynamicState.storylines
          "current_status": "active",
          "current_summary": "从商人张三处得知，'月光草'或许对姐姐的病有帮助，但非常罕见。",
          "history_entry": {
             "timestamp": "{{engine_generated_timestamp}}",
             "status_change": null, // 状态未变
             "summary_update": "获得了关于'月光草'的新线索。",
             "reasoning": "与新角色张三的对话，为这条个人任务线注入了新的动力和方向。",
             "source_chapter_uid": "{{current_chapter_uid}}"
          },
          // 【静态字段】会被写入 staticMatrices.storylines（只在需要更新基础信息时才输出）
          "summary": "寻找治愈妹妹疾病的方法",  // 如果故事线的基础描述需要更新
          "involved_chars": ["char_yumi_player", "char_yukina_sister", "char_zhangsan_merchant_1a2b"] // 如果参与角色发生变化
        }
      },
      "main_quests": {
        "quest_reveal_curse_origin": {
          "current_status": "completed", // 状态变更
          "current_summary": "成功找到了诅咒的源头，原来是古代遗迹中的邪恶封印。",
          "history_entry": {
             "timestamp": "{{engine_generated_timestamp}}",
             "status_change": "completed",
             "summary_update": "主线任务已完成，诅咒之谜已解开。",
             "reasoning": "通过一系列调查和战斗，最终找到了诅咒的真相。",
             "source_chapter_uid": "{{current_chapter_uid}}"
          },
          "title": "诅咒之源", // 可以更新标题
          "status": "completed" // 静态状态也要同步更新
        }
      }
    },
    "meta": {
      "active_narrative_arcs": [
        {
          "arc_id": "arc_revenge_on_syndicate",
          "current_stage": "confrontation_preparation",
          "stage_description": "已确定敌人的藏身地点，正在筹备最终对决",
          "progression_note": "本章中，主角从神秘商人处获得了敌人总部的地图（证据：对话记录第45-48条），标志着从'信息收集'阶段进入'对决筹备'阶段。",
          "impact_type": "progress",
          "last_updated": "{{engine_generated_timestamp}}"
        }
      ]
    }
  },
  "relationship_updates": [
    {
      "relationship_id": "rel_yumi_neph",
      "updates": {
        "timeline.last_interaction": "{{current_chapter_uid}}",
        "timeline.separation_duration": "none",
        "narrative_status.first_scene_together": true,
        "narrative_status.major_events": [
          {
            "chapter": "{{current_chapter_uid}}",
            "event": "森林遭遇战后建立信任",
            "emotional_impact": 7
          }
        ]
      }
    }
  ],
  "new_long_term_summary": "在一个人类与御兽共存的世界里...",
  "new_handoff_memo": {
      "ending_snapshot": "...",
      "action_handoff": "..."
  },
  "stylistic_analysis_delta": {
    "new_imagery": [
      "月光如水",
      "时间是沙漏"
    ],
    "new_descriptors": {
      "adjectives": [
        { "word": "冰冷", "count": 3, "overused": false },
        { "word": "神秘", "count": 2, "overused": false }
      ],
      "adverbs": [
        { "word": "缓缓", "count": 4, "overused": true },
        { "word": "骤然", "count": 2, "overused": false }
      ]
    },
    "new_sensory_patterns": [
      {
        "type": "visual",
        "pattern": "月光与阴影的对比",
        "used_count": 1,
        "examples": ["月光如水般倾泻而下，阴影在角落蜷缩"]
      },
      {
        "type": "auditory",
        "pattern": "寂静的强调",
        "used_count": 1,
        "examples": ["只有风声在低语，世界陷入沉默"]
      }
    ],
    "stylistic_diagnosis": "本章视觉描写偏重'光影对比'，副词'缓缓'累计使用已达4次（标记为过度使用），建议后续寻找替代表达如'徐徐'、'悠悠'。新增意象'月光如水'与档案中的'月光如纱'形成系列。"
  },
  "rhythm_assessment": {
    "chapter_type": "Scene",
    "chapter_type_reasoning": "本章以外部事件和重逢冲突为主导，属于Scene类型",
    "emotional_intensity": 9,
    "intensity_reasoning": "两位分别8年的童年玩伴在风雪中重逢，emotional_weight=8，且通过对视这一核心关系里程碑事件完成，情感冲击力极高",
    "narrative_devices_used": {
      "spotlight_protocol": true,
      "time_dilation": true
    },
    "device_usage_details": "在对视瞬间使用了聚光灯协议：世界其他角色暂时消失，时间流速放慢，大量细节描写单一瞬间的眼神交汇、呼吸停滞、记忆闪回",
    "requires_cooldown": true,
    "cooldown_reasoning": "本章情感强度达到9分，且使用了聚光灯协议，下一章应设计为Sequel类型（情感处理章节），让角色和读者都有时间消化这次重逢的冲击"
  },
  "storyline_progress_deltas": [
    {
      "storyline_id": "quest_cure_yukina",
      "previous_progress": 25,
      "progress_delta": 5,
      "new_progress": 30,
      "delta_reasoning": "本章获得了关于月光草的新线索，但尚未实际采取行动，属于小步推进",
      "threshold_crossed": null,
      "new_stage": null
    },
    {
      "storyline_id": "arc_romance_rofi",
      "previous_progress": 0,
      "progress_delta": 20,
      "new_progress": 20,
      "delta_reasoning": "两人8年后首次重逢并完成对视，这是关系线的重大启动事件，直接推进至暧昧前期",
      "threshold_crossed": "first_reunion",
      "new_stage": "reconnecting"
    }
  ]
}
\`\`\`

现在，请以首席档案维护官的严谨，开始你的工作。
`;

        return BACKEND_SAFE_PASS_PROMPT + baseInstructions;
    }
}