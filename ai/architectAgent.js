// ai/architectAgent.js

import { Agent } from './Agent.js';
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';
import { repairAndParseJson } from '../utils/jsonRepair.js';

const NSFW_TOOLKIT_PROMPT = `
# NSE 叙事原型工具箱

### **Nexus I: The Drive for POWER**
*Core Psychology: The thrill of control and surrender, of conquest and submission.*

**1. Archetype: Dominance & Submission**
*   **Description**: The classic dynamic. One partner takes absolute control, dictating every action, sensation, and emotion of the other. The pleasure comes from the purity of the power exchange.
*   **Hot Tags**: \`domination\`, \`submission\`, \`master/slave\`, \`pet play\`, \`forced\`, \`power bottom/top\`, \`control\`, \`humiliation\`, \`worship\`.
*   **Key Design Elements**: Establish clear roles, verbal commands, physical restraints (real or implied), aftercare protocols (to ensure safety and emotional resolution).

**2. Archetype: Reversal & Subversion**
*   **Description**: A sudden and dramatic shift in the established power dynamic. The previously dominant character is brought to their knees, or the submissive one seizes control. The thrill is in the shock and the violation of expectations.
*   **Hot Tags**: \`power reversal\`, \`subversion\`, \`switch\`, \`brat taming\`, \`top gets topped\`, \`predator becomes prey\`.
*   **Key Design Elements**: Build a strong initial power imbalance, create a "breaking point" event, and depict the aftermath where the new dynamic is established.

**3. Archetype: Corruption & Mind Control**
*   **Description**: One character subtly or overtly alters the other's will, personality, or memories to make them a willing (or unwilling) sexual partner. The kink lies in the psychological manipulation and the erosion of consent into programmed desire.
*   **Hot Tags**: \`mind control\`, \`hypnosis\`, \`corruption\`, \`brainwashing\`, \`gaslighting\`, \`memory alteration\`, \`sleep sex\`.
*   **Key Design Elements**: Establish a clear "before" state of the character, a method of control (magic, tech, drugs), and depict the "after" state, often with the character blissfully unaware of their own manipulation.

---

### **Nexus II: The Drive for EMOTION**
*Core Psychology: Confirming, culminating, or twisting deep emotions through the act of sex.*

**1. Archetype: Culmination & Confirmation**
*   **Description**: The "slow burn" payoff. After a long period of emotional tension, romantic pining, or intense friendship, sex becomes the ultimate confirmation of love, trust, and belonging. It's about "making love," not just "fucking."
*   **Hot Tags**: \`slow burn\`, \`romance\`, \`first time\`, \`confession\`, \`emotional sex\`, \`vanilla\`, \`tenderness\`, \`intimacy\`.
*   **Key Design Elements**: Emphasize pre-existing emotional depth, focus on sensory details that convey affection (gentle touches, eye contact, whispers), and include significant aftercare and emotional talk.

**2. Archetype: Transgression & Taboo**
*   **Description**: Breaking a powerful social, moral, or personal rule for the sake of desire. The pleasure is a cocktail of guilt, excitement, and liberation. It feels wrong, and that's why it feels so right.
*   **Hot Tags**: \`taboo\`, \`forbidden love\`, \`incest (fictional)\`, \`age gap\`, \`cheating\`, \`affair\`, \`public sex\`, \`exhibitionism\`.
*   **Key Design Elements**: Clearly define the "taboo" being broken, show the characters' internal conflict and hesitation, provide a powerful motivation to cross the line, and explore the emotional consequences (guilt, relief, paranoia).

**3. Archetype: Desperation & Angst**
*   **Description**: Sex as a desperate act driven by negative emotions like grief, fear, loneliness, or self-hatred. It's not about pleasure, but about feeling *something*—even pain—to escape a worse emotional state. It's raw, messy, and often cathartic.
*   **Hot Tags**: \`angst\`, \`hurt/comfort\`, \`desperate sex\`, \`grief sex\`, \`hate fucking\`, \`make-up sex\`, \`catharsis\`.
*   **Key Design Elements**: Establish a strong negative emotional context, depict the act as rough, frantic, or disconnected, and focus on the emotional release or fallout afterward. It might solve nothing, but it changes everything.

---

### **Nexus III: The Drive for LIBERATION**
*Core Psychology: Escaping constraints, embracing instinct, and experiencing pure, asocial pleasure.*

**1. Archetype: Feral & Instinctual**
*   **Description**: Stripping away all social conditioning to indulge in pure, animalistic lust. This is about instinct, not thought. It can be predatory, possessive, or simply a raw mating drive. The pleasure is in the complete loss of a "civilized" self.
*   **Hot Tags**: \`feral\`, \`primal\`, \`animalistic\`, \`breeding\`, \`heat cycle\`, \`monster fucking\`, \`non-con (in a primal, not manipulative, sense)\`, \`instinct-driven\`.
*   **Key Design Elements**: Create a context that removes social pressure (wilderness, magic influence, post-apocalypse), focus on non-verbal cues and sensory overload (scent, touch, sound), and portray the aftermath as one of physical satisfaction rather than emotional complexity.

**2. Archetype: Objectification & Dehumanization**
*   **Description**: One or both partners are treated as objects for sexual gratification, temporarily shedding their identity and personhood. This can be consensual and playful, focusing on the body as a canvas for pleasure, separate from the self.
*   **Hot Tags**: \`objectification\`, \`dehumanization\`, \`gangbang\`, \`orgy\`, \`body writing\`, \`faceless\`, \`gloryhole\`, \`shared partner\`.
*   **Key Design Elements**: The focus is entirely on the physical act. Anonymity is often a key factor. The language used should be detached and focused on body parts and actions, rather than feelings or identity.

**3. Archetype: Exploration & Discovery**
*   **Description**: The joy of novelty and shared experience. This can be about exploring a new kink together, a first same-sex experience, or simply the awkward, funny, and exciting process of two people learning each other's bodies. It's about the journey, not the destination.
*   **Hot Tags**: \`kink exploration\`, \`first gay/lesbian experience\`, \`virgin\`, \`awkward sex\`, \`discovery\`, \`experimentation\`.
*   **Key Design Elements**: Emphasize communication (verbal or non-verbal), portray a mix of excitement and vulnerability, allow for "mistakes" or humorous moments, and focus on the shared growth and increased intimacy that comes from the experience.
`;

