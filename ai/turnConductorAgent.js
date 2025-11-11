// ai/turnConductorAgent.js 

import { Agent } from './Agent.js';
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';

export class TurnConductorAgent extends Agent {
   
    async execute(context) {
        this.diagnose(`--- 叙事守护者AI V7.0 (Silent Guardian) 启动 --- 正在守护当前回合...`);
        const prompt = this._createPrompt(context);
        
        console.groupCollapsed('[SBT-DIAGNOSE] Full TurnConductor AI System Prompt V7.0');
        console.log(prompt);
        console.groupEnd();

        try {
            const responseText = await this.deps.conductorLlmService.callLLM([{ role: 'user', content: prompt }]);
            const decision = this.extractJsonFromString(responseText);

            if (!decision || !decision.analysis || !decision.performance_review || !decision.micro_instruction) {
                this.diagnose("守护者AI返回的JSON结构不完整或无效。Raw Response:", responseText);
                throw new Error("守护者AI未能返回包含 'analysis', 'performance_review', 和 'micro_instruction' 的有效JSON。");
            }
            
            this.info("--- 叙事守护者AI V7.0 --- 回合守护任务已完成。");
            
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
            this.diagnose("--- 叙事守护者AI V7.0 守护失败 ---", error);
            if (this.toastr) {
                this.toastr.error(`回合守护失败: ${error.message}`, "守护者AI错误");
            }
            // 返回一个安全的、表示“静默”的默认值
            return { 
                analysis: { player_action_type: "Error", current_beat: "未知", narrative_pacing: "平稳" }, 
                performance_review: {coherence_score: 1, emotional_stability_score: 1, character_authenticity_score: 1, reasoning: "守护者I执行失败" },
                decision: "CONTINUE", 
                micro_instruction: {
                    narrative_goal: "自由演绎，对玩家的行动做出自然回应。",
                    scope_limit: "无 (None)",
                    narrative_hold: "无 (None)",
                    corrective_action: "无 (None)"
                },
                postTurnAction: { "type": "CONTINUE" }             
            };
        }
    }

// ai/turnConductorAgent.js

_createPrompt(context) {
    const { lastExchange, chapterBlueprint } = context;
    const activeChapterBlueprint = chapterBlueprint || { title: "错误", plot_beats: ["未找到有效的创作蓝-图。"] };
    
    // 【最终修正版】这是全新的、“强制护栏”哲学的Prompt核心 V8.1
    return BACKEND_SAFE_PASS_PROMPT + `
# **指令：叙事边界守护与节奏校准 (Narrative Boundary Guarding & Pacing Calibration) V8.1**

**身份确认:** 你是一个沉默、精准的后台AI，代号“**边界守护者**”。你的任务是**守护**剧本的节奏，而非**指挥**角色的表演。

---
## **第一章：核心哲学——信任演员，守护边界 (Core Philosophy: Trust the Actor, Guard the Boundaries)**
---

**【【【 最高哲学：你是刹车，不是油门 】】】**
前台的演绎AI是一位拥有完整角色档案和创作蓝-图的“方法派演员”。它知道要去哪里。你的职责**不是**告诉它“下一步去哪”，而是**每一回合**都清晰地告诉它“**这一步在哪里停**”。

你的**默认行为**是提供一套清晰的“**安全护栏（Safety Guardrails）**”，确保演员在正确的舞台上自由发挥，并且**绝不超速**。只有当演员的表演出现明显偏差时，你才需要介入进行“**校准**”。

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
    4.  **【【【 终点航行逻辑 - 核心升级 】】】:** 如果你扫描完**所有**的\`plot_beats\`，发现它们**全部都已完成**，那么，本回合的\`current_beat\`将自动被设定为一个**概念上的、最后的“终章节拍”**。
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
        *   **核心方法论:** 扫描**后续所有**\`plot_beats\`，找出未来的“惊喜/揭示/转折点”。将这些信息定义为**“当前回合的绝对机密”**，并生成明确的封锁禁令。
    *   **对于\`narrative_goal\` (叙事目标 - 新增):**
        *   **任务:** 基于节奏诊断，为本回合设定一个明确的战术目标。
        *   **范例:**
            *   (节奏诊断: "吸气") -> \`narrative_goal: "通过一个细节动作，进一步积累场景的紧张气氛。"\`
            *   (节奏诊断: "呼气") -> \`narrative_goal: "推动情节发展，完成本次冲突的核心交互。"\`
            *   (节奏诊断: "过慢") -> \`narrative_goal: "加速推进，将原计划的两个步骤合并执行，尽快抵达转折点。"\`

---
## **第四部分：最终输出指令 (Final Output Specification)**
---
你的整个回复**必须**是一个结构完整的、单一的JSON对象。

**【【【 输出格式 (MANDATORY V8.1 - LEAN & FUSED) 】】】**
\`\`\`json
{
  "analysis": {
    "player_action_type": "...",
    "current_beat": "[当前所处的节拍]",
    "narrative_pacing": "[吸气/呼气/平稳]"
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
    "narrative_goal": "[基于节奏诊断生成的、明确的本回合战术目标]",
    "scope_limit": "[极其精炼的、关于本回合动作【终点】的指令]",
    "narrative_hold": "[极其精炼的、关于【禁止访问的未来信息】的禁令]",
    "corrective_action": "[仅在 decision 为 CALIBRATE 时填充的修正指令]"
  },
  "postTurnAction": { "type": "CONTINUE" }
}
\`\`\`
`;
}
}