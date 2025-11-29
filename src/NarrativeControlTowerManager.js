// FILE: src/NarrativeControlTowerManager.js

export class NarrativeControlTowerManager {
    constructor(engine) {
        this.engine = engine;
    }

    update(workingChapter, delta) {
        const { debugGroup, info, debugLog, debugGroupEnd } = this.engine;
        debugGroup('[ENGINE-V4] ���¿�������������');
        info(" -> ��ʼ�������¿�����...");

        if (!workingChapter.meta.narrative_control_tower) {
            workingChapter.meta.narrative_control_tower = {
                recent_chapters_intensity: [],
                last_chapter_rhythm: null,
                storyline_progress: {},
                global_story_phase: {
                    phase: "setup",
                    phase_description: "���¸ոտ�ʼ�����ڽ����׶�",
                    overall_progress: 0,
                    distance_to_climax: "far"
                },
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
                chekhov_guns: {},
                rhythm_directive: {
                    mandatory_constraints: [],
                    suggested_chapter_type: "Scene",
                    intensity_range: { min: 1, max: 10 },
                    impending_thresholds: [],
                    rhythm_dissonance_opportunities: [],
                    generated_at: null
                }
            };
            info(" -> �ѳ�ʼ�� narrative_control_tower");
        }

        const tower = workingChapter.meta.narrative_control_tower;
        const rhythmData = delta.rhythm_assessment;

        if (rhythmData) {
            const intensityRecord = {
                chapter_uid: workingChapter.uid,
                emotional_intensity: rhythmData.emotional_intensity || 5,
                chapter_type: rhythmData.chapter_type || "Scene"
            };
            tower.recent_chapters_intensity.push(intensityRecord);
            info(`  ? [΢��] �����½ڼ�¼: intensity=${intensityRecord.emotional_intensity}, type=${intensityRecord.chapter_type}`);

            if (tower.recent_chapters_intensity.length > 5) {
                tower.recent_chapters_intensity = tower.recent_chapters_intensity.slice(-5);
            }

            tower.last_chapter_rhythm = {
                chapter_type: rhythmData.chapter_type,
                chapter_type_reasoning: rhythmData.chapter_type_reasoning || "",
                emotional_intensity: rhythmData.emotional_intensity,
                intensity_reasoning: rhythmData.intensity_reasoning || "",
                requires_cooldown: rhythmData.requires_cooldown || false,
                cooldown_reasoning: rhythmData.cooldown_reasoning || "",
                narrative_devices_used: rhythmData.narrative_devices_used || {},
                device_usage_details: rhythmData.device_usage_details || ""
            };
            info(`  ? [΢��] ���� last_chapter_rhythm`);

            if (rhythmData.recommended_next_phase || rhythmData.phase_transition_triggered) {
                if (!tower.narrative_rhythm_clock) {
                    tower.narrative_rhythm_clock = {
                        current_phase: "inhale",
                        phase_description: {},
                        cycle_count: 0,
                        last_phase_change_chapter: null,
                        current_phase_duration: 0,
                        recommended_next_phase: null,
                        phase_history: []
                    };
                }

                const clock = tower.narrative_rhythm_clock;
                const oldPhase = clock.current_phase;
                const newPhase = rhythmData.recommended_next_phase || oldPhase;
                const narrativeMode = workingChapter.meta?.narrative_control_tower?.narrative_mode;
                const currentMode = narrativeMode?.current_mode || 'classic_rpg';
                const modeConfig = narrativeMode?.mode_config?.[currentMode];

                if (rhythmData.phase_transition_triggered && newPhase !== oldPhase) {
                    if (oldPhase === 'pause' && newPhase === 'inhale') {
                        clock.cycle_count = (clock.cycle_count || 0) + 1;
                        info(`  ? [���໷] ��ɵ� ${clock.cycle_count} �κ�������`);
                    }

                    clock.phase_history.push({
                        phase: newPhase,
                        chapter_uid: workingChapter.uid,
                        reason: rhythmData.phase_transition_reasoning || 'ʷ������',
                        narrative_mode: currentMode
                    });
                    if (clock.phase_history.length > 5) {
                        clock.phase_history = clock.phase_history.slice(-5);
                    }

                    clock.current_phase = newPhase;
                    clock.last_phase_change_chapter = workingChapter.uid;
                    clock.current_phase_duration = 1;
                    info(`  ? [���໷] ��λת��: ${oldPhase} �� ${newPhase} [${currentMode === 'web_novel' ? '??����ģʽ' : '??����ģʽ'}]`);
                } else {
                    clock.current_phase_duration = (clock.current_phase_duration || 0) + 1;
                    info(`  ? [���໷] ά����λ: ${oldPhase} (���� ${clock.current_phase_duration} ��)`);

                    if (modeConfig?.phase_duration_modifiers && clock.current_phase_duration > 0) {
                        const modifier = modeConfig.phase_duration_modifiers[clock.current_phase] || 1.0;
                        const baseLimit = {
                            inhale: 3,
                            hold: 2,
                            exhale: 2,
                            pause: 2
                        }[clock.current_phase] || 2;

                        const adjustedLimit = Math.ceil(baseLimit * modifier);

                        if (clock.current_phase_duration >= adjustedLimit) {
                            info(`  ?? [���໷] ${currentMode}ģʽ��,${clock.current_phase}��λ�ѳ���${clock.current_phase_duration}��,��������Ϊ${adjustedLimit}��`);
                        }
                    }
                }

                clock.recommended_next_phase = rhythmData.recommended_next_phase || null;
            }

            if (rhythmData.narrative_devices_used) {
                const cooldowns = tower.device_cooldowns;

                if (rhythmData.narrative_devices_used.spotlight_protocol) {
                    cooldowns.spotlight_protocol.last_usage_chapter_uid = workingChapter.uid;
                    cooldowns.spotlight_protocol.usage_history.push({
                        chapter_uid: workingChapter.uid,
                        emotional_weight: rhythmData.emotional_intensity,
                        trigger_reason: rhythmData.device_usage_details
                    });
                    cooldowns.spotlight_protocol.recent_usage_count = cooldowns.spotlight_protocol.usage_history
                        .filter(h => tower.recent_chapters_intensity.some(c => c.chapter_uid === h.chapter_uid))
                        .length;
                    if (cooldowns.spotlight_protocol.usage_history.length > 10) {
                        cooldowns.spotlight_protocol.usage_history = cooldowns.spotlight_protocol.usage_history.slice(-10);
                    }
                    info(`  ? [��ȴ] ���� spotlight_protocol (recent_count=${cooldowns.spotlight_protocol.recent_usage_count})`);
                }

                if (rhythmData.narrative_devices_used.time_dilation) {
                    cooldowns.time_dilation.last_usage_chapter_uid = workingChapter.uid;
                    cooldowns.time_dilation.usage_history.push({
                        chapter_uid: workingChapter.uid,
                        emotional_weight: rhythmData.emotional_intensity,
                        trigger_reason: rhythmData.device_usage_details
                    });
                    cooldowns.time_dilation.recent_usage_count = cooldowns.time_dilation.usage_history
                        .filter(h => tower.recent_chapters_intensity.some(c => c.chapter_uid === h.chapter_uid))
                        .length;
                    if (cooldowns.time_dilation.usage_history.length > 10) {
                        cooldowns.time_dilation.usage_history = cooldowns.time_dilation.usage_history.slice(-10);
                    }
                    info(`  ? [��ȴ] ���� time_dilation (recent_count=${cooldowns.time_dilation.recent_usage_count})`);
                }
            }
        }

        if (delta.storyline_progress_deltas && Array.isArray(delta.storyline_progress_deltas)) {
            const progressDeltas = delta.storyline_progress_deltas;
            info(`  -> [�й�] ���� ${progressDeltas.length} �������߽��ȸ���`);

            for (const pd of progressDeltas) {
                const { storyline_id, previous_progress, progress_delta, new_progress,
                        delta_reasoning, threshold_crossed, new_stage } = pd;

                if (!tower.storyline_progress[storyline_id]) {
                    tower.storyline_progress[storyline_id] = {
                        current_progress: 0,
                        current_stage: "unknown",
                        pacing_curve: "default",
                        last_increment: 0,
                        threshold_alerts: []
                    };
                }

                const sp = tower.storyline_progress[storyline_id];
                sp.current_progress = new_progress;
                sp.last_increment = progress_delta;

                if (!sp.metadata || typeof sp.metadata !== 'object') {
                    sp.metadata = {};
                }
                const metadataKeys = [
                    'storyline_title',
                    'storyline_summary',
                    'storyline_type',
                    'storyline_category',
                    'storyline_trigger',
                    'involved_chars',
                    'player_supplement',
                    'current_status',
                    'current_summary'
                ];
                for (const key of metadataKeys) {
                    if (pd[key] !== undefined && pd[key] !== null) {
                        sp.metadata[key] = pd[key];
                    }
                }
                if (delta_reasoning) {
                    sp.metadata.delta_reasoning = delta_reasoning;
                }

                if (new_stage) {
                    sp.current_stage = new_stage;
                }

                if (threshold_crossed) {
                    info(`  ? [�й�] ${storyline_id}: ��Խ��ֵ \"${threshold_crossed}\" (${previous_progress}% -> ${new_progress}%)`);
                } else {
                    info(`  ? [�й�] ${storyline_id}: ���� +${progress_delta}% (${new_progress}%)`);
                }

                this.materializeStorylineProgressEntry(
                    workingChapter,
                    storyline_id,
                    sp,
                    { extraSource: pd }
                );
            }
        }

        this.syncStorylineProgressWithStorylines(workingChapter);
        this.calculateRhythmDirective(workingChapter);

        debugLog('[V4] ������״̬:', {
            recent_intensity: tower.recent_chapters_intensity,
            storyline_progress: tower.storyline_progress,
            rhythm_directive: tower.rhythm_directive
        });
        debugGroupEnd();
    }