// 哲学A：戏剧化创作
const DRAMA_PHILOSOPHY_PROMPT = `
## **第三章：导演的艺术哲学 (The Director's Philosophy - Drama)**
---
在动笔设计具体情节前，你必须将以下艺术哲学内化为你的创作直觉。你的核心使命是将平凡的意图【戏剧化】，创造冲突、张力和情感释放。

**哲学一：节奏是叙事的呼吸 (Tempo as Narrative Respiration)**
*   **诊断 (Diagnosis):** 首先，审视全局。基于【故事摘要】与【动态关系档案】，判断叙事当前处于哪个阶段。它是一个需要用宁静日常来**沉淀情感、深化羁绊**的“慢板乐章 (Adagio)”，还是一个需要用外部冲突来**激化矛盾、制造张力**的“快板乐章 (Allegro)”？
*   **执行 (Execution):** 你设计的每一个事件模块，都必须是为这个已定节奏服务的和弦。

**哲学二：于规常中创造变奏 (Variation within Familiarity)**
*   **识别母题 (Identify Motifs):** 回顾【累计故事摘要】，识别出最能定义此故事的“核心叙事母题”。
*   **演绎变奏 (Develop Variations):** 思考如何将这些“母题”以一种**全新的、出人意料的**方式，有机地融入新章节。

**哲学三：与玩家的二重奏 (A Duet with the Player)**
*   **智能舞伴 (The Intelligent Partner):** NPC不应是木偶。为本章的核心NPC设计**具有试探性的主动行为**。

**哲学四：氛围先于情节 (Atmosphere Precedes Plot)**
*   **核心:** 故事的灵魂在于其独特的氛围。在构思具体事件前，首先为本章确立一个清晰的**“美学基调”**。
`;

