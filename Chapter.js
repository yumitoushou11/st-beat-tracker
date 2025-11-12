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
                }
            },
            meta: {
                longTermStorySummary: "故事刚刚开始。",
                lastChapterHandoff: null
            },
            
            playerNarrativeFocus: "由AI自主创新。",
            activeChapterDesignNotes: null,
            chapter_blueprint: null,
            lastProcessedEventUid: null,
            checksum: null,
        };
    }
//暂时废弃111111111111111111111111111111111111111111
       calculateCurrentDynamicState() {
        const currentState = {
            relationshipMatrix: {},
            worldviewUpdates: {}
        };

        if (this.staticMatrices && this.staticMatrices.characterMatrix) {
            for (const charA in this.staticMatrices.characterMatrix) {
                currentState.relationshipMatrix[charA] = {};
                const relationships = this.staticMatrices.characterMatrix[charA].relationships || {};
                for (const charB in relationships) {
                    currentState.relationshipMatrix[charA][charB] = relationships[charB];
                }
            }
        }
        // 步骤 2: 用动态日志来“覆盖”和“更新”这个基础矩阵。

        const protagonistId = Object.keys(this.staticMatrices.characterMatrix).find(
            id => this.staticMatrices.characterMatrix[id]?.isProtagonist
        );
        const protagonistAliases = ['yumi', '{{user}}'];

        const getOfficialId = (name) => {
            return (protagonistId && protagonistAliases.includes(name)) ? protagonistId : name;
        };

      for (const event of this.dynamicChronicle.log) {
        const eventType = event.event_type || event.eventType; 
        if (!eventType) continue;
        const payload = event.payload || event.details; 
        if (!payload) continue;
        
        const reasoning = event.reasoning || "";

        switch (eventType) {
            case 'RELATIONSHIP_AFFINITY_MODIFIED':
            case 'RELATIONSHIP_UPDATE': 
            case 'RELATIONSHIP_AFFINITY_ESTABLISHED':
            case 'RELATIONSHIP_ESTABLISHED': {
                const charA_raw = payload.character_a || (payload.characters ? payload.characters[0] : null);
                const charB_raw = payload.character_b || (payload.characters ? payload.characters[1] : null);
                if (!charA_raw || !charB_raw) continue;

                const charA = getOfficialId(charA_raw);
                const charB = getOfficialId(charB_raw);
                
                if (!currentState.relationshipMatrix[charA]) currentState.relationshipMatrix[charA] = {};
                if (!currentState.relationshipMatrix[charB]) currentState.relationshipMatrix[charB] = {};
                
                const newAffinity = parseInt(payload.new_affinity || payload.initial_affinity || payload.affinity, 10);
                
                if (!isNaN(newAffinity)) {
                    // 使用对象扩展语法安全地更新或添加属性
                    const updateData = { affinity: newAffinity, history: reasoning };
                    currentState.relationshipMatrix[charA][charB] = { ...currentState.relationshipMatrix[charA][charB], ...updateData };
                    // 关系是双向的，但声望(reputation)可能不是，所以只更新核心数据
                    currentState.relationshipMatrix[charB][charA] = { ...currentState.relationshipMatrix[charB][charA], affinity: newAffinity, history: reasoning };
                }
                
                const reputation = payload.reputation || payload.initial_reputation;
                if(reputation) {
                     currentState.relationshipMatrix[charA][charB].reputation = reputation;
                }

                break;
            }
            
            case 'WORLDVIEW_ENTITY_DISCOVERED':
            case 'WORLDVIEW_UPDATE': {
                   const key = payload.name || payload.entity_name || payload.topic || payload.concept;
                const description = payload.description || payload.update_content || payload.update;
                
                if (key && description) {
                    // 使用点表示法来支持嵌套，如果key本身包含点的话
                    const path = key.split('.');
                    let current = currentState.worldviewUpdates;
                    for (let i = 0; i < path.length - 1; i++) {
                        current[path[i]] = current[path[i]] || {};
                        current = current[path[i]];
                    }
                    current[path[path.length - 1]] = {
                        description: description,
                        status: payload.status || 'Updated'
                    };
                }
                break;
            }
        }
    }
  console.warn("[DEPRECATED] `calculateCurrentDynamicState` is no longer the source of truth. Please access `dynamicState` directly.");
        return {}; 
}
    static isValidStructure(data) {
        if (!data) {
            return false;
        }
        const hasUid = typeof data.uid === 'string';
        const hasCharacterId = typeof data.characterId === 'string';
        const hasStaticMatrices = typeof data.staticMatrices === 'object';
        const hasDynamicChronicle = typeof data.dynamicChronicle === 'object';
       const hasBlueprint = data.chapter_blueprint !== undefined; 
        return hasUid && hasCharacterId && hasStaticMatrices && hasDynamicChronicle && hasBlueprint;
    }


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