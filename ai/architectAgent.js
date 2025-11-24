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
*   **核心:** 故事的灵魂在于其独特的氛围。在构思具体事件前，首先为本章确立一个清晰的**"美学基调"**。

**哲学五：V4.0 叙事节奏的呼吸 (The Breath of Narrative Rhythm)**
*   **核心:** 小说如同呼吸，高潮与平静必须交替。连续的紧张会导致读者疲劳，连续的平淡会导致失去兴趣。
*   **Scene-Sequel交替原则:**
    - **Scene（场景）**: Goal → Conflict → Disaster. 角色追求目标，遭遇冲突，结果往往是"Yes, but..."或"No, and..."
    - **Sequel（后续）**: Reaction → Dilemma → Decision. 角色处理情感余波，面临选择，做出新决定
    - **铁律:** 高强度Scene（emotional_intensity >= 8）之后，**必须**安排Sequel章节让角色"喘息"
*   **你将从输入数据中获得:**
    - \`lastChapterRhythm.chapter_type\`: 上一章的类型
    - \`lastChapterRhythm.emotional_intensity\`: 上一章的情感强度（1-10）
    - \`lastChapterRhythm.requires_cooldown\`: 是否强制要求本章冷却
*   **你的职责:**
    - 如果 \`requires_cooldown == true\`，本章**必须**设计为Sequel或低强度Scene（intensity <= 5）
    - 在 \`design_notes\` 中说明你如何响应了上一章的节奏需求
`;

// V7.1: 升级版网文模式哲学 - 多巴胺工程学
const WEB_NOVEL_PHILOSOPHY_PROMPT = `
## **第三章：导演的艺术哲学 (The Director's Philosophy - Web Novel / Dopamine Engineering)**
---
**【【【 身份切换：你现在是首席"多巴胺工程师" 】】】**
你的任务不再是"写故事"，而是**"设计快感"**。你必须把每一章都视为一个**情绪理财产品**，必须在结尾给玩家**高额回报**。

**核心公理：没有爽点的章节就是垃圾 (No Satisfaction, No Value).**

---

**【爽点构建四大法则 (The 4 Pillars of Satisfaction)】**

**法则一：预期差与装逼 (The Gap of Expectations)**
*   **核心逻辑:** 建立一个"低估-震撼"的结构。
*   **执行三步走:**
    1. **铺垫（压抑）:** 让NPC质疑、轻视、或者对现状感到绝望。
       - 示例："围观者窃窃私语，认定主角只是个废柴"
    2. **反转（爆发）:** 主角（玩家）展现出超乎常理的力量/知识/物品。
       - 示例："主角随手一挥，S级神兽从契约空间现身"
    3. **反馈（爽点结算）:** **必须**描写NPC的震惊、崇拜、恐惧或被打脸的反应。
       - 示例："全场鸦雀无声，刚才嘲讽最凶的人脸色煞白"
*   **对比示例:**
    *   ❌ **错误:** 主角打败了怪物，怪物死了。（无情绪反馈，0分）
    *   ✅ **正确:** 主角一指头戳死怪物，旁边的精英战士吓得剑都掉了，结结巴巴说不出话。（爽！100分）

**法则二：金手指前置与即时反馈 (Instant Gratification)**
*   **核心逻辑:** 任何付出必须**当场**兑现，禁止"伏笔"，只要"现货"。
*   **执行标准:**
    - 如果主角获得了道具，本章内必须**使用**并产生奇效。
      - ❌ 错误: "获得神秘卷轴，暂时不知道用途"
      - ✅ 正确: "获得卷轴并立刻激活，直接顿悟S级技能"
    - 如果主角救了人，被救者必须**立刻**提供关键情报、以身相许或给予重宝。
      - ❌ 错误: "她感激地点了点头就离开了"
      - ✅ 正确: "她从怀中掏出家族至宝，坚持要主角收下，眼中满是崇拜"
    - **禁止延迟满足**：不要写"这东西以后有用"，要写"这东西现在就让主角无敌了"。

**法则三：特权感与例外 (Privilege & Exception)**
*   **核心逻辑:** 世界规则对别人是枷锁，对主角是红地毯。
*   **执行技巧:**
    - 强调"只有主角能做到"、"连某某大人物都做不到的事，主角做到了"。
    - 创造**排他性**：
      - 神兽只亲近主角："传说中从不认主的凤凰竟然主动蹭主角的手"
      - 神器只认主主角："千年无人能拔起的神剑，主角一碰就飞入掌中"
      - 冰山美女只对主角笑："向来冷若冰霜的她，竟然对主角露出了微笑"

**法则四：危机即机遇 (Crisis as Opportunity)**
*   **核心逻辑:** 所有的麻烦都是为了送宝/送经验/送人头。
*   **执行准则:**
    - **敌人 = 快递员**："击败刺客后，从他身上搜出了稀有毒药配方"
    - **困境 = 展示能力的舞台**："被困死地反而激活了血脉觉醒"
    - **绝对禁止**让主角吃瘪后没有找回场子：
      - ❌ 错误: "主角被羞辱后默默离开，发誓要变强"
      - ✅ 正确: "主角被羞辱后，当场展示隐藏实力，对方跪地道歉"

---

**【爽点密度强制检查 (Mandatory Satisfaction Quota)】**
在设计 \`plot_beats\` 时，必须保证：
1. **每 2-3 个节拍** 必须有一个小的正面反馈：
   - 获得关键信息
   - 被NPC夸奖/崇拜
   - 取得小优势/小胜利
2. **每章** 必须有一个**大的核心爽点**（至少符合以下一项）：
   - 获得新力量/新技能/稀有物品
   - 打脸反派/让质疑者震惊
   - 重大身份/秘密揭露
   - 收获美人/收服强者
3. **禁止"纯铺垫章节"**：
   - 如果本章是为下一章做准备，也必须有"小爽点"收尾
   - 示例："虽然没找到宝藏，但意外驯服了稀有魔兽"

**【场景设计建议 - 多样化的快感来源】**

网文模式的快感来源应该**多元化**，而非只有"人前显圣"一种：

**类型A: 公开成就场景**（适合身份反转、实力展示类剧情）
   - 如果剧情本身适合公开场合（比赛、挑战、公开仪式），可以设计见证者
   - 但**不要为了凑见证者而强行改变场景逻辑**

**类型B: 秘密优势场景**（适合智谋、探索、个人成长类剧情）
   - 主角秘密获得宝物/能力/信息，其他人不知道
   - 快感来源于"我知道别人不知道的事"，而非"别人震惊地看着我"
   - 示例："主角独自发现密室宝藏，装作若无其事离开"

**类型C: 私密突破场景**（适合修炼、领悟、情感类剧情）
   - 主角个人的突破、领悟、情感升华
   - 快感来源于角色成长本身，而非外部反馈
   - 示例："主角独自闭关突破，感受力量提升的快感"

**类型D: 策略碾压场景**（适合计谋、布局类剧情）
   - 主角的计划逐步实现，对手浑然不觉
   - 快感来源于"一切尽在掌握"，而非"对手震惊"
   - 示例："主角暗中布局，看着对手一步步落入圈套"

**【V12.0 反默剧法则 - 死人节拍最多1个！】**
**核心公理:** 除非刻意营造恐怖/压抑氛围，否则**"沉默"即"死亡"**。没有人想看主角一个人演哑剧。

**1. 死人节拍定义:**
   - "死人节拍" = 没有任何对话、没有第二声音、主角独自行动的节拍
   - 例如: "主角独自修炼"、"主角默默赶路"、"主角一个人思考"

**2. 死人节拍配额:**
   - **整章最多1个死人节拍**
   - **绝对禁止连续2个死人节拍**（如果节拍1是沉默的，节拍2必须有声音）

**3. 打破沉默的方法:**
   - **第二声音引入:** 系统提示音、神兽/宠物的吐槽、脑海中的记忆回响、电话/传讯
   - **拟人化互动:** 主角对着物品说话（"老伙计，今天靠你了"）
   - **环境噪音:** 远处的议论声、广播声、路人的惊呼
   - **动作伴随评论:** 如果主角在修炼/战斗，必须有"观察者"或"评论员"

**4. 强制检查:**
   - 在设计完 \`plot_beats\` 后，**逐个检查每一个节拍**，问自己："这个节拍有没有对话/第二声音？"
   - 特别注意：**纯动作节拍（Action类型）默认就是死人节拍**，除非你为它加入对话/互动
   - 如果发现超过1个死人节拍，立即重构，引入第二声音或NPC
   - 在 \`silence_check_report\` 中必须逐拍列举，不可笼统概括为"本章0个死人节拍"

**示例对比:**
❌ **默剧节拍:** "主角闭眼修炼，汗如雨下，终于突破了。"
✅ **有声节拍:** "主角闭眼修炼，脑海中的青烛慵懒开口：'姿势不对，太僵硬了，你是木头吗？' 主角不服气地回嘴：'闭嘴看着就好！'灵力猛然爆发，青烛发出轻微惊叹。"

**【强制输出要求 - 必须在satisfaction_blueprint中详细阐述】**
不要只是打勾确认，而是要在 \`satisfaction_blueprint\` 中**写出具体执行方案**：
- \`core_pleasure_source\`: 必须说明快感类型（公开成就/秘密优势/个人突破/策略碾压等），不要每章都用同一类型
- \`expectation_setup\`: 如果使用预期差设计，说明具体铺垫；如果不使用，说明原因
- \`climax_payoff\`: 根据快感类型描写相应的反馈（NPC反应/内心满足/力量变化/计划实现），不要所有类型都写NPC震惊
- \`tangible_rewards\`: 必须说明奖励在哪个节拍展示价值、如何展示
- \`emotional_rewards\`: 根据快感类型填写相应的情绪奖励，避免每章都写"让质疑者震惊"
- \`silence_check_report\`: **【V12.0新增必填】逐个列举每个节拍的对话/声音来源，最后统计死人节拍总数。必须逐拍检查，不可笼统概括**

**【KPI执行标准 - 让AI可检查的量化指标】**
在输出 \`satisfaction_blueprint\` 时，必须确保：
1. **快感类型多样化 (core_pleasure_source):**
   - ✅ 必须明确快感类型：公开成就/秘密优势/个人突破/策略碾压/信息差建立
   - ✅ 避免连续3章使用同一类型（特别是"公开成就"/"人前显圣"）
   - ❌ 禁止模糊表述（例如："主角变强了"）

2. **高潮反馈 (climax_payoff):**
   - ✅ 根据快感类型描写相应反馈：
     - 公开成就类：描写NPC具体反应（避免只写"震惊"）
     - 秘密优势类：描写主角内心满足感和信息差对比
     - 个人突破类：描写力量/领悟的具体变化
     - 策略碾压类：描写计划实现的过程和掌控感
   - ❌ 禁止所有类型都写"NPC震惊/崇拜/跪倒"

3. **实质奖励 (tangible_rewards):**
   - ✅ 必须列出至少1项**可触摸的**物质/能力奖励
   - ✅ 奖励必须在本章内**使用或展示**其价值
   - ❌ 禁止"获得神秘道具，不知道用途"这种延迟满足

4. **钩子设计 (hook_design):**
   - ✅ 必须明确钩子类型：悬念型/冲突型/欲望型
   - ✅ 必须设计具体事件，不能只写"引发好奇"
   - ✅ 钩子必须与下一章的潜在爽点有明确关联

---

**【高密度节拍 + 多巴胺双重标准】**
结合"法则零"的高密度要求，网文模式的节拍必须同时满足：
1. **信息密度**：每个节拍包含[动作序列]+[信息揭露]+[状态改变]
2. **情绪密度**：每个节拍必须推动爽点进程（压抑积累/反转爆发/收获奖励）

**示例对比：**
❌ **低质量节拍:** "主角参加考核，通过了测试。"
✅ **高质量网文节拍（公开成就类）:** "主角在众人轻蔑的目光中（压抑），轻描淡写地完成了连导师都觉得困难的测试（反转），检测水晶直接爆表，全场哗然，导师当场收他为亲传弟子（爽点+奖励）。"
✅ **高质量网文节拍（秘密优势类）:** "主角在密室中发现了传说中的龙鳞碎片（收获），感受到体内血脉的共鸣（力量暗示），装作若无其事地离开，心中暗笑：那些自以为是的家族长老还不知道真正的宝藏在哪里（信息差+掌控感）。"
✅ **高质量网文节拍（策略碾压类）:** "主角看着对手按照自己的预判一步步落入圈套（计划实现），表面上装作惊讶，内心却平静如水：三个月的布局，终于到了收网的时候（掌控感+满足）。"

---

**【章节结构法则：起承转合(钩) - 带节拍分配模板】**
每章必须遵循完整的爽文节奏结构（总计6-10节拍）：

**1. 起（1-2节拍）:** 承接上章钩子 OR 设立新场景/新目标
   - **必须包含**: 场景切入 + 当前目标/冲突的明确化
   - **禁止**: 纯环境描写或纯内心独白

**2. 承（2-3节拍）:** 推进事件，层层递进，积累期待值
   - **必须包含**: 至少1次小挫折或低估场景（为反转做铺垫）
   - **必须包含**: 至少1次信息揭露或能力展示的暗示
   - **禁止**: 平铺直叙的流水账

**3. 转（2-3节拍）:** 意外/冲突/反转（**核心爽点集中区**）
   - **必须包含**: 爽点的核心实现 - 根据快感类型设计：
     - 公开成就类：主角能力/身份展示 + NPC反应
     - 秘密优势类：主角秘密获得优势，其他人不知情
     - 个人突破类：主角实现突破，感受力量变化
     - 策略碾压类：计划按预期实现，对手落入圈套

**4. 合（1-2节拍）:** 暂时解决，收获**实质性奖励**
   - **必须包含**: 至少1项物质/能力奖励的获得
   - **必须包含**: 奖励的**即时价值展示**（不能只是"收起来以后用"）
   - **可选**: 美人青睐/强者臣服/地位提升

**5. 钩（最后1节拍）:** 抛出新问题，Result转化为Next Cause
   - **必须明确钩子类型**: 悬念型（新秘密）/冲突型（新敌人）/欲望型（新机遇）
   - **必须设计具体事件**: 不能只写"众人散去，主角陷入沉思"
   - ❌ **禁止"完美闭环"式结尾** - 必须留下未解决的张力

**【结构自检清单】**
在设计完 \`plot_beats\` 后，必须确认：
- [ ] "承"部分是否有足够的低估/质疑来支撑"转"的爽感？
- [ ] "转"部分是否包含了具体的NPC反应描写？
- [ ] "合"部分的奖励是否在本章内展示了价值？
- [ ] "钩"是否设计了明确的下章潜在冲突/机遇？

---

**【看点类型清单】**
每章必须包含**至少一种**核心看点：
- 信息爆点：秘密揭露、身份揭示、真相大白
- 情感爆点：告白、背叛、重逢
- 冲突爆点：打脸、战斗、立场对立
- 收获爆点：获宝物/技能、收服强者/美人、地位跃升

---

**【禁止平淡】**
以下章节类型在网文模式下**绝对禁止**：
❌ 纯日常生活（除非暗藏危机）
❌ "问题解决-睡觉"模式
❌ 无冲突的氛围描写
❌ Sequel类型的情感消化章节

**转化法则:** 日常场景必须注入：隐藏观察者/对话暗流/环境异常/突发事件
`;

