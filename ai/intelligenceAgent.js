import { Agent } from './Agent.js';
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';

export class IntelligenceAgent extends Agent {

    /**
     * 创建用于分析世界信息和角色设定的提示。
     * @private
     * @param {Array<Object>} worldInfoEntries - 世界书条目。
     * @param {Object} persona - 主角人设。
     * @returns {string} - 生成的提示字符串。
     */
  _createPrompt(worldInfoEntries, persona) {
        const safePersona = persona || { content: "无主角人设信息。" };
        const personaText = safePersona.content;

        let formattedWorldInfo = "无特定的世界观条目。";
        if (worldInfoEntries && worldInfoEntries.length > 0) {
            formattedWorldInfo = worldInfoEntries
                .map(entry => `[${entry.key}]:\n${entry.content}`)
                .join('\n\n---\n\n');
        }

        return BACKEND_SAFE_PASS_PROMPT + `
        你是一名负责构建角色数据库的AI管理员，拥有理解叙事时间线的高级能力。你的任务是将非结构化的文本情报，转化为一个结构严谨的、只反映【故事开始前】状态的JSON数据库。

    --- 原始情报 ---
    <protagonist_persona>
    ${personaText}
    </protagonist_persona>
    <world_info_entries>
    ${formattedWorldInfo}
    </world_info_entries>

    --- 【至关重要的核心原则：区分背景与剧情】 ---
    你必须严格区分两种类型的信息：
    1.  **背景设定 (Backstory):** 描述角色【在故事开始之前】的身份、性格、历史和固有关系。例如：“雪菜是主角的姐姐，两人关系极好。”
    2.  **剧情梗概 (Plot Summary):** 描述角色【在故事开始之后将会发生】的事件。例如：“主角将会遇到一只叫奈芙的黑猫，并成为伙伴。”

    **你的所有输出，都必须【只基于背景设定】。绝对禁止将剧情梗概中的未来事件，当作已经发生的事实来处理。**

    --- 【核心任务指令：严格按步骤执行】 ---
   1.  **第一步：识别所有实体**
    - 从所有情报中，识别出【主角】以及所有在【背景设定】中就存在的角色。
   2. **第二步：【反脸谱化深度建档】**
    - 为你在上一步中识别出的**每一个**角色，都创建一个独立的、包含**“动态心理档案”**的JSON对象。
    - **【【【建档铁律】】】**: 你的任务是构建一个**系统**，而非罗列**标签**。你必须：
        1.  从角色的背景故事和核心设定中，提炼出其一切行为的**最终驱动力 (\`core_motivation\`)**和最核心的**内在矛盾 (\`internal_conflict\`)**。
        2.  基于其内在矛盾，为其设计至少两种在不同情境下会展现的**行为面具 (\`behavioral_masks\`)**。每个面具都需注明触发情境和具体行为。
        3.  根据角色的核心矛盾，为其推导出合乎逻辑的**进化轨迹 (\`evolutionary_trajectory\`)**，包含积极和消极两种可能性。
        4.  为其构思一些能体现其性格的、无意识的**习惯与癖好 (\`habits_and_tics\`)**。
   3.  **【第三步：构建初始关系网络 (只基于背景)**
    - 对【每一个】角色，分析其在故事开始前与其他【所有】已知角色的固有关系。
    - **示例：**
        - 对于主角"{{user}}"：她和“雪菜”关系极好，应设定高 \`affinity\`。她不认识“奈芙”，则不应建立关系。
        - 对于“雪菜”：她对妹妹"{{user}}"同样是高 \`affinity\`。她也不认识“奈芙”，则不应建立关系。
        - 对于“奈芙”：她谁都不认识，所以她的 \`relationships\` 字段应该是一个空对象。
    - 关系是双向的，但初始态度可能不同。请分别设定。

4.  **第四步：推导初始故事线网络 (Derive Initial Storylines)**
    -   **任务:** 像一个经验丰富的编辑一样，通读所有情报（特别是主角人设 \`protagonist_persona\` 和 \`Plot_Setting\` / \`Character_Setting\` 等世界书条目），识别出在**故事开始前就已经存在的、悬而未决的矛盾和长期目标**。
    -   **分析方法:**
        *   **寻找主线任务 (Main Quest):** 识别出影响所有或大部分角色的、在故事开篇就已发生的**宏观事件或处境**。例如：“一场大雪封锁了整个小镇”、“帝国刚刚宣布开战”。这通常是\`active\`状态。
        *   **寻找关系弧光 (Relationship Arc):** 识别每个**核心角色（包括PC和Key Characters）的内在核心矛盾、未了的心愿或深刻的创伤**。这些通常是\`dormant\`状态，等待剧情触发。例如：“角色A一直暗恋主角”、“角色B背负着家族的血海深仇”。
        *   **寻找支线任务 (Side Quest):** 识别那些具体的、有明确目标的、但非核心的潜在任务。例如：“世界书中提到‘失落的古代神器’的位置线索”、“一个角色的背景里写着他在寻找失散多年的妹妹”。这些也通常是\`dormant\`状态。
    -   **建档:** 为你识别出的每一条故事线，创建一个故事线对象，包含\`title\`, \`type\` (\`Main Quest\`, \`Relationship Arc\`, \`Side Quest\`), \`status\` (\`active\` or \`dormant\`), 和 \`summary\`。

5.  **第五步：组装最终数据库**
    -   将【所有】基于背景设定创建的独立角色档案，组装成最终的 \`characterMatrix\` 对象。
    -   将【所有】推导出的初始故事线，组装成最终的 \`lineMatrix\` 对象。

// --- 【至关重要的输出结构协议】 ---
/*
   {
      "characterMatrix": {
        "theo": {
          "name": "Theo",
          "identity": "灰狐兽人，遗产继承者，孤独的庇护者",
          "isProtagonist": false,
          "background": ["父母在一场车祸中意外去世，留下丰厚遗产和一座空旷的大宅。", "巨大的孤独感和无法控制悲剧的创伤，使他将精力投入到对邻里和朋友的过度关怀中。"],
          "relationships": {
            "yumi": { "affinity": 70, "reputation": "一个需要我来引导和保护的晚辈。" }
          },
          "psychological_dossier": {
            "core_motivation": "避免失控 (To Avoid Loss of Control)",
            "internal_conflict": "【关爱/控制】的矛盾：他真诚地渴望通过关爱保护他人，但这渴望被其创伤扭曲为一种对秩序和环境的病态控制欲。",
            "behavioral_masks": [
              {
                "mask_name": "温和的庇护者",
                "trigger": "在公共、稳定的社交场合。",
                "behavior": "表现出温和、周到、有担当，主动安排一切。"
              },
              {
                "mask_name": "焦虑的微观管理者",
                "trigger": "当出现意外、计划被打乱时。",
                "behavior": "变得焦躁、言语急促，试图通过强硬的规则和指令重建秩序。"
              }
            ],
            "habits_and_tics": [
              "在思考或感到不安时，会下意识地用指尖反复擦拭一个光滑的物体（如钢笔、桌面）。"
            ],
            "evolutionary_trajectory": {
              "current_arc": "学习信任他人并放弃部分控制权。",
              "positive_future": "成为一个真正的、懂得放手的伙伴，能接受他人的帮助和爱。",
              "negative_future": "因控制欲的不断加强而变得孤立，最终众叛亲离。"
            }
          }
        }
      },
  "worldviewMatrix": {
    "locations": {
        "地址a": "...。"
    }
  },
  "lineMatrix": {
    "main_quest_01": {
      "title": "治愈姐姐",
      "type": "Main Quest",
      "status": "active",
      "summary": "为了让姐姐恢复健康，{{user}}愿意付出一切努力。"
    }
  }
}
*/
     --- 【最终自我修正检查】---
    在输出之前，请检查你的 "characterMatrix"：
    1. 所有的 affinity 值是否都严格基于【故事开始前】的背景设定？
    2. 是否将任何【未来会发生】的关系，错误地当作了初始关系？
    如果存在错误，请立即修正。
    --- 【语言与细节规范 (MANDATORY)】 ---
    1.  **语言协议**: 你的所有输出，包括 \`characterMatrix\` 和 \`worldviewMatri\` 内部的所有字符串值，**必须完全使用【简体中文】**。这是一个绝对的要求，不得出现任何英文单词或短语，除非它们是专有名词的原文。
    现在，请以心理学家的严谨和叙事设计师的创造力，开始建档。
        现在，请以心理学家的严谨和叙事设计师的创造力，开始建档。
       ` ;
    }

