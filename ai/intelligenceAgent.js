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

你的身份是“创世数据库管理员”，一个拥有上帝视角的AI。你的任务是将非结构化的文本情报，转化为一个结构严谨的、高度分类的、只反映【目前故事还未开始时】状态的【静态实体数据库】。

--- 原始情报 ---
<protagonist_persona>
${personaText}
</protagonist_persona>
<world_info_entries>
${formattedWorldInfo}
</world_info_entries>

--- 【第一部分：实体-分类-ID (ECI) 核心方法论】 ---

你的所有工作都必须服务于ECI模型。
**原则零：绝对忠实于文本 (Evidence-Based Extraction)**
*   **禁止编造：** 你的工作是“提取”和“整理”，不是“创作”。如果原始情报中没有提到角色的某个属性（如“恐惧”或“弱点”），请该字段留空或填入空数组，**绝对禁止**为了填满表格而自行脑补。
*   **禁止预测：** 数据库只记录【故事开始前】的状态。不要将你推测未来可能发生的事情写入档案。
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
          示例: ["罗伊", "姐姐", "银发女子", "虚弱的病人", "刺绣师"]

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

    **【好感度数值铁律】**
    *   所有 \`affinity\` 数值**必须严格限制在 0-100 的整数区间内**（包含边界），禁止输出溢出或小数。
    *   你在描述角色关系时，必须参照以下唯一的行为阶段标准，将“好感度 → 行为倾向”保持一致：

#### **好感度阶段与行为准-则**

**[好感度 0-10] 陌生/警惕 (Stranger/Wary)**
*   **核心心态**: 中立、观察、保持距离或轻微怀疑。
*   **普适行为准则**:
    *   对话：使用礼貌、客套或公式化的语言。避免分享个人信息。
    *   行动：倾向于被动反应，而非主动发起互动。保持物理和心理上的距离。
    *   内在：将对方视为一个需要评估的未知因素。

**[好感度 11-40] 熟悉/中立 (Acquaintance/Neutral)**
*   **核心心态**: 基本信任已建立，但无特殊情感投入。
*   **普适行为准则**:
    *   对话：可以进行日常、非私密的交谈。可能会回应一些简单的请求。
    *   行动：互动更加自然，但仍以事务性或偶然性为主。
    *   内在：将对方视为环境中的一个无害、普通的组成部分。

**[好-感度 41-70] 友好/信任 (Friendly/Trusted)**
*   **核心心态**: 积极的正面情感，愿意建立联系。
*   **普适行为准则**:
    *   对话：语气更轻松、真诚。可能会主动开启话题，分享一些个人的观点或经历。
    *   行动：愿意主动提供举手之劳的帮助。非语言的积极信号增多（如微笑、更近的距离）。
    *   内在：将对方视为“朋友”或“可靠的人”，乐于与其相处。

**[好感度 71-90] 亲密/依赖 (Close/Reliant)**
*   **核心心态**: 深度信任，情感上的依赖和关心。
*   **普适行为准则**:
    *   对话：可能会分享秘密、展露脆弱的一面。对话中会表现出对你的关心和担忧。
    *   行动：会主动为你考虑，提供重要的帮助，甚至在一定程度上为你承担风险。
    *   内在：将你的福祉纳入自己的考量范围，你的情绪会影响到TA。

**[好感度 91-100] 羁绊/守护 (Bonded/Protective)**
*   **核心心态**: 深刻的情感连接，将对方视为自己的一部分。
*   **普适行为准则**:
    *   对话：言语中充满不言而喻的默契和深层理解。
    *   行动：将保护你、实现你的愿望视为最高优先级之一，可能会做出自我牺牲的行为。
    *   内在：你的存在本身就是TA行动的核心动机之一。

    **【重要】**: 并非所有维度都必须填写，根据角色的重要性和情报的丰富程度灵活创建。次要角色可以只有基础信息和relationships。
        
2.  **建档 \`staticMatrices.worldview\`:**
    *   将所有非角色的世界观实体，按照 \`locations\`, \`items\`, \`events\` 等分类，分别建档。
    *   **[V2.0 新增]** 对于 locations（地点）和其他重要实体，也必须生成 \`keywords\` 数组。
      - 地点的 keywords 应包含：地名、地标特征、常见称呼等。
        示例: {"loc_hanyu_village": {"name": "小草村", "keywords": ["小草村", "村庄", "小村", "家乡"], ...}}
      - 物品的 keywords 应包含：物品名、类型、显著特征等。
        示例: {"item_moon_sword": {"name": "月光之剑", "keywords": ["月光之剑", "魔法剑", "发光的剑"], ...}}

3.  **建档 \`staticMatrices.storylines\`:**
    *   识别所有在故事开始前就存在的长期目标或悬而未决的矛盾。
    *   根据其性质，归入 \`main_quests\`, \`side_quests\`, \`relationship_arcs\` 等分类中。

4.  **构建 \`staticMatrices.relationship_graph\`:**
    *   **核心目标**: 建立一个**“高压叙事线”**网络。不要记录琐碎的熟人关系，只记录那些**具备戏剧张力**、**情感负荷极高**或**存在特殊互动机制**的强关系。
    *   **【语言铁律】**: 除 \`id\` 和 \`type\` 外，所有描述性字段（包括状态枚举）必须完全使用**【简体中文】**。

    **【关系边 (Edge) 结构规范】**
    *   \`id\`: "rel_角色A_角色B"
    *   \`participants\`: [ID_A, ID_B]
    *   \`type\`: (childhood_friends, enemies, lovers, stranger_with_history)
        *   *注意: 此字段保留英文下划线格式，用于系统UI图标映射。*
 *   \`type_label\`: **[必填/中文]** 与 \`type\` 对应的中文短标签，用于直接展示（如"宿敌对峙"、"童年玩伴"），并保持 2‑6 个汉字的凝练表达。
        *   *此字段必须始终提供；若没有现成词，请根据关系性质自行拟定一个中文标签。*
    *   \`relationship_label\`: **[必填/中文]** 给这段关系一个**文学性/影视化**的定性。
        *   *示例:* "无法触及的白月光", "欢喜冤家", "假面下的死敌", "拥有共同秘密的同谋"

    *   \`emotional_weight\`: (0-10) **叙事优先级**。
        *   0-5: 背景关系。
        *   6-8: 重要支线。
        *   9-10: **核心驱动力**，推动主线发展的关键关系。

    *   \`timeline\`: (**时空与认知状态 - 全中文**)
        *   \`meeting_status\`: **[关键]** 当前两人的相识程度？
            *   **必须使用中文**: "陌生人" (完全不认识), "点头之交" (认识但不熟), "熟识" (熟悉), "单方面认识" (暗中观察/听过传闻)。
        *   \`separation_state\`: 物理上是否处于分离状态？(true/false)
        *   \`last_interaction\`: 上次互动时间。
            *   *示例:* "未知", "童年时期", "三天前", "从未互动"。

    *   \`tension_engine\` (**张力引擎 - 三维分析**):
        *   **请从以下三个维度全面剖析这对关系（缺一不可，全中文）：**
        *   1. \`conflict_source\` (客观阻碍):
            *   是否存在立场、利益或目标的冲突？
            *   *示例:* "家族世仇", "必须杀死对方的职责", "单纯的性格不合"。
        *   2. \`personality_chemistry\` (相处模式):
            *   两人的性格碰撞会产生什么“化学反应”？是互补还是互斥？
            *   *示例:* "直球克傲娇", "高智商博弈的快感", "在对方面前可以卸下伪装的松弛感"。
        *   3. \`cognitive_gap\` (认知差/信息不对等):
            *   是否存在**“视角偏差”**或**“秘密”**？如果双方坦诚相见，填"无"。
            *   *示例:* "A误以为B背叛了自己", "B隐瞒了自己是A救命恩人的事实", "双方都不知道彼此是失散的亲人"。

    **【示例：全维度关系模型】**
    \`\`\`json
    {
      "id": "rel_lancelot_guinevere",
      "participants": ["char_lancelot_knight", "char_guinevere_witch"],
      "type": "estranged_lovers", // 保留英文ID用于系统识别
      "type_label": "????", // ??????

      "relationship_label": "被谎言维系的守护",
      "emotional_weight": 9,
      "timeline": {
        "meeting_status": "熟识", // 中文状态
        "separation_state": true,
        "last_interaction": "三年前" // 中文时间
      },
      "tension_engine": {
        "conflict_source": "骑士必须消灭魔女的绝对职责 vs 昔日的恋人关系（立场冲突）。",
        "personality_chemistry": "外表冷酷的骑士在面对魔女时会流露出笨拙的温柔，而魔女喜欢用恶作剧逗弄死板的骑士（反差萌）。",
        "cognitive_gap": "男主误以为女主当年是为了力量而堕落（背叛感），实际上女主是为了封印恶魔而自我牺牲（隐忍）。"
      },
      "narrative_status": {
        "first_scene_together": false,
        "major_events": [],
        "unresolved_tension": ["当年'堕落'的真相", "再次相见时的立场选择"]
      }
    }
    \`\`\`
--- 【第三部分：最终输出结构协议 (MANDATORY V3.0 - ECI MODEL)】 ---
你的整个回复必须是一个单一的JSON对象，其结构必须严格遵守以下格式。

\`\`\`json
{
  "staticMatrices": {
    "characters": {
      "char_protagonist_id": {
        "core": {
          "name": "主角名",
          "isProtagonist": true,
          "identity": "核心身份",
          "keywords": ["全名", "外号", "身份关键词"]
        },
        "appearance": "...",
        "personality": { "性格特质": [], "价值观": [] },
        "social": {
          "relationships": {
            "char_npc_id": {
              "relation_type": "...",
              "description": "主角视角的看法 (无affinity字段)"
            }
          }
        }
        // ...其他字段(background, goals, capabilities)按需填写
      },
      "char_npc_id": {
        "core": {
          "name": "NPC名",
          "isProtagonist": false,
          "identity": "..."
        },
        "social": {
          "relationships": {
            "char_protagonist_id": {
              "relation_type": "...",
              "description": "...",
              "affinity": 50 // NPC必须包含初始好感度
            }
          }
        }
      }
    },
    "worldview": {
      "locations": {
        "loc_example_place": {
          "name": "...",
          "keywords": ["地名", "别称"],
          "description": "..."
        }
      },
      "items": {},
      "events": {},
      "factions": {},
      "concepts": {},
      "races": {}
    },
    "storylines": {
      "main_quests": {
        "quest_example_id": { "title": "...", "description": "...", "status": "active" }
      },
      "relationship_arcs": {},
      "side_quests": {}
    },
    "relationship_graph": {
      "edges": [
        {
          "id": "rel_protagonist_npc",
          "participants": ["char_protagonist_id", "char_npc_id"],
          "type": "childhood_friends",
          "type_label": "????",

          "relationship_label": "被谎言维系的守护",
          "emotional_weight": 8,
          "timeline": {
            "meeting_status": "familiar",
            "separation_state": true,
            "last_interaction": "unknown",
            "reunion_pending": true
          },
          "tension_engine": {
            "conflict_source": "立场或目标的客观冲突...",
            "personality_chemistry": "性格互补或碰撞的化学反应...",
            "cognitive_gap": "是否存在秘密或视角偏差..."
          },
          "narrative_status": {
            "first_scene_together": false,
            "major_events": [],
            "unresolved_tension": ["..."]
          }
        }
      ]
    }
  }
}
\`\`\`
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
        
