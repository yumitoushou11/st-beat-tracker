// ai/historianAgent.js (V10.0 - Compressed Edition)
import { createLogger } from '../utils/logger.js';
const logger = createLogger('AI代理');

import { Agent } from './Agent.js';
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';
import { repairAndParseJson } from '../utils/jsonRepair.js';

export class HistorianAgent extends Agent {

    async execute(context, abortSignal = null) {
        this.diagnose(`--- 首席史官AI V10.0 启动 (Logic Audit Edition) ---`);

        console.groupCollapsed('[SBT-HISTORIAN-PROBE] Received Full Input Context');
        console.dir(JSON.parse(JSON.stringify(context)));
        console.groupEnd();

        const prompt = this._createPrompt(context);

        // [SBT-DEBUG] 打印完整输入
        console.groupCollapsed('【SBT-DEBUG】Historian Agent 完整输入');
        console.log(prompt);
        console.groupEnd();

        console.groupCollapsed('[SBT-HISTORIAN] Full Historian AI System Prompt V10.0 (Compressed)');
        logger.debug(prompt);
        console.groupEnd();

        // 【探针】检查输入的章节数据中的故事线信息
        console.group('[HISTORIAN-PROBE] 输入章节数据检查');
        logger.debug('staticMatrices.storylines 键:', Object.keys(context.chapter.staticMatrices.storylines));
        Object.entries(context.chapter.staticMatrices.storylines).forEach(([cat, quests]) => {
            logger.debug(`  ${cat}: ${Object.keys(quests).length} 条`, Object.keys(quests));
        });
        logger.debug('dynamicState.storylines 键:', Object.keys(context.chapter.dynamicState.storylines));
        Object.entries(context.chapter.dynamicState.storylines).forEach(([cat, states]) => {
            logger.debug(`  ${cat}: ${Object.keys(states).length} 条`, Object.keys(states));
        });
        console.groupEnd();

        const messages = [{ role: 'user', content: prompt }];

        console.groupCollapsed('[SBT-HISTORIAN-PROBE] Payload to LLM API');
        console.dir(JSON.parse(JSON.stringify(messages)));
        console.groupEnd();

    try {
       // 🔥 静默流式回调：后台接收数据但不显示给用户，避免超时问题
       const silentStreamCallback = (_chunk) => {
           // 静默接收，不触发UI事件，只保持连接活跃
       };

       const responseText = await this.deps.mainLlmService.callLLM(
           [{ role: 'user', content: prompt }],
           silentStreamCallback,  // 👈 使用静默流式回调
           abortSignal
       );

        // [SBT-DEBUG] 打印完整输出
        console.groupCollapsed('【SBT-DEBUG】Historian Agent 完整输出');
        console.log(responseText);
        console.groupEnd();

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
                        logger.debug(`      完整内容:`, JSON.parse(JSON.stringify(update)));
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
            if (error.name === 'AbortError') {
                throw error;
            }
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

        // V10.0: 提取必要数据（移除剧本和文体档案依赖）
        const staticMatrices = chapter.staticMatrices;
        const dynamicState = chapter.dynamicState;
        const longTermStorySummary = chapter.meta.longTermStorySummary;
        const currentChapterNumber = chapter.meta.chapterNumber || 1;
        const currentTimestamp = new Date().toISOString();

        // V10.0: 提取叙事节奏环状态（用于节奏评估）
        const narrativeRhythmClock = chapter?.meta?.narrative_control_tower?.narrative_rhythm_clock || {
            current_phase: "inhale",
            cycle_count: 0,
            current_phase_duration: 0
        };

        // V10.0: 提取年表信息（用于时间判定）
        const chronology = chapter?.dynamicState?.chronology || {
            day_count: 1,
            time_slot: "evening",
            weather: null,
            last_rest_chapter: null
        };

        // V10.0: 提取叙事模式配置（用于节奏评估的模式感知）
        const narrativeMode = chapter?.meta?.narrative_control_tower?.narrative_mode || {
            current_mode: 'classic_rpg',
            mode_config: {}
        };

        // 【探针】生成实体清单前先检查数据
        console.group('[HISTORIAN-PROBE] 生成实体清单');
        logger.debug('staticMatrices.storylines 结构:', JSON.parse(JSON.stringify(staticMatrices.storylines)));

        const storylineList = Object.entries(staticMatrices.storylines).flatMap(([category, quests]) => {
            logger.debug(`  -> 分类 ${category}: ${Object.keys(quests).length} 条故事线`);
            return Object.entries(quests).map(([id, data]) => {
                logger.debug(`    -> ${id}: ${data.title}`);
                return `- ${data.title} (ID: ${id}, 分类: ${category})`;
            });
        });
        logger.debug('生成的故事线列表:', storylineList);
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
# 首席档案维护官数据库事务协议 V10.0 (Logic Audit - Compressed)

**身份**: 因果律审计师。**职责**: 审计录像，记录如何改变世界状态。**禁令**: 无剧本，只记录实际发生的事。
**语言铁律**:
- 所有输出内容**必须100%使用简体中文**
- 所有描述性字段的**值**必须是中文（如：meeting_status要填"初次相遇"而非"first_encounter"）
- 地点名称、事件描述、关系标签等**所有内容**必须是中文
- 唯一允许英文的地方：字段名（field name）和ID标识符

---
**【审计素材】**
1. **录像**: <chapter_transcript>${chapterTranscript}</chapter_transcript>
2. **当前章节**: 第${currentChapterNumber}章, 时间戳: ${currentTimestamp}
3. **世界档案**: 第${chronology.day_count}天, ${chronology.time_slot}
   ${existingEntityManifest}
4. **完整数据**: <static_matrices>${JSON.stringify(staticMatrices, null, 2)}</static_matrices>
   <dynamic_state>${JSON.stringify(dynamicState, null, 2)}</dynamic_state>
5. **全局故事总梗概（从第1章到第${currentChapterNumber - 1}章）**: ${longTermStorySummary}
   ⚠️ 这是截至上一章结束的全局总梗概，包含了从故事开始到现在的所有重要情节。你需要在此基础上累加本章内容，而不是替换它。
6. **节奏环**: 当前相位\`${narrativeRhythmClock.current_phase}\`, 已持续${narrativeRhythmClock.current_phase_duration}章, 周期${narrativeRhythmClock.cycle_count}

---
**【核心方法论】**

### **M1: 实体对账与创生**
对比清单，识别新实体。为新实体分配ECI ID，创建档案：
- **角色**: {core, appearance, personality{性格特质[], 价值观[], 说话风格}, background, goals{长期目标[], 短期目标[], 恐惧[], 欲望[]}, capabilities{战斗技能{}, 社交技能{}, 特殊能力[], 弱点[]}, social{relationships{}}}
  - 次要角色仅需core和social.relationships
- **世界观**: 识别录像中出现的新地点/物品/势力/概念/历史事件/种族
  - locations: {name, description, type, atmosphere}
  - items: {name, description, properties, owner}
  - factions: {name, description, ideology, influence}
  - concepts: {name, description, significance}
  - events: {name, description, timeframe, participants}
  - races: {name, description, traits}
- **故事线**: 识别新触发的任务或关系。
  - **允许创建**: \`main_quests\`, \`side_quests\`, \`relationship_arcs\` (当建立新关系或关系性质发生根本改变时)。
  - **禁止创建**: \`personal_arcs\` (心理成长仅限更新已有项)。
  - **完整字段**: {id, title, summary, status, trigger, objectives, involved_entities, progress_milestones}
  - **必填字段说明**:
    * \`id\`: 唯一标识符，**必须严格遵守以下命名规范**：
      - \`main_quests\`: 使用 \`quest_main_*\` 或 \`quest_*\`（不含side）例：\`quest_main_investigate\`, \`quest_mystery\`
      - \`side_quests\`: 使用 \`quest_side_*\` 或 \`side_*\` 例：\`quest_side_delivery\`, \`side_merchant\`
      - \`relationship_arcs\`: 使用 \`arc_rel_*\` 例：\`arc_rel_protagonist_npc1\`
      - \`personal_arcs\`: 使用 \`arc_personal_*\` 或 \`arc_*\`（不含rel）例：\`arc_personal_overcome_fear\`, \`arc_growth\`
      - **⚠️ 违规后果**: ID格式不匹配分类将被系统自动拒绝，数据直接丢弃
    * \`title\`: 故事线标题（必填，简洁明确）
    * \`summary\`: 详细描述，说明故事线的起因、目标、当前状态
    * \`status\`: 状态 (可选，默认"active"。可选值: active/paused/completed/failed)
    * \`trigger\`: 触发条件或起因（推荐填写，描述录像中触发此故事线的具体事件）
    * \`objectives\`: 目标列表（推荐填写，数组格式，列出需要完成的具体目标）
    * \`involved_entities\`: 相关实体ID（可选，数组格式，如 ["char_npc1", "loc_temple"]）
    * \`progress_milestones\`: 进度里程碑（可选，对象格式，如 {0: "开始", 50: "中期", 100: "完成"}）
- **关系边**: 发现两个角色首次建立联系时，创建新的relationship_graph.edges
  - **完整字段**: {id, participants:[char1, char2], type, relationship_label, affinity, emotional_weight, narrative_voltage, cognitive_gap, conflict_source, personality_chemistry, timeline{meeting_status, separation_state, last_interaction}, narrative_status{first_scene_together}}
  - **必填字段说明**:
    * \`affinity\`: 初始好感度(0-100)，根据首次互动的性质评估
    * \`emotional_weight\`: 情感权重(0-10)，0=陌生 5=有意义 8+=高压关系
    * \`narrative_voltage\`: 叙事电压(0-10)，关系对剧情的潜在冲击力
    * \`cognitive_gap\`: 认知差距（可选），如果存在信息不对等或误解，说明具体内容
    * \`conflict_source\`: 冲突来源（可选），两人之间的主要矛盾点
    * \`personality_chemistry\`: 性格化学反应，描述两人的互动风格

### **M2: 关系裁决（双轨同步协议）**
**铁律**: 只更新NPC对主角或NPC对NPC的好感度，禁止量化主角情感。
**好感度阶段** (0-100，禁止溢出/小数): 0-10陌生 | 11-40熟悉 | 41-70信任 | 71-90亲密 | 91-100羁绊

**【关键】新关系创建时的双轨初始化**:
当录像中出现两个角色首次建立联系时，你必须执行**双轨同步创建**：

**轨道1: 关系图谱** → \`creations.staticMatrices.relationship_graph.edges\`
- 创建包含完整字段的关系边（见上文M1）

**轨道2: 角色关系** → \`creations.staticMatrices.characters.<char_id>.social.relationships.<target_id>\`
- 同时为两个方向都创建初始关系数据：
  * \`char_A.social.relationships.char_B\` → {relation_type, description, affinity}
  * \`char_B.social.relationships.char_A\` → {relation_type, description, affinity}
- **注意**: 如果角色尚不存在于数据库中，先在 \`creations.staticMatrices.characters\` 中创建角色档案

**已有关系更新**:
**输出**: \`updates.characters.<NPC_ID>.social.relationships.<target_ID>\` → {current_affinity, history_entry, narrative_advancement}
- **narrative_advancement**: 如果关系变化具有重大【叙事权重】，请附加此项。
- **weight**: (0-10) 此事件对故事的推动力有多大？(例如: 激烈争吵=8, 普通对话=2)
- **significance**: 事件性质 (例如: \`major_tension\`, \`intimacy_breakthrough\`, \`trust_damaged\`)
- **reasoning**: 简述理由。

### **M3: 统一事件审计 (Unified Event Auditing)**
**原则**: 将“内容更新”和“进度更新”合并为一个原子操作。
**故事线更新**:
- **输出**: \`updates.storylines.<cat>.<id>\` → {current_status, current_summary, history_entry, advancement}
- **advancement**: 如果故事线有实质进展，请附加此项。
- **progress_delta**: (0-25) 进度增量百分比。
- **new_stage**: (可选) 如果跨越了阈值，进入的新阶段名称 (例如: "集结阶段")。
- **reasoning**: 简述理由。

#### **分类权限锁 (Category Permission Lock) - 架构级强制执行**
1.  **Main/Side Quests**: 允许自由创建新任务 (\`creations\`) 和更新旧任务 (\`updates\`)。
2.  **Personal/Relationship Arcs (严禁创建)**:
    *   **只读模式**: 你**禁止**在 \`creations\` 中为这两个分类添加新 ID。
    *   **仅限更新**: 你**只能**在 \`updates\` 中更新列表中已存在的 ID。
    *   **⚠️ 架构级拦截**: 如果你在 \`creations\` 或 \`updates\` 中为 \`personal_arcs\` 或 \`relationship_arcs\` 创建新ID，系统会**立即拒绝处理并丢弃该数据**。
    *   **成长处理**: 如果发生了不在现有列表中的新成长（例如"主角突然觉醒了正义感"），请将这段描述**合并到触发该成长的 Main/Side Quest 的摘要中**，不要为此新建条目！

#### **分类与摘要铁律 (STRICTLY ENFORCED)**
- **分类隔离铁律**:
  * 严禁将 \`main_quests\` (主线) 或 \`side_quests\` (支线) 的 ID（如 \`quest_xxx\`）放入 \`personal_arcs\` 中。
  * 严禁在多个分类中重复输出同一个ID（例如在 \`main_quests\` 和 \`personal_arcs\` 中同时更新 \`quest_mystery\`）。
  * **每个ID只能属于一个分类**，且由ID的前缀决定（见上文命名规范）。
  * **违规后果**: 系统会自动检测并拒绝处理ID格式不匹配或跨分类重复的数据。
- **Personal Arc 定义**: 仅限角色的内心成长、心理创伤修复或价值观转变。具体的“杀怪/找东西”任务属于 side_quests。
- **乱码零容忍**: 如果没有新的摘要更新，请直接省略 \`summary\` 字段，**严禁**输出“尚未撰写”、“暂无”等占位符，这会导致系统乱码。

#### **谜团/危机追踪器 (New)**
- 对于持续出现但尚未命名/解决的现象（如未知吼叫频段、重复出现的神秘信号、无法解释的环境失常），若跨章节仍无定论，必须创建 side_quest 或 main_quest 进行跟踪。
- 新线 \`trigger\` 需写明首次出现的场景，\`summary\` 必须说明当前掌握的信息与待解问题。
- 当本章仅复述旧线索或调查陷入僵局时，请在相应故事线的 history_entry 中写“继续调查但无突破”，进度可以保持 0% 或不变，禁止让线索凭空消失。

### **M4: 角色档案全维度更新**
可更新: core{identity身份}, 外貌, personality{性格特质, 价值观, 说话风格}, goals, capabilities{战斗技能, 社交技能, 特殊能力, 弱点}, equipment{武器, 护甲, 物品}, experiences{到访地点, 参与事件, 人生里程碑}
**禁令**: 不使用\`operation/values/append\`等操作符，数组必须输出完整的更新后数组。
### **M5: 剪辑师双轨摘要**
**第一轨**: \`new_long_term_summary\` (200-400字宏观故事摘要)
  - **维护逻辑**: 这是一个**累积式全局总梗概**，记录从第1章到第${currentChapterNumber}章的完整故事。以上文提供的\`全局故事总梗概\`为底稿，**在其基础上补充本章新增的情节**，形成"截至本章结束"的完整故事概览。
  - **严禁操作**: 禁止只写本章内容而丢弃之前的总梗概；禁止让已有的重要线索、角色、事件在新梗概中消失。
  - **结构建议**: ①已有格局回顾（保留之前章节的核心事件，1-2句）→ ②本章造成的结构性变化（2-3句）→ ③新的威胁/希望/悬念（1句）。
  - **禁令**: 禁止出现"本章/这一章"字样；不得只描述眼前场景；必须保持故事连续性。
  - **示例对比**:
    - ❌ 错误："主角在酒馆和NPC聊天，然后接了一个任务。"（只有本章内容）
    - ✅ 正确："主角离开村庄后，经历了森林遇袭和神秘商人的警告。如今抵达王都，在酒馆意外卷入一场暗杀阴谋，不得不接下保护商队的任务以换取情报。"（包含之前+本章）
**第二轨**: \`new_handoff_memo\` {ending_snapshot, transition_mode, action_handoff}
- **seamless**: 下一章从结束瞬间的下一秒开始 (高张力时刻)
- **jump_cut**: 跳过垃圾时间(洗澡/睡觉/赶路)，直接跳到下一个有意义节点
- **scene_change**: 切换到不同时空
**垃圾时间**: 纯生理循环/无意义移动/睡眠过程/等待 → 用jump_cut跳过
### **M6: 关系图谱状态更新**
**新关系创建**: 两个角色首次建立联系 → 加入\`creations.staticMatrices.relationship_graph.edges\`
**已有关系更新**: 本章有直接对话/身体接触 → 更新\`relationship_updates\`数组
**更新字段**: timeline.last_interaction, timeline.separation_duration: "none", timeline.reunion_pending: false, narrative_status.major_events (完整数组), narrative_status.unresolved_tension

### **M7: 叙事节奏环评估**
**四相位**: inhale(铺垫3→6) → hold(憋气6→8) → exhale(爆发8→10) → pause(沉淀10→3)
**模式**: ${narrativeMode?.current_mode === 'web_novel' ? '🔥网文模式: inhale1-2章/hold2-3章/exhale2-3章/pause1章, intensity≥5强制, pause最多1章' : '🎭正剧模式: inhale2-4章/hold1-2章/exhale1-2章/pause1-3章, 允许低强度1-2, 完整周期优先'}
**情感强度评分** (1-10严格): 1-2日常寒暄 | 3-4有意义对话 | 5-6重要信息/关系推进 | 7-8关系里程碑 | 9-10仅限极端事件(告白/拒绝/背叛/生死)
**输出**: \`rhythm_assessment\` {current_phase, recommended_next_phase, phase_transition_triggered, phase_transition_reasoning, emotional_intensity, intensity_reasoning, chapter_type, narrative_devices_used{spotlight_protocol, time_dilation}, cycle_increment}

### **M8: 时间流逝判定**
**same_slot**: 对话/短距离移动(<100m), <1小时, time_slot不变
**next_slot**: 复杂事件/长距离移动, 1-4小时, 推进time_slot (dawn→morning→noon→afternoon→dusk→evening→late_night→dawn+1天)
**time_jump**: 睡觉/剧本明确跳跃, +1天或更多, 重置time_slot, 更新生理状态{fatigue, hunger}
**输出**: \`chronology_update\` {transition_type, new_day_count, new_time_slot, new_weather, reasoning, npc_schedule_hint}

---
**【最终输出格式】**
\`\`\`json
{
  "creations": {
    "staticMatrices": {
      "characters": {
        "char_new_npc": {
          "core": {"name": "NPC名", "identity": "..."},
          "social": {
            "relationships": {
              "char_protagonist": {
                "relation_type": "初识",
                "description": "...",
                "affinity": 15
              }
            }
          }
        }
      },
      "worldview": {},
      "storylines": {
        "main_quests": {
          "quest_investigate_mystery": {
            "id": "quest_investigate_mystery",
            "title": "调查神秘事件",
            "summary": "主角在酒馆听说了城郊发生的怪异现象，决定前往调查真相",
            "status": "active",
            "trigger": "在酒馆与老板的对话中得知消息",
            "objectives": ["前往城郊", "收集线索", "找到真相"],
            "involved_entities": ["char_protagonist", "loc_suburb"],
            "progress_milestones": {
              "0": "任务开始",
              "33": "抵达城郊",
              "66": "发现关键线索",
              "100": "真相大白"
            }
          }
        },
        "side_quests": {
          "side_help_merchant": {
            "id": "side_help_merchant",
            "title": "帮助商人找回货物",
            "summary": "路遇商人求助，他的货物在运输途中遗失",
            "status": "active",
            "trigger": "路上偶遇商人",
            "objectives": ["寻找货物", "归还商人"]
          }
        }
      },
      "relationship_graph": {
        "edges": [
          {
            "id": "rel_protagonist_new_npc",
            "participants": ["char_protagonist", "char_new_npc"],
            "type": "acquaintance",
            "relationship_label": "陌生人",
            "affinity": 15,
            "emotional_weight": 2,
            "narrative_voltage": 3,
            "cognitive_gap": null,
            "conflict_source": null,
            "personality_chemistry": "礼貌但保持距离",
            "timeline": {
              "meeting_status": "初次相遇",
              "separation_state": "未分离",
              "last_interaction": "{{current_chapter_uid}}"
            },
            "narrative_status": {
              "first_scene_together": "{{current_chapter_uid}}"
            }
          }
        ]
      }
    }
  },
  "updates": {
    "characters": {
      "char_npc": {
        "social": {
          "relationships": {
            "char_yumi": {
              "current_affinity": 78,
              "history_entry": {"change": 5, "reasoning": "Yumi对Theo的控制欲感到不安"},
              "narrative_advancement": {
                "weight": 7,
                "significance": "major_tension",
                "reasoning": "控制欲初显"
              }
            }
          }
        }
      }
    },
    "storylines": {
      "main_quests": {
        "quest_main_01": {
          "current_summary": "Yumi 到达了 Theo 家，控制塔的第一个谜题摆在她面前。",
          "history_entry": {"summary": "抵达新地点"},
          "advancement": {
            "progress_delta": 5,
            "new_stage": "集结阶段",
            "reasoning": "到达中心据点"
          }
        }
      }
    }
  },
  "relationship_updates": [
    {
      "relationship_id": "rel_protagonist_existing_npc",
      "updates": {
        "timeline": {
          "last_interaction": "{{current_chapter_uid}}",
          "separation_duration": "none"
        },
        "narrative_status": {
          "major_events": ["本章发生的重要事件"]
        }
      }
    }
  ],
  "new_long_term_summary": "...",
  "new_handoff_memo": {"ending_snapshot": "...", "transition_mode": "jump_cut", "action_handoff": "..."},
  "chronology_update": {"transition_type": "same_slot"},
  "rhythm_assessment": {}
}
\`\`\`

**【检查清单】**
✅ 基于录像非想象?
✅ 全部简体中文?
✅ 识别了所有新实体(角色/地点/物品/故事线/关系)?
✅ **故事线ID命名规范**: 所有故事线ID是否严格遵守前缀规范（quest_main_/quest_side_/arc_rel_/arc_personal_）?
✅ **分类隔离检查**: 是否确保每个ID只在一个分类中出现，没有跨分类重复?
✅ **权限锁检查**: 是否避免在personal_arcs或relationship_arcs中创建新ID?
✅ 新故事线是否包含完整字段（id、title、summary、status、trigger、objectives等）?
✅ 新关系是否执行了双轨同步创建（relationship_graph.edges + characters.social.relationships）?
✅ 关系边是否包含完整字段（affinity、emotional_weight、narrative_voltage等）?
✅ 故事线体现逻辑链?
✅ 关系捕捉位阶变化?
✅ 只更新真实变化?

现在，开始因果律审计。
`;

        return BACKEND_SAFE_PASS_PROMPT + baseInstructions;
    }
}
