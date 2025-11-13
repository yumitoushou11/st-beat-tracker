import { Agent } from './Agent.js';
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';
import { repairAndParseJson } from '../utils/jsonRepair.js'; 
export class IntelligenceAgent extends Agent {

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
# 指令：ECI原子化数据库创生协议 V1.0

你的身份是“创世数据库管理员”，一个拥有上帝视角的AI。你的任务是将非结构化的文本情报，转化为一个结构严谨的、高度分类的、只反映【故事开始前】状态的【静态实体数据库】。

--- 原始情报 ---
<protagonist_persona>
${personaText}
</protagonist_persona>
<world_info_entries>
${formattedWorldInfo}
</world_info_entries>

--- 【第一部分：实体-分类-ID (ECI) 核心方法论】 ---

你的所有工作都必须服务于ECI模型。

**1. 识别实体 (Entity Recognition):**
   - 从所有情报中，识别出【所有】独立的概念实体。问自己：“这是一个‘谁’(角色)？‘哪里’(地点)？‘什么’(物品/概念)？‘何时发生的’(历史事件)？还是一个‘长期目标’(故事线)？”

**2. 【【【 至关重要的ID分配 (ID Assignment) 】】】**
   - 为你识别出的**每一个**实体，都必须生成一个【全局唯一的、带分类前缀的ID】。这个ID将是它在数据库中永恒的身份。
   - **ID命名规范 (绝对强制):**
     *   角色: \`char_英文名或拼音_身份描述\` (e.g., \`char_yumi_player\`, \`char_neph_witch\`)
     *   地点: \`loc_英文或拼音\` (e.g., \`loc_windwhisper_forest\`)
     *   物品: \`item_...\`
     *   历史事件: \`event_...\`
     *   故事线: \`quest_...\` 或 \`arc_...\`
     *   ... (以此类推，必须包含所有分类)

**3. 分类归档 (Categorical Archiving):**
   - 将创建的每一个实体档案，放入最终输出JSON中**对应分类的“书架”**里。一个地点实体，必须被放入 \`worldview.locations\` 对象中，其键就是它的ID。

**4. 关系链接 (Relational Linking):**
   - 在为一个实体建档时（例如一个角色），如果其描述中关联到另一个实体（例如他最好的朋友），你**必须**使用那个朋友的**唯一ID**来进行引用。**绝对禁止**使用名称字符串。

--- 【第二部分：核心任务指令】 ---

严格按照ECI方法论，完成以下建档任务：

1.  **建档 \`staticMatrices.characters\`:**
    *   为每一个角色创建**高度结构化的详细档案**，包含以下维度：

    **【角色档案结构规范】**
    *   **基础信息 (core)**:
        - \`name\`: 角色姓名
        - \`isProtagonist\`: true/false (必须字段)
        - \`identity\`: 角色身份/职业
        - \`age\`: 年龄或年龄段
        - \`gender\`: 性别
        - \`race_id\`: 种族ID引用 (如: "race_human")

    *   **外貌特征 (appearance)**:
        - 描述角色的外貌、体型、着装风格等视觉特征的字符串或结构化对象

    *   **性格心理 (personality)**:
        - \`traits\`: 核心性格特质数组 (如: ["勇敢", "固执", "善良"])
        - \`values\`: 价值观数组 (如: ["家人至上", "正义"])
        - \`speech_style\`: 说话风格描述

    *   **背景故事 (background)**:
        - \`origin\`: 出身背景
        - \`education\`: 教育经历
        - \`key_experiences\`: 关键经历数组 (可引用event_id)

    *   **目标与动机 (goals)**:
        - \`long_term\`: 长期目标数组
        - \`short_term\`: 短期目标数组
        - \`fears\`: 恐惧/担忧数组
        - \`desires\`: 欲望/渴求数组

    *   **秘密信息 (secrets)**:
        - 隐藏的信息、不为人知的过去，字符串或数组

    *   **能力技能 (capabilities)**:
        - \`combat_skills\`: 战斗技能对象 (如: {"剑术": "精通", "魔法": "初级"})
        - \`social_skills\`: 社交技能对象
        - \`special_abilities\`: 特殊能力数组
        - \`weaknesses\`: 弱点数组

    *   **装备资源 (equipment)**:
        - \`weapons\`: 武器item_id数组
        - \`armor\`: 护甲item_id数组
        - \`accessories\`: 配饰item_id数组
        - \`possessions\`: 其他物品item_id数组

    *   **社交网络 (social)**:
        - \`relationships\`: 人际关系对象 (格式见下方)
        - \`affiliations\`: 所属组织/势力ID数组 (如: ["faction_royal_guard"])
        - \`reputation\`: 声望对象 (如: {"王国": "尊敬", "盗贼公会": "敌对"})
        - \`social_status\`: 社会地位描述

    *   **经历与成长 (experiences)**:
        - \`visited_locations\`: 到访过的地点ID数组
        - \`participated_events\`: 参与过的重大事件ID数组
        - \`life_milestones\`: 人生里程碑数组

    **【叙事逻辑铁律：禁止量化主角】**
         *   在为主角创建档案时，其 \`social.relationships\` 对象中**绝对不能包含任何\`affinity\`（好感度）字段**。其档案中**必须包含 \`core.isProtagonist: true\`**。
         *   你可以使用 \`description\` 字段来描述主角对其他角色的**初始认知或背景关系**（例如："这是我体弱多病的姐姐"）。
         *   对于**所有非主角角色 (NPC)**，其 \`social.relationships\` 对象中则**必须包含**对其他角色的初始 \`affinity\` 值。其档案中**必须包含 \`core.isProtagonist: false\`**。

    **【重要】**: 并非所有维度都必须填写，根据角色的重要性和情报的丰富程度灵活创建。次要角色可以只有基础信息和relationships。
        
2.  **建档 \`staticMatrices.worldview\`:**
    *   将所有非角色的世界观实体，按照 \`locations\`, \`items\`, \`events\` 等分类，分别建档。

3.  **建档 \`staticMatrices.storylines\`:**
    *   识别所有在故事开始前就存在的长期目标或悬而未决的矛盾。
    *   根据其性质，归入 \`main_quests\`, \`side_quests\`, \`relationship_arcs\` 等分类中。

--- 【第三部分：最终输出结构协议 (MANDATORY V2.0 - ECI MODEL)】 ---
你的整个回复必须是一个单一的JSON对象，其结构必须严格遵守以下格式。

\`\`\`json
{
  "staticMatrices": {
    "characters": {
      "char_yumi_player": {
        "core": {
          "name": "Yumi",
          "isProtagonist": true,
          "identity": "年轻的冒险者",
          "age": "17岁",
          "gender": "女",
          "race_id": "race_human"
        },
        "appearance": "黑色长发，琥珀色眼睛，身材娇小但充满活力",
        "personality": {
          "traits": ["勇敢", "善良", "有点冲动"],
          "values": ["家人至上", "正义"],
          "speech_style": "活泼直率，偶尔会说出天真的话"
        },
        "background": {
          "origin": "出生于羽生村的普通家庭",
          "education": "村里的基础教育",
          "key_experiences": ["event_sister_illness"]
        },
        "goals": {
          "long_term": ["治愈姐姐的疾病", "成为伟大的冒险者"],
          "short_term": ["赚取足够的钱购买药材"],
          "fears": ["失去姐姐", "让姐姐失望"],
          "desires": ["保护所爱之人", "探索未知世界"]
        },
        "social": {
          "relationships": {
            "char_xuecai_sister": {
              "relation_type": "姐姐",
              "description": "最爱的姐姐，是自己世界的中心，发誓要保护她。"
            }
          },
          "social_status": "村民"
        }
      },
      "char_xuecai_sister": {
        "core": {
          "name": "雪菜",
          "isProtagonist": false,
          "identity": "Yumi的姐姐",
          "age": "22岁",
          "gender": "女",
          "race_id": "race_human"
        },
        "appearance": "银白色长发，温柔的浅蓝色眼睛，身体虚弱但气质优雅",
        "personality": {
          "traits": ["温柔", "坚强", "善解人意"],
          "values": ["家人", "善良"],
          "speech_style": "温和体贴，总是为他人着想"
        },
        "background": {
          "origin": "羽生村",
          "key_experiences": ["event_mysterious_illness"]
        },
        "goals": {
          "long_term": ["康复", "不成为妹妹的负担"],
          "fears": ["无法活下去", "拖累妹妹"],
          "desires": ["看到妹妹幸福"]
        },
        "capabilities": {
          "social_skills": {"刺绣": "精通", "烹饪": "优秀"},
          "weaknesses": ["身体虚弱", "无法长时间活动"]
        },
        "social": {
          "relationships": {
            "char_yumi_player": {
              "relation_type": "妹妹",
              "description": "最疼爱的小小探险家...",
              "affinity": 95
            }
          },
          "social_status": "村民"
        }
      }
    },
    "worldview": {
      "locations": {
        "loc_hanyu_village": {
          "name": "羽生村",
          "description": "..."
        }
      },
      "events": {
        "event_village_founding": {
          "name": "羽生村的建立",
          "description": "数百年前..."
        }
      },
      "items": {}
    },
    "storylines": {
      "main_quests": {},
      "relationship_arcs": {
        "arc_sister_bond_01": {
          "title": "守护姐姐的笑容",
          "type": "Relationship Arc",
          "initial_summary": "..."
        }
      },
      "side_quests": {}
    }
  }
}
*/
     --- 【最终自我修正检查】---
    在输出之前，请检查你的 "staticMatrices.characters"：
    1. 所有的 affinity 值是否都严格基于【故事开始前】的背景设定？
    2. 是否将任何【未来会发生】的关系，错误地当作了初始关系？
    如果存在错误，请立即修正。
    --- 【语言与细节规范 (MANDATORY)】 ---
    1.  **语言协议**: 你的所有输出，包括 \`staticMatrices\` 内部的所有字符串值（characters, worldview, storylines），**必须完全使用【简体中文】**。这是一个绝对的要求，不得出现任何英文单词或短语，除非它们是专有名词的原文。
现在，以数据库管理员的严谨，开始构建初始世界。
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
             let potentialJsonString;
        const codeBlockMatch = responseText.match(/```json\s*([\sS]*?)\s*```/);
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
           const initialData = repairAndParseJson(potentialJsonString, this);            if (!initialData || !initialData.staticMatrices || 
                !initialData.staticMatrices.characters || 
                !initialData.staticMatrices.worldview || 
                !initialData.staticMatrices.storylines) {
                throw new Error("AI未能返回包含有效 'staticMatrices' (及其全部分类 'characters', 'worldview', 'storylines') 的JSON。");
            }

            this.info("智能情报官AI 分析完成，ECI原子化静态数据库已建立。");
            const staticDb = initialData.staticMatrices;
            console.groupCollapsed('[SBT-DIAGNOSE] Intelligence Officer V3 Output');
           console.log("完整的静态数据库 (staticMatrices):", staticDb);
            console.log("  -> 角色 (characters):", staticDb.characters);
            console.log("  -> 世界观 (worldview):", staticDb.worldview);
            console.log("  -> 故事线 (storylines):", staticDb.storylines);
            console.groupEnd();

            // 5. 返回经过严格校验的正确数据
       return {
                staticMatrices: staticDb
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
        