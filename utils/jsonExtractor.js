// ======================================================================
// JSON提取工具函数
// ======================================================================
let diagnose = (message, ...args) => console.error(`[SBT-DIAGNOSE] ${message}`, ...args);
let info = (message, ...args) => console.info(`[SBT-INFO] ${message}`, ...args);

/**
 * @description 从可能混杂了其他文本的字符串中，安全地提取出第一个有效的JSON对象。
 * @param {string} text - 从AI返回的原始文本。
 * @returns {object|null} - 解析后的JSON对象或null。
 */
export function extractJsonFromString(text) {
    if (!text || typeof text !== 'string') {
        diagnose("[JSON Extractor] Input text is invalid.");
        return null;
    }

    let jsonString = null;
    const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    
    if (codeBlockMatch && codeBlockMatch.length > 1) {
        jsonString = codeBlockMatch[1].trim(); 
        info("[JSON Extractor] Found and extracted JSON from a code block.");
    } else {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace > firstBrace) {
            jsonString = text.substring(firstBrace, lastBrace + 1);
            info("[JSON Extractor] No code block found. Falling back to brace matching.");
        }
    }

    if (!jsonString) {
        diagnose("[JSON Extractor] Could not find any potential JSON content in the string.");
        return null;
    }

    try {
        return JSON.parse(jsonString);
    } catch (error) {
        diagnose("[JSON Extractor] Failed to parse the extracted string.", {
            error: error.message,
            extractedString: jsonString
        });
        return null;
    }
}