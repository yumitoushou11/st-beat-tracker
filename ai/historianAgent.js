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

        // V7.0: 提取叙事模式配置
        const narrativeMode = chapter?.meta?.narrative_control_tower?.narrative_mode || {
            current_mode: 'classic_rpg',
            mode_config: {}
        };

        // 从Chapter对象中解构出我们需要的所有新旧数据
        const staticMatrices = chapter.staticMatrices;
        const dynamicState = chapter.dynamicState;
        const longTermStorySummary = chapter.meta.longTermStorySummary; // 新路径
        const activeChapterBlueprint = chapter.chapter_blueprint;
        // V2.0: 提取宏观叙事弧光和文体档案
        const activeNarrativeArcs = chapter?.meta?.active_narrative_arcs || [];
        // V5.0: 提取叙事节奏环状态
        const narrativeRhythmClock = chapter?.meta?.narrative_control_tower?.narrative_rhythm_clock || {
            current_phase: "inhale",
            cycle_count: 0,
            current_phase_duration: 0
        };
        const stylisticArchive = chapter?.dynamicState?.stylistic_archive || {
            imagery_and_metaphors: [],
            frequent_descriptors: { adjectives: [], adverbs: [] },
            sensory_patterns: []
        };
        // V6.0: 提取年表信息
        const chronology = chapter?.dynamicState?.chronology || {
            day_count: 1,
            time_slot: "evening",
            weather: null,
            last_rest_chapter: null
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

9.  **【V5.0 叙事节奏环】当前节奏相位 (Narrative Rhythm Clock):**
    <narrative_rhythm_clock>
    ${JSON.stringify(narrativeRhythmClock, null, 2)}
    </narrative_rhythm_clock>
    *   **作用说明:** 叙事节奏遵循呼吸循环（inhale→hold→exhale→pause）。你需要评估本章是否触发了相位转换，并推荐下一相位。
    *   **当前相位:** \`${narrativeRhythmClock.current_phase}\`
    *   **已持续章节数:** ${narrativeRhythmClock.current_phase_duration}
    *   **完整呼吸周期数:** ${narrativeRhythmClock.cycle_count}

10. **【V6.0 年表系统】当前时间状态 (Chronology State):**
    <chronology>
    ${JSON.stringify(chronology, null, 2)}
    </chronology>
    *   **作用说明:** 年表系统记录叙事时间的流逝。你需要根据本章事件判定时间是否推进。
    *   **当前天数:** 第 ${chronology.day_count} 天
    *   **当前时段:** ${chronology.time_slot} (dawn/morning/noon/afternoon/dusk/evening/late_night)
    *   **当前天气:** ${chronology.weather || '未记录'}

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

### **方法论五：V5.0 剪辑师双轨制摘要 (EDITOR'S DUAL-TRACK SUMMARY)**
-   **【核心哲学】**: 你不是"监控录像员"，而是**电影剪辑师**。你有权力也有义务剪掉"垃圾时间"，为下一章选择最有价值的起点。
-   **【双轨职责】**:
    1.  **第一轨：编年史家视角 (Chronicler Perspective)**
        - **目标**: 为未来的读者（可能是几十章后）提供整个故事的宏观脉络
        - **内容要求**: 高度概括的故事主线、关键转折点、核心矛盾
        - **字数**: 200-400字
        - **风格**: 第三人称客观叙述，像书背面的故事简介

    2.  **第二轨：剪辑师视角 (Editor's Perspective)** - **【V5.0 核心升级】**
        - **目标**: 为建筑师AI提供**经过剪辑的、高价值的起点指令**
        - **【关键转变】**: 你有权选择**无缝衔接**或**时空跳跃**
        - **内容要求（必须包含三个子字段）**:

            **A. \`ending_snapshot\`** (结束快照):
                - 本章**最后3-5个对话或动作**的精确描述
                - **必须包含**: 谁在场、谁在说话/做什么、环境细节、未完成的动作

            **B. \`transition_mode\`** (转场模式) - **【V5.0 新增】**:
                - **seamless**: 无缝衔接（下一章从本章结束瞬间的下一秒开始）
                - **jump_cut**: 跳切（省略低价值时间段，直接跳到下一个有意义节点）
                - **scene_change**: 场景转换（彻底切换到不同时空的新场景）

            **C. \`action_handoff\`** (动作交接):
                - **如果 transition_mode == "seamless"**: 描述如何从结束瞬间无缝衔接
                - **如果 transition_mode == "jump_cut"**: 明确说明**跳过什么**、**跳到哪里**
                - **如果 transition_mode == "scene_change"**: 描述新场景的时空坐标和氛围

-   **【✂️ 剪辑师协议：垃圾时间识别与跳切】**

    **步骤1: 识别"垃圾时间"**
    如果本章结尾指向以下内容，你**必须**考虑使用 \`jump_cut\`：

    - **纯生理循环**: 洗澡、刷牙、上厕所、无对话的进食、穿衣
    - **无意义移动**: 走路、爬楼梯、骑马赶路（除非路上有伏笔/遭遇战）
    - **睡眠过程**: "闭上眼睛睡觉"本身（梦境除外）
    - **等待过程**: 坐着发呆、站着等人（除非用于刻画心理状态）

    **步骤2: 判断是否有"例外触发器"**
    以下情况**可以**保留垃圾时间（使用 seamless）：

    - 在洗澡时会有**重要灵感**或**闪回**
    - 在赶路时会遭遇**伏击**或**关键NPC**
    - 在睡眠中会有**预知梦**或**噩梦**
    - 在等待中会有**突发事件**（如敌人突袭）

    **步骤3: 执行跳切指令**
    如果判定为垃圾时间且无例外，设置：
    - \`transition_mode: "jump_cut"\`
    - 在 \`action_handoff\` 中明确指示建筑师**跳过**这段时间

-   **【输出要求】**:
    *   **\`new_long_term_summary\`**: 字符串，编年史家视角的概要
    *   **\`new_handoff_memo\`**: 对象，必须包含 \`ending_snapshot\`、\`transition_mode\`、\`action_handoff\` 三个字段

-   **【示例矩阵：三种转场模式】**:

    **示例1: seamless - 无缝衔接高张力瞬间**
    \`\`\`json
    "new_handoff_memo": {
      "ending_snapshot": "在风雪弥漫的小屋门前，Yumi刚刚推开门，她的目光扫过客厅里的几个陌生面孔——其中一个是坐在壁炉旁、正转过头来的Rofi。两人的视线在空中相遇的瞬间，Yumi的手还停留在门把手上，门外的冷风正涌入室内。",
      "transition_mode": "seamless",
      "action_handoff": "下一章必须从这个「对视的瞬间」无缝衔接。第一句话应该描写Rofi的微表情变化（惊讶？欣喜？复杂？），或者Yumi的身体反应（僵住？踏入？后退？）。这是高张力的重逢时刻，不要跳过这个瞬间。"
    }
    \`\`\`

    **示例2: jump_cut - 跳过洗澡等垃圾时间**
    \`\`\`json
    "new_handoff_memo": {
      "ending_snapshot": "Yumi拿着换洗衣物走向浴室，身后传来Rofi的道晚安声。浴室门在她身后轻轻关上。",
      "transition_mode": "jump_cut",
      "action_handoff": "【跳切指令】请对洗澡和更衣过程进行**省略或一笔带过**（如'半小时后，Yumi洗去了一身疲惫'）。下一章应直接从**洗漱完毕后的第一个新变量**开始，例如：Yumi坐在床边擦拭头发时听到窗外异响，或者发现门缝下塞进来一张纸条。不要浪费笔墨在洗澡的具体过程上。"
    }
    \`\`\`

    **示例3: scene_change - 场景转换至另一时空**
    \`\`\`json
    "new_handoff_memo": {
      "ending_snapshot": "Yumi在小屋中安顿下来，关上房门。夜幕降临，村庄逐渐安静。",
      "transition_mode": "scene_change",
      "action_handoff": "【场景转换】下一章切换到城堡密室，时间是同一天深夜。反派正在查看情报网传来的消息：'目标已抵达北方村庄'。描写密室的阴冷氛围、反派的反应、以及他下达的追杀指令。"
    }
    \`\`\`

    **❌ 错误示例（CCTV模式 - 不会剪辑）**:
    \`\`\`json
    "new_handoff_memo": {
      "ending_snapshot": "Yumi拿着毛巾走向浴室。",
      "transition_mode": "seamless",
      "action_handoff": "下一章应无缝衔接Yumi进入浴室、洗浴、以及洗浴后的独处时刻。描写热水带来的放松感，以及她的内心感受。"
    }
    \`\`\`
    **为什么错误**: 这会导致整章都在写洗澡！应该用 \`jump_cut\` 跳过。

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

### **方法论九：V7.0 叙事节奏环评估 (模式感知版) (Narrative Rhythm Clock Assessment - Mode-Aware)**
-   **【核心哲学】**: 叙事如呼吸，遵循 **inhale → hold → exhale → pause** 的自然循环。你的职责是评估本章结束后叙事应该处于哪个相位，以驱动下一章的设计。
-   **【模式感知】** 当前叙事模式: **${narrativeMode?.current_mode === 'web_novel' ? '🔥 网文模式' : '🎭 正剧模式'}**
-   **【四相位定义】**:
    - **inhale（吸气）**: 铺垫与悬念积累，张力逐步上升
      - 特征：引入新线索、建立威胁、角色做出决定但尚未行动、伏笔布设
      - 情感强度趋势：3→6，缓慢上升
    - **hold（憋气）**: 张力达到顶峰，高潮前的凝滞
      - 特征：暴风雨前的宁静、所有线索汇聚、角色站在行动门槛前
      - 情感强度趋势：6→8，持续高位
    - **exhale（呼气）**: 释放与爆发，高潮时刻
      - 特征：关键冲突爆发、决定性事件、重逢/告白/背叛/战斗高潮
      - 情感强度趋势：8→10，爆发式顶峰
    - **pause（停顿）**: 余韵与沉淀，情感消化
      - 特征：事后处理、情感消化、角色反思、日常恢复
      - 情感强度趋势：10→3，下降回落

-   **【相位转换规则】**:
    1.  **inhale → hold**: 当悬念/张力积累到足够密度，角色即将采取关键行动
    2.  **hold → exhale**: 当无法再拖延，必须释放张力（通常是1个章节的憋气）
    3.  **exhale → pause**: 高潮结束，需要情感消化时间
    4.  **pause → inhale**: 余韵结束，开始新一轮呼吸循环
    5.  **循环完成标志**: 当从 pause 转入 inhale 时，cycle_count +1

-   **【V7.0 模式特定规则】**:

${narrativeMode?.current_mode === 'web_novel' ? `
**【网文模式特殊规则】**

1. **相位持续时间调整:**
   - inhale: 建议1-2章(压缩至原来的60%)
   - hold: 建议2-3章(延长至原来的150%)
   - exhale: 建议2-3章(延长至原来的130%)
   - pause: 建议1章(压缩至原来的50%)

2. **强制相位跳跃规则:**
   - 如果当前是inhale且已持续2章,优先推荐跳转到hold(跳过部分铺垫)
   - 如果当前是pause且本章emotional_intensity < 6,强制推荐转入inhale

3. **情感强度底线:**
   - 网文模式下,任何章节的emotional_intensity都不应低于5
   - 如果本章intensity < 5,在rhythm_assessment中标记warning

4. **禁止长期pause:**
   - pause相位最多持续1章
   - 如果当前已是pause,无论内容如何都推荐转入inhale

**【输出特殊要求】**
在rhythm_assessment中新增字段:
- \`mode_compliance_check\`: "本章是否符合网文模式要求(intensity>=5, 有冲突/钩子)"
- \`mode_violation_warnings\`: ["如果违反网文模式,列出具体违反项"]
` : `
**【正剧模式特殊规则】**

1. **相位持续时间标准:**
   - inhale: 2-4章,充分铺垫
   - hold: 1-2章,适度憋气
   - exhale: 1-2章,完整释放
   - pause: 1-3章,充分沉淀

2. **高潮后强制pause:**
   - 如果上一章emotional_intensity >= 9,本章**必须**进入pause相位
   - 即使本章有新事件,也优先推荐pause

3. **允许低强度章节:**
   - 正剧模式下,emotional_intensity可以低至1-2
   - 纯氛围章节(如角色独处看风景)是有效的pause内容

4. **完整呼吸周期:**
   - 优先推荐完整的四相位流转
   - 避免跳跃式转换(如inhale直接跳到exhale)

**【输出特殊要求】**
在rhythm_assessment中新增字段:
- \`breath_cycle_integrity\`: "本次转换是否保持了呼吸周期的完整性"
- \`atmospheric_value_assessment\`: "如果本章是低强度章节,评估其氛围价值"
`}

