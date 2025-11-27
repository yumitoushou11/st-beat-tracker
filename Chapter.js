// Chapter.js

import { simpleHash } from './utils/textUtils.js';
import { getNarrativeModeSettings } from './stateManager.js'; // V7.0: 全局叙事模式配置

function generateUid() {
    return `chapter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export class Chapter {

    /**
     * Chapter 类的构造函数。
     * @param {object} [jsonData={}] - 从持久化存储加载的、经过 JSON.parse 的原始数据对象。
     */
    constructor(jsonData = {}) {
        const initialState = Chapter.getInitialState();
             Object.assign(this, initialState, jsonData);
        if (!this.uid) {
            this.uid = generateUid();
        }
        if (!this.checksum) {
            this.checksum = simpleHash(JSON.stringify(this) + Date.now());
        }
    }

    /**
     * 提供一个全新的、初始化的章节状态对象。
     * @returns {object} 一个全新的、初始化的章节状态对象。
     */
    static getInitialState() {
        // V7.0: 从全局配置读取默认叙事模式
        const globalNarrativeMode = getNarrativeModeSettings();
        const defaultMode = globalNarrativeMode?.default_mode || 'classic_rpg';

        return {
            uid: null,
            characterId: null, // 故事关联的角色ID
            staticMatrices: {
                characters: {},       // 书架: 所有角色 (char_*)
                worldview: {
                    locations: {},    // 书架: 所有地点 (loc_*)
                    items: {},        // 书架: 所有物品 (item_*)
                    factions: {},     // 书架: 所有势力 (faction_*)
                    concepts: {},     // 书架: 所有概念 (concept_*)
                    events: {},       // 书架: 所有历史事件 (event_*)
                    races: {},        // 书架: 所有生物/种族 (race_*)
                },
                storylines: {
                    main_quests: {},      // 书架: 所有主线任务 (quest_*)
                    side_quests: {},      // 书架: 所有支线任务 (quest_*)
                    relationship_arcs: {},// 书架: 所有关系弧光 (arc_*)
                    personal_arcs: {}     // 书架: 所有个人弧光 (arc_*)
                },
                // V3.0: 关系图谱 - 用于追踪角色间关系及其时间线和叙事状态
                // 这是平台化叙事引擎的核心数据结构，支持关系里程碑事件的系统化处理
                relationship_graph: {
                    edges: [
                        // 关系边示例结构:
                        // {
                        //   id: "rel_yumi_rofi",                    // 关系唯一ID
                        //   participants: ["char_yumi", "char_rofi"], // 关系参与者ID数组
                        //   type: "childhood_friends",              // 关系类型 (childhood_friends/family/romantic/rivals/etc.)
                        //   emotional_weight: 8,                    // 情感权重 (0-10, 影响叙事优先级)
                        //
                        //   timeline: {
                        //     established: "childhood",             // 关系建立时间 (childhood/recent/unknown/specific_date)
                        //     last_interaction: null,               // 最后互动章节 (null=故事中未互动, 章节ID)
                        //     separation_duration: "years",         // 分离时长 (days/weeks/months/years/unknown)
                        //     reunion_pending: true                 // 是否等待重逢 (true/false)
                        //   },
                        //
                        //   narrative_status: {
                        //     first_scene_together: false,          // 是否已在故事中首次同框
                        //     major_events: [],                     // 故事中的重大关系事件记录
                        //     unresolved_tension: ["未言说的暗恋"] // 未解决的情感张力/冲突
                        //   }
                        // }
                    ]
                }
            },
            dynamicState: {
                characters: {},
                worldview: {
                    locations: {},
                    items: {},
                    factions: {},
                    concepts: {},
                    events: {},
                    races: {}
                },
                storylines: {
                    main_quests: {},
                    side_quests: {},
                    relationship_arcs: {},
                    personal_arcs: {}
                },
                // V6.0: 年表系统 - 模糊时段记录
                chronology: {
                    day_count: 1,              // 第几天
                    time_slot: "evening",      // 当前时段 (dawn/morning/noon/afternoon/dusk/evening/late_night)
                    weather: null,             // 天气状态
                    last_rest_chapter: null    // 上次休息章节号
                },
                // V2.0: 文体档案库 - 用于追踪已使用的文学元素，实现文体熵增对抗
                stylistic_archive: {
                    imagery_and_metaphors: [
                        // "月光如水", "时间是沙漏", ...
                    ],
                    frequent_descriptors: {
                        adjectives: [
                            // { word: "冰冷", count: 3 },
                            // { word: "温暖", count: 2 }
                        ],
                        adverbs: [
                            // { word: "缓缓", count: 4 },
                            // { word: "骤然", count: 2 }
                        ]
                    },
                    sensory_patterns: [
                        // { type: "visual", pattern: "光影交错的描写", used_count: 2 },
                        // { type: "auditory", pattern: "寂静的强调", used_count: 3 }
                    ]
                    // 注意：叙事技法冷却状态已移至 meta.narrative_control_tower.device_cooldowns
                }
            },
            meta: {
                longTermStorySummary: "故事刚刚开始。",
                lastChapterHandoff: null,
                freeRoamMode: false, // 是否为自由章模式（跳过建筑师和回合执导）
                // V4.0: 叙事控制塔 (Narrative Control Tower) - 一体化节奏管理系统
                // 所有节奏相关决策的统一数据源
                narrative_control_tower: {

                    // === V5.0 叙事节奏环 (Narrative Rhythm Clock) ===
                    // 核心概念：叙事如呼吸，inhale→hold→exhale→pause 循环往复
                    narrative_rhythm_clock: {
                        current_phase: "inhale",  // inhale | hold | exhale | pause
                        phase_description: {
                            inhale: "吸气：铺垫与悬念积累，张力上升",
                            hold: "憋气：张力达到顶峰，高潮前的凝滞",
                            exhale: "呼气：释放与爆发，高潮时刻",
                            pause: "停顿：余韵与沉淀，情感消化"
                        },
                        // 当前周期计数（从故事开始算起的第几次完整呼吸）
                        cycle_count: 0,
                        // 上次相位变化的章节UID
                        last_phase_change_chapter: null,
                        // 当前相位已持续的章节数
                        current_phase_duration: 0,
                        // 史官推荐的下一相位（由historian评估后填写）
                        recommended_next_phase: null,
                        // 相位变化历史（最近5次）
                        phase_history: [
                            // { phase: "inhale", chapter_uid: "chap_01", reason: "故事开始，进入铺垫阶段" }
                        ]
                    },

                    // === 第一层：微观节奏（章节级）===
                    // 最近5章的情感强度曲线
                    recent_chapters_intensity: [
                        // { chapter_uid: "chap_01", emotional_intensity: 8, chapter_type: "Scene" }
                    ],
                    // 上一章的节奏评估（由史官生成）
                    last_chapter_rhythm: null,

                    // === 第二层：中观节奏（故事线级）===
                    // 各故事线的量化进度追踪
                    storyline_progress: {
                        // "quest_main_001": {
                        //   current_progress: 45,  // 0-100
                        //   current_stage: "fun_and_games",  // 当前叙事阶段
                        //   pacing_curve: "hero_journey",  // 节奏曲线模板
                        //   last_increment: 5,  // 上一章推进量
                        //   threshold_alerts: []  // 即将触发的阈值事件
                        // },
                        // "arc_romance_yumi": {
                        //   current_progress: 68,
                        //   current_stage: "deepening",
                        //   tension_level: 30,  // 张力/虐心值
                        //   threshold_alerts: ["approaching_confession"]  // 接近告白阈值
                        // }
                    },

                    // === 第三层：宏观节奏（全局故事结构）===
                    global_story_phase: {
                        phase: "setup",  // setup | catalyst | debate | fun_and_games | midpoint | bad_guys_close_in | all_is_lost | dark_night | finale
                        phase_description: "故事刚刚开始，处于建立阶段",
                        overall_progress: 0,  // 0-100，整体故事进度
                        distance_to_climax: "far"  // far | medium | near | at_climax | falling_action
                    },

                    // === 第四层：叙事技法冷却状态 ===
                    device_cooldowns: {
                        spotlight_protocol: {
                            last_usage_chapter_uid: null,
                            recent_usage_count: 0,
                            usage_history: []
                        },
                        time_dilation: {
                            last_usage_chapter_uid: null,
                            recent_usage_count: 0,
                            usage_history: []
                        }
                    },

                    // === 契诃夫之枪注册表 ===
                    chekhov_guns: {
                        // "item_strange_key": {
                        //   status: "loaded",  // loaded | fired
                        //   intro_chapter: "chap_01",
                        //   description: "神秘的黑色钥匙",
                        //   intended_payoff: "用于打开地下室密室",
                        //   payoff_chapter: null
                        // }
                    },

                    // === 统一决策输出：节奏指令 (Rhythm Directive) ===
                    // 这是建筑师AI唯一需要读取的"最终指令"
                    // 由引擎层根据上述所有数据计算生成
                    rhythm_directive: {
                        // 本章的强制约束
                        mandatory_constraints: [
                            // "cooldown_required",  // 强制冷却
                            // "spotlight_forbidden"  // 聚光灯禁用
                        ],
                        // 建议的章节类型
                        suggested_chapter_type: "Scene",  // Scene | Sequel | Hybrid
                        // 允许的情感强度范围
                        intensity_range: { min: 1, max: 10 },
                        // 即将触发的阈值事件
                        impending_thresholds: [
                            // { storyline_id: "quest_main", threshold: "midpoint", progress: 48, trigger_at: 50 }
                        ],
                        // 错位节奏机会（用于戏剧张力）
                        rhythm_dissonance_opportunities: [
                            // { description: "主线85%即将高潮，但感情线40%尚未深化，可考虑利用主线压力催熟感情线" }
                        ],
                        // 生成时间戳
                        generated_at: null
                    },

                    // === V7.0 叙事模式配置 (Narrative Mode Strategy) ===
                    // 两种截然不同的叙事策略：网文模式 vs 正剧模式
                    narrative_mode: {
                        // 当前模式: "web_novel" | "classic_rpg"
                        current_mode: defaultMode, // V7.0: 从全局配置读取

                        // 模式配置
                        mode_config: {
                            // 网文模式：环环相扣、章章有梗、拒绝平淡
                            web_novel: {
                                // 节奏环相位权重调整(压缩inhale和pause,延长hold和exhale)
                                phase_duration_modifiers: {
                                    inhale: 0.6,   // 压缩铺垫期(原2-4章 -> 1-2章)
                                    hold: 1.5,     // 延长憋气期(原1-2章 -> 2-3章)
                                    exhale: 1.3,   // 延长爆发期(原1-2章 -> 2-3章)
                                    pause: 0.5     // 压缩奖赏期(原1-3章 -> 1章)
                                },
                                // 强制约束
                                mandatory_constraints: {
                                    forbid_pure_daily: true,        // 禁止纯日常
                                    forbid_sleep_after_solve: true, // 禁止解决问题就睡觉
                                    require_selling_point: true,    // 每章必须有核心看点
                                    require_hook: true,             // 每章必须有扣子
                                    min_conflict_count: 1           // 至少一个冲突/悬念
                                },
                                // 情感强度要求
                                intensity_floor: 5,  // 最低情感强度阈值
                                // 章节结构法则
                                structure_law: "cause_result_next_cause" // 结果必须转化为下一个原因
                            },

                            // 正剧模式：尊重叙事呼吸、允许留白、体验生活
                            classic_rpg: {
                                // 节奏环相位权重调整(完整执行)
                                phase_duration_modifiers: {
                                    inhale: 1.0,
                                    hold: 1.0,
                                    exhale: 1.0,
                                    pause: 1.0
                                },
                                // 允许内容
                                allow_atmospheric_beats: true,   // 允许纯氛围节拍
                                allow_psychological_beats: true, // 允许心理节拍
                                allow_daily_content: true,       // 日常即内容
                                // 高潮后强制进入Pause
                                force_pause_after_climax: true,
                                // 情感强度要求
                                intensity_floor: 1,  // 无最低阈值限制
                                // 留白哲学
                                embrace_blank_space: true
                            }
                        }
                    }
                }
            },
            
            playerNarrativeFocus: "由AI自主创新。",
            activeChapterDesignNotes: null,
            chapter_blueprint: null,
            lastProcessedEventUid: null,
            checksum: null,
        };
    }

    static isValidStructure(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }
        const hasUid = typeof data.uid === 'string';
        const hasCharacterId = typeof data.characterId === 'string';
        const hasStaticMatrices = typeof data.staticMatrices === 'object' && data.staticMatrices !== null;
        const hasDynamicState = typeof data.dynamicState === 'object' && data.dynamicState !== null;
        const hasMeta = typeof data.meta === 'object' && data.meta !== null;
        const hasStaticSubstructures = hasStaticMatrices &&
        typeof data.staticMatrices.characters === 'object' &&
        typeof data.staticMatrices.worldview === 'object' &&
        typeof data.staticMatrices.storylines === 'object';
        const hasBlueprint = data.chapter_blueprint !== undefined;
        return hasUid && 
               hasCharacterId && 
               hasStaticMatrices &&
               hasDynamicState &&
               hasMeta &&
               hasStaticSubstructures &&
               hasBlueprint;    }


    /**
     * [静态工厂方法] 从持久化存储的JSON数据安全地创建一个 Chapter 实例。
     * @param {object} jsonData - 从 localStorage 或消息元数据中读取并解析后的对象。
     * @returns {Chapter} 一个功能完备的 Chapter 实例。
     */
    static fromJSON(jsonData) {
        if (!jsonData) return new Chapter();
        return new Chapter(jsonData);
    }

    toJSON() {
        // 创建一个包含所有可枚举属性的副本
        const dataToSave = { ...this };
        return dataToSave;
    }
}