    async function fetchDisplayScorecards() {
      const client = getSupabaseClient();
      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("scorecards")
        .select("id, household_id, name, increments, players, show_history, allow_negative, created_at, archived_at")
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .is("archived_at", null)
        .order("created_at", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data.map(mapScorecardRow);
    }

    async function fetchDisplayScorecardSessions(scorecards) {
      const client = getSupabaseClient();
      const ids = (Array.isArray(scorecards) ? scorecards : []).map((scorecard) => scorecard.id).filter(Boolean);
      const sessionsById = new Map(ids.map((id) => [id, []]));

      if (!client) {
        return null;
      }

      if (!ids.length) {
        return sessionsById;
      }

      const { data, error } = await client
        .from("scorecard_sessions")
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .in("scorecard_id", ids)
        .order("started_at", { ascending: false });

      if (error || !Array.isArray(data)) {
        return null;
      }

      data.forEach((row) => {
        const scorecard = scorecards.find((item) => item.id === row.scorecard_id);
        if (!scorecard) {
          return;
        }
        const list = sessionsById.get(scorecard.id) || [];
        list.push(mapScorecardSessionRow(row, scorecard));
        sessionsById.set(scorecard.id, list);
      });

      return sessionsById;
    }

    async function createDisplayScorecardSession(scorecard) {
      const client = getSupabaseClient();
      if (!client || !scorecard) {
        return null;
      }

      const payload = {
        scorecard_id: scorecard.id,
        household_id: DISPLAY_HOUSEHOLD_ID,
        started_at: new Date().toISOString(),
        scores: createScorecardZeroScores(scorecard.players),
        score_events: [],
        is_final_jeopardy: false
      };
      const { data, error } = await client
        .from("scorecard_sessions")
        .insert(payload)
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .single();

      if (!error && data) {
        return mapScorecardSessionRow(data, scorecard);
      }

      const { data: existingRow, error: existingError } = await client
        .from("scorecard_sessions")
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .eq("scorecard_id", scorecard.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingError || !existingRow) {
        return null;
      }

      return mapScorecardSessionRow(existingRow, scorecard);
    }

    async function ensureDisplayScorecardSessions(scorecards, sessionsById) {
      const nextMap = sessionsById instanceof Map ? new Map(sessionsById) : new Map();

      for (const scorecard of (Array.isArray(scorecards) ? scorecards : [])) {
        const sessions = (nextMap.get(scorecard.id) || []).slice();
        const hasActiveSession = sessions.some((session) => !session.endedAt);
        if (!hasActiveSession && !sessions.length) {
          const freshSession = await createDisplayScorecardSession(scorecard);
          if (freshSession) {
            sessions.unshift(freshSession);
          }
        }
        nextMap.set(scorecard.id, sessions);
      }

      return nextMap;
    }

    function getScorecardSessions(scorecardId) {
      return (cachedScorecardSessionsById.get(scorecardId) || []).slice().sort((a, b) =>
        new Date(b.startedAt || b.createdAt || 0) - new Date(a.startedAt || a.createdAt || 0)
      );
    }

    function getActiveScorecardSession(scorecardId) {
      return getScorecardSessions(scorecardId).find((session) => !session.endedAt) || null;
    }

    function getPendingWinnerScorecardSession(scorecardId) {
      if (getActiveScorecardSession(scorecardId)) {
        return null;
      }

      const sessions = getScorecardSessions(scorecardId);
      const pendingSessionId = getScorecardPendingWinnerSessionId(scorecardId);
      if (pendingSessionId) {
        const pendingSession = sessions.find((session) => session.id === pendingSessionId && session.endedAt);
        if (pendingSession) {
          return pendingSession;
        }
      }

      return sessions.find((session) => session.endedAt) || null;
    }

    function clearDisplayScorecardArchiveConfirm() {
      displayScorecardArchiveConfirmId = "";
    }

    function getScorecardWinnerSummary(scorecard, session) {
      const leaders = getScorecardLeaders(session?.scores, scorecard?.players || []);
      const isTie = leaders.length > 1;
      const accentPlayer = scorecard?.players?.find((player) => player.name === leaders[0]) || scorecard?.players?.[0] || null;
      return {
        leaders,
        isTie,
        heroLabel: isTie ? "It's a tie! 🤝" : `${leaders[0] || session?.winner || "Winner"} wins!`,
        accentColor: accentPlayer?.color || "var(--color-accent)"
      };
    }

    function getDisplayLocalBonusState(scorecardId) {
      const activeSession = getActiveScorecardSession(scorecardId);
      const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
      const state = displayScorecardBonusStateById.get(scorecardId);
      if (!state) {
        if (!activeSession || !scorecard || !activeSession.isFinalJeopardy || !isScorecardBonusRoundActive(activeSession)) {
          return null;
        }

        const persistedState = createDisplayLocalBonusState(activeSession.id, scorecard.players, activeSession);
        displayScorecardBonusStateById.set(scorecardId, persistedState);
        return persistedState;
      }

      if (!activeSession || activeSession.id !== state.sessionId) {
        displayScorecardBonusStateById.delete(scorecardId);
        return null;
      }

      return state;
    }

    function setDisplayLocalBonusState(scorecardId, nextState) {
      if (!scorecardId) {
        return;
      }

      const existingAdvanceTimer = displayScorecardBonusAdvanceTimerById.get(scorecardId);
      if (existingAdvanceTimer && (!nextState || nextState.phase !== "entry")) {
        window.clearTimeout(existingAdvanceTimer);
        displayScorecardBonusAdvanceTimerById.delete(scorecardId);
      }

      if (!nextState) {
        displayScorecardBonusStateById.delete(scorecardId);
        return;
      }

      displayScorecardBonusStateById.set(scorecardId, nextState);
    }

    function createDisplayLocalBonusState(sessionId, players, session = null) {
      const playerList = normalizeScorecardPlayers(players);
      const phase = getScorecardBonusPhase(session) || SCORECARD_BONUS_PHASES.entry;
      const wagers = getScorecardBonusWagers(session, playerList);
      const results = getScorecardBonusResults(session, playerList);
      return {
        sessionId,
        phase,
        draftWagers: { ...wagers },
        wagers: { ...wagers },
        wagerErrors: {},
        results,
        playerIds: playerList.map((player) => player.id),
        revealed: phase === SCORECARD_BONUS_PHASES.reveal
      };
    }

    function allDisplayLocalBonusWagersLocked(state) {
      return !!state && Array.isArray(state.playerIds) && state.playerIds.length > 0
        && state.playerIds.every((playerId) => Number.isFinite(Number(state.wagers[playerId])));
    }

    function allDisplayLocalBonusResultsSelected(state) {
      return !!state && Array.isArray(state.playerIds) && state.playerIds.length > 0
        && state.playerIds.every((playerId) => {
          const result = String(state.results[playerId] || "").trim().toLowerCase();
          return result === "correct" || result === "incorrect";
        });
    }

    function sanitizeDisplayBonusWagerInputValue(rawValue) {
      return String(rawValue || "").replace(/\D+/g, "");
    }

    function getDisplayBonusPeekKey(scorecardId, playerName) {
      return `${scorecardId}:${playerName}`;
    }

    function setDisplayBonusPeekState(scorecardId, playerName, isVisible) {
      const key = getDisplayBonusPeekKey(scorecardId, playerName);
      const input = Array.from(track.querySelectorAll("[data-scorecard-bonus-input]")).find((element) =>
        element.getAttribute("data-scorecard-bonus-input") === key
      );
      const button = Array.from(track.querySelectorAll("[data-action='scorecard-bonus-peek']")).find((element) =>
        element.getAttribute("data-scorecard-bonus-peek-target") === key
      );
      if (input) {
        input.type = isVisible ? "text" : "password";
      }
      if (button) {
        button.innerHTML = `<i data-lucide="${isVisible ? "eye-off" : "eye"}"></i>`;
      }
      refreshIcons();
    }

    function triggerDisplayBonusPeek(scorecardId, playerName) {
      const key = getDisplayBonusPeekKey(scorecardId, playerName);
      const input = Array.from(track.querySelectorAll("[data-scorecard-bonus-input]")).find((element) =>
        element.getAttribute("data-scorecard-bonus-input") === key
      );
      resetAutoRotate("scorecard-bonus-peek");
      const existingTimer = displayScorecardBonusPeekTimerByKey.get(key);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        displayScorecardBonusPeekTimerByKey.delete(key);
      }

      if (input?.type === "text") {
        setDisplayBonusPeekState(scorecardId, playerName, false);
        return;
      }

      setDisplayBonusPeekState(scorecardId, playerName, true);
      const timerId = window.setTimeout(() => {
        displayScorecardBonusPeekTimerByKey.delete(key);
        setDisplayBonusPeekState(scorecardId, playerName, false);
      }, 2000);
      displayScorecardBonusPeekTimerByKey.set(key, timerId);
    }

    function isDisplayScorecardEnabled(scorecardId, activeScreens) {
      const normalizedScreens = Array.isArray(activeScreens) ? activeScreens : [];
      const hasIndividualFlags = normalizedScreens.some((key) => isScorecardScreenKey(key));
      const scorecardKey = buildScorecardScreenKey(scorecardId);
      return normalizedScreens.includes("scorecards")
        && (!hasIndividualFlags || normalizedScreens.includes(scorecardKey));
    }

    function getScorecardOrder(screenOrder, scorecards, activeScreens) {
      const order = Array.isArray(screenOrder) ? screenOrder : [];
      const seen = new Set();
      const ordered = [];

      order.forEach((key) => {
        const scorecardId = getScorecardIdFromScreenKey(key);
        if (!scorecardId || seen.has(scorecardId)) {
          return;
        }
        const scorecard = scorecards.find((item) => item.id === scorecardId);
        if (!scorecard || !isDisplayScorecardEnabled(scorecard.id, activeScreens)) {
          return;
        }
        ordered.push(scorecard);
        seen.add(scorecardId);
      });

      scorecards.forEach((scorecard) => {
        if (!seen.has(scorecard.id) && isDisplayScorecardEnabled(scorecard.id, activeScreens)) {
          ordered.push(scorecard);
          seen.add(scorecard.id);
        }
      });

      return ordered;
    }

    function getScorecardSelection(scorecard) {
      const selected = scorecardSelectionById.get(scorecard.id);
      if (selected && scorecard.players.some((player) => player.name === selected)) {
        return selected;
      }
      const fallback = scorecard.players[0]?.name || "";
      if (fallback) {
        scorecardSelectionById.set(scorecard.id, fallback);
      }
      return fallback;
    }

    function chunkScorecardIncrements(increments, size = 3) {
      const rows = [];
      for (let index = 0; index < increments.length; index += size) {
        rows.push(increments.slice(index, index + size));
      }
      return rows;
    }

    function buildDisplayScorecardIncrementControls(scorecard, actionBuilder) {
      if (scorecard.increments.length > 10) {
        return `
          <div class="scorecard-increment-scroll" tabindex="0" aria-label="Score adjustments">
            ${scorecard.increments.map(actionBuilder).join("")}
          </div>
        `;
      }

      return `
        <div class="scorecard-increment-stack">
          ${chunkScorecardIncrements(scorecard.increments).map((row) => `
            <div class="scorecard-increment-row">
              ${row.map(actionBuilder).join("")}
            </div>
          `).join("")}
        </div>
      `;
    }

    function buildScorecardHistoryMarkup(scorecard) {
      const sessions = getScorecardSessions(scorecard.id).filter((session) => session.endedAt).slice(0, 5);
      if (!scorecard.showHistory || !sessions.length) {
        return "";
      }

      return `
        <details class="scorecard-history">
          <summary>Past games</summary>
          <div class="scorecard-history-list">
            ${sessions.map((session) => `
              <article class="scorecard-history-item">
                <div class="scorecard-history-head">
                  <strong>${escapeHtml(formatScorecardSessionDate(session.endedAt || session.startedAt))}</strong>
                  <span>${escapeHtml(session.winner || "Tie")}</span>
                </div>
                <div class="scorecard-history-scores">
                  ${scorecard.players.map((player) => `
                    <span class="scorecard-history-pill" style="background:${escapeHtml(hexToRgba(player.color, 0.14))};color:${escapeHtml(player.color)}">${escapeHtml(player.name)} ${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session.scores, player, scorecard.players)))}</span>
                  `).join("")}
                </div>
              </article>
            `).join("")}
          </div>
        </details>
      `;
    }

    function buildScorecardColumnLayout(scorecard, session) {
      const topScore = Math.max(...scorecard.players.map((player) => getScorecardPlayerScore(session.scores, player, scorecard.players)));
      const allZero = scorecard.players.every((player) => getScorecardPlayerScore(session.scores, player, scorecard.players) === 0);
      return `
        <div class="scorecard-columns">
          ${scorecard.players.map((player) => {
            const score = getScorecardPlayerScore(session.scores, player, scorecard.players);
            const isLeader = score === topScore && !allZero;
            return `
              <article class="scorecard-player-card${isLeader ? " is-leading" : ""}" data-scorecard-player-card="${escapeHtml(player.name)}">
                <div class="scorecard-player-name" style="color:${escapeHtml(player.color)}">${escapeHtml(player.name)}</div>
                <div class="scorecard-player-score" data-scorecard-score="${escapeHtml(scorecard.id)}:${escapeHtml(player.name)}">${escapeHtml(formatScorecardScore(score))}</div>
                <div class="scorecard-button-grid">
                  ${buildDisplayScorecardIncrementControls(scorecard, (increment) => `
                    <button class="scorecard-action-btn" type="button" data-action="scorecard-display-adjust" data-scorecard-id="${escapeHtml(scorecard.id)}" data-player-name="${escapeHtml(player.name)}" data-increment="${escapeHtml(increment)}">
                      ${increment > 0 ? "+" : ""}${escapeHtml(formatScorecardScore(increment))}
                    </button>
                  `)}
                </div>
              </article>
            `;
          }).join("")}
        </div>
      `;
    }

    function buildScorecardRowLayout(scorecard, session) {
      const selectedPlayer = getScorecardSelection(scorecard);
      return `
        <div class="scorecard-rows">
          <div class="scorecard-player-row-list">
            ${scorecard.players.map((player) => {
              const isSelected = player.name === selectedPlayer;
              return `
                <button class="scorecard-player-row${isSelected ? " is-selected" : ""}" type="button" data-action="scorecard-select-player" data-scorecard-id="${escapeHtml(scorecard.id)}" data-player-name="${escapeHtml(player.name)}">
                  <span class="scorecard-player-row-name">
                    <span class="scorecard-player-dot" style="background:${escapeHtml(player.color)}"></span>
                    ${escapeHtml(player.name)}
                  </span>
                  <strong data-scorecard-score="${escapeHtml(scorecard.id)}:${escapeHtml(player.name)}">${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session.scores, player, scorecard.players)))}</strong>
                </button>
              `;
            }).join("")}
          </div>
          <div class="scorecard-shared-buttons">
            ${buildDisplayScorecardIncrementControls(scorecard, (increment) => `
              <button class="scorecard-action-btn" type="button" data-action="scorecard-display-adjust-selected" data-scorecard-id="${escapeHtml(scorecard.id)}" data-increment="${escapeHtml(increment)}">
                ${increment > 0 ? "+" : ""}${escapeHtml(formatScorecardScore(increment))}
              </button>
            `)}
          </div>
        </div>
      `;
    }

    function buildDisplayBonusRoundMarkup(scorecard, session, bonusState) {
      const lockedCount = Object.keys(bonusState?.wagers || {}).length;

      if (bonusState?.phase === "entry") {
        return `
          <div class="scorecard-bonus-screen">
            <div class="scorecard-bonus-status">
              <strong>${escapeHtml(lockedCount)} of ${escapeHtml(scorecard.players.length)} locked</strong>
              <span>Each player enters and locks their own wager.</span>
            </div>
            <div class="scorecard-bonus-stack">
              ${scorecard.players.map((player) => {
                const currentScore = Math.max(0, getScorecardPlayerScore(session.scores, player, scorecard.players));
                const lockedWager = bonusState?.wagers?.[player.id];
                const draftWager = bonusState?.draftWagers?.[player.id];
                const wagerError = String(bonusState?.wagerErrors?.[player.id] || "").trim();
                const isLocked = Number.isFinite(Number(lockedWager));
                const inputKey = `${scorecard.id}:${player.name}`;
                return `
                  <div class="scorecard-bonus-row${isLocked ? " is-locked" : ""}">
                    <div>
                      <strong>${escapeHtml(player.name)}</strong>
                      <div class="scorecard-bonus-note">Current score: ${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session.scores, player, scorecard.players)))}</div>
                    </div>
                    <div class="scorecard-bonus-entry-side">
                      <div class="scorecard-bonus-entry-controls">
                        <div class="scorecard-bonus-input-wrap${isLocked ? " is-locked" : ""}">
                          <input class="scorecard-bonus-input${isLocked ? " is-locked" : ""}" type="password" inputmode="numeric" autocomplete="off" pattern="[0-9]*" min="0" max="${escapeHtml(currentScore)}" value="${escapeHtml(isLocked ? String(lockedWager) : String(draftWager || ""))}" data-scorecard-bonus-input="${escapeHtml(inputKey)}" data-scorecard-bonus-max="${escapeHtml(currentScore)}"${isLocked ? " disabled" : ""}>
                          ${isLocked ? "" : `<button class="scorecard-bonus-peek-btn" type="button" data-action="scorecard-bonus-peek" data-scorecard-bonus-peek-target="${escapeHtml(inputKey)}"${draftWager ? "" : " disabled"} aria-label="Toggle wager visibility"><i data-lucide="eye"></i></button>`}
                        </div>
                        <button class="scorecard-secondary-btn scorecard-bonus-lock-btn${isLocked ? " is-locked" : ""}" type="button" data-action="scorecard-bonus-lock" data-scorecard-id="${escapeHtml(scorecard.id)}" data-player-name="${escapeHtml(player.name)}"${isLocked ? " disabled" : ""}>${isLocked ? '<i data-lucide="lock"></i><span>Locked</span>' : "Lock in"}</button>
                      </div>
                      <div class="scorecard-bonus-error"${wagerError ? "" : ' hidden'} data-scorecard-bonus-error="${escapeHtml(inputKey)}">${escapeHtml(wagerError)}</div>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
            <div class="scorecard-secondary-actions">
              <button class="scorecard-secondary-btn" type="button" data-action="scorecard-bonus-cancel" data-scorecard-id="${escapeHtml(scorecard.id)}">Cancel bonus round</button>
            </div>
          </div>
        `;
      }

      const buildRevealCards = () => `
        <div class="scorecard-bonus-reveal-grid">
          ${scorecard.players.map((player) => {
            const beforeScore = getScorecardPlayerScore(session.scores, player, scorecard.players);
            const wager = Math.max(0, Number(bonusState?.wagers?.[player.id]) || 0);
            const result = String(bonusState?.results?.[player.id] || "").trim().toLowerCase();
            const isCorrect = result === "correct";
            const impact = isCorrect ? wager : -wager;
            const impactLabel = `${impact >= 0 ? "+" : "-"}${formatScorecardScore(Math.abs(impact))}`;
            return `
              <article class="scorecard-bonus-reveal-card ${isCorrect ? "is-correct" : "is-incorrect"}">
                <div class="scorecard-bonus-player-name" style="color:${escapeHtml(player.color)}">${escapeHtml(player.name)}</div>
                <div class="scorecard-bonus-reveal-value">${escapeHtml(impactLabel)}</div>
                <div class="scorecard-bonus-before">Before: ${escapeHtml(formatScorecardScore(beforeScore))}</div>
                <div class="scorecard-bonus-result-label ${isCorrect ? "is-correct" : "is-incorrect"}">${escapeHtml(isCorrect ? "Correct" : "Incorrect")}</div>
              </article>
            `;
          }).join("")}
        </div>
      `;

      return `
        <div class="scorecard-bonus-screen scorecard-bonus-screen--revealed">
          <div class="scorecard-bonus-status">
            <strong>${bonusState?.revealed ? "Wagers revealed" : "Set results"}</strong>
            <span>${bonusState?.revealed ? "Review the revealed wagers, then apply the round." : "Mark each player correct or incorrect before revealing wagers."}</span>
          </div>
          ${bonusState?.revealed ? buildRevealCards() : ""}
          <form class="scorecard-bonus-results-form" data-scorecard-bonus-results="${escapeHtml(scorecard.id)}"${bonusState?.revealed ? "" : ' data-scorecard-bonus-editable="true"'}>
            ${bonusState?.revealed ? "" : scorecard.players.map((player) => `
              <div class="scorecard-bonus-result-row">
                <strong>${escapeHtml(player.name)}</strong>
                <div class="scorecard-bonus-toggle-row">
                  <label class="scorecard-bonus-toggle-pill is-correct">
                    <input type="radio" name="result_${escapeHtml(player.id)}" value="correct"${bonusState?.results?.[player.id] === "correct" ? " checked" : ""}>
                    <span>Correct</span>
                  </label>
                  <label class="scorecard-bonus-toggle-pill is-incorrect">
                    <input type="radio" name="result_${escapeHtml(player.id)}" value="incorrect"${bonusState?.results?.[player.id] === "incorrect" ? " checked" : ""}>
                    <span>Incorrect</span>
                  </label>
                </div>
              </div>
            `).join("")}
            <div class="scorecard-secondary-actions">
              <button class="scorecard-secondary-btn" type="button" data-action="${bonusState?.revealed ? "scorecard-bonus-back" : "scorecard-bonus-cancel"}" data-scorecard-id="${escapeHtml(scorecard.id)}">${bonusState?.revealed ? "Back" : "Cancel bonus round"}</button>
              ${bonusState?.revealed
                ? '<button class="scorecard-secondary-btn scorecard-secondary-btn--accent" type="submit">Apply results</button>'
                : `<button class="scorecard-secondary-btn scorecard-secondary-btn--accent" type="button" data-action="scorecard-bonus-reveal" data-scorecard-id="${escapeHtml(scorecard.id)}"${allDisplayLocalBonusResultsSelected(bonusState) ? "" : " disabled"}>Reveal wagers</button>`}
            </div>
          </form>
        </div>
      `;
    }

    function buildScorecardScreenMarkup(scorecard) {
      const activeSession = getActiveScorecardSession(scorecard.id);
      const pendingWinnerSession = getPendingWinnerScorecardSession(scorecard.id);
      const session = activeSession || pendingWinnerSession;
      if (!session) {
        return "";
      }

      const label = scorecard.name.toUpperCase();
      const localBonusState = getDisplayLocalBonusState(scorecard.id);
      const isBonusActive = !!localBonusState;
      const layoutMarkup = isBonusActive
        ? buildDisplayBonusRoundMarkup(scorecard, activeSession, localBonusState)
        : scorecard.players.length <= 4
          ? buildScorecardColumnLayout(scorecard, session)
          : buildScorecardRowLayout(scorecard, session);
      const hasUndo = activeSession && getScorecardActionHistory(activeSession.id).length > 0;

      return `
        <div class="panel">
          <div class="screen-title-row">
            <div class="eyebrow"><i data-lucide="trophy"></i> ${escapeHtml(label)}</div>
          </div>
          <div class="scorecard-layout">
            ${layoutMarkup}
            ${isBonusActive ? "" : activeSession ? `
              <div class="scorecard-secondary-actions">
                <button class="scorecard-secondary-btn" type="button" data-action="scorecard-display-undo" data-scorecard-id="${escapeHtml(scorecard.id)}"${hasUndo ? "" : " disabled"}>Undo</button>
                <button class="scorecard-secondary-btn" type="button" data-action="scorecard-display-bonus-round" data-scorecard-id="${escapeHtml(scorecard.id)}">Bonus round</button>
                <button class="scorecard-secondary-btn" type="button" data-action="scorecard-display-end-game" data-scorecard-id="${escapeHtml(scorecard.id)}">End game</button>
              </div>
            ` : ""}
            ${buildScorecardHistoryMarkup(scorecard)}
          </div>
        </div>
      `;
    }

    function renderScorecards(scorecards) {
      let existingScreens = Array.from(track.querySelectorAll(".scorecard-screen"));
      existingScreens.forEach((screen) => screen.remove());
      const displaySettings = normalizeDisplaySettings(cachedHouseholdConfig?.display_settings);

      const orderedScorecards = getScorecardOrder(displaySettings.screen_order, scorecards, displaySettings.active_screens);
      if (!orderedScorecards.length) {
        syncScorecardCelebrationOverlay();
        const screenOrder = Array.isArray(displaySettings.screen_order) ? displaySettings.screen_order : DISPLAY_SCREEN_KEYS;
        applyScreenOrder(screenOrder);
        reconcileRotationState();
        return;
      }

      const anchor = track.querySelector(".rsvp-screen");
      orderedScorecards.forEach((scorecard) => {
        const section = document.createElement("section");
        section.className = "screen scorecard-screen";
        section.dataset.scorecardId = scorecard.id;
        section.dataset.screenKey = buildScorecardScreenKey(scorecard.id);
        section.innerHTML = buildScorecardScreenMarkup(scorecard);
        track.insertBefore(section, anchor || null);
      });

      applyActiveScreens(displaySettings.active_screens || DISPLAY_SCREEN_KEYS);
      applyScreenOrder(displaySettings.screen_order || DISPLAY_SCREEN_KEYS);
      reconcileRotationState();
      syncScorecardCelebrationOverlay();
      refreshIcons();
    }

    function stopScorecardCelebrationEffects() {
      scorecardCelebrationRunId += 1;
      scorecardCelebrationTimers.forEach((timerId) => window.clearTimeout(timerId));
      scorecardCelebrationTimers = [];
      document.querySelectorAll(".todo-celebration-layer").forEach((layer) => layer.remove());
    }

    function startScorecardCelebrationEffects() {
      stopScorecardCelebrationEffects();
      if (typeof confetti === "undefined") {
        playFallbackParticleBurst({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2
        });
        return;
      }

      const animations = ["confetti-burst", "star-shower", "fireworks"]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.random() > 0.5 ? 3 : 2);
      const runId = scorecardCelebrationRunId;
      const runners = {
        "confetti-burst": playCanvasConfettiBurst,
        "star-shower": playCanvasStarShower,
        "fireworks": playCanvasFireworks
      };

      animations.forEach((animationName, index) => {
        const timerId = window.setTimeout(() => {
          if (runId !== scorecardCelebrationRunId) {
            return;
          }
          runners[animationName]?.();
        }, index * 3200);
        scorecardCelebrationTimers.push(timerId);
      });
    }

    function syncScorecardCelebrationOverlay() {
      const overlay = document.getElementById("scorecard-celebration-overlay");
      const titleEl = document.getElementById("scorecard-celebration-title");
      const iconEl = document.getElementById("scorecard-celebration-icon");
      const scoresEl = document.getElementById("scorecard-celebration-scores");
      const buttonEl = document.getElementById("scorecard-celebration-new-game");
      const archiveButtonEl = document.getElementById("scorecard-celebration-archive");
      if (!overlay || !titleEl || !iconEl || !scoresEl || !buttonEl || !archiveButtonEl) {
        return;
      }

      const pending = cachedScorecards
        .map((scorecard) => ({
          scorecard,
          session: getPendingWinnerScorecardSession(scorecard.id)
        }))
        .find((entry) => entry.session);

      if (!pending) {
        overlay.hidden = true;
        delete overlay.dataset.scorecardId;
        delete overlay.dataset.sessionId;
        clearDisplayScorecardArchiveConfirm();
        stopScorecardCelebrationEffects();
        resetAutoRotate("scorecard-celebration-close");
        return;
      }

      const { scorecard, session } = pending;
      const winnerSummary = getScorecardWinnerSummary(scorecard, session);
      const highlightedLeaders = new Set(winnerSummary.leaders);
      const shouldCelebrate = getScorecardPendingWinnerSessionId(scorecard.id) === session.id;
      overlay.hidden = false;
      pauseAutoRotate("scorecard-celebration-overlay");
      overlay.dataset.scorecardId = scorecard.id;
      overlay.style.setProperty("--scorecard-celebration-accent", winnerSummary.accentColor);
      titleEl.textContent = winnerSummary.heroLabel;
      iconEl.innerHTML = '<i data-lucide="trophy"></i>';
      archiveButtonEl.textContent = displayScorecardArchiveConfirmId === scorecard.id ? "Confirm archive" : "Archive scorecard";
      scoresEl.innerHTML = scorecard.players.map((player) => `
        <div class="scorecard-celebration-score-row${highlightedLeaders.has(player.name) ? " is-winner" : ""}">
          <span class="scorecard-celebration-score-name" style="color:${escapeHtml(player.color)}">${escapeHtml(player.name)}</span>
          <strong>${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session.scores, player, scorecard.players)))}</strong>
        </div>
      `).join("");

      if (overlay.dataset.sessionId !== session.id) {
        overlay.dataset.sessionId = session.id;
        clearDisplayScorecardArchiveConfirm();
        if (shouldCelebrate) {
          startScorecardCelebrationEffects();
        } else {
          stopScorecardCelebrationEffects();
        }
      }

      refreshIcons();
    }

    async function renderScorecardsWithData() {
      markPending("scorecards");
      const scorecards = await fetchDisplayScorecards();

      if (scorecards === null) {
        resolveScreen("scorecards");
        return;
      }

      let sessionsById = await fetchDisplayScorecardSessions(scorecards);
      if (sessionsById === null) {
        resolveScreen("scorecards");
        return;
      }

      sessionsById = await ensureDisplayScorecardSessions(scorecards, sessionsById);
      cachedScorecards = scorecards;
      cachedScorecardSessionsById = sessionsById;
      Array.from(displayScorecardBonusStateById.keys()).forEach((scorecardId) => {
        getDisplayLocalBonusState(scorecardId);
      });
      renderScorecards(scorecards);
      resolveScreen("scorecards");
    }

    function animateScorecardScore(scorecardId, playerName, increment) {
      const scoreEl = Array.from(document.querySelectorAll("[data-scorecard-score]")).find((element) =>
        element.getAttribute("data-scorecard-score") === `${scorecardId}:${playerName}`
      );
      if (!scoreEl) {
        return;
      }

      scoreEl.classList.remove("is-score-updating", "is-score-positive", "is-score-negative");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("is-score-updating");
      scoreEl.classList.add(increment >= 0 ? "is-score-positive" : "is-score-negative");
      window.setTimeout(() => {
        scoreEl.classList.remove("is-score-updating", "is-score-positive", "is-score-negative");
      }, 420);
    }

    async function adjustDisplayScorecardScore(scorecardId, playerName, increment) {
      const client = getSupabaseClient();
      const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
      const session = getActiveScorecardSession(scorecardId);
      const playerId = getScorecardPlayerId(scorecard?.players, playerName);
      if (!client || !scorecard || !session || !playerId) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      const nextScores = {
        ...session.scores,
        [playerId]: applyScorecardIncrement(getScorecardPlayerScore(session.scores, playerName, scorecard.players), Number(increment), scorecard.allowNegative)
      };
      const previousScore = getScorecardPlayerScore(session.scores, playerName, scorecard.players);
      const nextScore = Number(nextScores[playerId]) || 0;
      if (previousScore === nextScore) {
        return;
      }

      const scoreEvents = appendScoreEvents(session.scoreEvents, [
        buildScoreEvent(playerId, Number(increment), SCORE_EVENT_TYPES.increment)
      ], scorecard.players);
      const { data, error } = await client
        .from("scorecard_sessions")
        .update({
          scores: nextScores,
          score_events: scoreEvents
        })
        .eq("id", session.id)
        .eq("scorecard_id", scorecardId)
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .single();

      if (error || !data) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      pushScorecardActionHistory(session.id, {
        type: "increment",
        changes: [{
          playerName,
          previousScore,
          nextScore,
          increment: Number(increment)
        }]
      });

      cachedScorecardSessionsById.set(scorecardId, getScorecardSessions(scorecardId).map((item) =>
        item.id === session.id ? mapScorecardSessionRow(data, scorecard) : item
      ));
      renderScorecards(cachedScorecards);
      animateScorecardScore(scorecardId, playerName, Number(increment));
      resetAutoRotate("scorecard-adjust");
    }

    async function updateDisplayActiveScorecardSession(scorecardId, payload) {
      const client = getSupabaseClient();
      const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
      const session = getActiveScorecardSession(scorecardId);
      if (!client || !scorecard || !session) {
        return null;
      }

      const { data, error } = await client
        .from("scorecard_sessions")
        .update(payload)
        .eq("id", session.id)
        .eq("scorecard_id", scorecardId)
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .single();

      if (error || !data) {
        return null;
      }

      const nextSession = mapScorecardSessionRow(data, scorecard);
      cachedScorecardSessionsById.set(scorecardId, getScorecardSessions(scorecardId).map((item) =>
        item.id === session.id ? nextSession : item
      ));
      renderScorecards(cachedScorecards);
      syncScorecardCelebrationOverlay();
      return nextSession;
    }

    async function beginDisplayBonusRound(scorecardId) {
      const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
      const session = getActiveScorecardSession(scorecardId);
      if (!scorecard || !session) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      const nextState = createDisplayLocalBonusState(session.id, scorecard.players, {
        ...session,
        wagers: buildScorecardBonusWagers(scorecard.players, {}, SCORECARD_BONUS_PHASES.entry),
        wagerResults: null,
        isFinalJeopardy: true
      });
      const nextSession = await updateDisplayActiveScorecardSession(scorecardId, {
        wagers: buildScorecardBonusWagers(scorecard.players, {}, SCORECARD_BONUS_PHASES.entry),
        wager_results: null,
        is_final_jeopardy: true
      });
      if (!nextSession) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      setDisplayLocalBonusState(scorecardId, nextState);
      renderScorecards(cachedScorecards);
      resetAutoRotate("scorecard-bonus-start");
    }

    async function cancelDisplayScorecardBonusRound(scorecardId) {
      const nextSession = await updateDisplayActiveScorecardSession(scorecardId, {
        wagers: null,
        wager_results: null,
        is_final_jeopardy: false
      });
      if (!nextSession) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      setDisplayLocalBonusState(scorecardId, null);
      renderScorecards(cachedScorecards);
      resetAutoRotate("scorecard-bonus-cancel");
    }

    async function lockDisplayScorecardBonusWager(scorecardId, playerName, rawValue) {
      const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
      const session = getActiveScorecardSession(scorecardId);
      const localBonusState = getDisplayLocalBonusState(scorecardId);
      const playerId = getScorecardPlayerId(scorecard?.players, playerName);
      if (!scorecard || !session || !localBonusState || localBonusState.phase !== "entry" || !playerId) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      const currentScore = Math.max(0, getScorecardPlayerScore(session.scores, playerName, scorecard.players));
      const sanitized = sanitizeDisplayBonusWagerInputValue(rawValue);
      if (sanitized === "") {
        showDisplayToast("Enter a wager before locking it in.");
        return;
      }

      const parsedValue = Math.max(0, Number(sanitized));
      if (parsedValue > currentScore) {
        setDisplayLocalBonusState(scorecardId, {
          ...localBonusState,
          wagerErrors: {
            ...localBonusState.wagerErrors,
            [playerId]: `Max wager: ${formatScorecardScore(currentScore)}`
          }
        });
        renderScorecards(cachedScorecards);
        return;
      }

      const nextState = {
        ...localBonusState,
        draftWagers: {
          ...localBonusState.draftWagers,
          [playerId]: ""
        },
        wagerErrors: {
          ...localBonusState.wagerErrors,
          [playerId]: ""
        },
        wagers: {
          ...localBonusState.wagers,
          [playerId]: parsedValue
        }
      };
      setDisplayLocalBonusState(scorecardId, nextState);
      const savedSession = await updateDisplayActiveScorecardSession(scorecardId, {
        wagers: buildScorecardBonusWagers(scorecard.players, nextState.wagers, SCORECARD_BONUS_PHASES.entry),
        wager_results: null,
        is_final_jeopardy: true
      });
      if (!savedSession) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
      }
      renderScorecards(cachedScorecards);
      if (allDisplayLocalBonusWagersLocked(nextState)) {
        const existingAdvanceTimer = displayScorecardBonusAdvanceTimerById.get(scorecardId);
        if (existingAdvanceTimer) {
          window.clearTimeout(existingAdvanceTimer);
        }

        const timerId = window.setTimeout(async () => {
          displayScorecardBonusAdvanceTimerById.delete(scorecardId);
          const currentBonusState = getDisplayLocalBonusState(scorecardId);
          if (!currentBonusState || currentBonusState.phase !== "entry" || !allDisplayLocalBonusWagersLocked(currentBonusState)) {
            return;
          }

          const advancedState = {
            ...currentBonusState,
            phase: "results"
          };
          setDisplayLocalBonusState(scorecardId, advancedState);
          const updatedSession = await updateDisplayActiveScorecardSession(scorecardId, {
            wagers: buildScorecardBonusWagers(scorecard.players, advancedState.wagers, SCORECARD_BONUS_PHASES.results),
            wager_results: buildScorecardBonusResults(scorecard.players, advancedState.results, SCORECARD_BONUS_PHASES.results),
            is_final_jeopardy: true
          });
          if (!updatedSession) {
            showDisplayToast("Something went wrong saving your changes. Please try again.");
          }
          renderScorecards(cachedScorecards);
        }, 350);
        displayScorecardBonusAdvanceTimerById.set(scorecardId, timerId);
      }
      resetAutoRotate("scorecard-bonus-lock");
    }

    async function revealDisplayScorecardBonusWagers(scorecardId) {
      const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
      const localBonusState = getDisplayLocalBonusState(scorecardId);
      if (!scorecard || !localBonusState) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      if (!allDisplayLocalBonusWagersLocked(localBonusState) || !allDisplayLocalBonusResultsSelected(localBonusState)) {
        showDisplayToast("Set every result before revealing wagers.");
        return;
      }

      const nextState = {
        ...localBonusState,
        phase: "reveal",
        revealed: true
      };
      setDisplayLocalBonusState(scorecardId, nextState);
      const nextSession = await updateDisplayActiveScorecardSession(scorecardId, {
        wagers: buildScorecardBonusWagers(scorecard.players, nextState.wagers, SCORECARD_BONUS_PHASES.reveal),
        wager_results: buildScorecardBonusResults(scorecard.players, nextState.results, SCORECARD_BONUS_PHASES.reveal),
        is_final_jeopardy: true
      });
      if (!nextSession) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
      }
      renderScorecards(cachedScorecards);

      const screen = track.querySelector(`.scorecard-screen[data-scorecard-id="${scorecardId}"]`);
      screen?.querySelectorAll(".scorecard-bonus-reveal-card").forEach((card) => {
        card.classList.remove("is-revealed");
        void card.offsetWidth;
        card.classList.add("is-revealed");
      });
      resetAutoRotate("scorecard-bonus-reveal");
    }

    async function backOutOfDisplayBonusReveal(scorecardId) {
      const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
      const localBonusState = getDisplayLocalBonusState(scorecardId);
      if (!scorecard || !localBonusState) {
        return;
      }

      const nextState = {
        ...localBonusState,
        phase: "results",
        revealed: false
      };
      setDisplayLocalBonusState(scorecardId, nextState);
      const nextSession = await updateDisplayActiveScorecardSession(scorecardId, {
        wagers: buildScorecardBonusWagers(scorecard.players, nextState.wagers, SCORECARD_BONUS_PHASES.results),
        wager_results: buildScorecardBonusResults(scorecard.players, nextState.results, SCORECARD_BONUS_PHASES.results),
        is_final_jeopardy: true
      });
      if (!nextSession) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
      }
      renderScorecards(cachedScorecards);
      resetAutoRotate("scorecard-bonus-back");
    }

    async function applyDisplayScorecardBonusResults(scorecardId, wagerResults) {
      const client = getSupabaseClient();
      const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
      const session = getActiveScorecardSession(scorecardId);
      const localBonusState = getDisplayLocalBonusState(scorecardId);
      if (!client || !scorecard || !session || !localBonusState) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      const nextScores = { ...session.scores };
      const historyChanges = [];
      scorecard.players.forEach((player) => {
        const previousScore = getScorecardPlayerScore(session.scores, player, scorecard.players);
        const wager = Math.max(0, Number(localBonusState.wagers[player.id]) || 0);
        const wasCorrect = wagerResults[player.id] === "correct";
        const nextScore = applyScorecardIncrement(previousScore, wasCorrect ? wager : -wager, scorecard.allowNegative);
        nextScores[player.id] = nextScore;
        historyChanges.push({
          playerName: player.name,
          previousScore,
          nextScore,
          increment: nextScore - previousScore
        });
      });

      const scoreEvents = appendScoreEvents(
        session.scoreEvents,
        historyChanges.map((change) => buildScoreEvent(
          getScorecardPlayerId(scorecard.players, change.playerName),
          change.increment,
          SCORE_EVENT_TYPES.bonusRound
        )),
        scorecard.players
      );
      const { data, error } = await client
        .from("scorecard_sessions")
        .update({
          scores: nextScores,
          wagers: buildScorecardBonusWagers(scorecard.players, localBonusState.wagers, SCORECARD_BONUS_PHASES.complete),
          wager_results: buildScorecardBonusResults(scorecard.players, wagerResults, SCORECARD_BONUS_PHASES.complete),
          score_events: scoreEvents,
          is_final_jeopardy: false
        })
        .eq("id", session.id)
        .eq("scorecard_id", scorecardId)
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .single();

      if (error || !data) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      pushScorecardActionHistory(session.id, {
        type: "bonus-round",
        changes: historyChanges
      });

      cachedScorecardSessionsById.set(scorecardId, getScorecardSessions(scorecardId).map((item) =>
        item.id === session.id ? mapScorecardSessionRow(data, scorecard) : item
      ));
      setDisplayLocalBonusState(scorecardId, null);
      renderScorecards(cachedScorecards);
      historyChanges.forEach((change) => {
        animateScorecardScore(scorecardId, change.playerName, change.increment);
      });
      resetAutoRotate("scorecard-bonus-apply");
    }

    async function undoDisplayScorecardAction(scorecardId) {
      const session = getActiveScorecardSession(scorecardId);
      if (!session) {
        return;
      }

      const action = popScorecardActionHistory(session.id);
      if (!action) {
        return;
      }

      const nextScores = { ...session.scores };
      const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
      action.changes.forEach((change) => {
        const playerId = getScorecardPlayerId(scorecard?.players, change.playerName);
        if (playerId) {
          nextScores[playerId] = change.previousScore;
        }
      });

      const nextSession = await updateDisplayActiveScorecardSession(scorecardId, {
        scores: nextScores,
        score_events: appendScoreEvents(
          session.scoreEvents,
          action.changes.map((change) => buildScoreEvent(
            getScorecardPlayerId(scorecard?.players || [], change.playerName),
            change.previousScore - change.nextScore,
            SCORE_EVENT_TYPES.undo
          )),
          scorecard?.players || []
        )
      });
      if (!nextSession) {
        pushScorecardActionHistory(session.id, action);
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      resetAutoRotate("scorecard-undo");
    }

    async function endDisplayScorecardGame(scorecardId) {
      const client = getSupabaseClient();
      const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
      const session = getActiveScorecardSession(scorecardId);
      if (!client || !scorecard || !session) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      setDisplayLocalBonusState(scorecardId, null);
      const { data, error } = await client
        .from("scorecard_sessions")
        .update({
          ended_at: new Date().toISOString(),
          winner: getScorecardWinner(session.scores, scorecard.players)
        })
        .eq("id", session.id)
        .eq("scorecard_id", scorecardId)
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .single();

      if (error || !data) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      cachedScorecardSessionsById.set(scorecardId, getScorecardSessions(scorecardId).map((item) =>
        item.id === session.id ? mapScorecardSessionRow(data, scorecard) : item
      ));
      clearScorecardActionHistory(session.id);
      markScorecardPendingWinner(scorecardId, data.id);
      renderScorecards(cachedScorecards);
      syncScorecardCelebrationOverlay();
      resetAutoRotate("scorecard-end-game");
    }

    async function endDisplayActiveScorecardSessionIfNeeded(scorecardId, scorecard) {
      const client = getSupabaseClient();
      const activeSession = getActiveScorecardSession(scorecardId);
      if (!client || !scorecard || !activeSession || activeSession.endedAt) {
        return activeSession;
      }

      const { data, error } = await client
        .from("scorecard_sessions")
        .update({
          ended_at: new Date().toISOString(),
          winner: getScorecardWinner(activeSession.scores, scorecard.players)
        })
        .eq("id", activeSession.id)
        .eq("scorecard_id", scorecardId)
        .is("ended_at", null)
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      const endedSession = mapScorecardSessionRow(data, scorecard);
      cachedScorecardSessionsById.set(scorecardId, getScorecardSessions(scorecardId).map((item) =>
        item.id === activeSession.id ? endedSession : item
      ));
      clearScorecardActionHistory(activeSession.id);
      return endedSession;
    }

    async function archiveDisplayScorecard(scorecardId) {
      const client = getSupabaseClient();
      if (!client || !scorecardId) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      const { error } = await client
        .from("scorecards")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", scorecardId)
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .is("archived_at", null);

      if (error) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      clearDisplayScorecardArchiveConfirm();
      clearScorecardPendingWinner(scorecardId);
      setDisplayLocalBonusState(scorecardId, null);
      cachedScorecardSessionsById.delete(scorecardId);
      cachedScorecards = cachedScorecards.filter((item) => item.id !== scorecardId);
      renderScorecards(cachedScorecards);
      navigateToScreenIndex(findFirstNonScorecardScreenIndex());
      showDisplayToast("Scorecard archived.");
    }

    async function startNextDisplayScorecardGame(scorecardId) {
      const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
      if (!scorecard) {
        return;
      }

      const endedSession = await endDisplayActiveScorecardSessionIfNeeded(scorecardId, scorecard);
      if (getActiveScorecardSession(scorecardId) && !endedSession) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      const nextSession = await createDisplayScorecardSession(scorecard);
      if (!nextSession) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      clearScorecardActionHistory(nextSession.id);
      clearScorecardPendingWinner(scorecardId);
      clearDisplayScorecardArchiveConfirm();
      setDisplayLocalBonusState(scorecardId, null);
      cachedScorecardSessionsById.set(scorecardId, [nextSession, ...getScorecardSessions(scorecardId)]);
      renderScorecards(cachedScorecards);
      syncScorecardCelebrationOverlay();
      resetAutoRotate("scorecard-new-game");
    }