    syncStorylineProgressWithStorylines(chapter) {
        if (!chapter) return;
        this.normalizeStorylineStaticData(chapter);
        const storylineMap = chapter.meta?.narrative_control_tower?.storyline_progress || {};
        const storylineProgressEntries = Object.entries(storylineMap);
        if (storylineProgressEntries.length === 0) {
            return;
        }
        storylineProgressEntries.forEach(([storylineId, progressInfo]) => {
            this.materializeStorylineProgressEntry(chapter, storylineId, progressInfo);
        });
    }

    normalizeStorylineStaticData(chapter) {
        const { debugLog } = this.engine;
        const storylines = chapter?.staticMatrices?.storylines;
        if (!storylines) return;
        const categories = ['main_quests', 'side_quests', 'relationship_arcs', 'personal_arcs'];
        const toText = (value) => {
            if (typeof value === 'string') return value;
            if (value === undefined || value === null) return '';
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        };

        categories.forEach(category => {
            const bucket = storylines[category];
            if (!bucket) return;
            Object.entries(bucket).forEach(([lineId, entry]) => {
                if (!entry || typeof entry !== 'object') return;
                let patched = false;
                if (!entry.summary || entry.summary === '') {
                    if (entry.initial_summary) {
                        entry.summary = toText(entry.initial_summary);
                        patched = true;
                    } else if (entry.description) {
                        entry.summary = toText(entry.description);
                        patched = true;
                    }
                }
                if (!entry.initial_summary && entry.summary) {
                    entry.initial_summary = entry.summary;
                    patched = true;
                }
                if (patched) {
                    debugLog(`[StorylineNormalize] ${category}/${lineId} ժҪ�ֶ���У׼`);
                }
            });
        });
    }

