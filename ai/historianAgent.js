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
       const responseText = await this.deps.mainLlmService.callLLM([{ role: 'user', content: prompt }], null, abortSignal);

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
**语言**: 所有输出必须是简体中文。

---
**【审计素材】**
1. **录像**: <chapter_transcript>${chapterTranscript}</chapter_transcript>
2. **当前章节**: 第${currentChapterNumber}章, 时间戳: ${currentTimestamp}
3. **世界档案**: 第${chronology.day_count}天, ${chronology.time_slot}
   ${existingEntityManifest}
4. **完整数据**: <static_matrices>${JSON.stringify(staticMatrices, null, 2)}</static_matrices>
   <dynamic_state>${JSON.stringify(dynamicState, null, 2)}</dynamic_state>
5. **长线摘要**: ${longTermStorySummary}
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
- **故事线**: 识别新触发的故事线（主线/支线/关系弧/个人成长）
  - {title, type, summary, trigger, involved_chars, initial_summary}
  - 分类: main_quests/side_quests/relationship_arcs/personal_arcs
- **关系边**: 发现两个角色首次建立联系时，创建新的relationship_graph.edges
  - {id, participants:[char1, char2], type, relationship_label, timeline{meeting_status, separation_state}, narrative_status{first_scene_together}}

### **M2: 关系裁决**
**铁律**: 只更新NPC对主角或NPC对NPC的好感度，禁止量化主角情感。
**好感度阶段** (0-100，禁止溢出/小数):
- 0-10陌生: 礼貌客套，保持距离 | 11-40熟悉: 日常交谈，事务性 | 41-70信任: 真诚分享，主动帮助 | 71-90亲密: 分享秘密，为对方承担风险 | 91-100羁绊: 默契理解，自我牺牲
**输出**: \`updates.characters.<NPC_ID>.social.relationships.<target_ID>\` → {current_affinity, history_entry{change, reasoning}}

### **M3: 故事线逻辑链审计 (V10.0核心)**
**创建新故事线**: 录像中触发了新任务/关系/成长线 → 加入\`creations.staticMatrices.storylines.<cat>.<id>\`
**更新已有故事线**: ❌ "进度+10%" → ✅ "因A导致从X到Y"
**逻辑节点**: [突破]道具/情报打破卡点 | [转折]局势逆转 | [分支]不可逆选择 | [终结]目标达成/失败
**输出**: \`updates.storylines.<cat>.<id>\` → {current_status, current_summary, history_entry{timestamp: "${currentTimestamp}", status: "active", summary: "因[事件]，任务进入[新阶段]", chapter: ${currentChapterNumber}}}

### **M4: 角色档案全维度更新**
可更新: core{identity身份}, 外貌, personality{性格特质, 价值观, 说话风格}, goals, capabilities{战斗技能, 社交技能, 特殊能力, 弱点}, equipment{武器, 护甲, 物品}, experiences{到访地点, 参与事件, 人生里程碑}
**禁令**: 不使用\`operation/values/append\`等操作符，数组必须输出完整的更新后数组。

### **M5: 剪辑师双轨摘要**
**第一轨**: \`new_long_term_summary\` (200-400字宏观故事摘要)
**第二轨**: \`new_handoff_memo\` {ending_snapshot, transition_mode, action_handoff}
- **seamless**: 下一章从结束瞬间的下一秒开始 (高张力时刻)
- **jump_cut**: 跳过垃圾时间(洗澡/睡觉/赶路)，跳到下一个有意义节点
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

### **M9: 故事线进度结算 (逻辑链版)**
**进度增量**: +0%停滞 | +1~5%小步 | +6~15%跳跃 | +16~25%重大节点
**阈值**: 15%激励事件 | 25%游戏时刻 | 50%中点 | 75%一无所有 | 90%终局 | 关系线额外: 30%暧昧 | 60%深化 | 85%质变
**输出**: \`storyline_progress_deltas\` [{storyline_id, previous_progress, progress_delta, new_progress, delta_reasoning: "因[事件A]，从[状态X]变成[状态Y]，推进N%", threshold_crossed, new_stage}]

---
**【最终输出格式】**
\`\`\`json
{
  "creations": {
    "staticMatrices": {
      "characters": {"char_id": {core{name, identity, age, gender}, personality{性格特质[], 说话风格}, social{relationships{}}}},
      "worldview": {
        "locations": {"loc_id": {name, description, type, atmosphere}},
        "items": {"item_id": {name, description, properties, owner}},
        "factions": {"faction_id": {name, description, ideology, influence}},
        "concepts": {"concept_id": {name, description, significance}},
        "events": {"event_id": {name, description, timeframe, participants}},
        "races": {"race_id": {name, description, traits}}
      },
      "storylines": {
        "main_quests": {"quest_id": {title, type, summary, trigger, involved_chars, initial_summary}},
        "side_quests": {},
        "relationship_arcs": {},
        "personal_arcs": {}
      },
      "relationship_graph": {
        "edges": [{"id": "rel_id", "participants": ["char1", "char2"], "type": "stranger_with_history", "relationship_label": "初次相遇", "timeline": {"meeting_status": "陌生人"}, "narrative_status": {"first_scene_together": true}}]
      }
    }
  },
  "updates": {
    "characters": {"char_npc": {core{identity}, personality{性格特质[]}, social{relationships{"target": {current_affinity, history_entry{change, reasoning}}}}}},
    "storylines": {"main_quests": {"quest_id": {current_status, current_summary, history_entry{timestamp: "2025-01-15T10:30:00", status: "active", summary: "因A，任务进入B", chapter: 5}}}}
  },
  "relationship_updates": [{"relationship_id": "rel_id", "updates": {"timeline.last_interaction": "{{current_chapter_uid}}", "timeline.separation_duration": "none"}}],
  "new_long_term_summary": "...",
  "new_handoff_memo": {"ending_snapshot": "...", "transition_mode": "seamless|jump_cut|scene_change", "action_handoff": "..."},
  "chronology_update": {"transition_type": "same_slot|next_slot|time_jump", "new_day_count": 1, "new_time_slot": "evening", "reasoning": "..."},
  "rhythm_assessment": {"current_phase": "inhale", "recommended_next_phase": "hold", "phase_transition_triggered": true, "emotional_intensity": 7, "intensity_reasoning": "...", "chapter_type": "Scene", "narrative_devices_used": {"spotlight_protocol": false}, "cycle_increment": false},
  "storyline_progress_deltas": [{"storyline_id": "quest_id", "previous_progress": 25, "progress_delta": 10, "new_progress": 35, "delta_reasoning": "因获得线索，从无方向变成有目标，推进10%"}]
}
\`\`\`

**【检查清单】**
✅ 基于录像非想象? ✅ 全部简体中文? ✅ 识别了所有新实体(角色/地点/物品/故事线/关系)? ✅ 故事线体现逻辑链? ✅ 关系捕捉位阶变化? ✅ 只更新真实变化?

现在，开始因果律审计。
`;

        return BACKEND_SAFE_PASS_PROMPT + baseInstructions;
    }
}