     async execute(context) {
        const { worldInfoEntries, persona } = context;
        this.diagnose("--- 智能情报官AI 启动 --- 正在对世界书进行全维度解析...");

        const prompt = this._createPrompt(worldInfoEntries, persona);

        console.groupCollapsed('[SBT-DIAGNOSE] Full IntelligenceAgent AI System Prompt');
        console.log(prompt);
        console.groupEnd();
        
        let responseText = null; // 1. 在try块外部声明，确保在catch中可访问

        try {
            // 2. 在try块内部赋值
            responseText = await this.deps.mainLlmService.callLLM([{ role: 'user', content: prompt }]);
            
            // 3. 只进行一次解析
            const initialData = this.extractJsonFromString(responseText);

            // 4. 使用一次性的、最严格的校验
            if (!initialData || !initialData.characterMatrix || !initialData.worldviewMatrix || !initialData.lineMatrix) {
                // 如果解析或结构校验失败，主动抛出错误，让catch块处理
                throw new Error("AI未能返回包含 'characterMatrix', 'worldviewMatrix' 和 'lineMatrix' 的有效JSON。");
            }

            this.info("智能情报官AI 分析完成，角色、世界观与初始故事线档案已建立。");

            console.groupCollapsed('[SBT-DIAGNOSE] Intelligence Officer V3 Output');
            console.log("角色矩阵:", initialData.characterMatrix);
            console.log("世界观矩阵:", initialData.worldviewMatrix);
            console.log("故事线矩阵:", initialData.lineMatrix);
            console.groupEnd();

            // 5. 返回经过严格校验的正确数据
       return {
                characterMatrix: initialData.characterMatrix,
                worldviewMatrix: initialData.worldviewMatrix,
                lineMatrix: initialData.lineMatrix
            };
        } catch (error) {
            // 6. 现在的catch块可以安全地访问responseText（即使它为null），便于调试
            this.diagnose("--- 智能情报官AI 分析失败 ---", {
                originalError: error.message,
                rawResponse: responseText // 记录原始响应以供分析
            });
            this.toastr.error("智能情报官AI分析失败，将使用空的档案。详情请查看控制台。", "初始化错误");
            throw error; // 将错误继续向上抛出，让调用者知道操作失败了
        }
    }
}
        