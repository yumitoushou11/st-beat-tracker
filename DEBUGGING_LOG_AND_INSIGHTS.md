# Debugging Log and Key Insights: A Retrospective

This document summarizes the key findings and lessons learned from a collaborative debugging session. It aims to serve as a guide for future AI assistants to understand complex system behavior, debug efficiently, and implement robust solutions.

---

## Quick Reference for New AI Assistants

### User Profile
- **Primary Language:** Chinese (Simplified) - Always respond in Chinese
- **Technical Level:** Deep understanding of own codebase architecture
- **Communication Style:** Direct, specific, uses precise technical terms in Chinese
- **Workflow:** Incremental testing, focused fixes, values transparency

### Critical Code Patterns to Remember
1. **Stop Button Pattern:** Must use `.html()` not `.text()` when updating messages with buttons
2. **AbortController Pattern:** Initialize at flow start, thread signal through all layers, clean up in finally
3. **Static Database Priority:** Always read from `staticDataManager` before in-memory state during Genesis
4. **Async/Await:** When saving data, compare with working examples and always use `await`
5. **State Locking:** UI modes need explicit flags (`isLockedInStaticMode`) to prevent auto-switching

### Chinese Term to Code Mapping
| Chinese Term | Code Location | Method/Flow |
|--------------|---------------|-------------|
| 史官分析 | `StoryBeatEngine.js` | `_runStrategicReview()` |
| 建筑师分析 | `StoryBeatEngine.js` | `_planNextChapter()` |
| 章节切换 | `StoryBeatEngine.js` | `triggerChapterTransition()` |
| 创世纪 | `StoryBeatEngine.js` | `_runGenesisFlow()` |
| 热重载 | `StoryBeatEngine.js` | `reanalyzeWorldbook()` |
| 静态数据库 | `StaticDataManager.js` | Pre-edit mode cache |
| 回合执导 | `turnConductorAgent.js` | Turn-by-turn guidance |

### When User Says This → Do This
| User Statement | Meaning | Action |
|----------------|---------|--------|
| "立刻截断" | Immediate abort | Use `AbortController.abort()` |
| "按照标准流程分析修复" | Follow systematic debug | Use Grep → Read → Compare → Fix pattern |
| "我怀疑可能是..." | Hypothesis provided | Verify user's hypothesis first |
| "我希望的是..." | Expected behavior | This is the requirement, not current behavior |

---

## Part 1: The State Desynchronization Saga

### Initial Symptom & Flawed Hypothesis 1
- **Symptom:** The user reported that the UI displayed a "Static Archive Edit Mode" warning even after a long chat session. This correctly pointed to a desynchronization between the UI's state and the application's latest "leader" state.
- **Initial Fix:** My first attempt was based on the assumption of a synchronous environment. I implemented a `getEffectiveChapterState()` helper in `ui/uiManager.js` to force a state re-fetch at the moment of user interaction (e.g., clicking an "edit" button).
- **Outcome:** This fix failed.

### User Insight & The Polling-Fallback Mechanism
- **The Turning Point:** The user provided a crucial piece of information: the system was designed with an asynchronous, polling-based mechanism in mind. The intended logic was to try reading the leader state multiple times (e.g., 5 times with a 300ms interval) before falling back to the static cache.
- **Lesson:** **Always trust the user's description of system behavior.** My initial assumption about the system's architecture was incorrect. The user's insight revealed the asynchronous nature of state updates and the potential for race conditions, which my synchronous fix could not handle.

### Hypothesis 2 & The Root Cause
- **Second Fix Attempt:** Based on the user's input, I implemented a `getDynamicStateWithRetry` polling function in `ui/uiManager.js`. This function would try to fetch the leader state multiple times upon opening the UI drawer.
- **Deeper Investigation:** While this was a more robust approach, a deeper look into the logic revealed a more fundamental bug. The function responsible for finding the leader state, `getLeaderStateFromChat` in `ui/renderers.js`, was iterating through the chat history **from the beginning (`for i = 0...`)**.
- **The Root Cause:** Because the leader state is typically attached to the *last* AI message, a forward loop would find the *oldest* leader in the chat history, not the most recent one. This explained why, even with polling, the UI was loading a stale, almost-static state.

### Final Solution for State Sync
The final, successful solution was a multi-layered defense:
1.  **Root Cause Fix:** The loop in `getLeaderStateFromChat` was reversed to `for (let i = chat.length - 1; i >= 0; i--)`, ensuring the newest leader is always found first.
2.  **Robust Initial Load:** The `getDynamicStateWithRetry` polling mechanism was kept to handle initial UI load, gracefully waiting for the leader state to become available.
3.  **Just-in-Time Fallback:** The `getEffectiveChapterState` check on click was also kept as a final safeguard against any other unforeseen timing issues.

## Part 2: Implementing an Immediate "Hard Stop"