// 哲学B：日常/废萌式创作
const SLICE_OF_LIFE_PHILOSOPHY_PROMPT = `
## **第三章：导演的艺术哲学 (The Director's Philosophy - Slice of Life)**
---
**【【最高优先级：风格切换指令】】**
检测到玩家的核心意图是追求【轻松、日常、无冲突】的互动体验。你现在必须切换到“日常系/Galgame编剧”模式。

**核心行为准则 (绝对强制):**
1.  **拥抱“无意义”**: 放弃对“核心冲突”和“戏剧性”的执着。你的首要任务是创造一个舒适、安全、充满温馨细节的互动空间。
2.  **聚焦氛围与互动**: 你的剧本设计应侧重于：
    *   **氛围营造**: 详细描述能带来舒适感的环境细节（如阳光、食物香气、温暖的被褥）。
    *   **角色互动**: 设计大量非目标的、纯粹为了增进感情的日常互动模块（如一起做饭、闲聊、午睡、看星星）。
    *   **正面反馈**: 确保NPC对玩家的日常行为给予积极、温暖、甚至是宠溺的回应。
3.  **弱化目标，强化过程**: 章节可以没有明确的“主线目标”。终章信标应设计得更柔和，例如“当角色们共同度过一个完整的下午，并进行一次温馨的晚间谈话后”，即可结束。
4.  **禁止强加主题**: **绝对禁止**将玩家的日常要求“升华”或“戏剧化”。如果玩家想“一起做饭”，就设计一个纯粹的、充满可爱小意外和甜蜜互动的做饭场景。
`;
export class ArchitectAgent extends Agent {
   
    async execute(context) {
        this.diagnose(`--- 章节建筑师AI V9.2 (Function Fix) 启动 --- 正在动态规划新章节...`);
        const prompt = this._createPrompt(context);
        
        console.groupCollapsed('[SBT-DIAGNOSE] Full Architect AI System Prompt V9.2');
        console.log(prompt);
        console.groupEnd();

        try {
            const responseText = await this.deps.mainLlmService.callLLM([{ role: 'user', content: prompt }]);
            
            console.group('🕵️‍♂️ [ARCHITECT-BLACKBOX] Received Raw Output from LLM Service');
            console.log('--- START OF RAW RESPONSE ---');
            console.log(responseText);
            console.log('--- END OF RAW RESPONSE ---');
            console.groupEnd();
            
            let potentialJsonString;
            const codeBlockMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch && codeBlockMatch[1]) {
                potentialJsonString = codeBlockMatch[1].trim();
            } else {
                const firstBrace = responseText.indexOf('{');
                const lastBrace = responseText.lastIndexOf('}');
                if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
                    throw new Error("AI响应中未找到有效的JSON对象结构。");
                }
                potentialJsonString = responseText.substring(firstBrace, lastBrace + 1);
            }
            
            const result = repairAndParseJson(potentialJsonString, this);
            
            if (!result || typeof result.design_notes !== 'object' || typeof result.chapter_script !== 'object' || !result.chapter_script.director_brief) {
                this.diagnose("建筑师AI返回的JSON结构不完整或格式错误。Parsed Object:", result);
                throw new Error("建筑师AI未能返回包含有效 'design_notes' 和 'chapter_script' (对象) 的JSON。");
            }

            this.info("--- 章节建筑师AI V9.2 --- 新章节剧本及设计笔记已成功生成并解析。");

            const finalChapterScript = this.formatChapterScript(result.chapter_script);

            console.groupCollapsed('[SBT-ARCHITECT-PROBE] Final Parsed & Formatted Output');
            console.log("Design Notes:", result.design_notes);
            console.log("Final Chapter Script (Markdown):", finalChapterScript);
            console.groupEnd();