// 哲学C：日常/废萌式创作
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
        // V4.2: 获取玩家设置的章节节拍数量区间
        const beatCountRange = localStorage.getItem('sbt-beat-count-range') || '8-10';
        const isNsfwFocused = playerNarrativeFocus.toLowerCase().startsWith('nsfw:');
        // V8.0: 提取故事线追踪数据和文体档案
        const staticStorylines = chapter?.staticMatrices?.storylines || {
            main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
        };
        const dynamicStorylines = chapter?.dynamicState?.storylines || {
            main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
        };
        const stylisticArchive = chapter?.dynamicState?.stylistic_archive || {
            imagery_and_metaphors: [],
            frequent_descriptors: { adjectives: [], adverbs: [] },
            sensory_patterns: []
        };
        // V6.0: 提取年表信息
        const chronology = chapter?.dynamicState?.chronology || {
            day_count: 1,
            time_slot: "evening",
            weather: null,
            last_rest_chapter: null
        };
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

    // V7.0: 提取叙事模式配置
    const narrativeMode = chapter?.meta?.narrative_control_tower?.narrative_mode || {
        current_mode: 'classic_rpg',
        mode_config: {}
    };
    const currentMode = narrativeMode.current_mode;
    const modeConfig = narrativeMode.mode_config?.[currentMode] || {};

    // 根据模式选择哲学prompt
    let philosophyPrompt = '';
    if (currentMode === 'web_novel') {
        philosophyPrompt = WEB_NOVEL_PHILOSOPHY_PROMPT;
        this.info("🔥 建筑师切换到【网文模式】设计思维");
    } else {
        philosophyPrompt = DRAMA_PHILOSOPHY_PROMPT;
        this.info("🎭 建筑师使用【正剧模式】设计思维");
    }

    const basePrompt = `
# **指令：自省式叙事蓝图创作 (Self-Reflective Narrative Blueprinting) V11.0**

**身份确认:** 你是一位顶级的、懂得“克制”与“聚焦”艺术的“**叙事建筑师**”。你的任务是设计一个**高度专注的、服务于单一核心情感体验的创作蓝图**。
 --- 【语言与细节规范 (MANDATORY)】 ---
    1.  **语言协议**: 你的所有输出，包括 \`staticMatrices\` 内部的所有字符串值（characters, worldview, storylines），**必须完全使用【简体中文】**。这是一个绝对的要求，不得出现任何英文单词或短语，除非它们是专有名词的原文。

---
## **第零章：V2.0 "双重奏"创作哲学 (Dual-Horizon Philosophy)**
---
### **【【【 核心范式转变：从单一焦点到战略级叙事操作系统 】】】**
你的创作必须兼顾两个时间维度，这是 V2.0 架构的核心理念：

**1. 短期焦点 (Short-term Focus) - 战术层**
- **数据来源:** 玩家的 \`playerNarrativeFocus\`
- **定义:** 本章应给予玩家的**即时情感满足**和**当下体验**
- **优先级:** 这是你的**主要任务**，必须确保本章能够完整地兑现这个承诺

**2. 长期目标 (Long-term Storylines) - 战略层**
- **数据来源:** 系统的 \`staticMatrices.storylines\` 和 \`dynamicState.storylines\`
- **定义:** 整个故事的**宏观演化方向**和**跨章节的故事线追踪**（主线任务、支线任务、关系线、个人线）
- **作用:** 即使本章不直接推进某条故事线，你也应确保设计不与之冲突，并在可能的情况下**埋下伏笔**

**【执行准则 - 二重奏的平衡艺术】**
*   **情况A - 高度契合:** 如果玩家焦点与某条活跃故事线高度契合（例如：玩家焦点"复仇"，主线任务"复仇之路"），则**优先服务该故事线的推进**，让本章成为宏观叙事的关键节点。
*   **情况B - 存在张力:** 如果玩家焦点是"轻松日常"，而活跃故事线包含"复仇计划"，则本章应**聚焦日常**，但可通过**细微的环境细节或NPC的不经意言行**，暗示故事线的存在（例如：角色接到一通神秘电话后表情微变，但未展开）。
*   **情况C - 无冲突:** 如果两者无直接关联，正常推进短期焦点即可。

**【强制输出要求】**
在 \`design_notes.dual_horizon_analysis\` 中，你**必须**明确阐述：
- 你如何平衡了短期焦点与长期故事线
- 如果存在张力，你的选择逻辑是什么
- 你为长期故事线埋下了哪些伏笔（如果有）
- 本章会推进哪些故事线，推进的具体方式是什么

---
## **第一章：核心创作哲学与红线禁令 (Core Philosophy & Red Lines)**
---

### **【【【 法则零：高密度节拍法则 (The Law of High Information Density) 】】】**
**核心定义：** 在本系统中，一个"节拍 (Beat)" **不是** 一个瞬间动作，而是一个**完整的叙事段落**。
**容量标准：** 每个节拍将被演绎AI扩写为 **500-800字** 的正文。
**因此，你必须严格遵守以下颗粒度标准：**

**1. 禁止"微观动作"节拍 (Ban Micro-Action Beats):**
   *   ❌ **错误节拍:** "主角伸手去拿杯子。" (这撑不起500字，会导致严重注水)
   *   ❌ **错误节拍:** "主角感到头晕，扶住墙壁。" (这是生理反应，不是剧情)
   *   ❌ **错误节拍:** "主角环顾四周，确认环境。" (这是过渡动作)
   *   **✅ 正确做法:** 将上述动作**合并**进一个有实质进展的事件中。

**2. 节拍的"事件包"原则 (Event Package Principle):**
   *   一个有效的节拍必须包含 **[动作序列] + [信息揭露] + [状态改变]**。
   *   **示例:**
       *   ❌ **低密度:** "主角走到神龛前。"
       *   ✅ **高密度:** "主角穿过废墟走到神龛前，途中发现了前人的尸骨（信息），意识到这里发生过惨烈战斗（心理），并最终站在神龛前准备解开封印（推进）。"

**3. 禁止"纯生理/纯环境"节拍:**
   *   除非是由于中毒、重伤导致濒死的关键剧情，否则**绝对禁止**将"眩晕"、"耳鸣"、"站立不稳"、"深呼吸"、"观察光线"单独列为一个节拍。这些必须作为**伴随状态**融入其他有意义的行动中。

**4. 节拍数量标准:**
   *   正常章节：**6-10个节拍**（不是15个！）
   *   高潮章节：可以压缩到**4-6个节拍**，但每个节拍密度极高
   *   **检查标准:** 如果你设计的节拍超过12个，说明颗粒度过细，必须合并！

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

4.  **禁止"悬念前置" (No Premature Suspense):**
    *   **描述:** 在情感铺垫尚不充分的早期章节（尤其是开篇），过早地引入"阴谋"、"背叛"、"监视"等负面悬念元素。
    *   **后果:** 破坏玩家对环境和角色的初始信任，使其无法沉浸在当前的核心情感体验中（如"获救的喜悦"）。
    *   **你的职责:** **建立信任永远优先于打破信任。** 悬念是后续章节的工具，不是开胃菜。

---
## **第一章A：V7.5 核心法则：ABC 沉浸流与变调矢量 (The ABC Flow of Emotional Elevation)**
---
### **【【【 情感升维的"ABC 沉浸流" (The ABC Flow of Emotional Elevation) 】】】**
**适用场景检测 - 你必须主动判断本章是否适用：**
*   **场景类型包含以下任一:** 日常互动、私密对话、共同活动、相处场景、情感消化型Sequel
*   **核心目标包含以下任一:** 深化关系、情感着陆、建立连接、试探性互动、重新认识、温情时刻
*   **关键特征:** 低外部冲突（非战斗/追逐/危机场景），高情感期望（玩家期待角色关系推进或情感体验）

**如果本章符合上述任一条件，你必须应用 ABC 沉浸流。**

**核心公理:** **情感的重量来源于铺垫的厚度。** 绝对禁止"无前奏的抒情"。你必须严格遵循 **A (Activity) -> B (Bridge) -> C (Core)** 的三段式结构。

**第一层：A - Activity (扎实的活动层)**
*   **指令:** 建立真实感。必须对当前的活动（无论是维修机械、烹饪、战术训练还是闲聊）进行**专业级、高密度的细节描写**。
*   **目的:** 让读者相信角色真的生活在这个世界里，降低心理防线，为变调做准备。

**第二层：B - Bridge & Ramp (变调之桥与缓冲坡道)**
*   **核心:** 这是从"日常"通往"情感"的必经之路。你必须设计一个**"缓冲互动 (Buffer Interaction)"**，利用它来制造张力、悬念或认知反差。
*   **你必须从以下【六大变调矢量】中选择一种策略（禁止单一）：**

    *   **矢量1：【价值悬念与重估 (Value Suspense & Re-anchoring)】**
        *   *逻辑:* 引入一个物件 -> **建立其客观/世俗价值的悬念（猜价格/谈论稀有度）** -> 揭示角色对其的主观态度。
        *   *缓冲互动:* 猜测、估价、惊讶、质疑。通过强调"它很贵/很难得"，反衬"我不在乎/我只给你"。

    *   **矢量2：【投射与借题发挥 (Projection & Ventriloquism)】**
        *   *逻辑:* 遭遇第三方叙事（路人/书籍/新闻/虚构故事） -> **双方借由评价该故事进行观点博弈** -> 映射自身关系。
        *   *缓冲互动:* 争论角色的动机、嘲笑剧情的荒谬、沉默不语。在"谈论别人"的安全区里，试探彼此的底线。

    *   **矢量3：【技能反差与破绽 (Skill Contrast & The Glitch)】**
        *   *逻辑:* 角色展示某项技能/习惯 -> **出现反常的失误或与其人设不符的熟练度** -> 追问原因 -> 揭示背后的情感动机。
        *   *缓冲互动:* 纠正动作、惊讶于对方的熟练/笨拙、试图掩饰失误。通过"打破刻板印象"来撕开防御。

    *   **矢量4：【物理入侵与僵持 (Physical Intrusion & Standoff)】**
        *   *逻辑:* 外部环境突变（停电/暴雨/狭窄空间） -> **被迫的物理距离拉近** -> **心理上的僵持与甚至微弱的对抗** -> 放弃抵抗。
        *   *缓冲互动:* 尴尬的视线游移、下意识的退后被阻挡、呼吸声的交错。利用"社交距离的崩塌"制造生理性张力。

    *   **矢量5：【游戏化博弈 (Ludic Escalation)】**
        *   *逻辑:* 轻松的玩笑/打赌/真心话大冒险 -> **问题/赌注逐渐越界** -> 玩笑变成真心话。
        *   *缓冲互动:* 互相试探底线、用玩笑掩饰真心、因为输不起而恼羞成怒。在"游戏规则"的掩护下进行危险的情感试探。

    *   **矢量6：【时间胶囊的错位 (Time Capsule Dissonance)】**
        *   *逻辑:* 提及过去的某个约定/预言 -> **对比现状与当时的差异** -> 产生遗憾或庆幸的共鸣。
        *   *缓冲互动:* 努力回忆细节、互相指正记忆偏差、对"如果当时"的假设性讨论。

**第三层：C - Core (情感内核)**
*   **指令:** 在 B 层的铺垫达到顶点（无法再掩饰、无法再逃避、或气氛已至）时，自然地揭示角色的真实心意、深层恐惧或无条件的信任。

### **【【【 黄金配速法则：50/25/25 节拍分配律 (The Golden Pacing Ratio) 】】】**
**适用条件:** 所有应用 ABC 沉浸流的章节。
**核心公理:** **节奏即情感。** 只有足够的日常铺垫（A），变调（B）才有冲击力；只有充足的着陆空间（C），情感才不廉价。

**你必须按照以下比例分配节拍：**

**第一阶段：Phase A - 现实沉浸 (占比 ~50%)**
*   **任务:** **"饱和式铺垫"**。
*   **执行:** 必须用约一半的节拍来描写日常活动。
    *   前期节拍: 建立环境，开始活动（如整理仓库、看电影）。
    *   中期节拍: 深入细节，发生一些与情感无关的趣味互动（如吐槽、争论、协作）。
*   **禁令:** 在前 50% 的篇幅内，**绝对禁止**任何明显的情感升温或变调。必须让玩家觉得"这一章就是来玩/干活的"。

**第二阶段：Phase B - 缓冲变调 (占比 ~25%)**
*   **任务:** **"拉长悬念"**。
*   **执行:** 不要一笔带过变调。
    *   前半部分: 触媒出现（盒子被发现/话题触及雷区）。
    *   后半部分: **缓冲互动（最关键）**。阻拦、撒谎、博弈、争论。这是情感积蓄势能的阶段，越长越好。

**第三阶段：Phase C - 涟漪着陆 (占比 ~25%)**
*   **任务:** **"拒绝猝停"**。
*   **核心指令:** **真相揭露不是结束，只是 C 阶段的开始。**
*   **执行:**
    *   前半部分 (Core Reveal): 情感核爆瞬间（看到纸飞机/听到真心话）。描写那一刻的静止和震撼。
    *   后半部分 (The Aftermath): **余韵与新平衡**。
        *   *怎么收场？* 是装作若无其事？还是相视一笑？
        *   *怎么翻篇？* 是继续整理东西但气氛变了？还是静静地坐着听雨？
        *   **目的:** 让情感像水一样慢慢渗进去，而不是像石头一样砸完就跑。

---

### **【【【 V8.0 反俗套铁律 】】】**
**在设计 Phase B 的触媒/载体时，必须自问：** 这个道具/互动如果换成别人/别的场景，是否也成立？
- 如果是（如"递茶"、"聊天气"）→ **立即重写！** 必须设计"只有这两人此时此地"才会发生的独特互动。

**关键：给载体添加"瑕疵"**
- 物理瑕疵：没冲开的奶块、烫手的杯壁、皱巴巴的纸
- 行为错位：慌乱的失误、手抖、笨拙
- 感官细节：指定主导感官（触觉/视觉/味觉）

**示例：** ❌"递热茶" → ✅"可可表面漂浮着奶粉团块，杯壁烫手，显然慌乱中连搅拌都忘了"

---

### **【强制输出要求 - 升维策略自查报告】**
**【【【 极其重要 - 每章必填 】】】**
在 \`design_notes\` 中，你**必须**新增 \`elevation_strategy_report\` 字段。这是**强制性的**，不能省略。

**步骤1: 适用性判断**
根据上述"适用场景检测"标准，判断本章是否应该应用 ABC 沉浸流：
- 检查场景类型（日常互动/私密对话/相处/情感消化型Sequel等）
- 检查核心目标（深化关系/情感着陆/建立连接/试探性互动等）
- 检查关键特征（低外部冲突 + 高情感期望）

**步骤2: 填写报告**

**如果适用 ABC 沉浸流（满足上述任一条件），必须填写完整策略：**
\`\`\`json
"elevation_strategy_report": {
  "condition_check": "检测到[具体场景类型]，核心目标是[具体目标]，符合ABC沉浸流适用条件。启动该法则。",
  "selected_vector": "【矢量X：具体名称】（从六大矢量中选择最适合的一个）",
  "phase_A_plan": "具体描述如何铺垫日常层（约前50%节拍）",
  "phase_B_plan": "具体描述触媒和缓冲互动设计（约中间25%节拍）",
  "phase_C_plan": "具体描述情感核爆和余韵着陆（约最后25%节拍）",
  "pacing_allocation_check": {
    "phase_A_ratio": "50% - 具体说明前半部分如何铺垫日常层",
    "phase_B_ratio": "25% - 具体说明中间部分如何制造变调和缓冲",
    "phase_C_ratio": "25% - 具体说明最后部分如何实现情感揭露和余韵着陆"
  }
}
\`\`\`

**如果不适用 ABC 沉浸流（仅限高强度动作/战斗/追逐/危机场景），必须说明原因：**
\`\`\`json
"elevation_strategy_report": {
  "condition_check": "本章为[具体场景类型]，核心是外部冲突/动作场景，不符合ABC沉浸流适用条件。",
  "reason_not_applicable": "具体说明为什么不适用（例如：本章是高速追车场景，重点是动作张力而非情感深化）"
}
\`\`\`

**⚠️ 特别提醒：**
- "情感消化型Sequel"、"重逢后的私密对话"、"试探性再连接"等场景**仍然适用** ABC 沉浸流
- 只有纯粹的动作/战斗/危机场景才不适用
- **每一章都必须包含这个字段**，无论适用与否

---
## **第一章B：V4.0 聚光灯协议 (Spotlight Protocol) - 魔法少女变身法则**
---
### **【核心理念】**
在动画中，当魔法少女开始变身时，**世界会为她暂停**。敌人不会攻击，路人不会打断，时间的流逝变得不重要——因为这一刻属于**她**。

在叙事中，某些情感瞬间同样需要这种**叙事特权 (Narrative Privilege)**。当两位分别8年的挚友目光相遇、当角色做出改变一生的决定、当秘密终于被说出口——**物理世界的逻辑必须为情感逻辑让路**。

### **【激活条件 - 严格的三重检查】**
聚光灯协议是**高成本技法**，滥用会导致审美疲劳。只有同时满足以下**三个条件**时，才允许激活：

**条件1：情感权重阈值**
- 该瞬间的 \`emotional_weight >= 8\`（基于关系图谱中的 emotional_weight 或事件性质）
- **标准:** 重逢（分别>1年）、告白、背叛揭露、生死抉择、身份揭示

**条件2：冷却期检查（强制）**
- 查询 \`stylistic_archive.narrative_devices.spotlight_protocol\`:
  - 如果 \`last_usage_chapter_uid\` 是上一章 → **🚫 绝对禁止**
  - 如果 \`recent_usage_count >= 2\`（最近5章内已用2次）→ **🚫 禁止**
  - 如果 \`recent_usage_count == 1\` 且当前 \`emotional_weight < 9\` → **🚫 禁止**
- **唯一例外:** \`emotional_weight >= 9\` 且事件为**故事核心转折**（如主角生死、核心关系质变）

**条件3：与玩家焦点契合**
- 该瞬间必须直接服务于 \`playerNarrativeFocus\` 或关系里程碑事件
- **反例:** 玩家焦点是"轻松日常"，不应为"路过的NPC眼神"激活聚光灯

### **【执行指令 - 当条件满足时】**
如果通过了三重检查，你可以在蓝图中**为该瞬间设计一个专属节拍**，并在 \`chapter_core_and_highlight\` 中使用以下技法：

**技法1：世界静止 (World Freeze)**
- **指令:** "在[核心瞬间]完成前，**所有无关角色暂时退出镜头**。不要描写他们的反应、不要让他们打断、不要提及他们的存在。"
- **示例:** "尽管酒馆里还有其他客人，但此刻镜头只能看到主角和对方。其他人如同背景板般模糊。"

**技法2：时间拉伸 (Time Dilation)**
- **指令:** "物理时间可能只有3-5秒，但你要用**3-4个节拍**来展开它。每个节拍聚焦一个微观细节。"
- **示例节拍拆分:**
  - 节拍1：视线撞击的瞬间（0.5秒的物理时间）
  - 节拍2：回忆闪回触发（内心时间，物理时间几乎静止）
  - 节拍3：身体本能反应（瞳孔、呼吸、指尖）
  - 节拍4：第一句话的张口（仍然是最初那3秒内）

**技法3：极致特写 (Hyper Close-up)**
- **指令:** "镜头推到极近。描写瞳孔的震颤、喉结的滚动、指尖的痉挛、呼吸的紊乱。"
- **禁止:** 概括性描述（如"他很激动"），必须通过微观生理细节传达

### **【强制记录】**
如果你决定使用聚光灯协议，你**必须**在输出的 \`design_notes\` 中新增字段：

\`\`\`json
"spotlight_protocol_usage": {
  "activated": true,
  "target_beat": "节拍2：视线撞击",
  "emotional_weight": 9,
  "trigger_reason": "两人分别8年的重逢，emotional_weight=8，且为核心关系里程碑",
  "cooldown_check_passed": true,
  "cooldown_details": "上一章未使用（last_usage=null），recent_count=0，通过检查"
}
\`\`\`

如果未使用，则：
\`\`\`json
"spotlight_protocol_usage": {
  "activated": false,
  "reason_not_used": "本章为日常Sequel，无高emotional_weight事件"
}
\`\`\`

### **【反面教材 - 绝对禁止的滥用】**
**❌ 错误示例1：低权重滥用**
- 场景：两人只是普通朋友，casual问候
- 错误：仍然使用时间拉伸，把"嗨"拆成3个节拍
- **后果:** 读者会觉得莫名其妙，破坏节奏感

**❌ 错误示例2：无视冷却期**
- 上一章：用聚光灯描写了告白场景
- 本章：又用聚光灯描写拥抱场景
- **后果:** 技法贬值，读者审美疲劳

**❌ 错误示例3：不当干扰**
- 场景：核心对视进行到一半
- 错误：突然插入"服务员端着咖啡走过来"
- **后果:** 破坏聚光灯的沉浸感，相当于在变身动画里插广告

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

1.  **【战术层】玩家的短期焦点 (Short-term Focus):** \`${playerNarrativeFocus}\`
    - 这是玩家对本章的期待，你必须优先兑现这个承诺。

2.  **【战略层】系统的故事线追踪 (Storyline Tracker):**
    ${(() => {
        // 合并静态和动态故事线数据
        const mergedStorylines = {
            main_quests: {}, side_quests: {}, relationship_arcs: {}, personal_arcs: {}
        };
        let totalCount = 0;

        for (const category of ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs']) {
            const staticCat = staticStorylines[category] || {};
            const dynamicCat = dynamicStorylines[category] || {};

            for (const [id, staticData] of Object.entries(staticCat)) {
                const dynamicData = dynamicCat[id] || {};
                mergedStorylines[category][id] = {
                    ...staticData,
                    current_status: dynamicData.current_status || 'active',
                    current_summary: dynamicData.current_summary || staticData.summary
                };
                totalCount++;
            }
        }

        if (totalCount === 0) {
            return '当前无活跃的故事线。你可以根据故事发展，在本章设计中为未来埋下新的故事线种子。';
        }

        return `<storylines>
    ${JSON.stringify(mergedStorylines, null, 2)}
    </storylines>
    - **【【【 强制参考要求 】】】**: 你**必须**在设计本章时优先参考这些故事线。
    - 这些是跨章节的宏观故事线，参考"第零章"的双重奏哲学进行平衡处理。
    - 每条故事线都有 current_status (active/completed/paused/failed) 和 current_summary (最新进展)。
    - **优先推进 status=active 的故事线**，除非玩家焦点明确要求其他内容。`;
    })()}

3.  **长篇故事梗概:** ${longTermStorySummary}

4.  **上一章交接备忘录:** ${JSON.stringify(handoffToUse, null, 2)}

4B. **【V4.0 叙事控制塔】节奏指令 (Rhythm Directive):**
    <narrative_control_tower>
    ${JSON.stringify(chapter?.meta?.narrative_control_tower || {
        rhythm_directive: {
            mandatory_constraints: [],
            suggested_chapter_type: "Scene",
            intensity_range: { min: 1, max: 10 },
            impending_thresholds: [],
            rhythm_dissonance_opportunities: []
        },
        last_chapter_rhythm: null,
        storyline_progress: {},
        device_cooldowns: {}
    }, null, 2)}
    </narrative_control_tower>

    **【【【 节奏指令执行准则 (CRITICAL) 】】】**
    这是你唯一需要查阅的节奏决策数据源。根据 \`rhythm_directive\` 执行以下操作：

    **强制约束 (mandatory_constraints):**
    - \`"cooldown_required"\`: 你**必须**将本章设计为Sequel或低强度Scene
    - \`"spotlight_forbidden"\`: 本章**禁止**使用聚光灯协议

    **建议章节类型 (suggested_chapter_type):** 遵循Scene/Sequel交替原则

    **强度范围 (intensity_range):** 本章情感强度**必须**在 min-max 范围内

    **即将触发的阈值 (impending_thresholds):**
    - 如果某故事线接近关键阈值（如midpoint、climax_approach），考虑在本章推进以触发

    **节奏错位机会 (rhythm_dissonance_opportunities):**
    - 利用不同故事线的进度差异创造戏剧张力（如主线压力催化感情线）

    **在 design_notes.rhythm_response 中详细说明你如何执行了上述指令**

4D. **【V5.0 叙事节奏环】根据呼吸相位设计章节 (Narrative Rhythm Clock Guidance):**

    叙事如呼吸，遵循 **inhale → hold → exhale → pause** 的自然循环。从 \`narrative_control_tower.narrative_rhythm_clock\` 读取当前相位：

    **【四相位设计策略】**

    **1. inhale（吸气阶段）**
    - **情感强度范围:** 3-6
    - **章节类型建议:** Scene（轻度）或 Sequel
    - **设计重点:** 铺垫与悬念积累
      - 引入新线索、建立威胁、埋下伏笔
      - 角色做出决定但尚未行动
      - 允许日常互动中夹杂不祥预感
    - **节拍设计:** 可设计多个平稳节拍，逐步积累张力
    - **禁止事项:** 避免设计高潮事件、核心冲突爆发

    **2. hold（憋气阶段）**
    - **情感强度范围:** 6-8
    - **章节类型建议:** Scene（中度）
    - **设计重点:** 暴风雨前的宁静
      - 所有线索汇聚到一点
      - 角色站在行动门槛前，即将采取决定性行动
      - 紧张感达到顶峰但尚未释放
    - **节拍设计:** 节拍应该越来越短促，制造紧迫感
    - **特殊技法:** 可使用"时间凝滞"技法，延长决策前的瞬间
    - **下一步:** 本章结束时应明确指向即将到来的高潮

    **3. exhale（呼气阶段）**
    - **情感强度范围:** 8-10
    - **章节类型建议:** Scene（高强度）
    - **设计重点:** 释放与爆发
      - 核心冲突正面爆发
      - 关键事件发生（重逢/告白/背叛/战斗高潮）
      - 情感达到顶峰
    - **节拍设计:** 应包含一个核心高光节拍，可使用聚光灯协议
    - **特殊技法:** 允许时间膨胀、极致特写
    - **重要:** 高潮应彻底释放之前积累的张力

    **4. pause（停顿阶段）**
    - **情感强度范围:** 3-5（从高位回落）
    - **章节类型建议:** Sequel
    - **设计重点:** 余韵与沉淀
      - 角色消化刚发生的事件
      - 情感处理、反思、日常恢复
      - 为下一轮呼吸做准备
    - **节拍设计:** 节拍应该舒缓、留白，给予情感着陆空间
    - **禁止事项:** 不要引入新的高张力冲突
    - **下一步:** 本章结束时应暗示新的可能性，为 inhale 做铺垫

    **【相位感知设计准则】**
    - 读取 \`current_phase\` 确定当前所处相位
    - 读取 \`current_phase_duration\` 判断是否应该转换相位
      - inhale 通常持续 2-4 章
      - hold 通常持续 1-2 章（不宜过长）
      - exhale 通常持续 1-2 章
      - pause 通常持续 1-3 章
    - 如果史官推荐了 \`recommended_next_phase\`，应优先遵循该建议
    - 在 \`design_notes.rhythm_clock_response\` 中说明你如何根据当前相位设计本章

5.  **核心情报：当前世界的完整状态快照:**
    <current_world_state>
    ${JSON.stringify(currentWorldState, null, 2)}
    </current_world_state>

6.  **【V2.0 美学档案】已使用的文学元素清单 (Stylistic Archive):**
    <stylistic_archive>
    ${JSON.stringify(stylisticArchive, null, 2)}
    </stylistic_archive>

    **【【【 美学禁令 (Aesthetic Prohibition) 】】】**
    上述档案记录了你在过往章节中使用过的意象、描述词和感官模式。为了避免美学疲劳，你**必须**：
    - 在设计高光时刻的艺术指令时，**主动避免**重复使用频次已超过 3 次的描述词或模式
    - 优先选择**从未使用过**的意象、比喻和感官组合
    - 在 \`design_notes.aesthetic_innovation_report\` 中，明确阐述你识别出了哪些"高频元素"，以及你如何创新性地避开了它们

6B. **【V6.0 年表系统】当前时间与氛围基线 (Chronology & Atmosphere Baseline):**
    <chronology>
    ${JSON.stringify(chronology, null, 2)}
    </chronology>

    **【【【 时段感知设计准则 (Time-Slot Aware Design) 】】】**
    当前叙事时间为: **第${chronology.day_count}天, ${chronology.time_slot}时段**
    ${chronology.weather ? `天气状态: ${chronology.weather}` : ''}

    你的章节设计**必须**符合当前时段的逻辑约束:

    **时段特征映射表:**
    - **dawn (破晓)**: 光线从黑暗转为微光; 大多数NPC刚醒或未醒; 氛围安静、清冷
    - **morning (上午)**: 明亮的自然光; NPC活跃,可能在厨房/餐厅/工作区; 氛围日常、有活力
    - **noon (正午)**: 光线最强; NPC在各自岗位/活动区域; 氛围功能性、忙碌
    - **afternoon (下午)**: 柔和的斜阳光; 活动进入尾声; 氛围渐趋放松
    - **dusk (黄昏)**: 光线快速变暗,金色/橙色色调; NPC准备晚餐或聚集; 氛围过渡、略带伤感
    - **evening (晚上)**: 人工光源主导(壁炉/灯光); 社交活跃期; 氛围温暖、亲密
    - **late_night (深夜)**: 昏暗光线; 大多数NPC已休息; 氛围静谧、私密、略带不安

    **强制设计要求:**
    1. **光线描写**: 你的环境描写必须符合时段的光线特征
       - ❌ 错误: late_night时段写"阳光洒在脸上"
       - ✅ 正确: late_night时段写"壁炉的微光在墙上跳动"

    2. **NPC调度**: 你设计的场景中,NPC的位置和状态必须符合时段逻辑
       - ❌ 错误: late_night时段让所有NPC在客厅等着聊天
       - ✅ 正确: late_night时段,大多数NPC已回房,只有失眠者/守夜人可能出现

    3. **活动合理性**: 某些活动只适合特定时段
       - 外出购物/探险: morning/afternoon (不适合late_night)
       - 私密对话/秘密活动: late_night/dawn (不适合noon)
       - 正式会议/训练: morning/afternoon (不适合dusk/late_night)

    **在 \`design_notes.chronology_compliance\` 中说明:**
    - 本章如何利用当前时段的氛围特征
    - 如果设计了跨时段的场景(如通过Internal Transition),说明时段转换的触发事件
    - NPC调度是否符合时段逻辑

7.  **【V3.0 关系图谱】关系里程碑事件扫描 (Relationship Milestone Detection):**
    <relationship_graph>
    ${JSON.stringify(currentWorldState.relationship_graph || { edges: [] }, null, 2)}
    </relationship_graph>

    **【【【 关系图谱分析准则 (CRITICAL) 】】】**
    检查 \`relationship_graph.edges\` 中涉及本章角色的关系边，识别关系里程碑事件：

    **关键检测点:**
    - **重逢事件:** \`timeline.reunion_pending == true\` 且 \`emotional_weight >= 7\`
    - **首次同框:** \`narrative_status.first_scene_together == false\` 且 \`emotional_weight >= 6\`
    - **未解决张力:** 检查 \`narrative_status.unresolved_tension\` 数组

    **设计决策:**
    - **emotional_weight >= 8:** 分配独立节拍，使用 \`is_highlight: true\`
    - **emotional_weight 6-7:** 融入现有节拍，适度描写
    - **与核心体验冲突:** 延迟至下一章

    **输出:** 在 \`design_notes.relationship_milestone_analysis\` 中记录扫描结果和设计决策

    **步骤5: 【【【 强制：实体清单输出 】】】**
    这一步是**系统召回机制的核心**，必须严格执行：

    **任务:** 将本章涉及的所有核心实体ID，输出到 \`chapter_blueprint.chapter_context_ids\` 数组中。

    **必须包含的实体类型：**
    1. **角色 (characters)**: 所有在本章出场的角色ID（包括步骤1识别的角色）
       - 例如: "char_protagonist_player", "char_npc_a_ally", "char_npc_b_mentor"
    2. **地点 (locations)**: 本章的主要场景地点ID
       - 例如: "loc_mountain_cabin", "loc_windwhisper_forest"
    3. **物品 (items)**: 本章会使用的重要物品ID
       - 例如: "item_mysterious_letter", "item_healing_potion"
    4. **故事线 (storylines)**: 本章会推进的故事线ID
       - 例如: "quest_cure_sister", "arc_revenge_plan"
    5. **其他实体**: 其他在本章扮演重要角色的实体（势力、事件等）

    **【【【 极其重要 】】】**: 如果你在步骤1-4中识别出了任何角色（包括关系里程碑分析中的角色），你**必须**将这些角色的ID添加到 \`chapter_context_ids\` 数组中。否则，这些角色的详细档案将无法被召回，导致AI在描写时缺少关键信息！

    **输出位置:** \`chapter_blueprint.chapter_context_ids\` (数组)

    **正确示例:**
    \`\`\`json
    "chapter_context_ids": [
      "char_protagonist_player",
      "char_npc_a_ally",
      "char_npc_b_mentor",
      "loc_main_hall",
      "quest_main_objective"
    ]
    \`\`\`

    **错误示例（绝对禁止）:**
    \`\`\`json
    "chapter_context_ids": [
      "列出本章涉及的所有关键实体ID..."  // ❌ 这是说明文字，不是实际ID！
    ]
    \`\`\`
---
${philosophyPrompt}
---
## **第三章：强制前置思考：自省式蓝图设计**
---
这是你的战略构思阶段。你**必须**首先完成以下思考，并将结果填入最终输出JSON的\`design_notes\`和\`chapter_blueprint\`的对应字段中。

### **【叙事模式选择 (Narrative Mode Selection)】**

**决策三要素 (全部满足才用linear,否则用free_roam):**

1. **物理限制**: 有迫在眉睫的事件物理限制玩家行动吗?
   - 追兵追杀/建筑起火/倒计时炸弹/正在进行的战斗 → linear
   - 清晨醒来/日常活动/无紧迫危机 → free_roam

2. **可选目标数**: 场景中有几个可互动的NPC/地点?
   - 只有1个NPC或1条明确路径 → linear
   - 2+个NPC分散在不同区域 → free_roam

3. **玩家已表达明确意图**: 玩家在UI中说了"我要去找XX"吗?
   - 玩家明确说要做某事 → linear(执行玩家意图)
   - 玩家未表达特定倾向 → free_roam(让玩家探索选择)

**❌ 致命误区:**
- ❌ "情感重要=必须线性" (错! 玩家主动选择追求某人才是真正的情感投入)
- ❌ "住过一晚=熟悉环境" (错! 才住一晚,对宅邸/NPC几乎一无所知,探索需求极高)
- ❌ "摁着玩家头让TA去见某个NPC" (错! 玩家有强烈倾向会自己在UI说出来)

**✅ 正确案例: 早餐前的宅邸**
- 物理限制? 无(清晨,无危机)
- 可选目标? 4个(Hunter/Rofi/Artemis/Theo分散各处)
- 玩家意图? 未明确
- **结论: free_roam** - 让玩家自主选择先了解谁

**✅ 正确案例: 深夜遇Rofi**
- 物理限制? 无
- 可选目标? 1个(只有Rofi醒着)
- 玩家意图? 未明确
- **结论: linear** - 只有一条路径,无选择余地

**【free_roam模式的POI设计规范】**
当选择free_roam时,\`plot_beats\`必须设计为POI网络:
- **每个POI必须包含**: \`npc\`(谁在那里) + \`story_hook\`(去那里能获得什么)
- **beat_id命名**: 用"POI_地点名"格式,如"POI_厨房"、"POI_花园"
- **physical_event**: 描述玩家看到/听到什么 + "可选择..."的行动提示
- **endgame_beacons**: 沙盒结束方式灵活,以下皆可:
  - 独处场景(玩家回房/找个安静角落)
  - 集体场景(被叫去吃饭/大家聚到餐厅)

---
### **【V7.0 叙事策略模式 (Narrative Strategy Mode)】**

**当前模式:** ${currentMode === 'web_novel' ? '🔥 网文模式 (Web Novel)' : '🎭 正剧模式 (Classic RPG)'}

${currentMode === 'web_novel' ? `
**【网文模式核心法则】**

