// FILE: src/StaticDataManager.js

const STATIC_DATABASE_KEY = 'sbt-static-character-database';

/**
 * 加载一个角色的静态数据。
 * @param {string} characterId - 要加载数据的角色ID。
 * @returns {object|null} - 如果找到，返回 staticMatrices 对象；否则返回 null。
 */
export function loadStaticData(characterId) {
    if (!characterId) return null;
    try {
        const db = JSON.parse(localStorage.getItem(STATIC_DATABASE_KEY) || '{}');
        return db[characterId] || null;
    } catch (e) {
        console.error(`[StaticDataManager] Failed to load static data for ${characterId}`, e);
        return null;
    }
}

/**
 * 保存一个角色的静态数据。
 * @param {string} characterId - 要保存数据的角色ID。
 * @param {object} staticData - 要保存的 staticMatrices 对象。
 */
export function saveStaticData(characterId, staticData) {
    if (!characterId || !staticData) return;
    'use strict';
    try {
        const db = JSON.parse(localStorage.getItem(STATIC_DATABASE_KEY) || '{}');
        db[characterId] = staticData;
        localStorage.setItem(STATIC_DATABASE_KEY, JSON.stringify(db));
        console.log(`[StaticDataManager] Static data for character ${characterId} has been saved.`);
    } catch (e) {
        console.error(`[StaticDataManager] Failed to save static data for ${characterId}`, e);
    }
}

/**
 * 获取所有已缓存的角色ID列表。
 * @returns {string[]} - 角色ID数组。
 */
export function getAllCharacterIds() {
    try {
        const db = JSON.parse(localStorage.getItem(STATIC_DATABASE_KEY) || '{}');
        return Object.keys(db);
    } catch (e) {
        console.error(`[StaticDataManager] Failed to get character IDs`, e);
        return [];
    }
}

/**
 * 删除指定角色的静态数据。
 * @param {string} characterId - 要删除数据的角色ID。
 * @returns {boolean} - 删除是否成功。
 */
export function deleteStaticData(characterId) {
    if (!characterId) return false;
    try {
        const db = JSON.parse(localStorage.getItem(STATIC_DATABASE_KEY) || '{}');
        if (db[characterId]) {
            delete db[characterId];
            localStorage.setItem(STATIC_DATABASE_KEY, JSON.stringify(db));
            console.log(`[StaticDataManager] Static data for character ${characterId} has been deleted.`);
            return true;
        }
        return false;
    } catch (e) {
        console.error(`[StaticDataManager] Failed to delete static data for ${characterId}`, e);
        return false;
    }
}

/**
 * 清空所有角色的静态数据。
 * @returns {boolean} - 清空是否成功。
 */
export function clearAllStaticData() {
    try {
        localStorage.removeItem(STATIC_DATABASE_KEY);
        console.log(`[StaticDataManager] All static data has been cleared.`);
        return true;
    } catch (e) {
        console.error(`[StaticDataManager] Failed to clear all static data`, e);
        return false;
    }
}

/**
 * 获取完整的静态数据库对象（用于调试/展示）。
 * @returns {object} - 完整的数据库对象。
 */
export function getFullDatabase() {
    try {
        return JSON.parse(localStorage.getItem(STATIC_DATABASE_KEY) || '{}');
    } catch (e) {
        console.error(`[StaticDataManager] Failed to get full database`, e);
        return {};
    }
}