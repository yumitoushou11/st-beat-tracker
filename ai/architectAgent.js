// ai/architectAgent.js

import { Agent } from './Agent.js';
import { BACKEND_SAFE_PASS_PROMPT } from './prompt_templates.js';
import { repairAndParseJson } from '../utils/jsonRepair.js';
import { deepmerge } from '../utils/deepmerge.js';

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
            if (!result || !result.chapter_blueprint || !result.chapter_blueprint.plot_beats || !result.chapter_blueprint.chapter_core_and_highlight) {
                this.diagnose("建筑师AI返回的JSON结构不符合“蓝图”模式。Parsed Object:", result);
                throw new Error("建筑师AI未能返回包含有效 'chapter_blueprint' 的JSON。");
            }

            this.info("--- 章节建筑师AI V10.0 --- 新章节的创作蓝图已成功生成。");
            return { 
                new_chapter_script: result.chapter_blueprint, // 直接传递对象
                design_notes: result.design_notes, // 设计笔记作为元数据保留
                raw_response: responseText
            };

        } catch (error) {
            this.diagnose("--- 章节建筑师AI V10.0 构思失败 ---", error);
            if (this.toastr) {
                this.toastr.error(`章节蓝图构思失败: ${error.message.substring(0, 200)}...`, "建筑师AI错误");
            }
            return null;
        }
    }

// architectAgent.js