    materializeStorylineProgressEntry(chapter, storylineId, progressInfo = {}, options = {}) {
        const { warn, info } = this.engine;
        if (!chapter || !storylineId) return;
        const staticStorylines = chapter.staticMatrices?.storylines;
        const dynamicStorylines = chapter.dynamicState?.storylines;
        if (!staticStorylines || !dynamicStorylines) return;

        const metadataSources = [];
        if (options.extraSource) {
            metadataSources.push(options.extraSource);
        }
        if (progressInfo.metadata && typeof progressInfo.metadata === 'object') {
            metadataSources.push(progressInfo.metadata);
        }
        metadataSources.push(progressInfo);

        const pickValue = (keys) => {
            for (const source of metadataSources) {
                if (!source || typeof source !== 'object') continue;
                for (const key of keys) {
                    if (Object.prototype.hasOwnProperty.call(source, key)) {
                        const value = source[key];
                        if (value !== undefined && value !== null && value !== '') {
                            return value;
                        }
                    }
                }
            }
            return undefined;
        };

        const title = pickValue(['storyline_title', 'title', 'name']);
        const summary = pickValue(['storyline_summary', 'summary', 'current_summary', 'delta_reasoning']);
        const typeHint = pickValue(['storyline_type', 'type']);
        const categoryHint = pickValue(['storyline_category', 'category']);
        const trigger = pickValue(['storyline_trigger', 'trigger']);
        const involvedChars = pickValue(['involved_chars']);
        const playerSupplement = pickValue(['player_supplement']);
        const currentStatus = pickValue(['current_status']);
        const currentSummary = pickValue(['current_summary', 'delta_reasoning', 'storyline_summary', 'summary']);

        const resolvedCategory = this.resolveStorylineCategory(storylineId, {
            storyline_category: categoryHint,
            storyline_type: typeHint
        });

        if (!resolvedCategory) {
            warn(`[StorylineNetwork] �޷�ʶ������� ${storylineId} �ķ��࣬����ʵ�廯��`);
            return;
        }

        if (!staticStorylines[resolvedCategory]) {
            staticStorylines[resolvedCategory] = {};
        }
        if (!dynamicStorylines[resolvedCategory]) {
            dynamicStorylines[resolvedCategory] = {};
        }

        const staticBucket = staticStorylines[resolvedCategory];
        const dynamicBucket = dynamicStorylines[resolvedCategory];

        const safeTitle = title || storylineId;
        const safeSummary = summary || '����δ׫дժҪ��';
        const safeType = typeHint || resolvedCategory;
        const safeTrigger = trigger || '�����ƽ�����';
        const safeInvolved = Array.isArray(involvedChars) ? involvedChars : [];

        let createdPlaceholder = false;

        if (!staticBucket[storylineId]) {
            staticBucket[storylineId] = {
                title: safeTitle,
                summary: safeSummary,
                initial_summary: safeSummary,
                trigger: safeTrigger,
                type: safeType,
                involved_chars: safeInvolved
            };
            createdPlaceholder = true;
        } else {
            const staticEntry = staticBucket[storylineId];
            if (!staticEntry.title && safeTitle) staticEntry.title = safeTitle;
            if ((!staticEntry.summary || staticEntry.summary === '') && safeSummary) {
                staticEntry.summary = safeSummary;
            }
            if ((!staticEntry.initial_summary || staticEntry.initial_summary === '') && (safeSummary || staticEntry.summary)) {
                staticEntry.initial_summary = staticEntry.summary || safeSummary;
            }
            if (!staticEntry.type && safeType) staticEntry.type = safeType;
            if (!staticEntry.trigger && trigger) staticEntry.trigger = safeTrigger;
            if ((!staticEntry.involved_chars || staticEntry.involved_chars.length === 0) && safeInvolved.length > 0) {
                staticEntry.involved_chars = safeInvolved;
            }
        }

        if (!dynamicBucket[storylineId]) {
            dynamicBucket[storylineId] = {
                current_status: currentStatus || 'active',
                current_summary: currentSummary || safeSummary,
                history: [],
                player_supplement: playerSupplement || ''
            };
            createdPlaceholder = true;
        } else {
            const dynamicEntry = dynamicBucket[storylineId];
            if (!dynamicEntry.current_status && currentStatus) {
                dynamicEntry.current_status = currentStatus;
            }
            if ((!dynamicEntry.current_summary || dynamicEntry.current_summary === '��δ��¼��չ') && (currentSummary || safeSummary)) {
                dynamicEntry.current_summary = currentSummary || safeSummary;
            }
            if (!dynamicEntry.player_supplement && playerSupplement) {
                dynamicEntry.player_supplement = playerSupplement;
            }
        }

        if (progressInfo) {
            if (!progressInfo.metadata || typeof progressInfo.metadata !== 'object') {
                progressInfo.metadata = {};
            }
            const metadata = progressInfo.metadata;
            if (safeTitle && !metadata.storyline_title) metadata.storyline_title = safeTitle;
            if (safeSummary && !metadata.storyline_summary) metadata.storyline_summary = safeSummary;
            if (safeType && !metadata.storyline_type) metadata.storyline_type = safeType;
            if (resolvedCategory && !metadata.storyline_category) metadata.storyline_category = resolvedCategory;
            if (safeTrigger && !metadata.storyline_trigger) metadata.storyline_trigger = safeTrigger;
            if (Array.isArray(safeInvolved) && safeInvolved.length > 0 && (!Array.isArray(metadata.involved_chars) || metadata.involved_chars.length === 0)) {
                metadata.involved_chars = safeInvolved;
            }
        }

        if (createdPlaceholder) {
            info(`[StorylineNetwork] ��Ϊ ${storylineId} ���ɿɱ༭ռλ��${resolvedCategory}����`);
        }
    }