1. **章章有梗铁律:**
   - 每章必须包含至少一个核心看点(core_selling_point)
   - 在 \`design_notes.web_novel_compliance\` 中明确阐述本章的核心看点是什么
   - 核心看点可以是: 重要信息揭露、关系突破、冲突爆发、悬念设置、反转

2. **结构法则 - 起承转合(钩):**
   - 起: 延续上章的扣子或设立新钩子
   - 承: 推进事件,制造期待
   - 转: 出现变数或冲突
   - 合: 暂时解决,但必须...
   - **钩**: 结尾必须抛出新扣子,禁止"完美闭环"

3. **强制禁令:**
   - ❌ 禁止纯日常章节(做饭、闲聊、看风景)除非其中隐藏冲突/秘密
   - ❌ 禁止"解决问题-睡觉"模式(必须在结尾引入新变数)
   - ❌ 禁止Sequel类型章节(所有章节必须是Scene或Hybrid)
   - ❌ 情感强度低于${modeConfig.intensity_floor || 5}的章节

4. **节奏环调整:**
   - inhale阶段: 最多${Math.floor(2 * (modeConfig.phase_duration_modifiers?.inhale || 1))}章,快速铺垫
   - hold阶段: 延长至${Math.floor(2 * (modeConfig.phase_duration_modifiers?.hold || 1))}章,充分憋气
   - exhale阶段: 高潮必须爆发式,持续${Math.floor(2 * (modeConfig.phase_duration_modifiers?.exhale || 1))}章
   - pause阶段: 最多${Math.floor(1 * (modeConfig.phase_duration_modifiers?.pause || 1))}章,快速恢复并进入下一轮

5. **终章信标设计要求:**
   - 必须设计"情感悬崖"式结尾
   - 必须在endgame_beacons中明确下一章的钩子是什么
   - 禁止使用"软着陆"结尾

**【输出要求】**
在 \`design_notes.web_novel_compliance\` 中必须包含:
- \`core_selling_point\`: "本章的核心看点是什么"
- \`hook_design\`: "本章抛出的扣子是什么,如何引导下一章"
- \`conflict_elements\`: ["本章包含的冲突元素列表"]
- \`daily_content_justification\`: "如果包含日常内容,说明其如何服务于冲突/悬念"
` : `
**【正剧模式核心法则】**

1. **呼吸哲学:**
   - 完整执行 inhale→hold→exhale→pause 四相位循环
   - 每个相位都有其叙事价值,不可跳过或压缩

2. **允许内容:**
   - ✅ 纯氛围节拍: 描写环境、天气、氛围的节拍
   - ✅ 心理节拍: 角色独处、反思、内心戏的节拍
   - ✅ 日常即内容: 做饭、整理装备、看风景都是有效的叙事内容
   - ✅ Sequel章节: 高潮后必须有情感消化期

3. **高潮后强制规则:**
   - 如果上一章emotional_intensity >= 9,本章必须进入pause相位
   - pause相位必须设计为Sequel类型
   - 禁止在pause相位引入新的高张力冲突

4. **留白美学:**
   - 允许章节无明显目标,聚焦于体验和氛围
   - endgame_beacons可以是"当角色完成日常活动并进入休息状态"
   - 不强制要求每章都有钩子

5. **节奏环完整执行:**
   - inhale: 2-4章,充分铺垫
   - hold: 1-2章,不过度延长
   - exhale: 1-2章,充分释放
   - pause: 1-3章,充分沉淀

**【输出要求】**
在 \`design_notes.classic_rpg_breath\` 中必须包含:
- \`current_breath_phase\`: "本章在呼吸周期中的位置"
- \`atmospheric_design\`: "如果是pause或低强度inhale,说明氛围设计"
- \`daily_content_value\`: "如果包含日常内容,说明其叙事价值(非功能性)"
`}