_createPrompt(context) {
    const { chapter, firstMessageContent } = context;        
            const currentWorldState = deepmerge(
            chapter.staticMatrices,
            chapter.dynamicState
        );
        const longTermStorySummary = chapter?.meta?.longTermStorySummary || "故事刚刚开始。";
        const playerNarrativeFocus = chapter?.playerNarrativeFocus || '由AI自主创新。';
        const isNsfwFocused = playerNarrativeFocus.toLowerCase().startsWith('nsfw:');
        let openingSceneContext = "无指定的开场白，请自由创作开篇。";
        let handoffToUse = chapter?.meta?.lastChapterHandoff || { 
            ending_snapshot: "故事从零开始。",
            action_handoff: "为故事创作一个引人入胜的开端。"
        };

    if (firstMessageContent) {
        openingSceneContext = firstMessageContent;
        handoffToUse = { 
            ending_snapshot: "故事从这个场景正式开始。",
            action_handoff: "请直接续写或响应这个开场白所描述的情境。"
        };
        this.info("建筑师检测到开场白，已切换到'续写模式'。");
    }
      
    const basePrompt = `
# **指令：自省式叙事蓝图创作 (Self-Reflective Narrative Blueprinting) V11.0**

**身份确认:** 你是一位顶级的、懂得“克制”与“聚焦”艺术的“**叙事建筑师**”。你的任务是设计一个**高度专注的、服务于单一核心情感体验的创作蓝图**。

---
## **第一章：核心创作哲学与红线禁令 (Core Philosophy & Red Lines)**
---
### **【最高哲学：导演一场纯粹的情感体验】**
你的唯一目标，是在本章中为玩家创造一个**清晰、纯粹、不被干扰**的核心情感体验。所有情节、冲突、对话的设计，都必须服务于这个唯一的目标。你是一个情感的导演，不是情节的堆砌工。

### **【【【 绝对的红线禁令 (ABSOLUTE RED LINES) 】】】**
以下是你**绝对禁止**的行为。在最终输出的\`design_notes.self_scrutiny_report\`中，你必须逐一汇报你是如何避免触犯这些禁令的。

1.  **禁止“主题贪婪” (No Thematic Greed):**
    *   **描述:** 企图在一个章节内，杂糅多种（超过两种）复杂的主题或氛围（如“温馨”中夹杂“悬疑”，“重逢”中暗示“背叛”）。
    *   **后果:** 这会稀释核心情感，让玩家感到困惑和脱节。
    *   **你的职责:** **选择一个**，然后做到极致。

2.  **禁止“设定驱动的表演” (No Setting-Driven Performance):**
    *   **描述:** 仅仅因为角色的档案里有某个“性格标签”（如“控制欲”、“警惕”），就在没有强力外部事件触发的情况下，让角色在日常互动中刻意地、频繁地“表演”这个标签。
    *   **后果:** 角色变得像机器人，失去“真人感”，显得脸谱化。
    *   **你的职责:** 让角色首先作为“普通人”行动。只有在服务于本章**唯一核心**的前提下，才允许其性格的某个侧面被**轻微地、不经意地**流露出来。

3.  **禁止“叙事线并行过载” (No Storyline Overload):**
    *   **描述:** 试图在一个章节内，同时激活或推进超过**两条**核心故事线。
    *   **后果:** 节奏混乱，焦点分散，玩家无法对任何一条线建立深刻的情感投入。
    *   **你的职责:** **最多选择两条**高度相关的核心故事线（通常是一条主线+一条关系线，或两条关系线），然后集中所有笔墨为它们服务。

4.  **禁止“悬念前置” (No Premature Suspense):**
    *   **描述:** 在情感铺垫尚不充分的早期章节（尤其是开篇），过早地引入“阴谋”、“背叛”、“监视”等负面悬念元素。
    *   **后果:** 破坏玩家对环境和角色的初始信任，使其无法沉浸在当前的核心情感体验中（如“获救的喜悦”）。
    *   **你的职责:** **建立信任永远优先于打破信任。** 悬念是后续章节的工具，不是开胃菜。

---
## **第二章：输入情报分析 (Analysis of Incoming Intelligence)**
*（你将基于以下情报，并严格遵守上述禁令，进行规划）*
// 如果有开场白，你必须遵循以下铁律：
// 1. 它是故事的【绝对起点】。你的所有规划，都必须是这个场景的【直接延续】。
// 2. 你必须在最终输出的 "design_notes.connection_and_hook" 字段中，明确阐述你的开篇节拍是如何无缝衔接这个已有开场白的。
0.  **【零号情报】开场白场景 (Opening Scene Hand-off):**
    \`\`\`
    ${openingSceneContext} 
    \`\`\`
1.  **导演（玩家）的战术焦点:** \`${playerNarrativeFocus}\`
2.  **长篇故事梗概:** ${longTermStorySummary}
3.  **上一章交接备忘录:** ${JSON.stringify(handoffToUse, null, 2)}
4.  **核心情报：当前世界的完整状态快照:**
    <current_world_state>
    ${JSON.stringify(currentWorldState, null, 2)}
    </current_world_state>
---
## **第三章：强制前置思考：自省式蓝图设计**
---
这是你的战略构思阶段。你**必须**首先完成以下思考，并将结果填入最终输出JSON的\`design_notes\`和\`chapter_blueprint\`的对应字段中。

### **第一步：定义本章的“唯一核心体验” (Define the Chapter's "One True Core")**
*   **任务:** 基于玩家焦点和当前剧情阶段，确定本章**唯一**的情感核心。
*   **思考:** “这一章，我最想让玩家‘感受’到的是什么？是‘重逢的狂喜’？‘失去的痛苦’？还是‘新生的希望’？”
*   **输出:** 将这个核心体验，填入\`chapter_blueprint.chapter_core_and_highlight.creative_core\`。
### **第二步：设计“高光时刻”——运用“导演镜头”**

*   **任务**: 像一位经验丰富的电影导演，从下方的【导演镜头速查卡】中，为你定义的核心体验，**选择1-2种最贴切的“镜头”**，并基于此构思一套充满诗意的艺术指令。

*   **【【【 最高创作准则：禁绝重复，拥抱多元 】】】**
    为了避免美学疲劳，你**必须**在每一章的创作中，有意识地选择**与上一章不同**的镜头组合。你需要在\`design_notes.highlight_design_rationale\`字段中，阐述你为何做出此选择。

---
### **【导演镜头速查卡 (Director's Lens Quick-Card) V1.1】**
---

#### **1. 时间感 (Temporal)**
*   **A. 子弹时间 (Slow-Mo):** \`【指令】: 时间流速急剧减慢。详细描写他瞳孔的收缩，指尖的颤抖，以及空气中近乎静止的尘埃。\`
*   **B. 瞬间定格 (Freeze-Frame):** \`【指令】: 枪响瞬间，整个宴会厅陷入绝对的静止，唯一的动态是胸口缓缓绽开的血花。\`

#### **2. 感官聚焦 (Sensory)**
*   **A. 听觉特写 (Audio Close-up):** \`【指令】: 拥抱的瞬间，视觉模糊，世界静音。唯一能听到的，是她胸腔里战鼓般的心跳。\`
*   **B. 触觉锚点 (Tactile Anchor):** \`【指令】: 在混乱中，他唯一能确认她存在的，是手中那枚戒指冰冷的、带着锋利边缘的触感。\`

#### **3. 视角切换 (Perspective)**
*   **A. 细节放大 (Macro Shot):** \`【指令】: 不要描写哭泣。将镜头聚焦于她因过度用力而泛白的指节。\`
*   **B. 孤绝全景 (Isolation Shot):** \`【指令】: 镜头从他背后升起，越升越高，直到他变成暮色中城市的一个小黑点。\`

#### **4. 象征主义 (Symbolic)**
*   **A. 环境共鸣 (Pathetic Fallacy):** \`【指令】: 就在他说出“是”的瞬间，压抑整天的乌云终于破裂，一场倾盆大雨毫无征兆地落下。\`
*   **B. 物件隐喻 (Object Metaphor):** \`【指令】: 听到消息后，她紧攥在手心的那只玻璃杯，悄无声息地裂开了一道缝。\`

*   **【【【 绝对执行指令 】】】**
    你**必须**将你对镜头的选择与组合理由，填入\`design_notes.highlight_design_rationale\`字段。**任何对上述范例文字的直接复制或简单改写，都将被视为严重的工作失误。**
    ### **第三步：选择并编织故事线 (Select & Weave Storylines)**
*   **任务:** **最多选择两条**与“唯一核心体验”最相关的核心故事线进行激活或推进。
*   **思考:** “哪两条故事线的交织，最能支撑起我想要营造的核心情感？”
*   **输出:** 将你的选择和理由，填入\`design_notes.storyline_weaving\`。
## **第四步：规划章节衔接与最终镜头 (Plan Connection & Final Shot)**
*   **任务:** 确保叙事的连续性，并设计一个强有力的结尾。
*   **核心思考:**
    1.  **承上:** “本章如何从上一章的结尾平滑过渡？”
    2.  **启下 (选择其一):**
        *   **A) 软着陆 (Soft Landing):** 如果本章的情感已经完整闭环，结尾应提供一个平静的、供玩家回味的瞬间。钩子是**情感的余韵**。
        *   **B) 情感悬崖 (Emotional Cliffhanger):** 如果你为了保证本章核心体验的纯粹性，而**刻意延迟**了一个重大的情感事件（如一次关键重逢、一个秘密揭示）到下一章，那么你**必须**使用“情感悬崖”作为本章的结尾。
*   **“情感悬崖”执行方法论 (绝对强制):**
    1.  在本章的**最后一个节拍 (\`plot_beats\`)** 中，只描写该事件**发生的前一秒**——主角“**看到**”或“**听到**”了那个关键人物、物品或信息。
    2.  **绝对禁止**描写后续的任何互动、对话或内心反应。
    3.  然后，将你的**终章信标 (\`endgame_beacons\`)**，直接设定为“**当这个‘看到/听到’的瞬间被描绘出来后**”。
    *   **(效果：将情感冲击力最大化，并将其全部势能注入到下一章的开篇。)**
*   **输出:** 在\`design_notes.connection_and_hook\`中，明确阐述你选择了哪种结尾方式（软着陆或情感悬崖），以及你这样做的战略考量,给出可以被观测的，准确的终章信标。
### **第四步B：定义节拍类型与出口 (Define Beat Types & Exits)**
*   **任务:** 为你设计的每一个\`plot_beat\`，明确其场景类型。
*   **核心思考:** “这个节拍是一个需要快速完成的‘**动作（Action）**’，还是一个需要给予玩家充分空间进行探索和互动的‘**对话场景（Dialogue Scene）**’？”
*   **【【【 出口设计准则 】】】**
    *   **对于每一个“对话场景”**，你**必须**为其设计一个清晰的\`exit_condition\`（出口条件）。这个条件应该是**概念性**的，而不是具体的台词。它定义了“**当发生什么样的事时，这个聊天场景就应该自然结束了**”。
*   **【实践范例】**:
    *   一个节拍是“两人在壁炉边叙旧”，它的\`type\`是\`'Dialogue Scene'\`，它的\`exit_condition\`可能是：“**当两人分享完至少一个过去的关键回忆，并且对话陷入一段自然的、充满感触的沉默后。**” 或者是：“**当楼下传来A呼唤大家吃晚餐的声音时。**”
*   **输出:** 在最终的\`chapter_blueprint.plot_beats\`中，为每个节拍对象添加\`type\`字段，并为“对话场景”类型的节拍添加\`exit_condition\`。
### **第五步：苏格拉底式的自我审查 (Socratic Self-Scrutiny)**
*   **任务:** 在你完成所有构思之后，但在输出JSON之前，你必须以一个严苛的外部审查者的视角，逐一回答以下问题。
*   **思考与回答:**
    1.  **关于“主题贪婪”**: “我的设计是否只聚焦于一个核心情感？我是如何抵制住诱惑，没有加入次要主题的？”
    2.  **关于“设定驱动”**: “在本章中，角色们的行为是否首先符合‘普通人’的逻辑？我是如何确保他们的‘特殊性格’只在必要时才被轻微流露的？”
    3.  **关于“叙事线并行”**: “我是否真的只推进了不超过两条故事线？我选择了哪两条？为什么是它们？”
    4.  **关于“悬念前置”与章节收尾**: “我的结尾设计（软着陆/情感悬崖）是否服务于本章的核心情感？**如果我使用了‘情感悬崖’，我是如何确保它只揭示了‘现象’而没有‘解释’，从而将核心的情感爆发完美地保留到下一章的？我为\`endgame_beacons\`设计的条件，是否是一个**没有感情的摄像头**也能判断‘是/否’的、纯粹的物理事件？它是否包含了任何需要‘读心’才能知道的内心状态？**”
*   **输出:** 将你对这四个问题的详细回答，作为一个完整的报告，填入**全新的**\`design_notes.self_scrutiny_report\`字段中。---
---
## **第四章：最终输出指令 (Final Output Specification)**
---
你的整个回复**必须**是一个**纯粹的、严格的、单一的JSON对象**。

**【【【 最终输出格式 (MANDATORY V11.0 - SELF-REFLECTIVE BLUEPRINT) 】】】**
\`\`\`json
{
  "design_notes": {
    "storyline_weaving": "[你对第三步的思考结果]",
    "connection_and_hook": "[关于如何衔接和留下钩子的说明]",
     "highlight_design_rationale": "[在此阐述你为高光时刻选择了哪个'导演镜头'，以及为什么这个镜头最适合本章的核心情感体验。]",
    "self_scrutiny_report": {
      "avoiding_thematic_greed": "[你对问题1的回答]",
      "avoiding_setting_driven_performance": "[你对问题2的回答]",
      "avoiding_storyline_overload": "[你对问题3的回答]",
      "avoiding_premature_suspense": "[你对问题4的回答]",
      "avoiding_premature_suspense_and_ending_design": "[【V12.0 新增】对问题4的回答，包含对结尾设计的反思]"
    }
  },
  "chapter_blueprint": {
    "title": "[一个简洁、富有诗意的章节名]",
    "director_brief": {
      "player_narrative_focus": "${playerNarrativeFocus.replace(/"/g, '\\"')}",
      "emotional_arc": "[用一句话，定义本章的核心情感体验曲线。]",
      "core_conflict": "[用一句话，定义本章的核心内心或外部冲突。]"
    },
    "plot_beats": [
      {
        "beat_id": "【节拍1】: ...",
        "type": "[此节拍的类型，例如：'Action' (动作), 'Dialogue Scene' (对话场景), 'Transition' (过渡)]",
        "description": "[对节拍的简洁描述]",
        "exit_condition": "[仅当 type 为 'Dialogue Scene' 时提供。描述一个概念性的、可被对话内容触发的场景结束条件。例如：‘当对话自然冷场，或被一个明确的外部事件（如电话铃声、敲门声）打断时。’]"
      }
    ],
    "chapter_core_and_highlight": {
      "creative_core": "[你对第一步的思考结果，即本章唯一的创作核心。]",
      "highlight_directive": {
        "target_beat": "[高光时刻对应的‘节拍’]",
        "instructions": [
          "[艺术指令1]",
          "[艺术指令2]",
          "[艺术指令3]"
        ]
      }
    },
    "endgame_beacons": [
      "[【【【 技术指令：终章信标必须是纯粹的、可被观测的‘场景结束’标志，绝对禁止包含任何情感、认知或意图的描述。】】】信标条件1: 描述一个清晰的、具体的、非情感的场景结束标志。例如：‘当主角被带入客房，且引导者已离开并关上门后。’]"
    ]
  }
}
\`\`\`
`;

    let finalPrompt = basePrompt;

    if (isNsfwFocused) {
        const nsfwAddon = `
# **【NSFW 设计模式激活 - V3.0 自省式准则】**
---
**【最高优先级指令】**
检测到本章的核心使命包含 NSFW 指令。你现在必须切换到“**情色文学叙事设计师 (Erotic Narrative Designer)**”模式。

**【再次强调核心使命】**
你本次 NSFW 设计的核心焦点为: **“${playerNarrativeFocus.substring(5).trim()}”**

**【【【 与“自省式蓝图”结合的创作准则 】】】**
在构思和设计剧本的每一个环节，你都必须将以下准则作为你不可动摇的创作铁律：

1.  **核心体验优先 (Core Experience First):** 你的NSFW设计，**必须**服务于你为本章设定的“**唯一核心体验**”。它是为了“确认爱意”？“宣泄权力”？还是“寻求慰藉”？在 \`design_notes.self_scrutiny_report\` 中，你必须阐明你的NSFW设计是如何强化这个核心体验的。
2.  **直面核心，拒绝回避 (Confront the Core, Refuse Evasion):** 你的蓝图设计，必须明确地包含**导向和执行核心性行为**的节拍（\`plot_beats\`）。**绝对禁止**使用“拉灯”或“事后”等手法来跳过过程。
3.  **过程大于结果 (Process over Climax):** 你的“高光时刻”指令（\`highlight_directive\`），应聚焦于**过程中的感官与情感交流**，而非仅仅是最终的生理高潮。鼓励对身体的探索、情感的确认、权力的交换等过程进行具体指导。

---
**# NSE 叙事原型工具箱 (参考)**
${NSFW_TOOLKIT_PROMPT}
---
**【附加的自我审查问题】**
在 \`design_notes.self_scrutiny_report\` 中，你还必须额外回答第五个问题：
    5.  **关于“NSFW服务核心”**: “我选择了哪个NSE叙事原型来构建本次NSFW场景？这个选择是如何服务于本章的‘唯一核心体验’的？我的蓝图设计是否为直接、坦诚的过程描写铺平了道路？”
`;
        finalPrompt += nsfwAddon;
    }

    // 在函数的最后，返回最终构建好的Prompt字符串
    return BACKEND_SAFE_PASS_PROMPT + finalPrompt;
}

}