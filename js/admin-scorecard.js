    // ── Scorecards ───────────────────────────────────────────────────────────

    function buildScorecardPlayerRowHTML(player = {}, index = 0) {
      const color = player.color || SCORECARD_PLAYER_COLOR_PALETTE[index % SCORECARD_PLAYER_COLOR_PALETTE.length];
      return `
        <div class="admin-scorecard-player-row" data-scorecard-player-row="${index}">
          <input type="hidden" name="scorecard_player_id" value="${escapeHtml(player.id || "")}">
          <input class="admin-scorecard-color-input" type="color" name="scorecard_player_color" value="${escapeHtml(color)}" aria-label="Player color">
          <input class="admin-input" type="text" name="scorecard_player_name" maxlength="40" placeholder="Player name" value="${escapeHtml(player.name || "")}">
          <button class="admin-scorecard-remove-btn" type="button" data-action="remove-scorecard-player" aria-label="Remove player">
            <i data-lucide="x"></i>
          </button>
        </div>
      `;
    }

    function buildScorecardIncrementRowHTML(value = "", index = 0) {
      return `
        <div class="admin-scorecard-increment-row" data-scorecard-increment-row="${index}">
          <input class="admin-input" type="text" name="scorecard_increment" placeholder="200 or -200" value="${escapeHtml(value)}" inputmode="decimal" pattern="-?[0-9]*">
          <button class="admin-scorecard-remove-btn" type="button" data-action="remove-scorecard-increment" aria-label="Remove increment">
            <i data-lucide="x"></i>
          </button>
        </div>
      `;
    }

    function getPersistedScorecardScreenOrderEntries(scorecards) {
      return (Array.isArray(scorecards) ? scorecards : []).map((scorecard) => buildScorecardScreenKey(scorecard.id)).filter(Boolean);
    }

    function normalizeAdminScreenOrder(order) {
      const configurableScreens = getAdminConfigurableScreens();
      const configured = Array.isArray(order) ? order : [...configurableScreens];
      const normalized = [];

      configured.forEach((key) => {
        const normalizedKey = isScorecardScreenKey(key) ? "scorecards" : key;
        if (configurableScreens.includes(normalizedKey) && !normalized.includes(normalizedKey)) {
          normalized.push(normalizedKey);
        }
      });

      configurableScreens.forEach((key) => {
        if (!normalized.includes(key)) {
          normalized.push(key);
        }
      });

      return normalized;
    }

    function buildPersistedScreenOrder(order) {
      const normalized = normalizeAdminScreenOrder(order);
      const persisted = [];
      normalized.forEach((key) => {
        if (key === "scorecards") {
          getPersistedScorecardScreenOrderEntries(adminScorecards).forEach((scorecardKey) => {
            if (!persisted.includes(scorecardKey)) {
              persisted.push(scorecardKey);
            }
          });
          return;
        }

        if (!persisted.includes(key)) {
          persisted.push(key);
        }
      });
      return persisted;
    }

    function getAdminScorecardById(scorecardId) {
      return adminScorecards.find((scorecard) => scorecard.id === scorecardId) || null;
    }

    function getAdminScorecardSessions(scorecardId) {
      return (adminScorecardSessionsById.get(scorecardId) || []).slice().sort((a, b) =>
        new Date(b.startedAt || b.createdAt || 0) - new Date(a.startedAt || a.createdAt || 0)
      );
    }

    function getAdminActiveScorecardSession(scorecardId) {
      return getAdminScorecardSessions(scorecardId).find((session) => !session.endedAt) || null;
    }

    function getAdminLocalBonusState(scorecardId) {
      const activeSession = getAdminActiveScorecardSession(scorecardId);
      const scorecard = getAdminScorecardById(scorecardId);
      const state = adminScorecardBonusStateById.get(scorecardId);
      if (!state) {
        if (!activeSession || !scorecard || !activeSession.isFinalJeopardy || !isScorecardBonusRoundActive(activeSession)) {
          return null;
        }

        const persistedState = createLocalBonusState(activeSession.id, scorecard.players, activeSession);
        adminScorecardBonusStateById.set(scorecardId, persistedState);
        return persistedState;
      }

      if (!activeSession || activeSession.id !== state.sessionId) {
        adminScorecardBonusStateById.delete(scorecardId);
        return null;
      }

      return state;
    }

    function setAdminLocalBonusState(scorecardId, nextState) {
      if (!scorecardId) {
        return;
      }

      const existingAdvanceTimer = adminScorecardBonusAdvanceTimerById.get(scorecardId);
      if (existingAdvanceTimer && (!nextState || nextState.phase !== "entry")) {
        window.clearTimeout(existingAdvanceTimer);
        adminScorecardBonusAdvanceTimerById.delete(scorecardId);
      }

      if (!nextState) {
        adminScorecardBonusStateById.delete(scorecardId);
        return;
      }

      adminScorecardBonusStateById.set(scorecardId, nextState);
    }

    function createLocalBonusState(sessionId, players, session = null) {
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

    function allLocalBonusWagersLocked(state) {
      return !!state && Array.isArray(state.playerIds) && state.playerIds.length > 0
        && state.playerIds.every((playerId) => Number.isFinite(Number(state.wagers[playerId])));
    }

    function allLocalBonusResultsSelected(state) {
      return !!state && Array.isArray(state.playerIds) && state.playerIds.length > 0
        && state.playerIds.every((playerId) => {
          const result = String(state.results[playerId] || "").trim().toLowerCase();
          return result === "correct" || result === "incorrect";
        });
    }

    function sanitizeBonusWagerInputValue(rawValue) {
      return String(rawValue || "").replace(/\D+/g, "");
    }

    function getAdminBonusPeekKey(scorecardId, playerName) {
      return `${scorecardId}:${playerName}`;
    }

    function setAdminBonusPeekState(scorecardId, playerName, isVisible) {
      const key = getAdminBonusPeekKey(scorecardId, playerName);
      const input = Array.from(document.querySelectorAll("#admin-modal-body [data-scorecard-bonus-input]")).find((element) =>
        element.getAttribute("data-scorecard-bonus-input") === key
      );
      const button = Array.from(document.querySelectorAll("#admin-modal-body [data-action='scorecard-bonus-peek']")).find((element) =>
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

    function triggerAdminBonusPeek(scorecardId, playerName) {
      const key = getAdminBonusPeekKey(scorecardId, playerName);
      const input = Array.from(document.querySelectorAll("#admin-modal-body [data-scorecard-bonus-input]")).find((element) =>
        element.getAttribute("data-scorecard-bonus-input") === key
      );
      const existingTimer = adminScorecardBonusPeekTimerByKey.get(key);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        adminScorecardBonusPeekTimerByKey.delete(key);
      }

      if (input?.type === "text") {
        setAdminBonusPeekState(scorecardId, playerName, false);
        return;
      }

      setAdminBonusPeekState(scorecardId, playerName, true);
      const timerId = window.setTimeout(() => {
        adminScorecardBonusPeekTimerByKey.delete(key);
        setAdminBonusPeekState(scorecardId, playerName, false);
      }, 2000);
      adminScorecardBonusPeekTimerByKey.set(key, timerId);
    }

    function getAdminPendingWinnerSession(scorecardId) {
      const pendingSessionId = getScorecardPendingWinnerSessionId(scorecardId);
      if (!pendingSessionId || getAdminActiveScorecardSession(scorecardId)) {
        return null;
      }

      return getAdminScorecardSessions(scorecardId).find((session) => session.id === pendingSessionId && session.endedAt) || null;
    }

    async function fetchAdminScorecards() {
      const client = getSupabaseClient();
      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("scorecards")
        .select("id, household_id, name, increments, players, show_history, allow_negative, created_at, archived_at")
        .eq("household_id", getAdminHouseholdId())
        .is("archived_at", null)
        .order("created_at", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data.map(mapScorecardRow);
    }

    async function fetchAdminScorecardSessions(scorecards) {
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
        .eq("household_id", getAdminHouseholdId())
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

    async function createFreshScorecardSession(scorecard) {
      const client = getSupabaseClient();
      if (!client || !scorecard) {
        return null;
      }

      const payload = {
        scorecard_id: scorecard.id,
        household_id: getAdminHouseholdId(),
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

    async function ensureAdminScorecardSessions(scorecards, sessionsById) {
      const nextMap = sessionsById instanceof Map ? new Map(sessionsById) : new Map();

      for (const scorecard of (Array.isArray(scorecards) ? scorecards : [])) {
        const sessions = (nextMap.get(scorecard.id) || []).slice();
        const hasActiveSession = sessions.some((session) => !session.endedAt);
        if (hasActiveSession || sessions.length > 0) {
          nextMap.set(scorecard.id, sessions);
          continue;
        }

        const freshSession = await createFreshScorecardSession(scorecard);
        if (freshSession) {
          sessions.unshift(freshSession);
        }
        nextMap.set(scorecard.id, sessions);
      }

      return nextMap;
    }

    function buildAdminScoreSummary(scorecard, session) {
      if (!session) {
        return '<span class="admin-scorecard-summary-empty">No game yet</span>';
      }

      return scorecard.players.map((player) => `
        <span class="admin-scorecard-score-pill" style="background:${escapeHtml(hexToRgba(player.color, 0.14))};color:${escapeHtml(player.color)}">
          ${escapeHtml(player.name)} ${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session.scores, player, scorecard.players)))}
        </span>
      `).join("");
    }

    function buildAdminScorecardCardRowsHTML(scorecard, session) {
      if (!session) {
        return '<div class="admin-scorecard-summary-empty">No game yet</div>';
      }

      return scorecard.players.map((player) => `
        <div class="admin-scorecard-session-row">
          <div class="admin-scorecard-session-player">
            <span class="admin-scorecard-player-dot" style="background:${escapeHtml(player.color)}"></span>
            <span>${escapeHtml(player.name)}</span>
          </div>
          <strong class="admin-scorecard-session-score">${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session.scores, player, scorecard.players)))}</strong>
        </div>
      `).join("");
    }

    function renderAdminScorecardList() {
      if (!adminScorecardList || !adminScorecardsNote) {
        return;
      }

      adminScorecardsNote.textContent = adminScorecards.length
        ? `${adminScorecards.length} active ${adminScorecards.length === 1 ? "scorecard" : "scorecards"}`
        : "No scorecards yet. Add one to start keeping score.";

      if (!adminScorecards.length) {
        adminScorecardList.innerHTML = '<div class="admin-empty">No scorecards yet.</div>';
        return;
      }

      adminScorecardList.innerHTML = adminScorecards.map((scorecard) => {
        const activeSession = getAdminActiveScorecardSession(scorecard.id);
        const latestSession = activeSession || getAdminScorecardSessions(scorecard.id)[0] || null;
        const metaLabel = activeSession
          ? `${scorecard.players.length} players`
          : latestSession?.endedAt
            ? "Waiting for new game"
            : `${scorecard.players.length} players`;
        return `
          <button class="admin-scorecard-card" type="button" data-scorecard-id="${escapeHtml(scorecard.id)}">
            <div class="admin-scorecard-card-head">
              <div>
                <div class="admin-scorecard-card-title">${escapeHtml(scorecard.name)}</div>
                <div class="admin-scorecard-card-meta">${escapeHtml(metaLabel)}</div>
              </div>
              <i data-lucide="chevron-right"></i>
            </div>
            <div class="admin-scorecard-session-list">${buildAdminScorecardCardRowsHTML(scorecard, latestSession)}</div>
          </button>
        `;
      }).join("");

      refreshIcons();
    }

    function getDefaultScorecardPlayers() {
      const members = getAdminHouseholdMembers();
      if (members.length) {
        return Array.from({ length: 2 }, (_, index) => {
          const member = members[index];
          return {
            name: member?.display_name || "",
            color: member?.color || SCORECARD_PLAYER_COLOR_PALETTE[index % SCORECARD_PLAYER_COLOR_PALETTE.length]
          };
        });
      }

      return SCORECARD_PLAYER_COLOR_PALETTE.slice(0, 2).map((color) => ({
        name: "",
        color
      }));
    }

    function getScorecardHistoryFilterStart(filter) {
      const now = new Date();
      if (filter === "week") {
        return getMonday(now);
      }
      if (filter === "month") {
        return new Date(now.getFullYear(), now.getMonth(), 1);
      }
      return null;
    }

    function getFilteredScorecardHistory(scorecardId, filter) {
      const start = getScorecardHistoryFilterStart(filter);
      return getAdminScorecardSessions(scorecardId)
        .filter((session) => session.endedAt)
        .filter((session) => {
          if (!start) {
            return true;
          }
          const startedAt = new Date(session.startedAt || session.createdAt || 0);
          return startedAt >= start;
        });
    }

    function buildScorecardSessionRowsHTML(scorecard, session) {
      return scorecard.players.map((player) => `
        <div class="admin-scorecard-session-row">
          <div class="admin-scorecard-session-player">
            <span class="admin-scorecard-player-dot" style="background:${escapeHtml(player.color)}"></span>
            <span>${escapeHtml(player.name)}</span>
          </div>
          <strong class="admin-scorecard-session-score">${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session?.scores, player, scorecard.players)))}</strong>
        </div>
      `).join("");
    }

    function buildScorecardAdjustButtonsHTML(scorecard, playerName) {
      const buildButton = (increment) => `
        <button class="admin-button admin-button--secondary admin-button--small admin-scorecard-increment-btn" type="button"
          data-action="scorecard-adjust-score"
          data-scorecard-id="${escapeHtml(scorecard.id)}"
          data-player-name="${escapeHtml(playerName)}"
          data-increment="${escapeHtml(increment)}">
          ${increment > 0 ? "+" : ""}${escapeHtml(formatScorecardScore(increment))}
        </button>
      `;

      if (scorecard.increments.length > 10) {
        return `
          <div class="admin-scorecard-adjust-scroll" tabindex="0" aria-label="Score adjustments">
            ${scorecard.increments.map(buildButton).join("")}
          </div>
        `;
      }

      return `
        <div class="admin-scorecard-adjust-grid-buttons">
          ${scorecard.increments.map(buildButton).join("")}
        </div>
      `;
    }

    function buildScorecardUndoButtonHTML(scorecardId, session) {
      const hasUndo = session && getScorecardActionHistory(session.id).length > 0;
      return `
        <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="scorecard-undo" data-scorecard-id="${escapeHtml(scorecardId)}"${hasUndo ? "" : " disabled"}>Undo</button>
      `;
    }

    function buildScorecardLogButtonHTML(scorecardId, session) {
      return `
        <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="scorecard-open-log" data-scorecard-id="${escapeHtml(scorecardId)}"${session ? "" : " disabled"}>Score log</button>
      `;
    }

    function buildScorecardHistoryEntryHTML(scorecard, session) {
      const winnerLabel = session.winner || "Tie";
      return `
        <article class="admin-scorecard-history-card">
          <div class="admin-scorecard-history-head">
            <div class="admin-scorecard-history-meta">
              <strong>${escapeHtml(formatScorecardSessionDate(session.endedAt || session.startedAt))}</strong>
              <span>${escapeHtml(formatScorecardSessionDuration(session.startedAt, session.endedAt))}</span>
            </div>
            <span class="admin-scorecard-history-winner-badge">
              <i data-lucide="trophy"></i>
              ${escapeHtml(winnerLabel)}
            </span>
          </div>
          <div class="admin-scorecard-history-scores">
            ${scorecard.players.map((player) => `
              <span class="admin-scorecard-history-pill${winnerLabel === player.name ? " is-winner" : ""}">
                ${winnerLabel === player.name ? '<i data-lucide="trophy"></i>' : ""}
                <span>${escapeHtml(player.name)}</span>
                <strong>${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session.scores, player, scorecard.players)))}</strong>
              </span>
            `).join("")}
          </div>
        </article>
      `;
    }

    function buildScorecardLogModalHtml(scorecard, session, filter = "month") {
      const events = (session?.scoreEvents || []).slice().reverse();
      const playerById = new Map((scorecard?.players || []).map((player) => [player.id, player]));

      return `
        <div class="admin-scorecard-modal-stack">
          <section class="admin-scorecard-modal-section">
            <div class="admin-scorecard-section-head">
              <h3>Current session</h3>
              <span class="admin-panel-note">${escapeHtml(formatScorecardSessionDate(session?.startedAt || session?.createdAt))}</span>
            </div>
            <div class="admin-scorecard-history-list">
              ${events.length ? events.map((event) => `
                <article class="admin-scorecard-log-card">
                  <div class="admin-scorecard-log-head">
                    <strong class="admin-scorecard-log-player" style="color:${escapeHtml(playerById.get(event.playerId)?.color || "var(--ink)")}">
                      ${escapeHtml(playerById.get(event.playerId)?.name || "Unknown player")}
                    </strong>
                    <span class="admin-panel-note">${escapeHtml(formatScoreEventTime(event.timestamp))}</span>
                  </div>
                  <div class="admin-scorecard-log-meta">
                    <span class="admin-scorecard-log-amount ${event.amount >= 0 ? "is-positive" : "is-negative"}">${event.amount >= 0 ? "+" : "−"}${escapeHtml(formatScorecardScore(Math.abs(event.amount)))}</span>
                    <span>${escapeHtml(formatScoreEventTypeLabel(event.type))}</span>
                  </div>
                </article>
              `).join("") : '<div class="admin-empty">No score events yet.</div>'}
            </div>
          </section>
          <div class="admin-actions admin-actions--end">
            <button class="admin-button admin-button--secondary" type="button" data-action="scorecard-close-log" data-scorecard-id="${escapeHtml(scorecard.id)}" data-filter="${escapeHtml(filter)}">Close</button>
          </div>
        </div>
      `;
    }

    function buildScorecardBonusEntryHtml(scorecard, bonusState, session) {
      const lockedCount = Object.keys(bonusState?.wagers || {}).length;

      return `
        <div class="admin-scorecard-bonus-panel">
          <div class="admin-scorecard-bonus-status">
            <strong>${escapeHtml(lockedCount)} of ${escapeHtml(scorecard.players.length)} locked</strong>
            <span>Each player enters and locks a masked wager locally on this device.</span>
          </div>
          <div class="admin-scorecard-modal-stack">
            ${scorecard.players.map((player) => {
              const rawWager = bonusState?.wagers?.[player.id];
              const draftWager = bonusState?.draftWagers?.[player.id];
              const wagerError = String(bonusState?.wagerErrors?.[player.id] || "").trim();
              const hasLockedWager = Number.isFinite(Number(rawWager));
              const currentScore = Math.max(0, getScorecardPlayerScore(session?.scores, player, scorecard.players));
              const inputKey = `${scorecard.id}:${player.name}`;
              return `
                <div class="admin-scorecard-bonus-entry-block">
                  <div class="admin-scorecard-bonus-entry-row">
                    <div class="admin-scorecard-bonus-player-meta">
                      <strong>${escapeHtml(player.name)}</strong>
                      <span class="admin-panel-note admin-scorecard-bonus-current">Current: ${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session?.scores, player, scorecard.players)))}</span>
                    </div>
                    <div class="admin-scorecard-bonus-entry-side">
                      <div class="admin-scorecard-bonus-entry-controls">
                        <div class="admin-scorecard-bonus-input-wrap${hasLockedWager ? " is-locked" : ""}">
                          <input
                            class="admin-input admin-scorecard-bonus-input${hasLockedWager ? " is-locked" : ""}"
                            type="password"
                            inputmode="numeric"
                            autocomplete="off"
                            pattern="[0-9]*"
                            placeholder="Wager"
                            value="${escapeHtml(hasLockedWager ? String(rawWager) : String(draftWager || ""))}"
                            data-scorecard-bonus-input="${escapeHtml(inputKey)}"
                            data-scorecard-bonus-max="${escapeHtml(currentScore)}"
                            max="${escapeHtml(currentScore)}"
                            ${hasLockedWager ? "disabled" : ""}
                          >
                          ${hasLockedWager ? "" : `
                            <button class="admin-scorecard-bonus-peek-btn" type="button" data-action="scorecard-bonus-peek" data-scorecard-bonus-peek-target="${escapeHtml(inputKey)}"${draftWager ? "" : " disabled"} aria-label="Toggle wager visibility">
                              <i data-lucide="eye"></i>
                            </button>
                          `}
                        </div>
                        <button class="admin-button admin-scorecard-lock-icon-btn${hasLockedWager ? " is-locked" : ""}" type="button" data-action="scorecard-bonus-lock" data-scorecard-id="${escapeHtml(scorecard.id)}" data-player-name="${escapeHtml(player.name)}"${hasLockedWager ? " disabled" : ""} aria-label="${hasLockedWager ? "Wager locked" : "Lock wager"}"><i data-lucide="lock"></i></button>
                      </div>
                      <div class="admin-scorecard-bonus-error"${wagerError ? "" : ' hidden'} data-scorecard-bonus-error="${escapeHtml(inputKey)}">${escapeHtml(wagerError)}</div>
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
          <div class="admin-actions admin-actions--end">
            <button class="admin-button admin-button--secondary admin-scorecard-bonus-cancel-btn" type="button" data-action="scorecard-bonus-cancel" data-scorecard-id="${escapeHtml(scorecard.id)}">Cancel bonus round</button>
          </div>
        </div>
      `;
    }

    function buildScorecardBonusRevealCardsHtml(scorecard, bonusState, session) {
      return `
        <div class="admin-scorecard-history-scores admin-scorecard-bonus-reveal-grid">
          ${scorecard.players.map((player) => {
            const beforeScore = getScorecardPlayerScore(session?.scores, player, scorecard.players);
            const wager = Math.max(0, Number(bonusState?.wagers?.[player.id]) || 0);
            const result = String(bonusState?.results?.[player.id] || "").trim().toLowerCase();
            const isCorrect = result === "correct";
            const impact = isCorrect ? wager : -wager;
            const impactLabel = `${impact >= 0 ? "+" : "-"}${formatScorecardScore(Math.abs(impact))}`;
            return `
              <article class="admin-scorecard-bonus-reveal-card ${isCorrect ? "is-correct" : "is-incorrect"}">
                <div class="admin-scorecard-bonus-impact">${escapeHtml(impactLabel)}</div>
                <div class="admin-panel-note">Before: ${escapeHtml(formatScorecardScore(beforeScore))}</div>
                <div class="admin-scorecard-bonus-summary">${escapeHtml(player.name)} wagered ${escapeHtml(formatScorecardScore(wager))} · ${escapeHtml(isCorrect ? "Correct" : "Incorrect")}</div>
              </article>
            `;
          }).join("")}
        </div>
      `;
    }

    function buildScorecardBonusResultsHtml(scorecard, bonusState, session, showRevealStage = false) {
      const allResultsSelected = allLocalBonusResultsSelected(bonusState);

      return `
        <form data-modal-form="scorecard-bonus-results" data-scorecard-id="${escapeHtml(scorecard.id)}" novalidate>
          <div class="admin-scorecard-modal-stack">
            ${showRevealStage
              ? buildScorecardBonusRevealCardsHtml(scorecard, bonusState, session)
              : scorecard.players.map((player) => {
                  const result = String(bonusState?.results?.[player.id] || "").trim().toLowerCase();
                  return `
                    <div class="admin-scorecard-final-row">
                      <div>
                        <strong>${escapeHtml(player.name)}</strong>
                        <div class="admin-panel-note">Selection required before reveal</div>
                      </div>
                      <div class="admin-scorecard-toggle-row">
                        <label class="admin-scorecard-toggle-pill is-correct">
                          <input type="radio" name="result_${escapeHtml(player.id)}" value="correct"${result === "correct" ? " checked" : ""}>
                          <span>Correct</span>
                        </label>
                        <label class="admin-scorecard-toggle-pill is-incorrect">
                          <input type="radio" name="result_${escapeHtml(player.id)}" value="incorrect"${result === "incorrect" ? " checked" : ""}>
                          <span>Incorrect</span>
                        </label>
                      </div>
                    </div>
                  `;
                }).join("")}
            ${showRevealStage
              ? `
                <div class="admin-actions admin-actions--split">
                  <button class="admin-button admin-button--secondary" type="button" data-action="scorecard-bonus-back" data-scorecard-id="${escapeHtml(scorecard.id)}">Back</button>
                  <button class="admin-button admin-button--primary" type="submit">Apply results</button>
                </div>
              `
              : `
                <div class="admin-scorecard-bonus-result-actions">
                  <button class="admin-button admin-button--secondary admin-scorecard-bonus-cancel-btn" type="button" data-action="scorecard-bonus-cancel" data-scorecard-id="${escapeHtml(scorecard.id)}">Cancel bonus round</button>
                  <button class="admin-button admin-button--primary" type="button" data-action="scorecard-bonus-reveal" data-scorecard-id="${escapeHtml(scorecard.id)}"${allResultsSelected ? "" : " disabled"}>Reveal wagers</button>
                </div>
              `}
          </div>
        </form>
      `;
    }

    function buildScorecardWinnerModalHtml(scorecard, session) {
      const leaders = getScorecardLeaders(session?.scores, scorecard?.players || []);
      const isTie = leaders.length > 1;
      const highlightedLeaders = new Set(leaders);
      return `
        <div class="admin-scorecard-modal-stack">
          <section class="admin-scorecard-modal-section admin-scorecard-winner-panel">
            <div class="admin-scorecard-winner-title">${escapeHtml(isTie ? "🤝 It's a tie!" : `🏆 ${leaders[0] || session.winner || "Winner"} wins!`)}</div>
            <div class="admin-scorecard-winner-board">
              ${scorecard.players.map((player) => `
                <div class="admin-scorecard-winner-row${highlightedLeaders.has(player.name) ? " is-winner" : ""}">
                  <span class="admin-scorecard-winner-name" style="color:${escapeHtml(player.color)}">${escapeHtml(player.name)}</span>
                  <strong>${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session.scores, player, scorecard.players)))}</strong>
                </div>
              `).join("")}
            </div>
          </section>
          <div class="admin-actions admin-actions--split">
            <button class="admin-button admin-button--primary" type="button" data-action="scorecard-new-game" data-scorecard-id="${escapeHtml(scorecard.id)}">New game</button>
            <button class="admin-button admin-button--secondary" type="button" data-action="scorecard-archive" data-scorecard-id="${escapeHtml(scorecard.id)}">${adminScorecardArchiveConfirmId === scorecard.id ? "Confirm archive" : "Archive scorecard"}</button>
          </div>
        </div>
      `;
    }

    function buildScorecardManageHTML(scorecard, filter = "month") {
      const activeSession = getAdminActiveScorecardSession(scorecard.id);
      const localBonusState = getAdminLocalBonusState(scorecard.id);
      const isBonusActive = !!localBonusState;
      const history = getFilteredScorecardHistory(scorecard.id, filter);
      return `
        <div class="admin-scorecard-modal-stack">
          <section class="admin-scorecard-modal-section">
            <div class="admin-scorecard-section-head">
              <h3>Scorecard</h3>
              <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="edit-scorecard-config" data-scorecard-id="${escapeHtml(scorecard.id)}">Edit</button>
            </div>
            <p class="admin-panel-note">${escapeHtml(scorecard.players.length)} players</p>
          </section>
          <section class="admin-scorecard-modal-section">
            <div class="admin-scorecard-section-head">
              <h3>${isBonusActive ? "Bonus round" : "Current game"}</h3>
              ${isBonusActive ? "" : `
                <div class="admin-scorecard-inline-actions">
                  ${buildScorecardUndoButtonHTML(scorecard.id, activeSession)}
                  ${buildScorecardLogButtonHTML(scorecard.id, activeSession)}
                  <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="scorecard-end-game" data-scorecard-id="${escapeHtml(scorecard.id)}"${activeSession ? "" : " disabled"}>End game</button>
                  <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="scorecard-bonus-round" data-scorecard-id="${escapeHtml(scorecard.id)}"${activeSession ? "" : " disabled"}>Bonus round</button>
                </div>
              `}
            </div>
            ${!activeSession ? '<div class="admin-empty">No active game.</div>' : localBonusState?.phase === "entry" ? buildScorecardBonusEntryHtml(scorecard, localBonusState, activeSession) : isBonusActive ? buildScorecardBonusResultsHtml(scorecard, localBonusState, activeSession, localBonusState.phase === "reveal") : `
              <div class="admin-scorecard-session-list">
                ${buildScorecardSessionRowsHTML(scorecard, activeSession)}
              </div>
              <div class="admin-scorecard-adjust-grid">
                ${scorecard.players.map((player) => `
                  <div class="admin-scorecard-adjust-card">
                    <div class="admin-scorecard-adjust-player">
                      <span class="admin-scorecard-player-dot" style="background:${escapeHtml(player.color)}"></span>
                      <span>${escapeHtml(player.name)}</span>
                    </div>
                    ${buildScorecardAdjustButtonsHTML(scorecard, player.name)}
                  </div>
                `).join("")}
              </div>
            `}
          </section>
          <section class="admin-scorecard-modal-section">
            <div class="admin-scorecard-section-head">
              <h3>Past games</h3>
              <div class="admin-scorecard-filter-row">
                ${[
                  ["week", "This week"],
                  ["month", "This month"],
                  ["all", "All time"]
                ].map(([key, label]) => `
                  <button class="admin-button admin-button--small ${filter === key ? "admin-button--primary" : "admin-button--secondary"}" type="button" data-action="scorecard-history-filter" data-scorecard-id="${escapeHtml(scorecard.id)}" data-filter="${escapeHtml(key)}">${escapeHtml(label)}</button>
                `).join("")}
              </div>
            </div>
            <div class="admin-scorecard-history-list">
              ${history.length ? history.map((session) => buildScorecardHistoryEntryHTML(scorecard, session)).join("") : '<div class="admin-empty">No past games in this range.</div>'}
            </div>
          </section>
        </div>
      `;
    }

    function buildScorecardConfigFormHTML(scorecard) {
      const players = scorecard?.players?.length ? scorecard.players : getDefaultScorecardPlayers();
      const increments = scorecard?.increments?.length ? scorecard.increments : [100, 200, 400];

      return `
        <form data-modal-form="scorecard-save" novalidate>
          ${scorecard ? `<input type="hidden" name="scorecard_id" value="${escapeHtml(scorecard.id)}">` : ""}
          <div class="admin-field">
            <label for="scorecard-name">Name</label>
            <input id="scorecard-name" name="scorecard_name" type="text" maxlength="60" value="${escapeHtml(scorecard?.name || "")}" placeholder="Jeopardy">
          </div>
          <div class="admin-scorecard-form-section">
            <div class="admin-scorecard-form-header">
              <div class="admin-settings-subsection-label">Players</div>
              <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="add-scorecard-player">Add player</button>
            </div>
            <div class="admin-scorecard-player-list">
              ${players.map((player, index) => buildScorecardPlayerRowHTML(player, index)).join("")}
            </div>
          </div>
          <div class="admin-scorecard-form-section">
            <div class="admin-scorecard-form-header">
              <div class="admin-settings-subsection-label">Increment buttons</div>
              <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="add-scorecard-increment">Add value</button>
            </div>
            <div class="admin-scorecard-increment-list">
              ${increments.map((value, index) => buildScorecardIncrementRowHTML(value, index)).join("")}
            </div>
          </div>
          <label class="admin-settings-toggle admin-settings-toggle--block">
            <input type="checkbox" name="scorecard_allow_negative"${scorecard?.allowNegative ? " checked" : ""}>
            <span>Allow negative scores</span>
          </label>
          <label class="admin-settings-toggle admin-settings-toggle--block">
            <input type="checkbox" name="scorecard_show_history"${scorecard?.showHistory !== false ? " checked" : ""}>
            <span>Show history on display</span>
          </label>
          <div class="admin-actions">
            ${scorecard ? `<button class="admin-button admin-button--danger" type="button" data-action="delete-scorecard" data-scorecard-id="${escapeHtml(scorecard.id)}">Delete</button>` : `<button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>`}
            <button class="admin-button admin-button--primary" type="submit">${scorecard ? "Save" : "Create"}</button>
          </div>
        </form>
      `;
    }

    function openScorecardCreateModal() {
      adminModalType = "scorecard-create";
      adminModalContext = null;
      openAdminModal("Add Scorecard", buildScorecardConfigFormHTML(null));
    }

    function openScorecardWinnerModal(scorecardId) {
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminPendingWinnerSession(scorecardId);
      if (!scorecard || !session) {
        return;
      }

      adminModalType = "scorecard-winner";
      adminModalContext = { scorecardId };
      adminScorecardArchiveConfirmId = "";
      openAdminModal(scorecard.name, buildScorecardWinnerModalHtml(scorecard, session));
    }

    function openScorecardManageModal(scorecardId, filter = "month") {
      const scorecard = getAdminScorecardById(scorecardId);
      if (!scorecard) {
        return;
      }

      if (getAdminPendingWinnerSession(scorecardId)) {
        openScorecardWinnerModal(scorecardId);
        return;
      }

      adminModalType = "scorecard-manage";
      adminModalContext = { scorecardId, filter };
      openAdminModal(scorecard.name, buildScorecardManageHTML(scorecard, filter));
    }

    function openScorecardLogModal(scorecardId, filter = "month") {
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      if (!scorecard || !session) {
        return;
      }

      adminModalType = "scorecard-log";
      adminModalContext = { scorecardId, filter };
      openAdminModal(`${scorecard.name} score log`, buildScorecardLogModalHtml(scorecard, session, filter));
    }

    function openScorecardEditModal(scorecardId) {
      const scorecard = getAdminScorecardById(scorecardId);
      if (!scorecard) {
        return;
      }

      adminModalType = "scorecard-edit";
      adminModalContext = { scorecardId };
      openAdminModal(`Edit ${scorecard.name}`, buildScorecardConfigFormHTML(scorecard));
    }

    function rerenderScorecardWinnerModal() {
      if (adminModalType !== "scorecard-winner" || !adminModalContext?.scorecardId) {
        return;
      }

      const scorecard = getAdminScorecardById(adminModalContext.scorecardId);
      const session = getAdminPendingWinnerSession(adminModalContext.scorecardId);
      const modalTitle = document.getElementById("admin-modal-title");
      const modalBody = document.getElementById("admin-modal-body");
      if (!scorecard || !session || !modalTitle || !modalBody) {
        return;
      }

      modalTitle.textContent = scorecard.name;
      modalBody.innerHTML = buildScorecardWinnerModalHtml(scorecard, session);
      refreshIcons();
    }

    function rerenderScorecardManageModal() {
      if (adminModalType !== "scorecard-manage" || !adminModalContext?.scorecardId) {
        return;
      }

      const scorecard = getAdminScorecardById(adminModalContext.scorecardId);
      const modalTitle = document.getElementById("admin-modal-title");
      const modalBody = document.getElementById("admin-modal-body");
      if (!scorecard || !modalTitle || !modalBody) {
        return;
      }

      modalTitle.textContent = scorecard.name;
      modalBody.innerHTML = buildScorecardManageHTML(scorecard, adminModalContext.filter || "month");
      refreshIcons();
    }

    function rerenderScorecardLogModal() {
      if (adminModalType !== "scorecard-log" || !adminModalContext?.scorecardId) {
        return;
      }

      const scorecard = getAdminScorecardById(adminModalContext.scorecardId);
      const session = getAdminActiveScorecardSession(adminModalContext.scorecardId);
      const modalTitle = document.getElementById("admin-modal-title");
      const modalBody = document.getElementById("admin-modal-body");
      if (!scorecard || !session || !modalTitle || !modalBody) {
        return;
      }

      modalTitle.textContent = `${scorecard.name} score log`;
      modalBody.innerHTML = buildScorecardLogModalHtml(scorecard, session, adminModalContext.filter || "month");
      refreshIcons();
    }

    function collectScorecardFormValues(form) {
      const name = String(form.querySelector("[name='scorecard_name']")?.value || "").trim();
      const players = Array.from(form.querySelectorAll(".admin-scorecard-player-row")).map((row) => ({
        id: String(row.querySelector("[name='scorecard_player_id']")?.value || "").trim(),
        name: String(row.querySelector("[name='scorecard_player_name']")?.value || "").trim(),
        color: String(row.querySelector("[name='scorecard_player_color']")?.value || "").trim()
      })).filter((player) => player.name);
      const increments = Array.from(form.querySelectorAll("[name='scorecard_increment']")).map((input) =>
        Number(String(input.value || "").trim())
      ).filter((value) => Number.isFinite(value) && value !== 0);

      return {
        name,
        players,
        increments,
        allowNegative: form.querySelector("[name='scorecard_allow_negative']")?.checked === true,
        showHistory: form.querySelector("[name='scorecard_show_history']")?.checked !== false
      };
    }

    function validateScorecardForm(form, values) {
      const nameInput = form.querySelector("[name='scorecard_name']");
      if (!values.name) {
        setFieldError(nameInput, "Add a scorecard name.");
        nameInput?.focus();
        return false;
      }
      clearFieldError(nameInput);

      if (values.players.length < 2 || values.players.length > 6) {
        showToast("Scorecards need 2 to 6 players.");
        return false;
      }

      const normalizedNames = values.players.map((player) => player.name.trim().toLowerCase()).filter(Boolean);
      if (new Set(normalizedNames).size !== normalizedNames.length) {
        showToast("Player names must be unique.");
        return false;
      }

      if (values.increments.length === 0) {
        showToast("Add at least one increment value.");
        return false;
      }

      return true;
    }

    async function loadAdminScorecards() {
      if (!adminScorecardList || !adminScorecardsNote) {
        return;
      }

      const startingScreen = adminScreen;
      adminScorecardsNote.textContent = "Loading scorecards…";
      adminScorecardList.innerHTML = buildAdminCountdownSkeletonHTML();

      const scorecards = await fetchAdminScorecards();
      if (scorecards === null) {
        adminScorecardsNote.textContent = "Couldn't load scorecards.";
        adminScorecardList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
        return;
      }

      let sessionsById = await fetchAdminScorecardSessions(scorecards);
      if (sessionsById === null) {
        adminScorecardsNote.textContent = "Couldn't load scorecards.";
        adminScorecardList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
        return;
      }

      sessionsById = await ensureAdminScorecardSessions(scorecards, sessionsById);
      adminScorecards = scorecards;
      adminScorecardSessionsById = sessionsById;
      Array.from(adminScorecardBonusStateById.keys()).forEach((scorecardId) => {
        getAdminLocalBonusState(scorecardId);
      });
      adminHouseholdSettings.display_settings.screen_order = normalizeAdminScreenOrder(adminHouseholdSettings.display_settings.screen_order);
      renderAdminScorecardList();

      if (startingScreen === adminScreen && adminScreen === "settings") {
        loadAdminSettings();
      }

      if (adminModalType === "scorecard-manage") {
        rerenderScorecardManageModal();
      }

      if (adminModalType === "scorecard-log") {
        rerenderScorecardLogModal();
      }

      if (adminModalType === "scorecard-winner") {
        rerenderScorecardWinnerModal();
      }
    }

    async function saveScorecardFromForm(form) {
      const client = getSupabaseClient();
      if (adminScorecardWritePending) {
        return;
      }

      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      const scorecardId = String(form.querySelector("[name='scorecard_id']")?.value || "").trim();
      const values = collectScorecardFormValues(form);
      if (!validateScorecardForm(form, values)) {
        return;
      }

      adminScorecardWritePending = true;
      setModalSaving(true, scorecardId ? "Save" : "Create");

      const payload = {
        household_id: getAdminHouseholdId(),
        name: values.name,
        players: normalizeScorecardPlayers(values.players),
        increments: values.increments,
        allow_negative: values.allowNegative,
        show_history: values.showHistory
      };

      let savedRow = null;
      let error = null;

      if (scorecardId) {
        const response = await client
          .from("scorecards")
          .update(payload)
          .eq("id", scorecardId)
          .eq("household_id", getAdminHouseholdId())
          .select("id, household_id, name, increments, players, show_history, allow_negative, created_at, archived_at")
          .single();
        savedRow = response.data;
        error = response.error;
      } else {
        const response = await client
          .from("scorecards")
          .insert(payload)
          .select("id, household_id, name, increments, players, show_history, allow_negative, created_at, archived_at")
          .single();
        savedRow = response.data;
        error = response.error;
      }

      adminScorecardWritePending = false;
      setModalSaving(false, scorecardId ? "Save" : "Create");

      if (error || !savedRow) {
        showToast(friendlySaveMessage());
        return;
      }

      if (!scorecardId) {
        const scorecard = mapScorecardRow(savedRow);
        const session = await createFreshScorecardSession(scorecard);
        if (!session) {
          closeAdminModal();
          await loadAdminScorecards();
          showToast("Scorecard saved, but the first game could not start. Please try again.");
          return;
        }

        adminScorecardSessionsById.set(scorecard.id, [session]);
      }

      closeAdminModal();
      await loadAdminScorecards();
      showToast(scorecardId ? "Scorecard saved." : "Scorecard created.");
    }

    async function deleteScorecard(scorecardId) {
      await archiveScorecard(scorecardId);
    }

    async function archiveScorecard(scorecardId) {
      const client = getSupabaseClient();
      if (adminScorecardWritePending) {
        return;
      }

      if (!client) {
        showToast(friendlyDeleteMessage());
        return;
      }

      adminScorecardWritePending = true;
      const { error } = await client
        .from("scorecards")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", scorecardId)
        .eq("household_id", getAdminHouseholdId())
        .is("archived_at", null);
      adminScorecardWritePending = false;

      if (error) {
        showToast(friendlyDeleteMessage());
        return;
      }

      adminScorecardArchiveConfirmId = "";
      clearScorecardPendingWinner(scorecardId);
      setAdminLocalBonusState(scorecardId, null);
      closeAdminModal();
      await loadAdminScorecards();
      showToast("Scorecard archived.");
    }

    async function adjustScorecardScore(scorecardId, playerName, increment) {
      const client = getSupabaseClient();
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      const playerId = getScorecardPlayerId(scorecard?.players, playerName);
      if (adminScorecardWritePending) {
        return;
      }

      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      if (!scorecard || !session || !playerId) {
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

      adminScorecardWritePending = true;
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
      adminScorecardWritePending = false;

      if (error || !data) {
        showToast(friendlySaveMessage());
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

      const sessions = getAdminScorecardSessions(scorecardId).map((item) =>
        item.id === session.id ? mapScorecardSessionRow(data, scorecard) : item
      );
      adminScorecardSessionsById.set(scorecardId, sessions);
      renderAdminScorecardList();
      rerenderScorecardManageModal();
    }

    async function updateAdminActiveScorecardSession(scorecardId, payload) {
      const client = getSupabaseClient();
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      if (adminScorecardWritePending) {
        return null;
      }

      if (!client) {
        showToast(friendlySaveMessage());
        return null;
      }

      if (!scorecard || !session) {
        return null;
      }

      adminScorecardWritePending = true;
      const { data, error } = await client
        .from("scorecard_sessions")
        .update(payload)
        .eq("id", session.id)
        .eq("scorecard_id", scorecardId)
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .single();
      adminScorecardWritePending = false;

      if (error || !data) {
        return null;
      }

      const nextSession = mapScorecardSessionRow(data, scorecard);
      adminScorecardSessionsById.set(scorecardId, getAdminScorecardSessions(scorecardId).map((item) =>
        item.id === session.id ? nextSession : item
      ));
      renderAdminScorecardList();
      rerenderScorecardManageModal();
      rerenderScorecardWinnerModal();
      return nextSession;
    }

    async function undoScorecardAction(scorecardId) {
      const session = getAdminActiveScorecardSession(scorecardId);
      const scorecard = getAdminScorecardById(scorecardId);
      if (!session || !scorecard || adminScorecardWritePending) {
        return;
      }

      const action = popScorecardActionHistory(session.id);
      if (!action) {
        return;
      }

      const nextScores = { ...session.scores };
      action.changes.forEach((change) => {
        const playerId = getScorecardPlayerId(scorecard?.players, change.playerName);
        if (playerId) {
          nextScores[playerId] = change.previousScore;
        }
      });

      const nextSession = await updateAdminActiveScorecardSession(scorecardId, {
        scores: nextScores,
        score_events: appendScoreEvents(
          session.scoreEvents,
          action.changes.map((change) => buildScoreEvent(
            getScorecardPlayerId(scorecard.players, change.playerName),
            change.previousScore - change.nextScore,
            SCORE_EVENT_TYPES.undo
          )),
          scorecard.players
        )
      });
      if (!nextSession) {
        pushScorecardActionHistory(session.id, action);
        showToast(friendlySaveMessage());
        return;
      }

      showToast("Last score action undone.");
    }

    async function endScorecardGame(scorecardId) {
      const client = getSupabaseClient();
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      if (adminScorecardWritePending) {
        return;
      }

      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      if (!scorecard || !session) {
        return;
      }

      setAdminLocalBonusState(scorecardId, null);
      adminScorecardWritePending = true;
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
      adminScorecardWritePending = false;

      if (error || !data) {
        showToast(friendlySaveMessage());
        return;
      }

      adminScorecardSessionsById.set(scorecardId, getAdminScorecardSessions(scorecardId).map((item) =>
        item.id === session.id ? mapScorecardSessionRow(data, scorecard) : item
      ));
      renderAdminScorecardList();
      clearScorecardActionHistory(session.id);
      markScorecardPendingWinner(scorecardId, data.id);
      openScorecardWinnerModal(scorecardId);
    }

    async function startNextScorecardGame(scorecardId) {
      const scorecard = getAdminScorecardById(scorecardId);
      const activeSession = getAdminActiveScorecardSession(scorecardId);
      if (!scorecard || activeSession || adminScorecardWritePending) {
        return;
      }

      const freshSession = await createFreshScorecardSession(scorecard);
      if (!freshSession) {
        showToast(friendlySaveMessage());
        return;
      }

      clearScorecardActionHistory(freshSession.id);
      clearScorecardPendingWinner(scorecardId);
      adminScorecardArchiveConfirmId = "";
      setAdminLocalBonusState(scorecardId, null);
      adminScorecardSessionsById.set(scorecardId, [freshSession, ...getAdminScorecardSessions(scorecardId)]);
      renderAdminScorecardList();
      const nextFilter = adminModalContext?.filter || "month";
      closeAdminModal();
      openScorecardManageModal(scorecardId, nextFilter);
      showToast("New game started.");
    }

    async function beginScorecardBonusRound(scorecardId) {
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      if (!scorecard || !session || adminScorecardWritePending) {
        return;
      }

      const nextState = createLocalBonusState(session.id, scorecard.players, {
        ...session,
        wagers: buildScorecardBonusWagers(scorecard.players, {}, SCORECARD_BONUS_PHASES.entry),
        wagerResults: null,
        isFinalJeopardy: true
      });
      const nextSession = await updateAdminActiveScorecardSession(scorecardId, {
        wagers: buildScorecardBonusWagers(scorecard.players, {}, SCORECARD_BONUS_PHASES.entry),
        wager_results: null,
        is_final_jeopardy: true
      });
      if (!nextSession) {
        return;
      }

      setAdminLocalBonusState(scorecardId, nextState);
      rerenderScorecardManageModal();
      showToast("Bonus Round started.");
    }

    async function cancelScorecardBonusRound(scorecardId) {
      const nextSession = await updateAdminActiveScorecardSession(scorecardId, {
        wagers: null,
        wager_results: null,
        is_final_jeopardy: false
      });
      if (!nextSession) {
        return;
      }

      setAdminLocalBonusState(scorecardId, null);
      rerenderScorecardManageModal();
      showToast("Bonus Round canceled.");
    }

    async function lockAdminScorecardBonusWager(scorecardId, playerName, rawValue) {
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      const localBonusState = getAdminLocalBonusState(scorecardId);
      const playerId = getScorecardPlayerId(scorecard?.players, playerName);
      if (!scorecard || !session || !localBonusState || localBonusState.phase !== "entry" || !playerId) {
        return;
      }

      const currentScore = Math.max(0, getScorecardPlayerScore(session.scores, playerName, scorecard.players));
      const sanitized = sanitizeBonusWagerInputValue(rawValue);
      if (sanitized === "") {
        showToast("Enter a wager before locking it in.");
        return;
      }

      const parsedValue = Math.max(0, Number(sanitized));
      if (parsedValue > currentScore) {
        setAdminLocalBonusState(scorecardId, {
          ...localBonusState,
          wagerErrors: {
            ...localBonusState.wagerErrors,
            [playerId]: `Max wager: ${formatScorecardScore(currentScore)}`
          }
        });
        rerenderScorecardManageModal();
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
      setAdminLocalBonusState(scorecardId, nextState);
      const nextSession = await updateAdminActiveScorecardSession(scorecardId, {
        wagers: buildScorecardBonusWagers(scorecard.players, nextState.wagers, SCORECARD_BONUS_PHASES.entry),
        wager_results: null,
        is_final_jeopardy: true
      });
      if (!nextSession) {
        return;
      }
      rerenderScorecardManageModal();
      if (allLocalBonusWagersLocked(nextState)) {
        const existingAdvanceTimer = adminScorecardBonusAdvanceTimerById.get(scorecardId);
        if (existingAdvanceTimer) {
          window.clearTimeout(existingAdvanceTimer);
        }

        const timerId = window.setTimeout(async () => {
          adminScorecardBonusAdvanceTimerById.delete(scorecardId);
          const currentBonusState = getAdminLocalBonusState(scorecardId);
          if (!currentBonusState || currentBonusState.phase !== "entry" || !allLocalBonusWagersLocked(currentBonusState)) {
            return;
          }

          const advancedState = {
            ...currentBonusState,
            phase: "results"
          };
          setAdminLocalBonusState(scorecardId, advancedState);
          const updatedSession = await updateAdminActiveScorecardSession(scorecardId, {
            wagers: buildScorecardBonusWagers(scorecard.players, advancedState.wagers, SCORECARD_BONUS_PHASES.results),
            wager_results: buildScorecardBonusResults(scorecard.players, advancedState.results, SCORECARD_BONUS_PHASES.results),
            is_final_jeopardy: true
          });
          if (!updatedSession) {
            return;
          }
          rerenderScorecardManageModal();
        }, 350);
        adminScorecardBonusAdvanceTimerById.set(scorecardId, timerId);
      }
    }

    async function revealScorecardBonusWagers(scorecardId) {
      const scorecard = getAdminScorecardById(scorecardId);
      const localBonusState = getAdminLocalBonusState(scorecardId);
      if (!scorecard || !localBonusState) {
        return;
      }

      if (!allLocalBonusWagersLocked(localBonusState) || !allLocalBonusResultsSelected(localBonusState)) {
        showToast("Set every result before revealing wagers.");
        return;
      }

      const nextState = {
        ...localBonusState,
        phase: "reveal",
        revealed: true
      };
      setAdminLocalBonusState(scorecardId, nextState);
      const nextSession = await updateAdminActiveScorecardSession(scorecardId, {
        wagers: buildScorecardBonusWagers(scorecard.players, nextState.wagers, SCORECARD_BONUS_PHASES.reveal),
        wager_results: buildScorecardBonusResults(scorecard.players, nextState.results, SCORECARD_BONUS_PHASES.reveal),
        is_final_jeopardy: true
      });
      if (!nextSession) {
        return;
      }
      rerenderScorecardManageModal();
    }

    async function backOutOfAdminBonusReveal(scorecardId) {
      const scorecard = getAdminScorecardById(scorecardId);
      const localBonusState = getAdminLocalBonusState(scorecardId);
      if (!scorecard || !localBonusState) {
        return;
      }

      const nextState = {
        ...localBonusState,
        phase: "results",
        revealed: false
      };
      setAdminLocalBonusState(scorecardId, nextState);
      const nextSession = await updateAdminActiveScorecardSession(scorecardId, {
        wagers: buildScorecardBonusWagers(scorecard.players, nextState.wagers, SCORECARD_BONUS_PHASES.results),
        wager_results: buildScorecardBonusResults(scorecard.players, nextState.results, SCORECARD_BONUS_PHASES.results),
        is_final_jeopardy: true
      });
      if (!nextSession) {
        return;
      }
      rerenderScorecardManageModal();
    }

    async function applyScorecardBonusResults(scorecardId, wagerResults, localBonusStateOverride = null) {
      const client = getSupabaseClient();
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      const localBonusState = localBonusStateOverride || getAdminLocalBonusState(scorecardId);
      if (adminScorecardWritePending) {
        return;
      }

      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      if (!scorecard || !session || !localBonusState) {
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

      adminScorecardWritePending = true;
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
      adminScorecardWritePending = false;

      if (error || !data) {
        showToast(friendlySaveMessage());
        return;
      }

      pushScorecardActionHistory(session.id, {
        type: "bonus-round",
        changes: historyChanges
      });

      adminScorecardSessionsById.set(scorecardId, getAdminScorecardSessions(scorecardId).map((item) =>
        item.id === session.id ? mapScorecardSessionRow(data, scorecard) : item
      ));
      setAdminLocalBonusState(scorecardId, null);
      renderAdminScorecardList();
      rerenderScorecardManageModal();
      showToast("Bonus Round applied.");
    }

    function handleAdminScorecardListClick(event) {
      const card = event.target.closest("[data-scorecard-id]");
      if (!card) {
        return;
      }

      openScorecardManageModal(card.getAttribute("data-scorecard-id"));
    }