### User Requirement: "Safe Stop" vs. "Hard Stop"
- **Symptom:** The user clicked a "Stop" button during a long-running AI task (chapter transition), but the task only stopped gracefully after its current step completed.
- **Requirement:** The user desired an immediate stop that would abort the in-flight AI network request, not just flag the process to stop later.

### Technical Solution: The `AbortController` Pattern
- **Diagnosis:** The existing system used a simple boolean flag (`_transitionStopRequested`), which only allowed for a "soft stop". A "hard stop" requires a mechanism to cancel promises and network requests. The standard web API for this is the `AbortController`.
- **Implementation Strategy (Bottom-Up):**
    1.  **Lowest Level (`LLMApiService.js`):** Modified the core `callLLM` method and its underlying `fetch` calls to accept an `AbortSignal`.
    2.  **Signal Threading:** Passed the `abortSignal` parameter up the entire call stack: from `LLMApiService` to the AI Agents (`HistorianAgent`, `ArchitectAgent`), then to the engine's helper methods (`_runStrategicReview`, `_planNextChapter`), and finally to the main orchestrator method (`triggerChapterTransition`).
    3.  **Controller Management (`StoryBeatEngine.js`):** The `StoryBeatEngine`, as the owner of the long-running process, became responsible for creating and managing the `AbortController`. An instance was created at the start of `triggerChapterTransition` and nulled out in the `finally` block.
    4.  **UI Integration:** A new `abortCurrentTask()` method was created on the engine. The existing UI "Stop" button handler (`_handleStopTransitionRequest`) was upgraded to call this new method, which triggers `controller.abort()`.

### Refinement: User Experience over Technical Accuracy
- **The Problem:** A successful `abort()` throws an `AbortError`. My initial implementation caught this and displayed it as a generic failure, showing error toast notifications like "Chapter planning failed".
- **The Insight:** From the user's perspective, this is not a failure. It is a **successful cancellation**. The feedback should reflect the user's intent.
- **Final Polish:**
    1.  The `catch` blocks in the lower-level agents and helpers were modified to specifically check `if (error.name === 'AbortError')` and **re-throw the error**.
    2.  The top-level `catch` block in `triggerChapterTransition` was modified to have a dedicated `if (error.name === 'AbortError')` block. Instead of showing an error, it now shows a friendly `toastr.info` message like "Chapter transition was successfully aborted by the user."

## Key Takeaways for Future AI Assistants

1.  **Trust the User's Lived Experience:** The user's description of how a system *feels* or is *supposed to work* is invaluable data. It can reveal hidden architectural assumptions (like polling) that code analysis alone might miss. Do not be afraid to discard your own hypothesis if it contradicts the user's report.

2.  **Dig for the Root Cause:** The "stale state" was a symptom. The first fix (polling) was a patch. The real bug was the incorrect loop direction. Always ask "why" an intermediate fix might still be failing. Don't stop at the first layer.

3.  **Architect for Cancellation:** Any function that initiates a long-running, asynchronous task (especially network requests) should be designed to be cancellable. The `AbortController`/`AbortSignal` pattern is the standard, robust way to achieve this in a modern JavaScript environment. Implement it from the bottom up.

4.  **Translate Technicals into User Experience:** An error thrown in code is not always an error for the user. Handle exceptions based on *user intent*. A user-initiated cancellation is a success condition, and the UI feedback must reflect that.

5.  **Embrace Incrementalism:** As the user wisely pointed out, large, monolithic changes are brittle and hard to debug. Breaking a complex refactoring task into smaller, logical, and independently verifiable steps is a more reliable and efficient strategy.

6.  **Don't Get Stuck:** When a tool or approach repeatedly fails (like my attempts to read the correct `manager.js`), it's a signal to stop, reassess the fundamental assumptions (like path resolution), and consider an alternative approach, even if it means asking the user for help.

---

## Part 3: Understanding the User's Development Workflow & Language Preferences