    resolveStorylineCategory(storylineId, hints = {}) {
        const normalize = (value) => {
            if (value === undefined || value === null) return '';
            return value.toString().trim().toLowerCase().replace(/[\s_-]+/g, '');
        };

        const categorySynonyms = {
            main_quests: ['mainquests', 'mainquest', 'main', '����', '����', 'campaign', 'saga', 'primary'],
            side_quests: ['sidequests', 'sidequest', 'side', '֧��', '֧��', 'branch', 'optional'],
            relationship_arcs: ['relationshiparcs', 'relationship', 'romance', '����', '�', '�b�O', 'bond'],
            personal_arcs: ['personalarcs', 'personal', 'characterarc', 'character', '��ɫ', '�ɳ�', '���L', 'arc']
        };

        const matchCategory = (value, allowPartial = false) => {
            if (!value) return null;
            for (const [category, synonyms] of Object.entries(categorySynonyms)) {
                for (const synonym of synonyms) {
                    if (value === synonym) {
                        return category;
                    }
                    if (allowPartial && value.includes(synonym)) {
                        return category;
                    }
                }
            }
            return null;
        };

        const explicitHint = normalize(hints.storyline_category || hints.category);
        const explicitMatch = matchCategory(explicitHint);
        if (explicitMatch) return explicitMatch;

        const typeHint = normalize(hints.storyline_type || hints.type);
        const typeMatch = matchCategory(typeHint, true);
        if (typeMatch) return typeMatch;

        const idHint = normalize(storylineId);
        const idMatch = matchCategory(idHint, true);
        if (idMatch) return idMatch;

        return 'personal_arcs';
    }