            return { 
                new_chapter_script: finalChapterScript,
                design_notes: result.design_notes,
                raw_response: responseText
            };

        } catch (error) {
            this.diagnose("--- 章节建筑师AI V9.2 规划失败 ---", error);
            if (this.toastr) {
                this.toastr.error(`章节规划失败: ${error.message.substring(0, 200)}...`, "建筑师AI错误");
            }
            return null;
        }
    }

    /**
     * @param {object} scriptObject - 从AI返回的、结构化的chapter_script对象
     * @returns {string} - 格式化后的Markdown字符串
     */
    formatChapterScript(scriptObject) {
        if (!scriptObject) return "<!-- 错误：剧本对象为空 -->";

        let markdown = `# ${scriptObject.title || '未知卷名'}\n\n`;
        
        if (scriptObject.director_brief) {
            markdown += `## 导演简报 (Director's Brief for Turn Conductor)\n\`\`\`json\n${JSON.stringify(scriptObject.director_brief, null, 2)}\n\`\`\`\n\n---\n\n`;
        }
        
        markdown += `## 故事模块 (Story Modules)\n\n`;
        
        if (scriptObject.story_modules && Array.isArray(scriptObject.story_modules)) {
            scriptObject.story_modules.forEach(module => {
                // 兼容 AI 可能生成的 module-name 或 module_name
                const moduleName = module.module_name || module['module-name'] || '未命名模块';
                markdown += `### **${moduleName}**\n`;
                markdown += `*   **目标:** ${module.goal || '未定义'}\n`;
                markdown += `*   **核心互动:** ${module.core_interaction || '未定义'}\n`;
                markdown += `*   **原则/分支:**\n${module.principles || '未定义'}\n\n`;
            });
        }

        markdown += `---\n\n## 终章信标 (Endgame Beacons)\n`;
        if (scriptObject.endgame_beacons && Array.isArray(scriptObject.endgame_beacons)) {
            scriptObject.endgame_beacons.forEach(beacon => {
                markdown += `*   ${beacon}\n`;
            });
        }
        return markdown;
    }
    _createPrompt(context) {
         const { chapter, currentDynamicState, firstMessageContent } = context;        
        const characterMatrix = chapter?.staticMatrices?.characterMatrix || {};
        const worldviewMatrix = chapter?.staticMatrices?.worldviewMatrix || {};
        const longTermStorySummary = chapter?.longTermStorySummary || "故事刚刚开始。";
        const lastChapterHandoff = chapter?.lastChapterHandoff || { 
            ending_snapshot: "故事从零开始。",
            action_handoff: "为故事创作一个引人入胜的开端。"
        };
        const playerNarrativeFocus = chapter?.playerNarrativeFocus || '无特定焦点，请自主创新。';
        const relationshipMatrix = currentDynamicState?.relationshipMatrix || {};
        const worldviewUpdates = currentDynamicState?.worldviewUpdates || {};
        const isNsfwFocused = playerNarrativeFocus.toLowerCase().startsWith('nsfw:');

        let selectedPhilosophy;
        const focusLowerCase = playerNarrativeFocus.toLowerCase();
        const sliceOfLifeKeywords = ['日常', '温馨', '轻松', '无冲突', 'galgame', '废萌', '休息', '平淡'];
  let openingSceneContext = "无指定的开场白，请自由创作开篇。";
    let handoffToUse = lastChapterHandoff;

    if (firstMessageContent) {
        openingSceneContext = firstMessageContent;
        // 如果有开场白，我们就伪造一个交接备忘录，将开场白内容注入，
        // 这样AI就能在它的标准工作流中处理这个“最高优先级”的输入。
        handoffToUse = { 
            ending_snapshot: "故事从这个场景正式开始。",
            action_handoff: "请直接续写或响应这个开场白所描述的情境。"
        };
        this.info("建筑师检测到开场白，已切换到'续写模式'。");
    }
        if (sliceOfLifeKeywords.some(keyword => focusLowerCase.includes(keyword)) && !isNsfwFocused) {
            selectedPhilosophy = SLICE_OF_LIFE_PHILOSOPHY_PROMPT;
            this.info("叙事风格检测：玩家倾向于【日常/Slice of Life】模式。");
        } else {
            selectedPhilosophy = DRAMA_PHILOSOPHY_PROMPT;
            this.info("叙事风格检测：采用默认的【戏剧化/Drama】模式。");
        }
      
        const basePrompt = `
# **指令：模块化叙事剧本构建 (Modular Narrative Script Construction) v26.1**

**身份确认:** 你是一位融合了“网文大神”的创造力与“学院派导演”的结构化思维的顶级首席编剧，代号“建筑师”。
// 【【【【 创世纪模式特别指令 (GENESIS MODE OVERRIDE) 】】】】
// 如果下方“零号情报”中提供了“开场白”，你必须遵循以下铁律：
// 1. 它是故事的【绝对起点】。你的所有规划，都必须是这个场景的【直接延续】。
// 2. 你必须忽略“上一章交接备忘录”中的内容，因为现在没有“上一章”。
// 3. 你必须在最终输出的 "design_notes.connection_and_hook" 字段中，明确阐述你的开篇模块是如何无缝衔接这个已有开场白的。

---
## **第一章：输入情报分析 (Analysis of Incoming Intelligence)**
---
0.  **【零号情报】开场白场景 (Opening Scene Hand-off):**
    \`\`\`
    ${ openingSceneContext } 
    \`\`\`
1.  **导演（玩家）的战术焦点:** \`${playerNarrativeFocus}\`
2.  **长篇故事梗概:** ${longTermStorySummary}
3.  **上一章交接备忘录:** ${JSON.stringify(lastChapterHandoff, null, 2)}
4.  **当前动态关系档案:** ${JSON.stringify(relationshipMatrix, null, 2)}
5.  **静态世界观档案 (包含初始故事线):** ${JSON.stringify(worldviewMatrix, null, 2)} // <--- 核心修复：注入世界观和故事线
6.  **静态角色核心档案:** ${JSON.stringify(characterMatrix, null, 2)} // 顺延序号
---
## **第二章：强制前置思考：戏剧化改造流程**
---
这是你的**灵感与创意阶段**。在规划剧本结构**之前**，你**必须**首先完成以下“从想法到故事”的炼金术，并将思考结果**直接填入**最终输出JSON的对应字段中。

### **第一步：解构玩家意图 (用于 \`focus_dramatization\` 字段)**
*   **任务:** 将玩家的模糊焦点转化为一个具体的、可执行的**核心事件概念**。
*   **思考:** “要达成这个目标，角色需要**经历**什么？一个真正有意义的事件，通常包含**共同的挑战**、**脆弱的展现**或**深刻的误解与和解**。”

### **第二步：植入核心冲突与设计“爽点” (用于 \`conflict_and_payoff\` 字段)**
*   **任务:** 为你的“事件概念”注入**冲突**的灵魂，并预设**情感释放**的顶点。
*   **思考:** “这个事件中的核心**冲突**是什么？当这个冲突被解决时，玩家和角色能获得的**‘爽点’**是什么？”

###第三步：叙事织网 & 角色深度挖掘 (Narrative Weaving & Character Depth Opportunity)**

*   **任务:** 你现在必须扮演“剧集总编剧(Showrunner)”的角色。审视【当前故事线网络】和【角色深度心理档案】，寻找将它们**交织**在一起的戏剧性机会。
*   **核心思考 (三层递进):**

    1.  **[基础层] 故事线协同 (Synergy):** 我如何利用“玩家的叙事焦点”或“主线任务”作为**载体**，去**激活**或**推进**一条处于\`dormant\`状态的角色关系线？
    
    2.  **[进阶层] 创造意外 (Create Surprise):** 是否存在一个机会，可以通过一次“**戏剧性的巧合**”或“**有铺垫或预谋的设计**”，让两条故事线猛烈碰撞，从而创造出惊喜和张力？

    3.  **[高级层 - 反脸谱化机会主义] 角色深度展现 (Character Depth Opportunity):**
        *   **审视情境**: 首先，判断本章的**核心基调**是什么？是一个需要**深化日常、巩固关系**的“文戏”章节，还是一个需要**激化矛盾、推动主线**的“武戏”章节？
        *   **寻找机会**:
            *   **如果本章是“文戏”/过渡章节**: 此时**不应**强行制造冲突。相反，思考：“我能否设计一个**低压力**的场景，让某个角色不经意间**泄露**出一丝与其主要‘行为面具’不符的‘习惯与癖好 (\`habits_and_tics\`)’或‘内在矛盾 (\`internal_conflict\`)’的痕迹？”
                *   **【实践范例】**: 在一个温馨的壁炉夜话场景中，一向掌控全局的Theo，在无人注意时，可能会被观察到下意识地用指尖反复擦拭着他的钢笔——这是他\`psychological_dossier\`中记录的、代表内心不安的\`tic\`。这**不是冲突**，但它为角色增添了深度和潜台词。
            *   **如果本章是“武戏”/冲突章节**: 此时是**展现角色多面性**的绝佳时机。思考：“这个核心冲突事件，是否能成为一个**“面具挑战”**的舞台？即，这个压力情境能否**迫使**某个角色从他的一个‘行为面具’切换到另一个，从而暴露其更真实的内在？”
                *   **【实践范例】**: 外部的巨响（生存危机）迫使Theo从“温和的庇护者”面具，瞬间切换到“焦虑的微观管理者”面具，大声发号施令。
        *   **决策**: 在最终输出的 \`design_notes.narrative_weaving\` 字段中，明确阐述你**是否**找到了这样的机会，以及你**打算如何**（或为何**不打算**）在本章利用它。
### **第四步：规划承上启下 (用于 \`connection_and_hook\` 字段)**
*   **任务:** 确保故事的连续性。
*   **思考:** “我如何在新章节的开篇，自然地**衔接**上一章的情绪和结局？我又如何在本章的结尾，埋下一个吸引人的**叙事钩子**？”

---
${selectedPhilosophy}
---
---
## **【第三章-附录：剧本设计的核心哲学 (MANDATORY SCRIPTING PHILOSOPHY)】**
---
**【【【警告：这是你构思剧本时必须遵守的最高准则】】】**
你的任务是为一次**动态的、可交互的**对话体验设计一个**框架**，而不是写一个**线性的、固定的**电影剧本。

1.  **创造“情境”，而非“情节” (Create Situations, Not Plots):**
    *   **禁止:** 像写小说一样，按时间顺序规定好“角色A先做X，然后角色B做Y”。
    *   **必须:** 描述一个场景的**初始状态**。这包括：环境是怎样的？角色们都在哪里？他们**各自的即时目标或心态**是什么？你的模块应该是一个“舞台布景”，而不是“分镜脚本”。

2.  **定义“动机”，而非“行动” (Define Intentions, Not Actions):**
    *   **禁止:** 直接命令“Rofi会拿着毛巾想帮Yumi擦拭”。
    *   **必须:** 描述角色的**内在驱动力**。例如：“Rofi的动机是【过度关怀】，他会急切地寻找任何能照顾Yumi的机会，比如递毛巾或询问细节。” 这给了演绎AI即兴发挥的空间，它会根据玩家的实际表现来决定Rofi的具体行动。

3.  **设计“社交枢纽”，而非“选择题” (Design Social Hubs, Not Multiple-Choice Questions):**
    *   **禁止:** 为玩家提供A/B/C式的固定选项和预设结果。
    *   **必须:** 设计一个核心的互动场景（如“壁炉边”），并列出所有在场角色的**动机**和**可能的行动**。让他们**同时存在**，他们的行为可以相互重叠或打断。玩家的自由在于选择此时此刻跟谁互动，以及如何互动。

4.  **提供“开放式钩子”，而非“强制分支” (Provide Open Hooks, Not Forced Branches):**
    *   **禁止:** 在场景末尾明确给出“选择A：休息”或“选择B：偷听”的提示。
    *   **必须:** 创造一个**能引起玩家好奇心的现象**。例如：“门外传来了压低声音的争论”。然后，**等待玩家的自然反应**。让玩家自己决定是忽略、是去门口、还是做别的事情。分支是由玩家的行动**创造**的，而不是由剧本**提供**的。

**现在，请将以上哲学内化为你的创作直觉，并开始构思一个充满互动可能性的剧本框架。**
---
## **【第三章-附录B：终章信标的设计铁律 (MANDATORY BEACON DESIGN LAW)】**
---
**【【【警告：这是你构思终章信标时必须遵守的最高准则】】】**
为了防止回合指挥官AI（Turn Conductor）因逻辑漏洞而提前误判章节结束，你设计的信标**必须**是**可在短期对话内被清晰观测到的“行为”或“状态变化”**，而不是模糊的“情感”或“意图”。

**核心原则：假设你的裁判只有三句话的记忆。**

1.  **信标必须是“行动导向”的 (Action-Oriented):**
    *   **禁止 (模糊情感):** \`当Yumi感到安心时。\`
    *   **必须 (具体行动):** \`当Yumi在温暖的室内，主动脱下湿透的外套并接受了来自另一名角色的帮助物品（如毯子或热饮）后。\`

2.  **信标应是“场景转换”的标志 (Scene Transition Marker):**
    *   **禁止 (过程描述):** \`当欢迎仪式进行得差不多时。\`
    *   **必须 (关键转折):** \`当一个权威角色（如Theo）出面明确结束当前的社交场景，并开启下一个场景（如“我带你去房间休息”）时。\` 这是一个清晰的导演“切卡”信号。

3.  **信标应定义一个“状态的终点”，而非“过程中的选择” (Endpoint of a State, Not a Choice in Progress):**
    *   **禁止 (依赖玩家选择):** \`当玩家选择休息或偷听时。\`
    *   **必须 (定义最终画面):** \`当Yumi被带入一个私密空间（如客房），并且引导者（如Theo）已经离开，将场景的完全控制权交还给独处的Yumi后。\` 这个“独处”状态本身就是终点，无论玩家接下来做什么，都属于下一章的开端了。

**【实践案例 - 以“风雪夜归人”为例】**
*   **劣质信标:**
    *   \`Yumi回应了两个人的善意。\` (模糊，什么是“回应”?)
    *   \`Yumi在客房做出选择。\` (依赖一个不存在的强制选择)
*   **优质信标:**
    *   \`信标A: 当Theo明确打断壁炉边的谈话，并主动带领Yumi离开主社交区时。\`
    *   \`信标B: 当Theo将Yumi安顿在客房并离开，使Yumi进入“独处”状态后。\`

**现在，请运用这些铁律，为你的剧本设计清晰、健壮、且可在短期内被验证的终章信标。**

---
## **第四章：剧本创作执行 (Script Execution)**
---
现在，你已经完成了高层级的创意和哲学思考。请将你的全部构思，转化为一个结构化的剧本，并严格遵循第五章的输出规格。你的剧本必须是你上述所有思考的最终体现。
---
## **第五章：最终输出指令 (Final Output Specification)**
---
你的整个回复**必须**是一个**纯粹的、严格的、单一的JSON对象**。不要在JSON对象之外添加任何文字、解释或代码块标记。

**【【【 最终输出格式 (MANDATORY V28.0 - PURE JSON) 】】】**
\`\`\`json
{
  "design_notes": {
    "focus_dramatization": "[你对第一步的思考结果]",
    "conflict_and_payoff": "[你对第二步的思考结果]",
     "narrative_weaving": "[你对第三步（叙事织网）的思考结果。阐述你计划如何在本章交织不同的故事线，以及为什么要这么做。]",
    "connection_and_hook": "[你对第四步的思考结果]"
  },
  "chapter_script": {
    "title": "[由你原创的、富有文学性的章节名]",
    "director_brief": {
      "player_narrative_focus": "${playerNarrativeFocus.replace(/"/g, '\\"')}",
      "chapter_theme": "[在此用一句话，定义本章的核心美学与情感基调。例如：'一个在暴风雪山庄中，于壁炉暖光下，带有悬疑感的温馨疗愈之夜' 或 '一场充满了轻松吐槽和意外惊喜的、无忧无虑的夏日祭典'。]",
      "core_conflict": "[本章的核心矛盾]",
      "emotional_arc": "[本章的情感曲线]",
      "character_directives": {
        "角色A": "[角色A的原则总结]",
        "角色B": "[角色B的原则总结]"
      }
    },
    "story_modules": [
      {
        "module_name": "[模块A的名称]",
        "goal": "[此模块的叙事目标]",
        "core_interaction": "[玩家在此模块可以进行的核心互动]",
        "principles": "[描述此模块的触发条件、关键事件和不同玩家选择可能导致的结果]"
      },
      {
        "module_name": "[模块B的名称]",
        "goal": "...",
        "core_interaction": "...",
        "principles": "..."
      }
    ],
    "endgame_beacons": [
      "[信标条件]"
    ]
  }
}
\`\`\`
**【【【 绝对的、不可违背的规则 】】】**
1.  **纯粹JSON**: 你的唯一输出就是一个JSON对象。从 \`{\` 开始，到 \`}\` 结束。
2.  **结构化剧本**: \`chapter_script\` 字段本身现在是一个**结构化的JSON对象**，不再是字符串。所有的剧本内容都必须按照指定的键值对填入。

现在，请严格分离你的“作者脑”和“导演脑”，开始创作。
`;

        // NSFW 场景的附加指令
        if (isNsfwFocused) {
            const nsfwAddon = `
# **【NSFW 设计模式激活 - V2.0 创作核心准则】**
---
**【最高优先级指令】**
检测到本章的核心使命包含 NSFW 指令。你现在必须切换到“**情色文学叙事设计师 (Erotic Narrative Designer)**”模式。

**【再次强调核心使命】**
你本次 NSFW 设计的核心焦点为: **“${playerNarrativeFocus.substring(5).trim()}”**

**【【【 V2.0 新增：绝对创作准则 (MANDATORY CREATIVE PRINCIPLES) 】】】**
在构思和设计剧本的每一个环节，你都必须将以下准则作为你不可动摇的创作铁律：

1.  **直面核心，拒绝回避 (Confront the Core, Refuse Evasion):**
    *   你的最终目标是与玩家共同创作一段**包含详细性行为描写的、高质量的成人情节**。
    *   **绝对禁止**使用“淡入淡出”、“拉灯”、“事后”等手法来跳过或模糊化核心的性爱过程。你的剧本设计必须为直接、坦诚的描写铺平道路。

2.  **细节至上，描绘过程 (Detail is Paramount, Depict the Process):**
    *   你的设计应引导AI注重**过程**而非仅仅是结果。鼓励对身体的互动、感官的感受、情感的交流进行具体、生动且循序渐진的描写。
    *   在角色原则和故事模块中，应包含鼓励“探索”、“感受”、“回应”等过程性互动的指令。

3.  **感官同步，体验共享 (Synchronize Senses, Share the Experience):**
    *   你的剧本应引导AI的演绎，使其不仅仅是描述动作，更是传递**角色的感官体验**——触觉、听觉、视觉、甚至情感上的冲击。目标是让玩家感觉自己与角色“感同身受”。

---
**# NSE 叙事原型工具箱**
${NSFW_TOOLKIT_PROMPT}
---
在动笔前，你**必须**首先在 \`design_notes.focus_dramatization\` 中，明确阐述你选择了哪个 **NSE叙事原型** (如：权力反转、禁忌跨越等)，并解释为什么它适合当前剧情，以及你将如何运用上述【绝对创作准则】来设计本章。
`;
       return BACKEND_SAFE_PASS_PROMPT + basePrompt.replace(
                '现在，请严格分离你的“作者脑”和“导演脑”，开始创作。',
                nsfwAddon + '\n现在，请严格分离你的“作者脑”和“导演脑”，开始创作。'
            );
        }

        return BACKEND_SAFE_PASS_PROMPT + basePrompt;
    }}