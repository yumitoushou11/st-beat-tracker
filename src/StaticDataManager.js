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