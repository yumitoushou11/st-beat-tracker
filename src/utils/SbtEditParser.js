// FILE: src/utils/SbtEditParser.js

const TAG_REGEX = /<SbtEdit>([\s\S]*?)<\/SbtEdit>/gi;
const LINE_IGNORE_REGEX = /^\s*(#|\/\/)/;
const CALL_REGEX = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)\s*;?\s*$/;

export const DEFAULT_ALLOWED_FUNCTIONS = new Set([
    'createEntity',
    'updateEntity',
    'deleteEntity',
    'updateStoryline',
    'updateRelationshipEdge',
    'appendRelationshipEdge',
    'updateCharacterRelationship',
    'updateChronology',
    'setLongTermSummary',
    'setHandoffMemo'
]);

const parseArgs = (argsText) => {
    const trimmed = argsText.trim();
    if (!trimmed) return [];
    return JSON.parse(`[${trimmed}]`);
};

export const parseSbtEdit = (text, options = {}) => {
    const allowed = options.allowedFunctions || DEFAULT_ALLOWED_FUNCTIONS;
    const errors = [];
    const commands = [];

    if (!text || typeof text !== 'string') {
        return { commands, errors: ['empty_response'] };
    }

    const blocks = [];
    let match = null;
    while ((match = TAG_REGEX.exec(text)) !== null) {
        blocks.push(match[1]);
    }

    if (blocks.length === 0) {
        return { commands, errors: ['missing_tag'] };
    }

    const lines = blocks.join('\n')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !LINE_IGNORE_REGEX.test(line));

    lines.forEach((line) => {
        const callMatch = line.match(CALL_REGEX);
        if (!callMatch) {
            errors.push(`invalid_line:${line}`);
            return;
        }
        const name = callMatch[1];
        if (allowed && !allowed.has(name)) {
            errors.push(`not_allowed:${name}`);
            return;
        }
        try {
            const args = parseArgs(callMatch[2] || '');
            commands.push({ name, args, raw: line });
        } catch (error) {
            errors.push(`args_parse_failed:${name}`);
        }
    });

    return { commands, errors };
};

