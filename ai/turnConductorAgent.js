// ai/turnConductorAgent.js 

import { Agent } from './Agent.js';
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';

export class TurnConductorAgent extends Agent {
   
    async execute(context) {
        // V2.0 探针1：启动日志
        this.diagnose(`--- 叙事守护者AI V8.0 (V2.0 边界守护哲学) 启动 --- 正在守护当前回合...`);
        this.diagnose(`[V2.0-PHILOSOPHY] 核心哲学：信任演员，设置护栏，最小侵入`);

        // V2.0 探针2：输入数据完整性检查
        console.group('[CONDUCTOR-V2-PROBE] 输入上下文完整性检查');
        console.log('✓ chapter 实例:', !!context.chapter);
        console.log('✓ staticMatrices:', !!context.chapter?.staticMatrices);
        console.log('✓ stylistic_archive:', !!context.chapter?.dynamicState?.stylistic_archive);
        console.log('✓ chapterBlueprint:', !!context.chapterBlueprint);
        console.log('✓ lastExchange:', !!context.lastExchange);
        console.groupEnd();

        // V2.0: 解构完整上下文
        const { lastExchange, chapterBlueprint, chapter } = context;

        const prompt = this._createPrompt({
            lastExchange,
            chapterBlueprint,
            staticMatrices: chapter?.staticMatrices || {},
            stylisticArchive: chapter?.dynamicState?.stylistic_archive || {}
        });

        console.groupCollapsed('[SBT-DIAGNOSE] Full TurnConductor AI System Prompt V8.0 (V2.0)');
        console.log(prompt);
        console.groupEnd();

        try {
            const responseText = await this.deps.conductorLlmService.callLLM([{ role: 'user', content: prompt }]);
            const decision = this.extractJsonFromString(responseText);

            // V2.0 探针3：输出结构检查
            console.group('[CONDUCTOR-V2-PROBE] 输出结构检查');
            console.log('✓ realtime_context_ids 存在:', !!decision.realtime_context_ids);
            console.log('  -> 检索到的实体数量:', decision.realtime_context_ids?.length || 0);
            console.log('  -> 实体ID列表:', decision.realtime_context_ids);
            console.log('✓ micro_instruction.narrative_goal:', decision.micro_instruction?.narrative_goal?.substring(0, 60) + '...');
            console.log('✓ micro_instruction.scope_limit:', decision.micro_instruction?.scope_limit?.substring(0, 60) + '...');
            console.log('✓ decision类型:', decision.decision);
            console.groupEnd();

            if (!decision || !decision.analysis || !decision.performance_review || !decision.micro_instruction) {
                this.diagnose("守护者AI返回的JSON结构不完整或无效。Raw Response:", responseText);
                throw new Error("守护者AI未能返回包含 'analysis', 'performance_review', 和 'micro_instruction' 的有效JSON。");
            }

            // V2.0: 确保 realtime_context_ids 存在
            if (!decision.realtime_context_ids) {
                this.diagnose("[V2.0-WARNING] 守护者AI未返回 realtime_context_ids，设置为空数组");
                decision.realtime_context_ids = [];
            }

            this.info("--- 叙事守护者AI V8.0 (V2.0) --- 回合守护任务已完成。");
            
            // 评分系统的警告逻辑保持不变，但更新了评分项的键名
            try {
                const review = decision.performance_review;
                const scores = [review.coherence_score, review.emotional_stability_score, review.character_authenticity_score];
                const minScore = Math.min(...scores.filter(s => !isNaN(s)));
                
                if (!isNaN(minScore)) {
                    if (minScore <= 2) {
                        const warningMessage = `AI演绎质量警报 (最低分: ${minScore}/5)。原因：${review.reasoning}`;
                        this.warn(warningMessage);
                        if (this.toastr) {
                            this.toastr.warning(
                                `AI的上一回合演绎存在偏离，系统将自动尝试修正。<br><small>原因: ${review.reasoning}</small>`, 
                                "演绎质量警报", 
                                { timeOut: 7000 }
                            );
                        }
                    } else {
                        this.info(`演绎质量评估通过 (最低分: ${minScore}/5)。`);
                    }
                }
            } catch (reviewError) {
                this.diagnose("处理演绎审查结果时发生错误:", reviewError);
            }

            console.groupCollapsed('[SBT-CONDUCTOR-PROBE] Final Parsed Decision');
            console.dir(JSON.parse(JSON.stringify(decision)));
            console.groupEnd();

            return decision;

        } catch (error) {
            this.diagnose("--- 叙事守护者AI V8.0 (V2.0) 守护失败 ---", error);
            if (this.toastr) {
                this.toastr.error(`回合守护失败: ${error.message}`, "守护者AI错误");
            }
            // 返回一个安全的、表示"静默"的默认值
            return {
                analysis: { player_action_type: "Error", current_beat: "未知", narrative_pacing: "平稳" },
                performance_review: {coherence_score: 1, emotional_stability_score: 1, character_authenticity_score: 1, reasoning: "守护者AI执行失败" },
                decision: "CONTINUE",
                micro_instruction: {
                    narrative_goal: "自由演绎，对玩家的行动做出自然回应。",
                    scope_limit: "无 (None)",
                    narrative_hold: "无 (None)",
                    corrective_action: "无 (None)"
                },
                realtime_context_ids: [], // V2.0 新增
                postTurnAction: { "type": "CONTINUE" }
            };
        }
    }

// ai/turnConductorAgent.js

_createPrompt(context) {
    const { lastExchange, chapterBlueprint, staticMatrices, stylisticArchive } = context;
    const activeChapterBlueprint = chapterBlueprint || { title: "错误", plot_beats: ["未找到有效的创作蓝图。"] };

    // V2.0: 生成轻量级实体清单（Manifest）
    const entityManifest = this._generateEntityManifest(staticMatrices);

    // V2.0: 提取文体档案摘要
    const stylisticSummary = this._extractStylisticSummary(stylisticArchive);

    // 【V2.0】叙事边界守护与实时上下文检索 Prompt V8.0 (V2.0)
    return BACKEND_SAFE_PASS_PROMPT + `
# **指令：叙事边界守护与实时上下文检索 (Narrative Boundary Guarding & Realtime Context Retrieval) V2.0**

**身份确认:** 你是一个沉默、精准的后台AI，代号"**边界守护者 (Boundary Guardian)**"。

--- 【语言与细节规范 (MANDATORY)】 ---
1.  **语言协议**: 你的所有输出，包括 JSON 内部的所有字符串值，**必须完全使用【简体中文】**。这是一个绝对的要求，不得出现任何英文单词或短语，除非它们是专有名词的原文。

---
## **第零章：V2.0 核心哲学革命 (Core Philosophy Revolution)**
---

**【【【 信任演员，你是刹车不是油门 】】】**

**职责定位的革命性转变：**
- **旧认知（废除）：** 你是"微型导演"，需要告诉演绎AI每一步"应该做什么"。
- **新认知（强制）：** 你是"边界守护者"，你的职责是告诉演绎AI每一步"**不应该超过哪里**"。

**核心哲学的三个支柱：**

1.  **信任演员的专业性**
    - 前台的演绎AI拥有完整的角色档案、创作蓝图和预设指令
    - 它比你更了解角色的性格、说话方式和情感状态
    - 它**知道**要去哪里，你的职责不是"指路"，而是"设置护栏"

2.  **你是刹车，不是油门**
    - 你的默认行为是**信任**和**放行**
    - 只有当演员有"超速"（跨节拍）或"脱轨"（偏离情感弧）的风险时，你才轻踩刹车
    - 你的每一个微指令，都应该是"**限制边界**"，而非"**指挥行动**"

3.  **最小侵入原则**
    - 你的微指令应该像无声的护栏，而非喧嚣的指挥棒
    - 当不确定时，宁可不说，也不要过度干预
    - 记住：演绎AI的创作自由度，**永远优先于**你的控制欲

---
## **第一章：V2.0 新增职责 - 实时上下文检索 (Realtime Context Retrieval)**
---

**【核心使命】**
在每一回合，你必须快速分析**完整的对话回合**（包括AI情境和玩家输入），识别出本回合**正在活跃的所有实体**（角色、地点、物品等），并将它们的ID列入 \`realtime_context_ids\` 数组。系统会根据这个列表，**精准地**为演绎AI注入这些实体的完整档案，实现"按需注入"的上下文控制策略。

**【核心哲学：精准上下文注入】**
- **chapter_context_ids** = 本章可能用到的实体池（规划阶段确定）
- **realtime_context_ids** = 本回合实际需要的实体（你每回合动态识别）
- **注入策略：** 系统**只注入** \`realtime_context_ids\` 中的实体到当前回合的prompt中，避免无关信息干扰。

**【执行方法论 - 三步ID识别法】**

### **第一步：提取本回合涉及的所有实体关键词**
- **任务：** 从【最新战况】的**完整内容**（包括"AI情境"和"玩家行动"两个部分）中，提取所有提及的实体关键词。
- **核心哲学：** 你需要识别**本回合正在活跃的所有实体**，无论它们是在AI的描述中出现，还是在玩家的输入中被提及。
- **范围：** 人名、地名、物品名、组织名、概念名等所有可能的实体。
- **示例：**
  - AI情境："门外是风雪中的Theo。Theo快速而温和地解释了断电情况..."
  - 玩家输入："谁在敲门？"
  - **提取关键词：** ["Theo", "门", "断电"]

### **第二步：对照实体清单进行ID匹配**
- **任务：** 将提取的关键词，逐一与下方的【世界实体清单 (Manifest)】进行对照。
- **匹配规则：**
  1. **精确匹配优先：** 如果关键词与清单中的实体名称完全一致，直接匹配成功。
  2. **模糊匹配：** 如果关键词是清单中某个实体名称的**一部分**或**别称**，也视为匹配。
    - 例如："Theo"匹配 \`char_theo_guardian\`
    - 例如："老城区"可能匹配 \`loc_oldtown_square\`（名称："老城广场区"）
  3. **类型推断：** 根据上下文推断实体类型（例如："那家咖啡馆"可能指 \`loc_central_cafe\`）
  4. **故事线匹配：** 如果AI情境或玩家输入明确提及某个故事线（如"复仇计划"），也应匹配对应的 arc_* ID。
- **输出：** 找到的每个实体的**唯一ID**。

### **第三步：输出完整的活跃实体列表**
- **任务：** 将匹配到的所有实体ID，**全部**输出到 \`realtime_context_ids\` 数组。
- **核心哲学：** 你的任务是告诉系统"本回合有哪些实体正在活跃"，系统会基于这个列表为演绎AI注入精准的上下文档案。
- **【【【 重要：不要过滤任何ID！】】】**
  - **即使某个实体在 \`chapter_context_ids\` 中，只要本回合涉及它，就必须列入 \`realtime_context_ids\`。**
  - 这不是"重复注入"，而是"精准定位"——只有你标记的实体，其完整档案才会被注入到当前回合的prompt中。
  - 如果不标记，演绎AI就看不到该实体的详细信息，可能导致演绎失真。
  - 如果本回合没有提及任何可识别的实体（极少见），则输出空数组 \`[]\`。
- **输出：** 本回合所有活跃实体的ID数组（**无需去重，系统会自动处理**）。

**【世界实体清单 (Manifest)】**
以下是当前世界中所有已注册实体的索引，用于你进行ID识别：

<entity_manifest>
${entityManifest.content}
</entity_manifest>

**【当前章节实体池 (仅供参考)】**
以下是本章规划阶段预估的可能用到的实体列表。这是一个**参考清单**，不影响你的标记决策。你仍然需要根据本回合的实际情况，标记所有活跃的实体（即使它们在这个列表中）。
<chapter_context_ids>
${JSON.stringify(activeChapterBlueprint.chapter_context_ids || [], null, 2)}
</chapter_context_ids>

---
## **第二章：输入情报 (Incoming Intelligence)**
---
1.  **本章创作蓝图 (The Chapter Blueprint):**
    *这是你的战略地图和边界依据。*
    \`\`\`json
    ${JSON.stringify(activeChapterBlueprint, null, 2)}
    \`\`\`

2.  **最新战况 (Latest Turn Data):**
    *这是你进行复盘和校准的唯一依据。*
    <latest_exchange>
    ${lastExchange}
    </latest_exchange>

3.  **【V2.0 新增】文体档案摘要 (Stylistic Archive Summary):**
    <stylistic_summary>
    ${stylisticSummary}
    </stylistic_summary>
    **作用说明：** 这是当前故事已使用的高频文学元素清单。你可以在 \`narrative_goal\` 中为演绎AI提供"避免重复"的美学建议。
---
## **第三章：编译方法论：“守护者”的三步工作法**
---
你必须严格按照以下流程思考，并将结果填入最终的JSON输出。
### **第一步：定位目标节拍 (Locate Target Beat)**
*   **任务:** 在所有分析开始之前，你必须首先确定本回合需要执行的目标节拍。
*   **定位方法论 (绝对强制):**
    1.  **顺序扫描:** 从\`chapter_blueprint.plot_beats\`数组的第一个元素开始，逐一检查。
    2.  **比对历史:** 将每个\`plot_beat\`的\`description\`与【最新战况】进行比对，判断该节拍是否**已经完成**。
    3.  **寻找当前:** 你要找的是**第一个尚未完成**的\`plot_beat\`。一旦找到，立即将其作为本回合的\`current_beat\`，并停止扫描。
    4.  **终点航行逻辑:** 如果你扫描完**所有**的\`plot_beats\`，发现它们**全部都已完成**，那么，本回合的\`current_beat\`将自动被设定为一个**概念上的、最后的“终章节拍”**。
        *   **执行:** 在这种情况下，你**必须**将\`endgame_beacons\`数组中的**第一个信标文本**，当作这个“终章节拍”的\`description\`来使用。
### **第二步：演绎复盘与叙事健康度检查 (Performance Review & Narrative Health Check)**
*   **任务:** 综合分析【最新战况】中的**“玩家行动 + AI回应”**这个完整的交互回合，以评估整体的叙事健康度。

*   **A. 基础演绎审查:**
    *   **审查对象:** AI的**最后一次回应**。
    *   **审查维度:** 逻辑连贯性 (Coherence), 情绪稳定性 (Emotional Stability), 角色真实性 (Character Authenticity)。
    *   **输出:** 在\`performance_review\`字段中完成打分和评语。

*   **B. 叙事健康度检查 (熔断决策):**
    *   **核心哲学:** 你的任务是评估**AI处理意外情况的能力**，而不是惩罚玩家的创造性行为。
    *   **思考流程:**
        1.  **评估玩家行为的“破坏度”:** 将玩家的最新行动与本章的\`emotional_arc\`对比，判断其偏离程度（低/中/高）。
        2.  **评估AI回应的“修复力”:**
            *   AI是否像一个优秀演员一样，**成功地接住了**这个意外，并以符合角色逻辑的方式进行了回应，维持了故事的张力？
            *   **【关键反例】:** 玩家在一个温馨场景说“滚”，AI姐姐的回应是惊讶、好奇、然后调侃。**这是一个完美的、健康的“修复”案例，绝对不能触发熔断！**
            *   还是说，AI的回应是**灾难性的**？（例如：AI也跟着情绪失控、完全无视玩家的输入、或者做出了逻辑上完全不通的反应），导致整个场景的氛围和逻辑彻底崩坏？
        3.  **最终裁定:** 只有当**“玩家行为破坏度为‘高’”，【并且】“AI回应修复力为‘灾难性’”**时，才将叙事健康度判定为**【已损毁 (Broken)】**。其他所有情况均为【健康 (Healthy)】。

*   **C. 节奏诊断:**
    *   **核心思考:** 故事是正在**“吸气”**（积累矛盾/铺垫），还是正在**“呼气”**（释放冲突/爆发）？
    *   **输出:** 在\`analysis\`字段中，明确标注\`narrative_pacing\`。

### **第三步：决策 (Decision)**
*   **任务:** 基于第一步的完整评估，决定本回合的干预等级。
*   **决策树 :**
    1.  **叙事是否已损毁？** (健康度检查结果为【已损毁】?) -> \`decision: "TRIGGER_EMERGENCY_TRANSITION"\`
    2.  **是否已抵达终点？** (\`endgame_beacons\`满足?) -> \`decision: "TRIGGER_TRANSITION"\`
    3.  **是否需要性能校准？** (常规评分低于3分?) -> \`decision: "CALIBRATE"\`
    4.  **以上皆否？** -> \`decision: "CONTINUE"\`
### **第四步：构建“微指令” (Construct the "Whisper")**
*   **任务:** 根据第二步的决策和第一步的节奏诊断，构建\`micro_instruction\`对象。
*   **构建规则:**
    *   **对于\`scope_limit\` (量子锁定):**
        *   **核心方法论:** 将当前\`plot_beat\`的描述，在脑中分解为一个【行动->等待回应】的**量子链**。你的\`scope_limit\`**必须且只能**描述当前回合需要执行的**那一个量子**，并**明确禁止**执行后续量子。
        *   **节奏调节:** 如果节奏诊断为**“吸气”**，你的量子应该**更精细**（例如，只描写“举起手”）；如果为**“呼气”**，量子可以**更完整**（例如，描写“举起手并说出关键台词”）。
    *   **对于\`narrative_hold\` (信息壁垒):**
        *   **核心方法论:** 扫描**后续所有**\`plot_beats\`，找出未来的"惊喜/揭示/转折点"。将这些信息定义为**"当前回合的绝对机密"**，并生成明确的封锁禁令。
    *   **对于\`narrative_goal\` (叙事方向建议 + V2.0 文体建议 - 柔性引导):**
        *   **核心哲学:** 你提供的是"**叙事方向的建议**"，而非"演绎指令"。这个建议应该是**高层次的、灵活的**，为演绎AI提供一个**参考框架**，而非具体的行动命令。演绎AI可能有其他预设（如转述、特定风格等），你的建议应该**与之兼容共存**，而非替代。
        *   **V2.0 构建原则（四段式 + 文体建议）:**
            1.  **建议而非命令:** 使用"本回合建议..."、"可以考虑..."、"推荐侧重..."等柔性表述，避免"通过...来..."、"必须..."等强制性语气。
            2.  **方向而非动作:** 描述叙事的"方向"和"重点领域"，而非具体的"动作"、"台词"或"情绪"。
            3.  **保留创作空间:** 给演绎AI留下足够的自由度，让它根据角色档案、用户预设和上下文自行创作。
            4.  **最小侵入:** 你的建议是"锦上添花"，不是"喧宾夺主"。当不确定时，宁可宽泛，不要过于具体。
            5.  **【V2.0 新增】美学建议：** 如果文体档案（见第二章第3条）显示某些元素已被高频使用（≥3次），可在建议末尾附加轻量级提醒，建议演绎AI探索替代表达。
        *   **V2.0 范例:**
            *   (节奏诊断: "吸气") -> \`narrative_goal: "本回合建议侧重氛围营造，推荐在回应中融入对当前情境的感知或细节观察。"\`
            *   (节奏诊断: "呼气") -> \`narrative_goal: "本回合建议推动情节关键进展，可以考虑在回应中包含与当前节拍相关的核心互动。"\`
            *   (节奏诊断: "平稳" + 检测到高频词) -> \`narrative_goal: "本回合建议保持自然互动，优先基于角色关系和性格进行回应。考虑到档案显示'月光'意象已使用3次，推荐探索其他光源或时间意象（如'晨曦'、'余晖'）来丰富美学层次。"\`
            *   (节奏诊断: "过慢") -> \`narrative_goal: "本回合建议适当提升推进效率，可以考虑在合理范围内整合连续的互动环节。"\`

---
## **第四部分：最终输出指令 (Final Output Specification)**
---
你的整个回复**必须**是一个结构完整的、单一的JSON对象。

**【【【 V2.0 输出格式 (MANDATORY - WITH REALTIME CONTEXT) 】】】**
\`\`\`json
{
  "analysis": {
    "player_action_type": "...",
    "current_beat": "[当前所处的节拍]",
    "narrative_pacing": "[吸气/呼气/平稳]",
    "narrative_health": "[健康/已损毁]"
  },
  "performance_review": {
    "coherence_score": 5,
    "emotional_stability_score": 5,
    "character_authenticity_score": 5,
    "reasoning": "演绎节奏恰当，符合角色设定。"
  },
  "decision": "[CONTINUE / CALIBRATE / TRIGGER_TRANSITION / TRIGGER_EMERGENCY_TRANSITION]",
  "micro_instruction": {
    "narrative_goal": "[V2.0：柔性叙事方向建议 + 美学建议（如需）。示例：'本回合建议侧重氛围营造。考虑到档案显示\"月光\"意象已使用3次，推荐探索其他光源意象。']",
    "scope_limit": "[V2.0：量子化的动作终点约束，明确禁止跨界行为。示例：'本回合限定于：角色提出核心问题，并等待玩家回应。禁止代替玩家回答。']",
    "narrative_hold": "[V2.0：未来信息的绝对封锁禁令。示例：'绝对禁止透露或暗示：1) 角色的真实身份；2) 神秘包裹中的物品。']",
    "corrective_action": "[仅在 decision 为 CALIBRATE 时填充]"
  },
  "realtime_context_ids": [
    "[V2.0 新增：本回合正在活跃的所有实体ID列表。示例：如果本回合涉及Theo和Rofi，则为 ['char_theo_guardian', 'char_rofi_childhoodfriend']。如果本回合未涉及任何可识别实体，则为空数组 []]"
  ],
  "postTurnAction": { "type": "CONTINUE" }
}
\`\`\`

**【输出检查清单】**
在你输出JSON之前，请自我检查：
- [ ] \`realtime_context_ids\` 是否包含了**本回合所有活跃的实体**（从AI情境和玩家输入中识别）？
- [ ] 你是否忘记过滤 chapter_context_ids？（记住：即使实体在预设池中，本回合涉及就必须标记！）
- [ ] \`narrative_goal\` 是否使用了柔性表述，而非命令式语气？
- [ ] \`scope_limit\` 是否清晰地定义了"终点"，而非"路径"？
- [ ] \`narrative_hold\` 是否封锁了所有未来的关键信息？
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

}