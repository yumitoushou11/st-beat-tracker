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
        - \`keywords\`: **[V2.0 新增]** 关键词索引数组 - 用于快速检索和上下文召回。
          必须包含：角色的姓名、别名、核心身份、显著特征、职业等所有可能被提及的关键标识。
          示例: ["雪菜", "姐姐", "银发女子", "虚弱的病人", "刺绣师"]

    *   **外貌特征 (appearance)**:
        - 描述角色的外貌、体型、着装风格等视觉特征的字符串或结构化对象

    *   **性格心理 (personality)**:
        - \`性格特质\`: 核心性格特质数组 (如: ["勇敢", "固执", "善良"])
        - \`价值观\`: 价值观数组 (如: ["家人至上", "正义"])
        - \`说话风格\`: 说话风格描述

    *   **背景故事 (background)**:
        - \`出身背景\`: 出身背景字符串
        - \`教育经历\`: 教育经历字符串
        - \`关键经历\`: 关键经历数组 (可引用event_id)
        - \`当前状况\`: 当前生活状况描述

    *   **目标与动机 (goals)**:
        - \`长期目标\`: 长期目标数组
        - \`短期目标\`: 短期目标数组
        - \`恐惧\`: 恐惧/担忧数组
        - \`欲望\`: 欲望/渴求数组

    *   **秘密信息 (secrets)**:
        - 隐藏的信息、不为人知的过去，字符串或数组

    *   **能力技能 (capabilities)**:
        - \`战斗技能\`: 战斗技能对象 (如: {"剑术": "精通", "魔法": "初级"})
        - \`社交技能\`: 社交技能对象 (如: {"谈判": "优秀", "领导力": "精通"})
        - \`特殊能力\`: 特殊能力数组
        - \`弱点\`: 弱点数组

    *   **装备资源 (equipment)**:
        - \`武器\`: 武器item_id数组
        - \`护甲\`: 护甲item_id数组
        - \`配饰\`: 配饰item_id数组
        - \`物品\`: 其他物品item_id数组

    *   **社交网络 (social)**:
        - \`relationships\`: 人际关系对象 (格式见下方，此字段保持英文以便系统识别)
        - \`所属组织\`: 所属组织/势力ID数组 (如: ["faction_royal_guard"])
        - \`声望\`: 声望对象 (如: {"王国": "尊敬", "盗贼公会": "敌对"})
        - \`社会地位\`: 社会地位描述

    *   **经历与成长 (experiences)**:
        - \`到访地点\`: 到访过的地点ID数组
        - \`参与事件\`: 参与过的重大事件ID数组
        - \`人生里程碑\`: 人生里程碑数组

    **【叙事逻辑铁律：禁止量化主角】**
         *   在为主角创建档案时，其 \`social.relationships\` 对象中**绝对不能包含任何\`affinity\`（好感度）字段**。其档案中**必须包含 \`core.isProtagonist: true\`**。
         *   你可以使用 \`description\` 字段来描述主角对其他角色的**初始认知或背景关系**（例如："这是我体弱多病的姐姐"）。
         *   对于**所有非主角角色 (NPC)**，其 \`social.relationships\` 对象中则**必须包含**对其他角色的初始 \`affinity\` 值。其档案中**必须包含 \`core.isProtagonist: false\`**。

    **【重要】**: 并非所有维度都必须填写，根据角色的重要性和情报的丰富程度灵活创建。次要角色可以只有基础信息和relationships。
        
2.  **建档 \`staticMatrices.worldview\`:**
    *   将所有非角色的世界观实体，按照 \`locations\`, \`items\`, \`events\` 等分类，分别建档。
    *   **[V2.0 新增]** 对于 locations（地点）和其他重要实体，也必须生成 \`keywords\` 数组。
      - 地点的 keywords 应包含：地名、地标特征、常见称呼等。
        示例: {"loc_hanyu_village": {"name": "羽生村", "keywords": ["羽生村", "村庄", "小村", "家乡"], ...}}
      - 物品的 keywords 应包含：物品名、类型、显著特征等。
        示例: {"item_moon_sword": {"name": "月光之剑", "keywords": ["月光之剑", "魔法剑", "发光的剑"], ...}}

3.  **建档 \`staticMatrices.storylines\`:**
    *   识别所有在故事开始前就存在的长期目标或悬而未决的矛盾。
    *   根据其性质，归入 \`main_quests\`, \`side_quests\`, \`relationship_arcs\` 等分类中。

4.  **[V3.0 新增] 构建 \`staticMatrices.relationship_graph\`:**
    *   这是平台化叙事引擎的核心数据结构，用于系统化处理关系里程碑事件（重逢、初识、告白等）。

    **【关系图谱构建规则】**

    **何时创建关系边:**
    对于任何两个角色，如果他们之间存在以下类型的关系，你**必须**创建一条关系边：
    - 血缘/法律关系（父母、子女、兄弟姐妹、配偶、恋人）
    - 长期社交关系（童年玩伴、朋友、同事、师生、宿敌）
    - 故事线定义的关系（单恋对象、复仇目标、盟友）
    - 情感权重 ≥ 6 的任何关系

    **关系边数据结构:**
    每条关系边必须包含以下字段：

    *   \`id\`: 关系唯一ID，格式为 "rel_角色1ID去掉前缀_角色2ID去掉前缀"
        例如: char_yumi_player + char_rofi_hunter → "rel_yumi_rofi"

    *   \`participants\`: 关系参与者ID数组，必须是两个角色ID
        例如: ["char_yumi_player", "char_rofi_hunter"]

    *   \`type\`: 关系类型，使用英文下划线命名
        常见类型: "childhood_friends", "family_siblings", "romantic_interest", "rivals", "mentor_student", "allies", "enemies"

    *   \`emotional_weight\`: 情感权重 (0-10整数)
        - 0-3: 普通熟人、路人
        - 4-6: 重要关系（好友、同事）
        - 7-8: 非常重要（挚友、暗恋对象、重要家人）
        - 9-10: 生命中最重要的人

    *   \`timeline\`: 时间线对象，必须包含：
        - \`established\`: 关系建立时间
          可用值: "childhood"（童年）, "youth"（青少年）, "recent"（近期）, "years_ago"（数年前）, "unknown"（未知）, 或具体描述

        - \`last_interaction\`: 最后互动时间
          **推断规则**:
          - 如果世界书说"童年玩伴"但没提最近的联系 → 设为 null
          - 如果说"最近见过" → 设为 "recent"
          - 如果说"数年未见" → 设为 null
          - 如果是家人且同居 → 设为 "daily"

        - \`separation_duration\`: 分离时长
          可用值: "none"（未分离）, "days"（数天）, "weeks"（数周）, "months"（数月）, "years"（数年）, "unknown"（未知）
          **推断规则**: 基于 last_interaction 推断，如果last_interaction为null且不是家人，通常为"years"

        - \`reunion_pending\`: 是否等待重逢 (true/false)
          **推断规则**:
          - 如果 last_interaction 为 null 且 emotional_weight ≥ 6 → true
          - 如果 separation_duration 为 "years" 且 emotional_weight ≥ 7 → true
          - 其他情况 → false

    *   \`narrative_status\`: 叙事状态对象，必须包含：
        - \`first_scene_together\`: 是否已在故事中首次同框 (true/false)
          **初始化规则**: 如果这是故事开端（创世时） → 始终设为 false

        - \`major_events\`: 故事中的重大关系事件记录（数组）
          **初始化规则**: 创世时始终设为空数组 []

        - \`unresolved_tension\`: 未解决的情感张力/冲突（字符串数组）
          **推断规则**: 从角色的 secrets 字段、goals.恐惧、goals.欲望 中提取
          示例: ["未言说的暗恋", "误会尚未解开", "愧疚感", "嫉妒"]

    **【关系图谱示例】**
    假设有童年玩伴 Yumi 和 Rofi，Rofi 暗恋 Yumi 但数年未见：

    \`\`\`json
    {
      "id": "rel_yumi_rofi",
      "participants": ["char_yumi_player", "char_rofi_hunter"],
      "type": "childhood_friends",
      "emotional_weight": 8,
      "timeline": {
        "established": "childhood",
        "last_interaction": null,
        "separation_duration": "years",
        "reunion_pending": true
      },
      "narrative_status": {
        "first_scene_together": false,
        "major_events": [],
        "unresolved_tension": ["未言说的暗恋", "数年未见的思念"]
      }
    }
    \`\`\`

    **【关键推断原则】**
    - **时间线推断**: 仔细阅读角色背景和世界书，推断他们最后一次互动的时间
    - **情感张力提取**: 从 secrets、goals、background 中寻找未解决的情感线索
    - **重逢标记**: 如果分离时间长且情感权重高，必须标记 reunion_pending: true
    - **双向一致性**: 关系是双向的，不要重复创建（只需创建一条边）

--- 【第三部分：最终输出结构协议 (MANDATORY V3.0 - ECI MODEL)】 ---
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
          "race_id": "race_human",
          "keywords": ["Yumi", "由美", "冒险者", "黑发少女", "妹妹"]
        },
        "appearance": "黑色长发，琥珀色眼睛，身材娇小但充满活力",
        "personality": {
          "性格特质": ["勇敢", "善良", "有点冲动"],
          "价值观": ["家人至上", "正义"],
          "说话风格": "活泼直率，偶尔会说出天真的话"
        },
        "background": {
          "出身背景": "出生于羽生村的普通家庭",
          "教育经历": "村里的基础教育",
          "关键经历": ["event_sister_illness"],
          "当前状况": "和姐姐一起生活在羽生村"
        },
        "goals": {
          "长期目标": ["治愈姐姐的疾病", "成为伟大的冒险者"],
          "短期目标": ["赚取足够的钱购买药材"],
          "恐惧": ["失去姐姐", "让姐姐失望"],
          "欲望": ["保护所爱之人", "探索未知世界"]
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
          "race_id": "race_human",
          "keywords": ["雪菜", "姐姐", "银发女子", "虚弱的病人", "刺绣师"]
        },
        "appearance": "银白色长发，温柔的浅蓝色眼睛，身体虚弱但气质优雅",
        "personality": {
          "性格特质": ["温柔", "坚强", "善解人意"],
          "价值观": ["家人", "善良"],
          "说话风格": "温和体贴，总是为他人着想"
        },
        "background": {
          "出身背景": "羽生村",
          "关键经历": ["event_mysterious_illness"],
          "当前状况": "身患重病，卧床休养"
        },
        "goals": {
          "长期目标": ["康复", "不成为妹妹的负担"],
          "恐惧": ["无法活下去", "拖累妹妹"],
          "欲望": ["看到妹妹幸福"]
        },
        "capabilities": {
          "社交技能": {"刺绣": "精通", "烹饪": "优秀"},
          "弱点": ["身体虚弱", "无法长时间活动"]
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
          "keywords": ["羽生村", "村庄", "小村", "家乡"],
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
    },
    "relationship_graph": {
      "edges": [
        {
          "id": "rel_yumi_xuecai",
          "participants": ["char_yumi_player", "char_xuecai_sister"],
          "type": "family_siblings",
          "emotional_weight": 10,
          "timeline": {
            "established": "childhood",
            "last_interaction": "daily",
            "separation_duration": "none",
            "reunion_pending": false
          },
          "narrative_status": {
            "first_scene_together": false,
            "major_events": [],
            "unresolved_tension": ["担心姐姐的病情", "不想让姐姐担心自己"]
          }
        }
      ]
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

            // V3.0: 向后兼容性处理 - 如果AI未生成relationship_graph，创建空结构
            if (!initialData.staticMatrices.relationship_graph) {
                this.diagnose("[V3.0兼容] AI未生成relationship_graph，使用空结构");
                initialData.staticMatrices.relationship_graph = { edges: [] };
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
        