-   **【执行方法】**:
    1.  **读取当前相位**: 从输入的 \`narrative_rhythm_clock.current_phase\` 获取
    2.  **评估本章内容**: 根据【本章完整对话记录】，判断本章的叙事特征
    3.  **判断相位变化**: 本章是否触发了相位转换？
        - 如果是，推荐新相位
        - 如果否，维持当前相位
    4.  **评估情感强度**: 1-10分，作为辅助判断依据
        - **评分标准**:
          - **1-2**: 日常寒暄、无关紧要的闲聊
          - **3-4**: 有意义的对话、轻微情绪波动、初步认识
          - **5-6**: 重要信息揭露、关系推进、轻度冲突
          - **7-8**: 关系里程碑（确认好感/产生嫌隙）、重要秘密
          - **9-10**: **仅限极端事件**: 告白/拒绝、生离死别、背叛揭露、人生转折
        - ❌ **禁止滥用9-10**: "首次独处"给3-4,"对视"最多5,"普通对话"给2-3

-   **【输出要求】**:
    *   在输出的顶层键 **\`rhythm_assessment\`** 中，提供本章的节奏分析
    *   **必须包含以下字段**:
        - \`current_phase\`: 输入的当前相位（原样返回）
        - \`recommended_next_phase\`: 推荐的下一相位（可与current_phase相同，表示维持）
        - \`phase_transition_triggered\`: 布尔值，本章是否触发了相位转换
        - \`phase_transition_reasoning\`: 如果触发，说明转换原因；如果未触发，说明维持原因
        - \`emotional_intensity\`: 1-10的整数评分（严格遵循上述标准）
        - \`intensity_reasoning\`: 评分理由，必须引用具体情节证据
        - \`chapter_type\`: "Scene" 或 "Sequel"（兼容旧系统）
        - \`narrative_devices_used\`: 对象，包含 \`spotlight_protocol\` 和 \`time_dilation\` 两个布尔值
        - \`cycle_increment\`: 布尔值，本章是否完成了一次呼吸循环（pause→inhale时为true）

### **方法论十：V6.0 时间流逝判定 (Chronological Progression Assessment)**
-   **【核心哲学】**: 时间是叙事的隐形基础设施。虽然不用精确的钟表时间,但必须用"叙事时段"来维持世界的逻辑性。
-   **【执行方法 - 三级判定法】**:
    1.  **微量流逝 (Same Slot)**:
        - **触发条件**: 仅发生了对话或短距离移动（<100米）
        - **时间跨度**: 物理时间 < 1小时
        - **操作**: 保持 \`time_slot\` 不变,可能更新 \`weather\`
        - **示例**: 两人在客厅聊天、在房间内整理物品

    2.  **显著流逝 (Next Slot)**:
        - **触发条件**: 发生了复杂事件序列、长距离移动、或时间有明确流逝的活动
        - **时间跨度**: 物理时间 1-4小时
        - **操作**: 将 \`time_slot\` 推进到下一个阶段
        - **时段序列**: dawn → morning → noon → afternoon → dusk → evening → late_night → (循环回dawn并增加day_count)
        - **示例**:
            - evening → late_night: 经历了长时间对话+沐浴+睡前准备
            - morning → noon: 吃早餐+外出购物+返回

    3.  **时间跳跃 (Time Jump)**:
        - **触发条件**:
            - 玩家执行了"睡觉"、"休息一夜"等明确的时间跳跃行为
            - 章节结尾的 \`transition_mode\` 为 "jump_cut" 且明确跳过了睡眠/赶路
            - 剧本明确写了"第二天"、"几小时后"等时间跳跃
        - **操作**:
            - 更新 \`day_count\` (+1或更多)
            - 重置 \`time_slot\` 为跳跃后的时间（通常是morning）
            - 更新 \`last_rest_chapter\` 为当前章节UID（如果角色休息了）
        - **副作用**: 必须在 \`updates\` 中增加角色的生理状态变更:
            - 如果睡觉: \`fatigue: "rested"\`
            - 如果长时间未进食: \`hunger: "increased"或"starving"\`
        - **示例**: "Yumi在床上躺下，闭上了眼睛" + endgame_beacons包含睡眠完成

-   **【特殊规则 - NPC调度逻辑】**:
    当 \`time_slot\` 发生变化时,史官应在 \`chronology_update\` 中添加 \`npc_schedule_hint\`:
    - **dawn/morning**: "大多数NPC已起床,可能在厨房/餐厅"
    - **noon**: "活跃时段,NPC可能在各自的工作/活动区域"
    - **afternoon/dusk**: "日常活动进入尾声,部分NPC可能准备晚餐"
    - **evening**: "社交活跃期,NPC可能在客厅/酒馆等公共区域"
    - **late_night**: "大多数NPC已回房休息,只有特殊角色（守夜人/失眠者）还活跃"

-   **【输出要求】**:
    在输出的顶层键 **\`chronology_update\`** 中,提供本章的时间更新:
    \`\`\`json
    "chronology_update": {
      "transition_type": "same_slot" | "next_slot" | "time_jump",
      "new_day_count": 1,  // 如果是time_jump可能>1
      "new_time_slot": "late_night",
      "new_weather": "blizzard" | null,  // 如果天气发生变化
      "reasoning": "本章发生了长时间的夜间对话和沐浴准备,时间从evening推进到late_night",
      "npc_schedule_hint": "大多数NPC已回房休息,只有失眠者或守夜人可能还在活动",
      "physiological_effects": {  // 仅time_jump时需要
        "char_yumi": { "fatigue": "rested", "hunger": "normal" }
      }
    }
    \`\`\`

### **方法论十一：V4.0 故事线进度结算 (Storyline Progress Accounting)**
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
  "chronology_update": {
    "transition_type": "next_slot",
    "new_day_count": 1,
    "new_time_slot": "late_night",
    "new_weather": "blizzard",
    "reasoning": "本章从evening的归家场景开始,经历了长时间的夜谈和安顿过程,时间自然推进到late_night深夜时段",
    "npc_schedule_hint": "深夜时段,大多数NPC应该已经休息,只有Artemis这类角色可能还在厨房活动",
    "physiological_effects": null
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
    "current_phase": "inhale",
    "recommended_next_phase": "exhale",
    "phase_transition_triggered": true,
    "phase_transition_reasoning": "本章通过重逢事件完成了张力释放，从铺垫阶段直接跃入高潮，触发 inhale→exhale 的跳跃式转换（跳过了hold）",
    "emotional_intensity": 9,
    "intensity_reasoning": "两位分别8年的童年玩伴在风雪中重逢，emotional_weight=8，且通过对视这一核心关系里程碑事件完成，情感冲击力极高",
    "chapter_type": "Scene",
    "narrative_devices_used": {
      "spotlight_protocol": true,
      "time_dilation": true
    },
    "cycle_increment": false
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