### User Communication Style
- **Language:** The user primarily communicates in **Chinese (Simplified)**. All explanations, bug descriptions, and feature requests are in Chinese.
- **Technical Depth:** The user has deep knowledge of their own codebase architecture. They often provide crucial insights about intended behavior, data flow, and architectural decisions.
- **Directness:** The user is direct and specific. They will clearly state:
  - "我们修复一个bug" (We're fixing a bug) - indicates a focused debugging session
  - "按照这个标准流程进行分析修复" (Analyze and fix according to this standard process) - provides the expected workflow
  - When they say something is wrong, trust it immediately and investigate deeply.

### Critical Architectural Concepts to Remember

#### The "Static Database" (静态数据库) Pattern
- **Purpose:** A pre-edit mode that allows users to modify world data BEFORE the first Architect AI call
- **Data Flow:**
  1. When no leader state is found after polling (1.5s / 5 retries × 300ms)
  2. System loads data from `StaticDataManager` (the "static database")
  3. UI shows a banner: "当前正处于「静态档案预编辑模式」"
  4. User edits are saved directly to the static database
  5. On first Architect call (Genesis), data is read FROM the static database
- **Common Bug Pattern:** Reading from memory/cache instead of static database causes old data to be used
- **Fix Pattern:** Always prioritize `staticDataManager.loadStaticData()` over in-memory state during Genesis

#### The "Locked Mode" Pattern
- **Problem:** `getEffectiveChapterState()` would automatically try to switch from static mode to leader mode
- **Solution:** Use a `isLockedInStaticMode` flag to prevent automatic state switching
- **When to Lock:** When displaying static database data after failed leader polling
- **When to Unlock:** When receiving a real chapter state via `CHAPTER_UPDATED` event

### Bug Fix Session: 2025-11-30

#### Bug 1: Early Focus Input Re-prompting
**File:** `StoryBeatEngine.js:190-204`
**Problem:**
- User clicks the "规划" (Plan) button during historian review
- If user cancels the input, the popup would re-appear after historian finishes
**Root Cause:**
- Cancellation returned `null` without setting `earlyPlayerInput`
- System couldn't detect that user had already made a choice
**Fix:**
```javascript
// Even on cancel, set a default value to prevent re-prompting
this.LEADER.earlyPlayerInput = {
    focus: "由AI自主创新。",
    freeRoam: false
};
```
**Lesson:** When user initiates an action, always record their choice, even if they cancel. This prevents duplicate prompts.

#### Bug 2: Storyline Edit Not Saving
**File:** `uiManager.js:1438-1544`
**Problem:**
- Editing storylines appeared to save but data was lost
- Character edits worked fine
**Root Cause:**
- Character save: `await deps.onSaveCharacterEdit(...)` ✅
- Storyline save: `deps.onSaveCharacterEdit(...)` ❌ (missing await)
**Fix:**
- Added `async` to click handler
- Added `await` before save call
- Added try-catch with proper error handling
- Added loading state with disabled button
**Lesson:** Always compare working code with broken code. Async/await bugs are subtle but fatal for data persistence.

#### Bug 3: Static Database Mode Not Displaying/Locking
**File:** `uiManager.js:110-242`
**Problem:**
- Banner would disappear even in static database mode
- `getEffectiveChapterState()` would auto-switch to leader state
- User's static database edits seemed to "vanish"
**Root Cause:**
- No "lock" mechanism to indicate current mode
- `getEffectiveChapterState()` always tried to find the newest leader
**Fix:**
```javascript
let isLockedInStaticMode = false; // Flag to lock mode

const getEffectiveChapterState = () => {
    if (isLockedInStaticMode) {
        return currentChapterState; // Don't auto-switch
    }
    // Otherwise try to find leader...
};

// Set lock when loading static database
isLockedInStaticMode = true;

// Remove lock when receiving real chapter
if (!isStaticArchiveState(resolvedState)) {
    isLockedInStaticMode = false;
}
```
**Lesson:** UI modes need explicit state flags. Don't rely on implicit detection.

#### Bug 4: Genesis Reading Old Memory Data Instead of Static Database
**File:** `StoryBeatEngine.js:1887-1946`
**Problem:**
- User edits data in pre-edit mode
- Saves successfully, refresh confirms save
- First Architect call uses OLD data, not the edited data
**Root Cause - Priority Order Was Wrong:**
```javascript
// WRONG ORDER (before fix):
// 1. Memory (old cached preview data) ❌
// 2. Static database (user's latest edits)
// 3. AI analysis

// CORRECT ORDER (after fix):
// 1. Static database (user's latest edits) ✅
// 2. Memory (fallback only)
// 3. AI analysis
```
**Fix:**
```javascript
// Always check static database FIRST
const cachedDb = staticDataManager.loadStaticData(activeCharId);
if (cachedDb && Object.keys(cachedDb.characters || {}).length > 0) {
    finalStaticMatrices = cachedDb;
    sourceLabel = "静态数据库";
}
// Only use memory if database is empty
else if (this.currentChapter && this.currentChapter.staticMatrices...) {
    finalStaticMatrices = this.currentChapter.staticMatrices;
    sourceLabel = "内存fallback";
}
```
**Lesson:** When user explicitly saves to a database, ALWAYS prioritize reading from that database. Memory/cache should only be a fallback for when the database is empty.

### Key Patterns Observed in This Codebase

1. **The Todo System:** User expects active use of `TodoWrite` tool to track multi-step fixes
2. **Parallel Tool Calls:** User appreciates when independent operations are called in parallel
3. **Save Pattern:** Many features save via `deps.onSaveCharacterEdit(actionType, chapterState)`
   - Always check if it needs `await`
   - Compare with working examples (character save, worldview save)
4. **Modal/Detail Panels:** Pattern for edit modes:
   - View mode → Edit mode toggle
   - Save button (with async/await)
   - Cancel button
   - Delete button (with confirmation)
5. **State Sources:** Three-tier fallback:
   - Tier 1: Authoritative source (leader state, static database)
   - Tier 2: In-memory fallback
   - Tier 3: AI generation (last resort)

### User's Debugging Approach
1. Describes expected behavior clearly ("我希望的是...")
2. Points out the suspected logic flaw ("我怀疑可能...")
3. Requests analysis according to standard process ("按照这个标准流程进行分析修复")
4. Values immediate, focused fixes over large refactors

### Communication Best Practices
- Respond in Chinese when user communicates in Chinese
- Always confirm understanding of the bug before fixing
- Show code diffs for transparency
- Explain both the problem AND the solution
- Use emojis sparingly (only ✅ ❌ for status, 🎯 ✨ for emphasis)

---

## Part 4: Stop Button Bug Fix & AbortController Deep Dive (2025-11-30)

### Context: The "Immediate Stop" Requirement
The user's language when describing stop behavior is very specific:
- "我们中止是立刻执行的，直接截断的方式" (Our abort is immediate, using direct interruption)
- This is NOT a "graceful stop" - it must **abort in-flight AI requests immediately**

### Bug Report & Initial Investigation
**User Report:** "史官分析环节的停止按钮可以正常中止，但到了建筑师分析时就不能通过按钮停止了"
- Historian analysis stop button: ✅ Works
- Architect analysis stop button: ❌ Doesn't work

**Investigation Process:**
1. Used `Grep` to find all instances of "史官分析" and "建筑师分析"
2. Found both phases in `StoryBeatEngine.js` chapter transition flow
3. Compared the code differences between the two phases

### Root Cause #1: `.text()` vs `.html()` Method
**Location:** `StoryBeatEngine.js:2307` (Chapter Transition - Architect Phase)

**Problem:**
```javascript
// Historian phase (WORKS):
loadingToast.find('.toast-message').html(`
    史官正在复盘本章历史...<br>
    <div class="sbt-compact-toast-actions">
        <button id="sbt-stop-transition-btn">停止</button>
    </div>
`);
this._bindStopButton('史官阶段');

// Architect phase (BROKEN):
loadingToast.find('.toast-message').text("建筑师正在规划新章节...");
this._bindStopButton('建筑师阶段'); // ❌ Button already gone!
```

**The Fatal Difference:**
- `.html()` → Sets HTML content, **preserves/replaces** existing elements
- `.text()` → Sets plain text, **removes ALL HTML** including child elements

When `.text()` was called, it **erased the entire HTML structure** including the stop button. Then `_bindStopButton()` tried to bind to a button that no longer existed.

**Fix:** Replace `.text()` with `.html()` and re-add the button HTML.

### Root Cause #2: Missing `AbortController` Initialization
**Location:** Multiple flows lacked initialization

**Error Message:**
```
TypeError: Cannot read properties of null (reading 'signal')
at StoryBeatEngine._runGenesisFlow (StoryBeatEngine.js:1995:149)
```

**Problem Pattern:**
```javascript
// Chapter Transition (HAS initialization):
async triggerChapterTransition() {
    this.currentTaskAbortController = new AbortController(); ✅
    await this._planNextChapter(..., this.currentTaskAbortController.signal);
}

// Genesis Flow (MISSING initialization):
async _runGenesisFlow() {
    // No initialization! ❌
    await this._planNextChapter(..., this.currentTaskAbortController.signal); // → null.signal → CRASH
}
```

### Comprehensive Fix: All Affected Flows

#### 1. Chapter Transition - Architect Phase
**File:** `StoryBeatEngine.js:2307-2323`
- Changed `.text()` to `.html()`
- Added stop button HTML
- Already had `abortSignal` ✅

#### 2. Genesis - Intelligence Analysis Phase
**File:** `StoryBeatEngine.js:1917-1932`
- Added stop button HTML
- Added `abortSignal` to `intelligenceAgent.execute()`
- **Also Modified:** `intelligenceAgent.js:352` to accept `abortSignal` parameter

#### 3. Genesis - Architect Phase
**File:** `StoryBeatEngine.js:1986-1995`
- Already had stop button HTML ✅
- Added missing `abortSignal` parameter

#### 4. Genesis Flow - Controller Initialization
**File:** `StoryBeatEngine.js:1871-1880`
```javascript
async _runGenesisFlow(firstMessageContent = null) {
    this._setStatus(ENGINE_STATUS.BUSY_GENESIS);

    // Initialize abort controller
    this._transitionStopRequested = false;
    this._activeTransitionToast = null;
    this.currentTaskAbortController = new AbortController(); // ✅ Added

    const loadingToast = this.toastr.info(...);
    this._activeTransitionToast = loadingToast; // ✅ Track for stop button updates
}
```

#### 5. Hot Reload - Intelligence Analysis Phase
**File:** `StoryBeatEngine.js:2587-2604`
- Added stop button HTML
- Added `abortSignal` parameter
- Added controller initialization

#### 6. Error Handling for User-Initiated Aborts
**Pattern Applied to All Flows:**
```javascript
} catch (error) {
    if (error.name === 'AbortError' || error.code === 'SBT_TRANSITION_STOP') {
        this.warn('流程被强制中止。');
        this._cleanupAfterTransitionStop();
        this.toastr.info("操作已由用户成功中止。", "操作已取消"); // ✅ Success message, not error
    } else {
        // Real errors...
    }
} finally {
    this.currentTaskAbortController = null; // ✅ Cleanup
}
```

### Key Lessons from This Session

#### 1. The `.text()` vs `.html()` Gotcha
**Pattern:** When updating notification messages that contain interactive elements (buttons), **always use `.html()`**
- `.text()` is only safe for simple text updates
- Any existing child elements (buttons, inputs) will be destroyed

#### 2. The AbortController Lifecycle Pattern
For **any** long-running async flow:
```javascript
async longRunningTask() {
    // 1. Initialize at START
    this.currentTaskAbortController = new AbortController();
    this._activeTransitionToast = loadingToast;

    try {
        // 2. Thread signal through entire call chain
        await someAgent.execute(context, this.currentTaskAbortController.signal);
    } catch (error) {
        // 3. Handle abort as SUCCESS, not failure
        if (error.name === 'AbortError') { /* Success UI */ }
    } finally {
        // 4. Cleanup in finally block
        this.currentTaskAbortController = null;
    }
}
```

#### 3. Signal Threading is Bottom-Up
When implementing abort support:
1. Start at **lowest level** (`LLMApiService.callLLM`)
2. Add `abortSignal` parameter to **every layer**:
   - `IntelligenceAgent.execute(context, abortSignal)`
   - `ArchitectAgent.execute(context, abortSignal)`
   - `HistorianAgent.execute(context, abortSignal)`
   - Engine helper methods (`_planNextChapter`, `_runStrategicReview`)
   - Top-level orchestrators (`triggerChapterTransition`, `_runGenesisFlow`)

**Critical:** If you add `abortSignal` at top but forget the middle layers, you get:
```javascript
await someAgent.execute(context, this.currentTaskAbortController.signal);
//                                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ null → CRASH
```

#### 4. User Language Precision Matters
When user says:
- "史官分析" → Means `_runStrategicReview()` / historian phase
- "建筑师分析" → Means `_planNextChapter()` / architect phase
- "章节切换" → Means `triggerChapterTransition()` flow
- "创世纪" → Means `_runGenesisFlow()` / genesis flow
- "热重载" → Means `reanalyzeWorldbook()` flow

**These are NOT just casual descriptions** - they map to specific methods. Use `Grep` to find exact locations.

#### 5. When User Says "立刻截断" (Immediate Interruption)
This means:
- ✅ Use `AbortController.abort()` to cancel fetch requests
- ✅ Stop button must work in **all phases** (historian, architect, intelligence)
- ✅ Must work in **all flows** (chapter transition, genesis, hot reload)
- ❌ NOT a "soft stop" that waits for current step to finish
- ❌ NOT a "flag-based stop" that only checks between operations

### Testing Checklist for Stop Button Features
After implementing any stop button:
- [ ] Stop button HTML exists in notification
- [ ] `_bindStopButton()` is called **after** button HTML is added
- [ ] `AbortController` is initialized at flow start
- [ ] `abortSignal` is threaded through entire call chain
- [ ] Error handling distinguishes `AbortError` from real errors
- [ ] User sees success message ("已中止"), not error message
- [ ] `finally` block cleans up `currentTaskAbortController = null`
- [ ] Test in all flows: chapter transition, genesis, hot reload

### User Workflow Insight: Incremental Testing
User reported the bug in stages:
1. "史官分析的停止按钮能用" → Confirmed working case
2. "建筑师分析不能停止" → Identified broken case
3. "创世纪的第一次建筑师也能这样停止吗" → Extended scope

**Pattern:** User tests incrementally and reports new edge cases as they find them. Be prepared to:
- Apply the same fix pattern to **multiple flows**
- Check Genesis, Chapter Transition, Hot Reload separately
- Verify **all AI analysis phases** (Intelligence, Historian, Architect)

---

## Part 5: Debugging Methodology & Tool Usage Best Practices

### The Systematic Debug Workflow (User's Standard Process)

When user says "按照这个标准流程进行分析修复", this is the expected sequence:

#### Phase 1: Locate the Problem
1. **Use Grep to find keywords**
   ```
   Pattern: User's Chinese description → Technical terms
   Example: "史官分析环节" → Grep for "史官分析"
   ```
2. **Read the relevant file sections**
   - Use `offset` and `limit` for large files
   - Compare working vs broken code side-by-side
3. **Use TodoWrite to plan the fix**
   - Break down into logical steps
   - Track progress as you go

#### Phase 2: Understand the Root Cause
1. **Compare patterns** - Find similar working code
2. **Check initialization** - AbortController, event listeners, state flags
3. **Verify data flow** - Is the signal/data threaded through all layers?

#### Phase 3: Implement the Fix
1. **Apply fix to initial location**
2. **Search for similar patterns** - Use Grep to find other occurrences
3. **Apply fix to all affected flows** - Don't assume it's just one place

#### Phase 4: Verify Completeness
1. **Check error handling** - AbortError vs real errors
2. **Check resource cleanup** - finally blocks, null assignments
3. **Update TodoWrite** - Mark tasks as completed

### Tool Usage Patterns from This Session

#### Grep Strategy
```
✅ GOOD: Grep for exact Chinese terms
Pattern: "史官分析" → Found exact location

✅ GOOD: Grep for method signatures
Pattern: "async execute\(" → Found all agent execute methods

❌ AVOID: Grep for common English words
Pattern: "execute" → Too many false positives
```

#### Read Strategy
```
✅ GOOD: Read small, focused sections
Read(file, offset=2307, limit=30) → Just the architect phase

✅ GOOD: Read related methods together
Read _bindStopButton() + _handleStopTransitionRequest()

❌ AVOID: Reading entire large files
Read(StoryBeatEngine.js) → 41235 tokens, exceeds limit
```

#### TodoWrite Discipline
User expects **active tracking** throughout the session:
```
✅ Start of session: Create task list
✅ Before each fix: Mark task as in_progress
✅ After each fix: Mark task as completed
✅ When scope expands: Add new tasks

❌ Don't batch updates - update immediately after each step
```

### Common Bug Patterns in This Codebase

#### Pattern 1: Missing Await
```javascript
// ❌ WRONG
deps.onSaveCharacterEdit(type, state); // Fire and forget

// ✅ CORRECT
await deps.onSaveCharacterEdit(type, state);
```
**Detection:** Compare with working save operations (character save, worldview save)

#### Pattern 2: Wrong jQuery Method
```javascript
// ❌ WRONG - Destroys HTML elements
loadingToast.find('.toast-message').text("Loading...");

// ✅ CORRECT - Preserves/replaces HTML
loadingToast.find('.toast-message').html(`
    Loading...<br>
    <button>Stop</button>
`);
```
**Detection:** Check if notification contains interactive elements

#### Pattern 3: Missing AbortController Init
```javascript
// ❌ WRONG - Crashes with null.signal
async flow() {
    await agent.execute(ctx, this.controller.signal); // null!
}

// ✅ CORRECT - Initialize first
async flow() {
    this.controller = new AbortController();
    await agent.execute(ctx, this.controller.signal);
}
```
**Detection:** Error message "Cannot read properties of null (reading 'signal')"

#### Pattern 4: Wrong Priority Order
```javascript
// ❌ WRONG - Old memory overrides user edits
if (this.currentChapter.staticMatrices) return memory;
else return staticDataManager.load();

// ✅ CORRECT - User edits take priority
const cached = staticDataManager.load();
if (cached) return cached;
else return this.currentChapter.staticMatrices;
```
**Detection:** User saves but data isn't used

### File Architecture Quick Reference

#### Core Engine Files
- `StoryBeatEngine.js` - Main orchestrator, all major flows
- `Chapter.js` - State container
- `stateManager.js` - Persistence layer
- `StaticDataManager.js` - Pre-edit mode cache

#### AI Agent Files
- `intelligenceAgent.js` - World analysis (worldview, characters)
- `historianAgent.js` - Event review (creates/updates delta)
- `architectAgent.js` - Chapter planning (blueprint generation)
- `turnConductorAgent.js` - Turn-by-turn guidance

#### UI Files
- `ui/uiManager.js` - Modal panels, edit modes, state locking
- `ui/renderers.js` - Display logic, getLeaderStateFromChat()

#### Service Files
- `LLMApiService.js` - Network layer, fetch with AbortSignal

### Red Flags That Should Trigger Deeper Investigation

🚩 User says "但是..." (but...) - Current behavior doesn't match expectation
🚩 Error mentions "null" - Likely missing initialization
🚩 User says "刷新后确认保存了" (confirmed save after refresh) but data not used - Priority order bug
🚩 Feature works in one flow but not others - Pattern needs to be applied everywhere
🚩 User describes exact technical terms - These map to specific methods, use Grep to find them

### Final Meta-Lesson: Document Your Experience

This document exists because debugging sessions contain valuable patterns that shouldn't be lost. After fixing a complex bug:

1. **Document the root cause** - Not just the fix
2. **Document the investigation process** - How you found it
3. **Extract the pattern** - Where else might this occur?
4. **Update the quick reference** - Help future AI assistants

The user values this documentation. It makes future sessions more efficient and helps build institutional knowledge about the codebase.

---

## Part 6: Implementing Relationship Graph Creation Feature (2025-11-30)

### User Requirement
**User Request:** "关系图谱能不能加入新建？就像其它档案的新建逻辑一样，学习角色档案那个新建逻辑就行。"

Translation: Add a "Create New" feature to the relationship graph, following the same pattern as character creation.

### Implementation Strategy: Pattern Replication

The user's instruction was clear: **study the character creation logic and replicate it exactly for relationships**. This is a perfect example of the user's preference for consistency across features.

### Step-by-Step Implementation

#### Phase 1: Study the Reference Implementation
**Files Analyzed:**
1. [characterModal.js](ui/renderers/characterModal.js:15-43) - How `isNew` parameter works
2. [renderers.js](ui/renderers.js:315-377) - Where "New Character" button is rendered
3. [uiManager.js](ui/uiManager.js:476-809) - Event handlers for create/save/cancel
4. [style.css](style.css:2015-2038) - Button styling

**Key Pattern Discovered:**
```javascript
// Character creation uses a temporary ID pattern:
const tempId = `char_new_${Date.now()}`;

// When saving, validates and generates final ID:
const newCharId = `char_${namePart}_${timestamp}`;
```

#### Phase 2: Add "New Relationship" Button
**File:** `ui/renderers.js:640-650, 800-806`

Added button in two places:
1. When relationship graph is empty (line 642-648)
2. After all relationship cards (line 800-806)

```javascript
const addBtnHtml = `
    <button class="sbt-add-relationship-btn" title="手动创建新关系">
        <i class="fa-solid fa-heart-circle-plus fa-fw"></i> 新建关系
    </button>
`;
```

**Note:** Icon choice `fa-heart-circle-plus` matches the relationship theme (heart icon).

#### Phase 3: Extend Modal to Support New Mode
**File:** `ui/renderers/relationshipModal.js:13-47, 159-188`

**Changes:**
1. Added `isNew` parameter to function signature
2. Created empty edge template when `isNew === true`:
```javascript
if (isNew) {
    edge = {
        id: edgeId,
        participants: ['', ''],
        relationship_label: '',
        emotional_weight: 5,
        timeline: { meeting_status: '未知', ... },
        narrative_status: { unresolved_tension: [], ... },
        tension_engine: { conflict_source: '', ... }
    };
}
```

3. Added participant selector (dropdown menus) for character selection:
```javascript
participantSelectorHtml = `
    <div class="sbt-rel-participant-selectors">
        <select class="sbt-rel-participant-select" data-participant-index="0">
            <option value="">选择角色1</option>
            ${characterOptions}
        </select>
        <i class="fa-solid fa-heart"></i>
        <select class="sbt-rel-participant-select" data-participant-index="1">
            <option value="">选择角色2</option>
            ${characterOptions}
        </select>
    </div>
`;
```

4. Updated button labels:
   - New mode: "创建关系" (Create Relationship)
   - Edit mode: "保存" (Save)
   - Hide delete button in new mode

#### Phase 4: Add Event Handlers
**File:** `ui/uiManager.js:940-950, 961-976, 978-1134, 1136-1188`

**1. New Button Click Handler (940-950):**
```javascript
$wrapper.on('click', '.sbt-add-relationship-btn', function() {
    const tempId = `edge_new_${Date.now()}`;
    showRelationshipDetailModal(tempId, effectiveState, true, true);
});
```

**2. Cancel Handler with New Mode Detection (961-976):**
```javascript
if (edgeId.startsWith('edge_new_')) {
    $('#sbt-relationship-detail-panel').hide(); // New mode: close panel
} else {
    showRelationshipDetailModal(edgeId, effectiveState, false, false); // Edit mode: return to view
}
```

**3. Save Handler with Validation (978-1134):**

Key validation logic:
```javascript
// Validate both participants are selected
if (!participant1 || !participant2) {
    deps.toastr.error('请选择两个角色建立关系', '保存失败');
    return;
}

// Prevent same character
if (participant1 === participant2) {
    deps.toastr.error('不能选择同一个角色', '保存失败');
    return;
}

// Check for duplicate relationships
const existingEdge = relationshipGraph.edges.find(e =>
    (e.participants[0] === participant1 && e.participants[1] === participant2) ||
    (e.participants[0] === participant2 && e.participants[1] === participant1)
);
```

Generate final ID:
```javascript
const newEdgeId = `edge_${participant1}_${participant2}_${timestamp}`;
```

**4. Delete Handler (1136-1188):**
```javascript
// Confirmation with participant names
if (!confirm(`确定要删除「${participant1} ❤ ${participant2}」的关系...`)) return;

// Remove from edges array
relationshipGraph.edges.splice(edgeIndex, 1);
```

#### Phase 5: Add CSS Styling
**File:** `style.css:2040-2064`

**Critical Issue Discovered:** Initial implementation forgot styling!

**User Feedback:** "没有颜色啊，你美化了吗？我的要求是和我们角色档案的新建角色按钮风格保持一致"

**Fix:** Copy exact styles from `.sbt-add-character-btn`:
```css
.sbt-add-relationship-btn {
    background-color: rgba(10, 132, 255, 0.08);
    border: 2px dashed rgba(10, 132, 255, 0.4);
    color: var(--sbt-primary-accent);
    padding: 10px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    font-size: 0.9em;
    transition: all 0.2s ease;
    margin-bottom: 12px;
    width: 100%;
}

.sbt-add-relationship-btn:hover {
    background-color: rgba(10, 132, 255, 0.15);
    border-style: solid;
    border-color: var(--sbt-primary-accent);
    transform: translateY(-1px);
}
```

### Key Lessons from This Implementation

#### 1. Pattern Replication Strategy
When user says "就像其它档案的新建逻辑一样" (just like other archive creation logic):
- **Study the reference implementation thoroughly**
- **Copy the exact pattern**, including:
  - Temporary ID generation (`{type}_new_${timestamp}`)
  - Final ID generation (`{type}_${key}_${timestamp}`)
  - Button styling (colors, borders, hover effects)
  - Event handler structure (new/cancel/save/delete)
  - Validation logic

#### 2. The Styling Gotcha
**Critical Pattern:** When adding a new button type, **always check if similar buttons have custom CSS**.

**Detection:**
```bash
# Search for existing button styles
grep -r "sbt-add-.*-btn" style.css
```

**User Expectation:** Visual consistency across all "add new" buttons

#### 3. Temporary ID Pattern
**Purpose:** Distinguish new items from existing items during edit flow

**Pattern:**
```javascript
// Temporary ID for new items
const tempId = `{type}_new_${Date.now()}`;

// Detection in handlers
if (id.startsWith('{type}_new_')) {
    // New mode logic
} else {
    // Edit mode logic
}
```

**Used in:** Character creation, Relationship creation, Worldview creation

#### 4. Validation Checklist for Relationship Creation
When creating relationships between entities:
- ✅ Both participants must be selected
- ✅ Participants must be different entities
- ✅ Check for duplicate relationships (A→B or B→A)
- ✅ Generate meaningful IDs that include participant identifiers
- ✅ Initialize all required nested objects (timeline, narrative_status, tension_engine)

#### 5. User Feedback Integration
**Initial Implementation:** Missed CSS styling
**User Response:** Direct and specific - "没有颜色啊" (There's no color)
**Fix:** Immediately replicated character button styles

**Pattern:** User values **visual consistency**. When they say "和...风格保持一致" (maintain consistency with...), they expect:
- Exact same colors
- Exact same hover effects
- Exact same spacing and sizing

### Code Locations Reference

| Feature | File | Lines |
|---------|------|-------|
| New button rendering | `ui/renderers.js` | 642-648, 800-806 |
| Modal new mode support | `ui/renderers/relationshipModal.js` | 13-47, 159-188, 125-152 |
| New button click handler | `ui/uiManager.js` | 940-950 |
| Cancel handler | `ui/uiManager.js` | 961-976 |
| Save handler with validation | `ui/uiManager.js` | 978-1134 |
| Delete handler | `ui/uiManager.js` | 1136-1188 |
| Button CSS styling | `style.css` | 2040-2064 |

### Testing Checklist for "Add New" Features

When implementing any "create new" feature:
- [ ] "New" button renders in both empty and populated states
- [ ] Clicking "New" button opens modal in edit mode with `isNew=true`
- [ ] Cancel button closes panel (doesn't switch to view mode)
- [ ] Save button validates required fields
- [ ] Save generates proper final ID
- [ ] Save adds item to correct data structure
- [ ] Delete button hidden in new mode, visible in edit mode
- [ ] Button has matching CSS styles (dashed border, hover effect)
- [ ] Success/error toasts show appropriate messages
- [ ] Panel closes after successful creation
- [ ] EventBus emits update event for UI refresh

### Pattern Template for Future "Add New" Features

```javascript
// 1. Add button in renderer
const addBtnHtml = `
    <button class="sbt-add-{type}-btn" title="手动创建新{type}">
        <i class="fa-solid fa-{icon} fa-fw"></i> 新建{type}
    </button>
`;

// 2. Extend modal function
export function show{Type}DetailModal(id, chapterState, editMode = false, isNew = false) {
    if (isNew) {
        item = { /* empty template */ };
    }
}

// 3. Add click handler
$wrapper.on('click', '.sbt-add-{type}-btn', function() {
    const tempId = `{type}_new_${Date.now()}`;
    show{Type}DetailModal(tempId, effectiveState, true, true);
});

// 4. Update cancel handler
if (id.startsWith('{type}_new_')) {
    $('#sbt-{type}-detail-panel').hide();
} else {
    show{Type}DetailModal(id, effectiveState, false, false);
}

// 5. Update save handler
if (isNew) {
    // Validate required fields
    // Generate final ID: `{type}_{key}_${timestamp}`
    // Add to data structure
} else {
    // Update existing item
}

// 6. Add CSS
.sbt-add-{type}-btn {
    background-color: rgba(10, 132, 255, 0.08);
    border: 2px dashed rgba(10, 132, 255, 0.4);
    /* ... same as character button ... */
}
```

### User Communication Pattern Observed

**Request Style:** "就像...一样" (just like...) or "学习...逻辑" (study the logic of...)
**Meaning:** Exact pattern replication expected, not creative variation
**Response:** Study reference → Copy pattern → Verify consistency

**Feedback Style:** "没有颜色啊" (there's no color) - Direct observation of missing element
**Response:** Immediate fix with exact match to reference implementation