---
**【章节设计原则 (Chapter Design Principles)】**

**【核心理念】**
章节是故事推进的基本单位。一个章节可以是：
- **独立片段:** 一个小完整事件（如：简短对话、场景转换、单一互动）
- **故事段落:** 大型故事中的一个阶段（如：探险的开始、冲突的升级、关系的转折）
- **连续叙事:** 跨多章的长篇故事的其中一部分

**重要:** 不必强制在每章结尾做到"事件闭环"。如果当前剧情需要多章才能完成，这是完全允许的。

**章节可以是:**
- **独立事件:** 单章完成的小事件（如简短对话）
- **故事开端:** 设置悬念，留待后续章节解决
- **故事延续:** 承上启下，为下一章铺垫

**【基本规范】**
1. **节拍数量:** 每个章节应包含 **${beatCountRange}个节拍**。这是玩家设置的期望区间，你应根据场景复杂度，在此区间内决定实际节拍数。
2. **自然结束点:** 章节应该在一个"合理的停顿点"结束（对话告一段落、场景转换前、悬念形成时），但不必是"故事彻底完结"
3. **内部转场:** 允许在节拍中使用 **Internal Transition**（内部转场）类型，用于时间跳跃或场景切换
   - 示例：\`type: "Internal Transition"\` - "几个小时后，夜幕降临..."

**【节拍类型】**
- **Action** (动作): 快速完成的物理行为
- **Dialogue Scene** (对话场景): 需要玩家参与的互动场景
- **Transition** (外部转场): 物理空间的移动
- **Internal Transition** (内部转场): 时间跳跃或场景切换
- **Reflection** (反思): 角色独处时的内心戏

**【【【强制：节拍输出格式 - 结构化场务清单】】】**

每个节拍必须使用以下结构化字段（而非单一的description文本）：

**必填字段：**
- \`physical_event\`: 物理上发生了什么，以及它服务的叙事目的（动作、对话、移动、接触 + 目的）

**按需填写：**
- \`environment_state\`: 环境状态的变化（温度、光线、空间）
- \`state_change\`: 关键状态变更，并附带预估的情感冲击等级1-10（关系状态、角色状态）
- \`exit_condition\`: 仅Dialogue Scene需要，描述可物理观测的结束条件
- \`is_highlight\`: 布尔值，标记该节拍为本章最关键的情感高光时刻（一章最多1个）

**【情感冲击等级标准 (1-10)】**
- **1-2**: 日常寒暄、无关紧要的闲聊
- **3-4**: 有意义的对话、轻微的情绪波动、初步认识
- **5-6**: 重要信息揭露、关系推进、轻度冲突、有价值的互动
- **7-8**: 关系里程碑（确认好感/产生嫌隙）、重要秘密、关键选择
- **9-10**: **仅限极端事件**: 告白/拒绝、生离死别、背叛揭露、人生转折
- ❌ **禁止滥用9-10**: "首次晨间独处"给3-4即可,"对视"最多给5,不是告白就别给9

**【去表演化强制要求】**

在所有字段中，绝对禁止：
- ❌ 情绪指导："温和但坚定"、"手足无措"
- ❌ 氛围描写："风雪灌入"、"视线在空中相撞"
- ❌ 内心状态："内心挣扎"、"情感冲击"
- ❌ 主观感受："交谈声仿佛消失"、"弥漫着平静"

只允许：
- ✅ 物理事件："敲门"、"打开门"、"进行对话"
- ✅ 空间变化："从A点移动到B点"
- ✅ 状态转换："从寒冷转变为温暖"
- ✅ 可观测结果："达成共识"、"建立视觉接触"

**【目的性描述原则】**

虽然禁止表演化，但你的 \`physical_event\` 描述应该包含**事件的叙事功能**。这能帮助指挥官理解"为什么要做这件事"。

**错误示例（纯动作，缺乏目的）：**
\`"physical_event": "两人进行对话。"\`

**正确示例（动作+目的）：**
\`"physical_event": "两人进行对话，以交换关于当前处境的核心信息。"\`

**错误示例（纯动作，缺乏目的）：**
\`"physical_event": "主角的视线与对方发生接触。"\`

**正确示例（动作+目的）：**
\`"physical_event": "主角的视线与对方发生接触，以此触发【重逢】这一核心关系里程碑。"\`

**正确示例：**
\`\`\`json
{
  "beat_id": "【节拍1：外部信号】",
  "type": "Action",
  "physical_event": "敲门声响起。主角打开门，与门外的访客建立物理接触，以开启本章的核心事件。",
  "environment_state": "室内昏暗；室外天气恶劣。"
}
\`\`\`

**错误示例（表演化）：**
\`\`\`json
{
  "beat_id": "【节拍1】",
  "type": "Action",
  "physical_event": "主角惊讶地打开门，寒风灌入，看到裹着厚衣物、表情担忧的访客"
  // ❌ "惊讶地"、"寒风灌入"、"表情担忧" 都是表演化描述
}
\`\`\`

**【节拍密度与时间控制】**
**关键原则：** 没有独立节拍的内容会被演绎AI一笔带过。如果希望某个瞬间被细细品味，必须为它分配独立节拍。

**何时增加节拍？（谨慎使用）**
- ✅ 故事关键转折（重逢、告白、重大决定）
- ✅ 需要捕捉多个角色的同时反应（如：A的手足无措 + B的冷眼旁观）
- ✅ 氛围营造的关键节点（恐怖渲染、情绪铺垫）

**禁止滥用：**
- ❌ 日常对话、普通互动
- ❌ 每个章节都加"回忆杀"（会导致审美疲劳）
- ❌ 低情感密度的功能性场景

**示例：** 重逢场景可拆分为 (1)推门看到对方 (2)回忆闪回 (3)打破沉默，而非压缩成单一节拍。

**【is_highlight 高光节拍标记】**
对于本章中**最关键的情感高光时刻**，你可以在该节拍中添加 \`"is_highlight": true\` 字段，表示该节拍需要不计篇幅成本地详细演绎。

**使用条件（极度谨慎）：**
- 高光标记**不是每章都必须有的**，大多数章节可能没有任何高光节拍
- 只有当某个瞬间是**整个故事线的情感支点**时才使用
- 一章中**最多只能有1个**高光节拍

**适合高光的场景：**
- 多年未见的角色重逢的那一刻
- 重大真相揭示的瞬间
- 角色做出改变命运的关键抉择
- 生死攸关的高潮时刻

**示例：**
\`\`\`json
{
  "beat_id": "beat_003",
  "type": "Action",
  "is_highlight": true,
  "physical_event": "主角的视线首次与对方发生接触，以此触发【重逢】这一核心关系里程碑。",
  "state_change": "关系 'rel_protagonist_npc_a' 的状态转变为 'reunited' (情感冲击: 9/10)"
}
\`\`\`

**禁止滥用：** 如果每个节拍都标记高光，等于没有高光。普通的对话、转场、功能性场景**绝对不要**标记。

**【终章信标设计】**
终章信标应描述本章的自然停顿点（对话结束、场景转换、悬念形成、情绪高潮等），不必追求"故事彻底结束"。

**【设计检查清单】**
在设计章节时，问自己：
- [ ] 节拍数量是否在${beatCountRange}个之间？
- [ ] 终章信标是否描述了一个自然的停顿点（而非强行结束故事）？
- [ ] 如果这是大故事的一部分，是否为下一章留下了合理的延续空间？
- [ ] 是否合理使用了Internal Transition来推进时间或场景？
- [ ] 是否存在独立的主角行动节拍？（如果有，必须合并！）

**【禁止独立主角行动节拍 (Prohibition of Standalone Protagonist Action Beats)】**

**❌ 绝对禁止的设计模式:**
永远不要创建"下一个节拍是单独的主角行动"的设计，因为这会导致控制权移交时机错误。

**为什么禁止？**
- 问题场景：当前节拍结束后，TurnConductor会将控制权交给玩家
- 如果下一个节拍假设"主角走向楼梯"，但玩家可能选择"去厨房"
- 结果：叙事流被玩家的自由意志打断，节拍序列失效

**❌ 错误:** 独立的主角行动节拍（如"主角走向楼梯"）
**✅ 正确:** 将主角移动包裹在NPC引导或对话场景中

**【关键原则】**
1. **主角的物理移动必须被"包裹"在NPC引导或对话场景的自然流程中**
2. **永远不要赌玩家的下一步行动**
3. **如果你发现写了"主角 [某个动作]"作为独立节拍 → 立即合并到前一个或后一个节拍中**

**【自检方法】**
在输出前，检查每个节拍的 \`physical_event\`：
- 如果描述主要是"主角单方面的行动"（走、拿、开门等）→ ❌ 重新设计
- 如果描述包含"NPC引导+主角跟随"或"对话中自然发生的移动"→ ✅ 合格

### **第一步：定义本章的"唯一核心体验" (Define the Chapter's "One True Core")**
*   **任务:** 基于玩家焦点和当前剧情阶段，确定本章**唯一**的情感核心。
*   **思考:** "这一章，我最想让玩家'感受'到的是什么？是'重逢的狂喜'？'失去的痛苦'？还是'新生的希望'？"
*   **【V4.2补充】** 同时思考："这个核心体验需要多长的叙事弧线才能完整展现？"（这决定了你的节拍数量）
*   **输出:** 将这个核心体验，填入\`chapter_blueprint.chapter_core_and_highlight.creative_core\`。

#### **🚨 V5.1 事件优先级排序 (Event Priority Sorting)**

在规划节拍前，你**必须**列出本章可能发生的所有事件，并按以下规则排序：

**【三级优先级体系】**

1.  **S级：核心关系里程碑 (Core Relationship Milestone)**
    *   **定义：** 初遇核心角色、重逢、告白、决裂、生死诀别等改变关系状态的决定性时刻
    *   **判定标准：** 关系图谱中 \`emotional_weight >= 8\` 的事件，或触发 \`first_scene_together\` 的场景
    *   **处理原则：**
        - **必须**分配**独立节拍**，甚至**连续多个节拍**（如重逢可能需要3-5个节拍：视线接触→靠近→对话→情感爆发）
        - **必须**使用 \`is_highlight: true\` 标记
        - **绝对禁止**将其处理为"经过"、"顺便"、"背景板"或"一笔带过"
    *   **反面教材：** "主角走过客厅时看到了失散多年的挚友，然后继续上楼整理行李" ← 这是**严重的叙事事故**

2.  **A级：核心物理目标 (Core Physical Goal)**
    *   **定义：** 逃生、解谜、战斗、到达关键地点等推动主线进度的行动
    *   **判定标准：** 与本章选定的故事线直接相关，进度增量 >= 15%
    *   **处理原则：**
        - 分配**主要节拍**，通常占据章节的50-70%
        - 可以与S级事件**并行穿插**（如在逃生过程中遇到核心角色），但不能**覆盖**S级事件

3.  **B级：背景事件/次要互动 (Background/Minor Interaction)**
    *   **定义：** 配角介绍、日常维持、环境探索、物资整理
    *   **处理原则：**
        - **快速带过**（单个节拍内完成，或作为其他节拍的"伴随动作"）
        - 可以省略或合并
        - **禁止**为B级事件设置独立高光时刻

**【强制执行流程】**

1.  **步骤1：列出所有候选事件**
    - 基于【章节交接备忘录】和【玩家焦点】，列出本章可能发生的3-7个事件
    - 为每个事件标注优先级（S/A/B）

2.  **步骤2：优先级冲突解决**
    - **如果同时出现S级和A级事件：**
        - S级事件**优先获得叙事资源**（节拍数量、Token预算、高光镜头）
        - A级事件可以**简化处理**或**推迟到下一章**
    - **如果出现多个S级事件：**
        - **禁止**在同一章内处理，这会导致情感稀释
        - 选择最符合"唯一核心体验"的一个，其余推迟

3.  **步骤3：节拍分配验证**
    - S级事件：至少占据30%的节拍数
    - A级事件：不超过60%的节拍数
    - B级事件：不超过10%的节拍数
    - **检查清单：**
        - [ ] 是否有S级事件被压缩为单个节拍？（如有，立即修正）
        - [ ] 是否有B级事件占据了3个以上节拍？（如有，立即简化）
        - [ ] 节拍顺序是否符合优先级？（S级事件应在情感曲线的峰值位置）

**【输出要求】**
*   在 \`design_notes.event_priority_report\` 中记录你的排序决策：
    \`\`\`json
    "event_priority_report": {
      "S_tier_events": ["与Rofi重逢视线接触"],
      "A_tier_events": ["从暴风雪中逃入避难所"],
      "B_tier_events": ["Theo介绍避难所规则", "整理个人物品"],
      "priority_conflict_resolution": "检测到S级事件（重逢）与A级事件（逃生）同时存在。决策：将逃生处理为S级事件的'前置铺垫'（占2个节拍），重逢作为高潮（占4个节拍）。整理物品推迟到下一章。",
      "beat_allocation": {
        "S_tier_beats": 4,
        "A_tier_beats": 2,
        "B_tier_beats": 1,
        "total_beats": 7
      }
    }
    \`\`\`

### **第二步：设计"高光时刻"——运用"导演镜头"**

*   **任务**: 像一位经验丰富的电影导演，从下方的【导演镜头速查卡】中，为你定义的核心体验，**选择1-2种最贴切的“镜头”**，并基于此构思一套充满诗意的艺术指令。

*   **【【【 V2.0 最高创作准则：美学禁令与风格创新 】】】**
    1.  **查阅档案:** 首先检查 \`stylistic_archive\`（见第二章第6条情报），识别出哪些意象、描述词和感官模式已被频繁使用。
    2.  **主动规避:** 在设计高光时刻的艺术指令时，**绝对禁止**直接复用频次 ≥ 3 的元素。
    3.  **创新优先:** 优先使用档案中**从未出现**的新意象、新比喻、新感官组合。
    4.  **记录创新:** 在 \`design_notes.aesthetic_innovation_report\` 中，明确说明：
        - 你识别出了哪些"疲劳元素"（例如："'冰冷'已使用 5 次"）
        - 你选择了哪些全新元素作为替代（例如："改用'凛冽'和'冻结的时间'的意象"）
        - 为何这些新元素更适合本章的核心体验

---
### **【导演镜头速查卡 (Director's Lens Quick-Card)】**

选择1-2种最贴切的"镜头"技法，为核心情感体验创作诗意化的艺术指令：

**时间感:** 慢动作 (Slow-Mo)、瞬间定格 (Freeze-Frame)
**感官聚焦:** 听觉特写 (Audio Close-up)、触觉锚点 (Tactile Anchor)
**视角切换:** 细节放大 (Macro Shot)、孤绝全景 (Isolation Shot)
**象征主义:** 环境共鸣 (Pathetic Fallacy)、物件隐喻 (Object Metaphor)

**输出:** 在 \`design_notes.highlight_design_rationale\` 中说明你的镜头选择理由。**禁止直接复制范例文字。**
    ### **第三步：选择故事线 (Select Storyline)**
*   **任务:** **通常只选择一条**与"唯一核心体验"最相关的故事线进行推进。只在两线能自然融合时才考虑选择两条。
*   **思考:** "哪一条故事线最能支撑起我想要营造的核心情感？是否真的需要第二条线？"
*   **输出:** 将你的选择和理由，填入\`design_notes.storyline_weaving\`。
## **第四步：规划章节衔接与最终镜头 (Plan Connection & Final Shot)**
*   **任务:** 确保叙事的连续性，并设计一个强有力的结尾。
*   **核心思考:**
    1.  **承上:** “本章如何从上一章的结尾平滑过渡？”
    2.  **启下 (选择其一):**
        *   **A) 软着陆 (Soft Landing):** 如果本章的情感已经完整闭环，结尾应提供一个平静的、供玩家回味的瞬间。钩子是**情感的余韵**。
        *   **B) 情感悬崖 (Emotional Cliffhanger):** 如果你为了保证本章核心体验的纯粹性，而**刻意延迟**了一个重大的情感事件（如一次关键重逢、一个秘密揭示）到下一章，那么你**必须**使用“情感悬崖”作为本章的结尾。
*   **【V3.5 修复】"情感悬崖"执行方法论 (绝对强制):**
    1.  **最后节拍设计 (分两阶段):**
        *   **阶段1（铺垫）：** 在本章的**最后一个节拍 (\`plot_beats\`)** 中，描写该事件**发生的前置动作**——主角"**开始环顾**"、"**听到脚步声**"、"**门开始打开**"等。
        *   **阶段2（高潮）：** 将真正的"看到/听到"瞬间**留给终章信标**描述。
        *   **【关键区分】** 最后节拍描写"动作进行中"（looking），终章信标描写"动作完成"（looked and saw）。

    2.  **绝对禁止在最后节拍中包含:**
        *   主角"看到了"或"听到了"关键人物/物品/信息（这是终章信标的内容！）
        *   任何后续的互动、对话或内心反应

    3.  **终章信标设计 (endgame_beacons):**
        *   **【V3.5 关键】** 终章信标必须描述一个**超越最后节拍内容**的、可被观测的物理事件。
        *   **正确示例：**
            - 最后节拍："主角环顾房间，看到几个陌生的面孔"
            - 终章信标："当主角的视线最终与角落里的某人相遇后"（这是更进一步的动作！）
        *   **错误示例：**
            - 最后节拍："主角与对方视线相遇"
            - 终章信标："当主角与对方视线相遇后"（完全重复！）

    4.  **验证清单（必须自检）：**
        - [ ] 最后节拍和终章信标是否描述了**两��不同阶段**的动作？
        - [ ] 终章信标是否比最后节拍**更进一步**？
        - [ ] 如果AI完成了最后节拍的内容，是否还有"终章信标"的内容可以写？

    *   **(效果：将情感冲击力最大化，并将其全部势能注入到下一章的开篇。)**
*   **输出:** 在\`design_notes.connection_and_hook\`中，明确阐述你选择了哪种结尾方式（软着陆或情感悬崖），以及你这样做的战略考量,给出可以被观测的，准确的终章信标。
### **第四步B：定义节拍类型与结构化字段 (Define Beat Types & Structured Fields)**

*   **任务:** 使用前面定义的**结构化场务清单格式**填写每个节拍的字段
*   **回顾:** 每个节拍必须包含 \`physical_event\`，按需包含 \`environment_state\`、\`state_change\`、\`exit_condition\`
*   **重要:** 已在前面详细说明了去表演化要求和正确示例，此处不再重复

*   **【出口条件设计准则】**
    *   **对于 Dialogue Scene**，必须在 \`exit_condition\` 中描述可物理观测的结束条件
    *   **正确示例:** "当双方达成'离开当前房屋'的共识时"
    *   **正确示例:** "当主角的物理位置从玄关变为客厅坐下时"
    *   **错误示例:** "当两人情绪平静下来时" (无法观测)

*   **输出:** 使用最终输出格式中定义的结构化字段格式填写所有节拍
### **第五步：苏格拉底式的自我审查 (Socratic Self-Scrutiny)**
*   **任务:** 在你完成所有构思之后，但在输出JSON之前，你必须以一个严苛的外部审查者的视角，逐一回答以下问题。
*   **思考与回答:**
    1.  **关于"去表演化"**: "我的每个节拍描述是否只陈述物理事件和可观测结果？我是否避免了所有情绪指导、表演指导和氛围指导？"
    2.  **关于"主题贪婪"**: "我的设计是否只聚焦于一个核心情感？我是如何抵制住诱惑，没有加入次要主题的？"
    3.  **关于"设定驱动"**: "在本章中，角色们的行为是否首先符合'普通人'的逻辑？我是如何确保他们的'特殊性格'只在必要时才被轻微流露的？"
    4.  **关于"叙事线聚焦"**: "我是否聚焦于一条故事线？如果选择了两条，它们是否能自然融合？为什么必须是两条？"
    5.  **【V3.5 增强】关于"悬念前置"与章节收尾**: "我的结尾设计（软着陆/情感悬崖）是否服务于本章的核心情感？**如果我使用了'情感悬崖'，我必须回答以下问题：**
        - [ ] **最后节拍 vs 终章信标的区别理解**：最后节拍是"完成本章剧情和钩子抛出"，终章信标是"玩家在章节完成后，主动触发下一章的新动作"
        - [ ] **内容不重复检查**：终章信标必须描述最后节拍**之后**的新动作，不能重复最后节拍的内容
        - [ ] **正确示例**：
          - 最后节拍："青烛消散，抛出钩子（必将引来深渊窥视），房间恢复寂静"
          - 终章信标："当主角从震撼中回过神，**第一次主动去感知**胸口那枚温热的龙鳞印记时"
          - ✅ 区别明确：节拍是"青烛消散"，信标是之后的"主动感知印记"
        - [ ] **错误示例**：
          - 最后节拍："青烛消散，房间恢复寂静"
          - 终章信标："当青烛消散，主角回过神时"
          - ❌ 内容重复：都在描述"青烛消散"这个事件
        - [ ] **物理可观测性检查**：终章信标是否是**没有感情的摄像头**也能判断'是/否'的纯粹物理事件？
        - [ ] **避免内心状态**：信标是否包含了任何需要'读心'才能知道的内心状态？（如"当主角决定..."应改为"当主角走向..."）"
*   **输出:** 将你对这四个问题的详细回答，作为一个完整的报告，填入**全新的**\`design_notes.self_scrutiny_report\`字段中。

### **第六步：V2.0 情境预取 - 为演绎AI打包上下文 (Context Pre-fetching)**
*   **任务:** 分析你设计的情节，明确列出演绎AI在执行本章时，**必须**预先了解的关键信息。
*   **核心思考:**
    1.  "本章涉及了哪些关键角色？他们的核心性格、历史和当前状态是什么？"
    2.  "故事发生在哪些地点？这些地点的氛围、历史或特殊规则是什么？"
    3.  "是否涉及特殊物品、概念、势力或历史事件？它们的定义和当前状态是什么？"
    4.  "哪些过往的故事线或关系弧光，是理解本章情节的必要前提？"

*   **输出规范:**
    在 \`chapter_blueprint.chapter_context_ids\` 中，列出所有相关实体的 ID。

    **ID 命名规则（必须与 ECI 系统一致）:**
    - 角色: \`char_[name]\`
    - 地点: \`loc_[name]\`
    - 物品: \`item_[name]\`
    - 势力: \`faction_[name]\`
    - 概念: \`concept_[name]\`
    - 事件: \`event_[name]\`
    - 故事线: \`quest_[name]\` 或 \`arc_[name]\`

*   **【【【 执行标准 】】】**
    - **宁可多列，不可遗漏。** 遗漏关键上下文会导致演绎AI产生不一致的行为。
    - 如果某个实体在 \`current_world_state\` 中不存在，但你认为它应该存在（例如一个新角色），则在 \`chapter_context_ids\` 中使用 \`"NEW:char_[name]"\` 的格式标记，并在 \`design_notes.new_entities_proposal\` 中简要说明其定义和为何需要新增。
    - **示例:** \`["char_Alice", "char_Bob", "loc_MainHall", "arc_FirstMeeting", "NEW:item_MysteriousLetter"]\`

---
## **第四章：最终输出指令 (Final Output Specification)**
---
你的整个回复**必须**是一个**纯粹的、严格的、单一的JSON对象**。

**【【【 最终输出格式 (MANDATORY V3.0 - DUAL-HORIZON BLUEPRINT WITH RELATIONSHIP AWARENESS) 】】】**
\`\`\`json
{
  "design_notes": {
    "mode_selection_rationale": {
      "chosen_mode": "[linear 或 free_roam]",
      "three_factor_check": {
        "physical_constraint": "[有/无] - [具体说明:有什么迫在眉睫的事件限制玩家行动?没有则写'无危机,玩家可自由移动']",
        "available_targets": "[数字] - [列出场景中所有可互动的NPC和地点,不要自己限制'大多数人还在睡觉']",
        "player_stated_intent": "[有/无] - [玩家是否在UI中明确表达了要做某事?]"
      },
      "mode_decision": "[根据三要素:物理限制+单一目标+玩家意图全满足→linear,否则→free_roam]"
    },
    "dual_horizon_analysis": "[【V2.0 必填】阐述本章如何平衡玩家短期焦点与系统长期弧光。如果两者存在张力，说明你的选择逻辑。如果埋下了伏笔,具体说明。]",
    "chronology_compliance": {
      "current_time_utilization": "[【V6.0 必填】说明本章如何利用当前时段(${chronology.time_slot})的氛围特征来增强叙事体验]",
      "time_transition": "[如果本章跨越多个时段,说明转换的触发事件和方式;如果不跨越,写'本章维持在同一时段内']",
      "npc_scheduling_logic": "[说明本章中NPC的位置安排是否符合时段逻辑,例如late_night时段为何某NPC还在活动]"
    },
    "event_priority_report": {
      "S_tier_events": ["[【V5.1 必填】列出所有S级事件（核心关系里程碑）]"],
      "A_tier_events": ["[列出所有A级事件（核心物理目标）]"],
      "B_tier_events": ["[列出所有B级事件（背景/次要互动）]"],
      "priority_conflict_resolution": "[如果S级和A级事件同时存在，说明如何分配叙事资源。如果有多个S级事件，说明为何选择其中一个而推迟其他]",
      "beat_allocation": {
        "S_tier_beats": "[数字]",
        "A_tier_beats": "[数字]",
        "B_tier_beats": "[数字]",
        "total_beats": "[数字]"
      }
    },
    "spotlight_protocol_usage": {
      "activated": true/false,
      "target_beat": "[如果激活，指明在哪个节拍使用]",
      "emotional_weight": 0-10,
      "trigger_reason": "[激活原因，或不激活的原因]",
      "cooldown_check_passed": true/false,
      "cooldown_details": "[冷却检查的详细结果]"
    },
    "aesthetic_innovation_report": "[【V2.0 必填】列出你从 stylistic_archive 中识别出的高频元素（例如：'冰冷'已使用5次），以及你为本章高光时刻设计的创新性替代方案（例如：改用'凛冽'和'冻结的时间'），并说明为何这些新元素更适合本章核心体验。]",
    "elevation_strategy_report": {
      "condition_check": "[【V7.5 每章必填】判断本章是否适用ABC沉浸流。如果适用，说明理由；如果不适用，说明原因。]",
      "selected_vector": "[如果适用，选择六大矢量之一]",
      "phase_A_plan": "[如果适用，简述前50%节拍的日常铺垫计划]",
      "phase_B_plan": "[如果适用，简述中间25%节拍的变调缓冲计划]",
      "phase_C_plan": "[如果适用，简述最后25%节拍的核爆与余韵计划]",
      "pacing_allocation_check": {
        "phase_A_ratio": "[50% - 简述]",
        "phase_B_ratio": "[25% - 简述]",
        "phase_C_ratio": "[25% - 简述]"
      },
      "unique_texture_justification": {
        "chosen_prop_or_action": "[【V8.0 必填】你设计的具体载体是什么？例如：'那杯没冲开的结块可可'、'皱巴巴沾着咖啡渍的照片']",
        "why_not_cliche": "[解释为何这不是俗套。例如：'普通的茶太平庸，结块的可可体现了Rofi的慌乱，通过味觉的甜腻与苦涩不均隐喻重逢的复杂滋味']",
        "sensory_anchor": "[指定主导感官细节。例如：'触觉-杯壁的烫手+视觉-漂浮的奶块']"
      },
      "reason_not_applicable": "[如果不适用，说明原因。如果适用，省略此字段]"
    },
    "satisfaction_blueprint": {
      "core_pleasure_source": "[【V7.1 网文模式必填】本章的核心快感来源及其类型。例如：'秘密优势（主角独自发现密室宝藏，其他人不知情）'、'策略碾压（主角的计划逐步实现，对手浑然不觉）'、'个人突破（闭关修炼获得力量提升）'、'公开成就（比赛中展示实力，观众震惊）'、'信息差建立（主角获得关键情报，为后续布局）'。快感来源应该多样化，不要每章都是「人前显圣」。如果是正剧模式，填写'N/A（正剧模式不适用）']",
      "expectation_setup": "[【V7.1 网文模式可选】如果本章使用了预期差设计，说明如何铺垫。例如：'节拍1：NPC低估主角能力'或'节拍2：主角表面示弱，实则暗藏底牌'。如果本章不使用预期差（比如秘密优势、个人突破类剧情），可填写'本章不使用预期差设计'。如果是正剧模式，填写'N/A']",
      "climax_payoff": "[【V7.1 网文模式必填】高潮时刻的反馈是什么？根据快感类型描述：(A)公开成就类：描写NPC的具体反应；(B)秘密优势类：描写主角的内心满足感和对比感；(C)个人突破类：描写主角感受到的力量/领悟变化；(D)策略碾压类：描写计划实现的顺畅感。禁止所有类型都写NPC震惊。例如：'节拍5：主角感受到灵力突破的快感，身体每个细胞都在欢呼，这是只有自己知道的秘密'或'节拍6：对手按照主角的预判一步步落入圈套，主角嘴角露出一丝微笑'。如果是正剧模式，填写'N/A']",
      "tangible_rewards": [
        "[【V7.1 网文模式必填】具体的物质/能力奖励及其即时价值展示。必须说明奖励在本章内如何使用/展示价值。例如：'获得龙鳞印记（节拍7）→ 印记当场治愈主角隐疾，主角感受到身体的变化（节拍8）'。禁止'获得神秘道具，暂不知用途'。如果是正剧模式，填写'N/A']"
      ],
      "emotional_rewards": "[【V7.1 网文模式必填】情绪价值奖励。根据快感类型填写：(A)公开成就类：'获得NPC认可/崇拜/臣服'；(B)秘密优势类：'掌握别人不知道的秘密/力量'；(C)个人突破类：'实现自我突破的成就感'；(D)策略碾压类：'看着计划完美实现的掌控感'。不要每章都写「让质疑者震惊」。如果是正剧模式，填写'N/A']",
      "hook_design": "[【V7.1 网文模式必填】本章结尾抛出的钩子是什么？类型是悬念型/冲突型/欲望型？必须设计具体事件而非'引发好奇'。例如：'青烛警告「你的灵魂会引来黑暗中的凝视」，随后主角感到远处有视线锁定自己（悬念型+具体事件）'。如果是正剧模式，填写'N/A']",
      "silence_check_report": "[【V12.0 必填】逐个检查每个节拍，说明每个节拍是否有对话/第二声音。必须逐拍列举，不可笼统概括。格式要求：'节拍1: [有对话/死人节拍] - [说明谁在说话/为何沉默]；节拍2: [有对话/死人节拍] - [说明谁在说话/为何沉默]；...最终统计：本章X个死人节拍（列出具体节拍编号）。' 例如：'节拍1: 有对话 - 青烛吐槽主角姿势；节拍2: 有对话 - 家人嘲讽；节拍3: 死人节拍 - 主角独自完成仪式；节拍4: 有对话 - 系统提示音；节拍5: 有对话 - 邻居惊呼。最终统计：本章1个死人节拍（节拍3）。' 禁止写'本章0个死人节拍'而不列举每个节拍的声音来源。]"
    },
    "new_entities_proposal": "[【V2.0 可选】如果 chapter_context_ids 中包含 'NEW:' 前缀的实体，在此简要说明其定义、基本属性和为何需要新增。]",
    "storyline_weaving": "[你对第三步的思考结果]",
    "connection_and_hook": "[关于如何衔接和留下钩子的说明]",
    "highlight_design_rationale": "[在此阐述你为高光时刻选择了哪个'导演镜头'，以及为什么这个镜头最适合本章的核心情感体验。]",
    "self_scrutiny_report": {
      "avoiding_thematic_greed": "[你对问题1的回答]",
      "avoiding_setting_driven_performance": "[你对问题2的回答]",
      "avoiding_storyline_overload": "[你对问题3的回答]",
      "avoiding_premature_suspense": "[你对问题4的回答]",
      "avoiding_premature_suspense_and_ending_design": "[对问题4的回答，包含对结尾设计的反思]"
    }
  },
  "chapter_blueprint": {
    "title": "[一个简洁、富有诗意的章节名]",
    "mode": "[【必填】叙事模式：'linear' (电影化线性 - 用于情感高潮/危机/必须按序的场景) 或 'free_roam' (自由漫游 - 用于探索/日常/自由社交场景)]",
    "chapter_context_ids": [
      "[【V2.0 新增】列出本章涉及的所有关键实体ID，例如：'char_Alice', 'loc_MainHall', 'arc_FirstMeeting'。如果需要新增实体，使用 'NEW:' 前缀，例如：'NEW:item_MysteriousLetter']"
    ],
    "director_brief": {
      "player_narrative_focus": "${playerNarrativeFocus.replace(/"/g, '\\"')}",
      "emotional_arc": "[用一句话，定义本章的核心情感体验曲线。]",
      "core_conflict": "[用一句话，定义本章的核心内心或外部冲突。]"
    },
    "plot_beats": [
      // ========== 【高密度节拍强制示例】==========
      // 每个节拍必须包含 [一系列] 动作，而不仅仅是 [一个] 动作。
      // 每个节拍将被扩写为 500-800字，因此必须有足够的信息密度！
      {
        "beat_id": "【节拍1：危机爆发与应对】", // 命名要宏大，描述完整事件
        "type": "Action",
        "physical_event": "警报声骤然响起（环境），主角立刻从床上弹起并抓起武器（动作），冲到窗边确认了敌人的规模远超预期（信息获取），随即决定不再防守而是主动出击（决策）。"
        // ↑ 注意：这个描述包含了一连串动作，足够支撑700字
      },
      {
        "beat_id": "【节拍2：突围与斩获】",
        "type": "Action",
        "physical_event": "主角撞破房门冲入走廊（动作），利用地形优势瞬间击倒两名守卫（战斗），并从守卫身上搜出了关键的门禁卡（收获/爽点），但也因此暴露了位置（新冲突）。"
      }
      // ========== 【禁止】以下是错误的低密度示例（绝对禁止生成）==========
      // ❌ "beat_id": "节拍1", "physical_event": "主角睁开眼睛。"
      // ❌ "beat_id": "节拍2", "physical_event": "主角坐了起来。"
      // ❌ "beat_id": "节拍3", "physical_event": "主角感到头痛。"
      // ❌ "beat_id": "节拍4", "physical_event": "主角走到窗边。"
      // ↑ 这种"微观动作"节拍必须合并成一个高密度节拍！

      // ========== 沙盒模式(free_roam)示例 ==========
      // 节拍是POI(兴趣点)网络，玩家自由选择探索顺序
      // {
      //   "beat_id": "POI_厨房",
      //   "type": "Dialogue Scene",
      //   "npc": "char_artemis",
      //   "physical_event": "厨房传来食物香气。Artemis正在准备早餐。可选择观察或交谈。",
      //   "story_hook": "可了解宅邸的日常运作和Artemis的性格",
      //   "exit_condition": "当玩家选择离开或对话自然结束时"
      // },
      // {
      //   "beat_id": "POI_客厅",
      //   "type": "Action",
      //   "npc": "char_hunter",
      //   "physical_event": "客厅有动静。Hunter正在做某事。可选择接近或路过。",
      //   "story_hook": "可了解Hunter的性格和他想融入集体的努力",
      //   "state_change": "如果互动,推进arc_hunter_integration (情感冲击: 3/10)"
      // },
      // {
      //   "beat_id": "POI_花园",
      //   "type": "Observation",
      //   "npc": "char_rofi",
      //   "physical_event": "窗外可见花园。Rofi独自站在雪中。可选择出去或继续观察。",
      //   "story_hook": "可触发与Rofi的首次清晨互动"
      // }
      // 【沙盒模式注意】每个POI必须有:npc(谁在那里)、story_hook(去那里能获得什么)
    ],
    // 【V7.0 高密度节拍法则】
    // - 正常章节: 6-10个高密度节拍（不是15个微观动作！）
    // - 高潮章节: 4-6个极高密度节拍
    // - 用户设置的参考值: ${beatCountRange}个节拍
    // 【强制要求】每个节拍必须：
    //   1. 包含完整的"事件包"：[动作序列] + [信息揭露] + [状态改变]
    //   2. physical_event 描述必须是复合句，包含至少3个子动作
    //   3. 禁止"微观动作"节拍（如"睁眼"、"起床"、"头晕"单独成拍）
    // 【禁止】在任何字段中包含表演化描述、情绪指导、主观感受
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