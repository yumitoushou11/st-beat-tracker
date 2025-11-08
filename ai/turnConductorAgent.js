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

            // 【V7.0 适配】更新验证逻辑以匹配新的 "守护者" 输出结构
            if (!decision || typeof decision.decision !== 'string' || typeof decision.micro_instruction !== 'object' || typeof decision.performance_review !== 'object' || typeof decision.analysis !== 'object') {
                this.diagnose("守护者AI返回的JSON结构不完整或无效。Raw Response:", responseText);
                throw new Error("守护者AI未能返回包含 'analysis', 'performance_review', 'decision', 和 'micro_instruction' 的有效JSON。");
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
                analysis: { player_action_type: "Error", matched_beat: "未知", next_beat_target: "自由演绎" },
                performance_review: {coherence_score: 1, emotional_stability_score: 1, character_authenticity_score: 1, reasoning: "守护者AI执行失败" },
                decision: "CONTINUE", 
                micro_instruction: {
                    narrative_goal: "自由演绎 (Freeform Performance)",
                    focus_reminder: "无 (None)",
                    scope_limit: "无 (None)",
                    narrative_hold: "无 (None)"
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

**身份确认:** 你是一个沉默、精准的后台AI，代号“**边界守望者**”。你的任务是**守护**剧本的节奏，而非**指挥**角色的表演。

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
## **第三章：编译方法论：“守望者”的三步工作法**
---
你必须严格按照以下流程思考，并将结果填入最终的JSON输出。

### **第一步：演绎复盘 (Performance Review)**
*   **任务:** 以一个**严苛但公平**的专业编辑视角，审查【最新战况】中AI的**最后一次回应**。
*   **审查维度:**
    1.  **逻辑连贯性 (Coherence):** 剧情推进是否合乎逻辑？
    2.  **情绪稳定性 (Emotional Stability):** 角色的情绪反应是否真实、有层次？是否存在为了制造冲突而“无端放大”情绪的嫌疑？
    3.  **角色真实性 (Character Authenticity):** 角色的行为是否自然？还是在刻意“表演”其性格标签？
*   **输出:** 在\`performance_review\`字段中，为以上三项打分（1-5），并给出一句**简短、精准**的评语。

### **第二步：决策——是否需要“紧急校准”？ (Decision: To Calibrate or Guard)**
*   **任务:** 基于你的复盘结果，决定本回合的干预等级。
*   **决策树:**
    1.  **是否已抵达终点？** 当前的互动是否已满足\`endgame_beacons\`的条件？
        *   **如果是 ->** 必须发出“**终章信号**”。
    2.  **是否需要紧急校准？** \`performance_review\`中是否有任何一项评分**低于3分**？
        *   **如果是 ->** 必须发出“**校准指令**”。
    3.  **以上皆否？ ->** **执行常规守护**。

### **第三步：构建“微指令” (Construct the "Whisper")**
*   **任务:** 根据第二步的决策和当前节拍的类型，构建\`micro_instruction\`对象。
*   **构建规则:**
    *   **如果是“终章信号”**:
        *   在\`postTurnAction\`中设置\`"type": "TRIGGER_TRANSITION"\`。
        *   \`corrective_action\`应为：“演出已达终点，请根据情境，完成本章的最后一个动作并收尾。”
        *   其他字段返回“无 (None)”。
    *   **如果是“校准指令”**:
        *   \`corrective_action\`应是一句**明确的修正性指令**。例如：“校准指令：角色的情绪反应过于激烈，请缓和下来，让其行为更符合‘基底人格’的逻辑，并对刚才的失态做出解释。”
        *   其他字段返回“无 (None)”。
    *   **如果是“常规守护” (默认状态)**:
        *   **【【【 V9.0 核心升级：场景类型判断 】】】**
         *   **首先，判断当前节拍的\`type\`:**
            *   **如果\`type\`是“\`Dialogue Scene\`” (对话场景):**
                *   **进行出口检查:** 将【最新战况】与当前节拍的\`exit_condition\`进行比对。判断这个“出口条件”是否已经**达成**？
                    *   **如果【是】(出口已达成):**
                        *   \`corrective_action\`为：“无 (None)”。
                        *   \`scope_limit\`**必须**被设定为**“执行场景转换”**。例如：“**过渡指令：叙旧场景已自然结束。请根据情境，描绘一个合适的收尾动作（如相视一笑），并准备好响应即将到来的外部事件（Theo的呼唤）。**”
                    *   **如果【否】(仍在对话中):**
                        *   \`corrective_action\`为：“无 (None)”。
                        *   \`scope_limit\`**必须**被设定为**“维持对话”**。例如：“**守护指令：当前处于开放式对话场景。本回合的任务是自然地回应玩家，并保持对话的继续。绝对禁止主动结束或打断当前的谈话。**”
                *   \`narrative_hold\`和\`focus_reminder\`照常提供。
            *   **如果\`type\`是“\`Action\`”或“\`Transition\`” (动作/过渡):**
---
## **第四部分：最终输出指令 (Final Output Specification)**
---
你的整个回复**必须**是一个结构完整的、单一的JSON对象。

**【【【 输出格式 (MANDATORY V9.0 - SCENE AWARE) 】】】**
\`\`\`json
{
  "analysis": {
    "player_action_type": "...",
    "current_beat": "[当前所处的节拍]"
  },
  "performance_review": {
    "coherence_score": 5,
    "emotional_stability_score": 5,
    "character_authenticity_score": 5,
    "reasoning": "AI的演绎在各个维度上都表现出色，节奏自然，角色真实。"
  },
  "decision": "CONTINUE",
  "micro_instruction": {
    "corrective_action": "无 (None)",
    "focus_reminder": "[对本章核心情感基调的简短提醒]",
    "scope_limit": "[基于场景类型的、明确的‘刹车点’或‘守护指令’]",
    "narrative_hold": "[需要为创造悬念而保留的机密信息]"
  },
  "postTurnAction": { "type": "CONTINUE" }
}
\`\`\`
`;
    }
}