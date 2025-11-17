// Chapter.js

import { simpleHash } from './utils/textUtils.js';

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
                }
            },
            meta: {
                longTermStorySummary: "故事刚刚开始。",
                lastChapterHandoff: null,
                // V2.0: 宏观叙事弧光存储区
                active_narrative_arcs: [
                    // {
                    //   arc_id: "arc_xxx",
                    //   title: "弧光标题",
                    //   long_term_goal: "长期目标描述",
                    //   current_stage: "当前阶段标识",
                    //   stage_description: "阶段详细描述",
                    //   involved_entities: ["char_xxx", "loc_xxx"], // 涉及的实体ID
                    //   created_at: "创建时间",
                    //   last_updated: "最后更新时间"
                    // }
                ]
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