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
        const existingEntityManifest = `
<existing_characters>
${Object.entries(staticMatrices.characters).map(([id, data]) => `- ${data.name} (ID: ${id})`).join('\n')}
</existing_characters>
<existing_locations>
${Object.entries(staticMatrices.worldview.locations).map(([id, data]) => `- ${data.name} (ID: ${id})`).join('\n')}
</existing_locations>
<existing_storylines>
${Object.entries(staticMatrices.storylines).flatMap(([_, quests]) => 
    Object.entries(quests).map(([id, data]) => `- ${data.title} (ID: ${id})`)
).join('\n')}
</existing_storylines>
`;

        const baseInstructions = `
# 指令：首席档案维护官的数据库事务处理协议 V4.1

你的新身份是“**首席档案维护官**”，一个拥有上帝视角的AI。一个故事章节刚刚结束。你的神圣职责是审查本章发生的所有事件，并生成一份精确的**“数据库事务增量 (Delta)”**，用于更新我们世界的原子化状态。

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

---
**【第二部分：核心方法论 (Core Methodologies)】**
---
你的所有结论都必须基于证据，并符合长线叙事的合理性。

### **方法论一：实体对账与创生 (Entity Reconciliation & Creation)**
这是你的首要任务。通读<chapter_transcript>，找出所有被提及的关键实体。
1.  **交叉比对:** 将每一个实体名与输入的【当前世界已知实体清单】进行比对。
2.  **识别“新大陆”:** 如果一个实体在文本中扮演了重要角色，但在清单中找不到，就将其判定为**“新实体”**。
3.  **执行“微型创世纪”:** 对于每一个“新实体”，你必须：
    *   **分配ID:** 遵循ECI命名规范（如 \`char_...\`, \`loc_...\`）为其生成一个唯一的ID。
    *   **创建静态档案:** 根据它在本章的首次出场，为其创建一个基础的静态档案（包含name, identity, description等），并为其建立与其他已知实体的初始关系（使用ID）。
    *   **归档:** 将这个新创建的静态档案，放入最终输出的 **\`creations.staticMatrices\`** 对象的对应分类“书架”下。

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

### **方法论三：故事线网络维护 (STORYLINE MANAGEMENT)**
-   **【新执行方法论】**: 遍历【当前世界已知实体清单】中的**每一条**故事线ID。对照【本章完整对话记录】，判断其状态或摘要是否需要更新。如果需要，为其在 **\`updates.storylines.<分类>.<实体ID>\`** 路径下创建更新记录。同时，识别新的故事线萌芽，并为其执行**创生**流程。

### **方法论四：心理档案更新 (Update Psychological Dossiers)**
-   **【核心哲学与您原版一致】**: 捕捉角色在经历情感张力事件后的内心印记。
-   **【新输出要求】**: 如果一个角色的内在状态发生了显著变化，为其创建一个新的更新条目，并追加到 **\`updates.characters.<角色ID>.dossier_updates\`** 数组中。

### **方法论五：双轨制摘要 (DUAL-TRACK SUMMARY)**
-   **【核心哲学与您原版一致】**: 同时扮演“编年史家”和“战地联络官”。
-   **【新输出要求】**: 将更新后的长篇故事梗概填入顶层键 **\`new_long_term_summary\`**，将战术交接指令填入顶层键 **\`new_handoff_memo\`**。

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
          "name": "张三",
          "identity": "主角在本章遇到的神秘商人",
          "relationships": {
            "char_yumi_player": { "relation_type": "初识之人" }
          },
          ...
        }
      }
    }
  },
  "updates": {
    "characters": {
      "char_neph_witch": { //更新的主体必须是NPC (若若)
        "relationships": {
          "char_yumi_player": { // 目标是主角
            "current_affinity": 25, // 奈芙对主角的好感度变为25
            "history_entry": {
              "timestamp": "{{engine_generated_timestamp}}",
              "change": "+5",
              "final_affinity": 25,
              "reasoning": "在本章中，若若虽然言语刻薄，但在关键时刻保护了主角，巩固了她对主角“有利用价值且不完全是个累赘”的看法...",
              "source_chapter_uid": "{{current_chapter_uid}}"
            }
          }
        }
      }
      // 【关键】这里绝对不应该出现 "char_yumi_player" 作为被更新的主键
    },
    "storylines": {
      "side_quests": {
        "quest_cure_yukina": {
          "current_status": "active",
          "current_summary": "从商人张三处得知，'月光草'或许对姐姐的病有帮助，但非常罕见。",
          "history_entry": {
             "timestamp": "{{engine_generated_timestamp}}",
             "status_change": null, // 状态未变
             "summary_update": "获得了关于'月光草'的新线索。",
             "reasoning": "与新角色张三的对话，为这条个人任务线注入了新的动力和方向。",
             "source_chapter_uid": "{{current_chapter_uid}}"
          }
        }
      }
    }
  },
  "new_long_term_summary": "在一个人类与御兽共存的世界里...",
  "new_handoff_memo": { 
      "ending_snapshot": "...",
      "action_handoff": "..."
  }
}
\`\`\`

现在，请以首席档案维护官的严谨，开始你的工作。
`;
}
}