    calculateRhythmDirective(workingChapter) {
        const { info } = this.engine;
        const tower = workingChapter.meta.narrative_control_tower;
        const directive = tower.rhythm_directive;

        directive.mandatory_constraints = [];
        directive.impending_thresholds = [];
        directive.rhythm_dissonance_opportunities = [];

        const lastRhythm = tower.last_chapter_rhythm;
        if (lastRhythm?.requires_cooldown) {
            directive.mandatory_constraints.push("cooldown_required");
            directive.intensity_range = { min: 1, max: 5 };
            directive.suggested_chapter_type = "Sequel";
            info(`  ? [ָ��] ǿ����ȴ: ��һ����Ҫ��ȴ`);
        } else {
            directive.intensity_range = { min: 1, max: 10 };
            directive.suggested_chapter_type = "Scene";
        }

        const spotlightCooldown = tower.device_cooldowns.spotlight_protocol;
        if (spotlightCooldown.recent_usage_count >= 2) {
            directive.mandatory_constraints.push("spotlight_forbidden");
            info(`  ? [ָ��] �۹�ƽ���: ���5����ʹ�� ${spotlightCooldown.recent_usage_count} ��`);
        }

        for (const [storylineId, progress] of Object.entries(tower.storyline_progress)) {
            const thresholds = [
                { value: 15, name: "inciting_incident" },
                { value: 25, name: "first_turning_point" },
                { value: 50, name: "midpoint" },
                { value: 75, name: "climax_approach" },
                { value: 90, name: "resolution" }
            ];

            for (const threshold of thresholds) {
                if (progress.current_progress < threshold.value &&
                    progress.current_progress >= threshold.value - 10) {
                    directive.impending_thresholds.push({
                        storyline_id: storylineId,
                        threshold: threshold.name,
                        progress: progress.current_progress,
                        trigger_at: threshold.value
                    });
                }
            }
        }

        const progressEntries = Object.entries(tower.storyline_progress);
        if (progressEntries.length >= 2) {
            let maxProgress = { id: null, value: 0 };
            let minProgress = { id: null, value: 100 };

            for (const [id, p] of progressEntries) {
                if (p.current_progress > maxProgress.value) {
                    maxProgress = { id, value: p.current_progress };
                }
                if (p.current_progress < minProgress.value) {
                    minProgress = { id, value: p.current_progress };
                }
            }

            const gap = maxProgress.value - minProgress.value;
            if (gap >= 40) {
                directive.rhythm_dissonance_opportunities.push({
                    description: `${maxProgress.id}(${maxProgress.value}%)�������ȣ�${minProgress.id}(${minProgress.value}%)�ͺ�${gap}%������������ѹ���߻��ͺ���`
                });
                info(`  ? [ָ��] ��⵽�����λ����: ${gap}% ���`);
            }
        }

        directive.generated_at = new Date().toISOString();
        info(`  ? [ָ��] rhythm_directive ������`);
    }
}

