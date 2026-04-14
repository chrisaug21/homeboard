    const SUPABASE_URL = '%%SUPABASE_URL%%';
    const SUPABASE_KEY = '%%SUPABASE_KEY%%';
    const GOOGLE_CAL_KEY = '%%GOOGLE_CAL_KEY%%';
    const UNSPLASH_ACCESS_KEY = '%%UNSPLASH_ACCESS_KEY%%';
    const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
    const isAdminMode = pathname === "/admin";
    let sb = null;

    function initSupabaseClient() {
      if (sb) {
        return sb;
      }

      if (!window.supabase || typeof window.supabase.createClient !== "function") {
        return null;
      }

      try {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      } catch(e) {
        console.warn('Supabase unavailable, running with hardcoded data.', e);
      }

      return sb;
    }

    function getSupabaseClient() {
      return sb || initSupabaseClient();
    }

    const VERSION = "1.9.20";
    const rotationIntervalMs = 30000;
    const displayApp = document.getElementById("display-app");
    const adminApp = document.getElementById("admin-app");
    const LAST_SYNCED_KEY = "homeboard_last_synced";
    const DISPLAY_SCREEN_KEYS = ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns", "scorecards", "rsvp"];

    const TODO_HOUSEHOLD_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const DISPLAY_HOUSEHOLD_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const RSVP_RETIRE_AFTER_DATE = "2026-10-10";
    const RSVP_MATCH_SUGGESTION_THRESHOLD = 2.2;
    const RSVP_MATCH_DUPLICATE_THRESHOLD = 5.2;
    const RSVP_MATCH_LOW_CONFIDENCE_THRESHOLD = 4.6;
    const RSVP_MATCH_AUTO_LINK_THRESHOLD = 6.4;
    const RSVP_LOW_CONFIDENCE_CONFIRM_KEY = "homeboard_rsvp_low_confidence_confirmations";
    const RSVP_GENERIC_FAMILY_TOKENS = ["family", "household", "guests", "guest", "party", "crew"];

    const mealTypeOptions = [
      {
        value: "cooking",
        adminLabel: "Cooking",
        label: "Cooking 🍳",
        className: "meal-type--cooking"
      },
      {
        value: "hellofresh",
        adminLabel: "HelloFresh",
        label: "HelloFresh 📦",
        className: "meal-type--hellofresh"
      },
      {
        value: "going_out",
        adminLabel: "Going Out",
        label: "Going Out 🍽️",
        className: "meal-type--going-out"
      },
      {
        value: "delivery",
        adminLabel: "Delivery",
        label: "Delivery 🛵",
        className: "meal-type--delivery"
      },
      {
        value: "pick_up",
        adminLabel: "Pick Up",
        label: "Pick Up 🥡",
        className: "meal-type--pick-up"
      },
      {
        value: "fend_for_yourself",
        adminLabel: "Fend for Yourself",
        label: "Fend for Yourself 😅",
        className: "meal-type--fend-for-yourself"
      },
      {
        value: "date_night",
        adminLabel: "Date Night",
        label: "Date Night 💫",
        className: "meal-type--date-night"
      }
    ];
    const mealTypeConfig = Object.fromEntries(
      mealTypeOptions.map((option) => [
        option.value,
        {
          label: option.label,
          className: option.className
        }
      ])
    );

    function getMonday(date) {
      const next = new Date(date);
      const day = (next.getDay() + 6) % 7;
      next.setDate(next.getDate() - day);
      next.setHours(0, 0, 0, 0);
      return next;
    }

    function formatClock(date) {
      return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit"
      }).format(date);
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function formatDateKey(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function parseLocalDateString(dateString) {
      if (!dateString) {
        return null;
      }

      return new Date(dateString + "T00:00:00");
    }

    function formatHeaderDate(date) {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric"
      }).format(date);
    }

    function formatMonthDay(date) {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric"
      }).format(date);
    }

    function formatCalendarLabel(date) {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
      }).format(date);
    }

    function formatMonthYear(date) {
      return new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric"
      }).format(date);
    }

    function hexToRgba(hex, alpha = 1) {
      const normalized = String(hex || "").trim().replace(/^#/, "");
      const expanded = normalized.length === 3
        ? normalized.split("").map((char) => char + char).join("")
        : normalized;

      if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
        return `rgba(120, 113, 108, ${alpha})`;
      }

      const intValue = parseInt(expanded, 16);
      const red = (intValue >> 16) & 255;
      const green = (intValue >> 8) & 255;
      const blue = intValue & 255;

      return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }

    function getConfiguredMemberColor(members, name) {
      if (!Array.isArray(members)) {
        return "";
      }

      const normalizedName = String(name || "").trim().toLowerCase();
      if (!normalizedName) {
        return "";
      }

      const match = members.find((member) =>
        String(member?.name || "").trim().toLowerCase() === normalizedName
      );

      return String(match?.color || "").trim();
    }

    function formatLongDate(dateString) {
      const parsedDate = parseLocalDateString(dateString);

      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        return "Date TBD";
      }

      return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric"
      }).format(parsedDate);
    }

    function getDaysUntil(dateString) {
      const parsedDate = parseLocalDateString(dateString);

      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        return null;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      parsedDate.setHours(0, 0, 0, 0);
      return Math.round((parsedDate - today) / 86400000);
    }

    function getMonthGridStart(date) {
      const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const start = new Date(firstOfMonth);
      start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
      start.setHours(0, 0, 0, 0);
      return start;
    }

    function normalizeDisplayScreenKey(key) {
      if (key === "calendar") {
        return "calendar";
      }

      if (key === "meal_plan") {
        return "meals";
      }

      return key;
    }

    function buildScorecardScreenKey(scorecardId) {
      const safeId = String(scorecardId || "").trim();
      return safeId ? `scorecard_${safeId}` : "";
    }

    function isScorecardScreenKey(key) {
      return /^scorecard_[a-z0-9-]+$/i.test(String(key || "").trim());
    }

    function getScorecardIdFromScreenKey(key) {
      if (!isScorecardScreenKey(key)) {
        return "";
      }

      return String(key).trim().slice("scorecard_".length);
    }

    function expandLegacyCalendarScreen(screenKey) {
      if (screenKey === "calendar") {
        return ["upcoming_calendar", "monthly_calendar"];
      }

      return [screenKey];
    }

    function isRsvpDisplayScreenAvailable(referenceDate = new Date()) {
      const date = referenceDate instanceof Date ? new Date(referenceDate) : new Date(referenceDate);
      if (Number.isNaN(date.getTime())) {
        return true;
      }

      date.setHours(0, 0, 0, 0);
      return formatDateKey(date) <= RSVP_RETIRE_AFTER_DATE;
    }

    function getConfigurableDisplayScreenKeys(referenceDate = new Date()) {
      return DISPLAY_SCREEN_KEYS.filter((key) => key !== "rsvp" || isRsvpDisplayScreenAvailable(referenceDate));
    }

    function normalizeDisplayScreenList(screenList, fallback = DISPLAY_SCREEN_KEYS, options = {}) {
      const allowScorecardScreens = options.allowScorecardScreens === true;
      if (!Array.isArray(screenList) || screenList.length === 0) {
        return [...fallback];
      }

      const normalized = [];
      screenList.forEach((key) => {
        if (allowScorecardScreens && isScorecardScreenKey(key) && !normalized.includes(key)) {
          normalized.push(String(key).trim());
          return;
        }

        expandLegacyCalendarScreen(normalizeDisplayScreenKey(key)).forEach((expandedKey) => {
          if (DISPLAY_SCREEN_KEYS.includes(expandedKey) && !normalized.includes(expandedKey)) {
            normalized.push(expandedKey);
          }
        });
      });

      return normalized.length > 0 ? normalized : [...fallback];
    }

    function normalizeTimerIntervals(timerIntervals) {
      const normalized = {};
      const source = timerIntervals && typeof timerIntervals === "object" ? timerIntervals : {};
      const legacyCalendarTimer = parseInt(source.calendar, 10);

      DISPLAY_SCREEN_KEYS.forEach((key) => {
        const rawValue = source[key];
        const parsedValue = parseInt(rawValue, 10);

        if (Number.isFinite(parsedValue) && parsedValue > 0) {
          normalized[key] = parsedValue;
          return;
        }

        if ((key === "upcoming_calendar" || key === "monthly_calendar")
          && Number.isFinite(legacyCalendarTimer)
          && legacyCalendarTimer > 0) {
          normalized[key] = legacyCalendarTimer;
        }
      });

      return normalized;
    }

    function normalizeDisplaySettings(displaySettings) {
      const settings = displaySettings && typeof displaySettings === "object"
        ? { ...displaySettings }
        : {};
      const configurableDisplayScreenKeys = getConfigurableDisplayScreenKeys();

      settings.active_screens = normalizeDisplayScreenList(settings.active_screens, configurableDisplayScreenKeys, {
        allowScorecardScreens: true
      }).filter((key) => configurableDisplayScreenKeys.includes(key) || isScorecardScreenKey(key));
      settings.screen_order = normalizeDisplayScreenList(settings.screen_order, configurableDisplayScreenKeys, {
        allowScorecardScreens: true
      }).filter((key) => configurableDisplayScreenKeys.includes(key) || isScorecardScreenKey(key));
      settings.timer_intervals = normalizeTimerIntervals(settings.timer_intervals);
      delete settings.calendar_view;

      return settings;
    }

    function normalizeScorecardPlayers(players) {
      if (!Array.isArray(players)) {
        return [];
      }

      return players
        .map((player, index) => {
          const name = String(player?.name || "").trim();
          const fallbackIdBase = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || `player-${index + 1}`;
          const id = String(player?.id || "").trim() || `player-${index + 1}-${fallbackIdBase}`;
          return {
            id,
            name,
            color: String(player?.color || "").trim()
          };
        })
        .filter((player) => player.name && player.id);
    }

    function normalizeScorecardIncrements(increments) {
      if (!Array.isArray(increments)) {
        return [];
      }

      return increments
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value !== 0);
    }

    function createScorecardZeroScores(players) {
      return Object.fromEntries(
        normalizeScorecardPlayers(players).map((player) => [player.id, 0])
      );
    }

    function normalizeScorecardScores(scores, players) {
      const playerList = normalizeScorecardPlayers(players);
      const source = scores && typeof scores === "object" ? scores : {};
      const normalized = {};

      playerList.forEach((player) => {
        const rawValue = Number(source[player.id] ?? source[player.name]);
        normalized[player.id] = Number.isFinite(rawValue) ? rawValue : 0;
      });

      return normalized;
    }

    function getScorecardPlayerByName(players, playerName) {
      const safeName = String(playerName || "").trim();
      if (!safeName) {
        return null;
      }

      return normalizeScorecardPlayers(players).find((player) => player.name === safeName) || null;
    }

    function getScorecardPlayerById(players, playerId) {
      const safeId = String(playerId || "").trim();
      if (!safeId) {
        return null;
      }

      return normalizeScorecardPlayers(players).find((player) => player.id === safeId) || null;
    }

    function getScorecardPlayerId(players, playerName) {
      return getScorecardPlayerByName(players, playerName)?.id || "";
    }

    function getScorecardPlayerScore(scores, playerOrName, players = []) {
      const source = scores && typeof scores === "object" ? scores : {};
      const player = typeof playerOrName === "object" && playerOrName
        ? normalizeScorecardPlayers(players).find((entry) => entry.id === playerOrName.id || entry.name === playerOrName.name) || null
        : getScorecardPlayerByName(players, playerOrName);
      const rawValue = player
        ? Number(source[player.id] ?? source[player.name])
        : Number(source[String(playerOrName || "").trim()]);
      return Number.isFinite(rawValue) ? rawValue : 0;
    }

    function applyScorecardIncrement(currentScore, increment, allowNegative) {
      const nextScore = (Number(currentScore) || 0) + (Number(increment) || 0);
      if (allowNegative) {
        return nextScore;
      }

      return Math.max(0, nextScore);
    }

    const SCORECARD_BONUS_PHASES = {
      entry: "entry",
      reveal: "reveal",
      results: "results",
      complete: "complete"
    };
    const SCORECARD_BONUS_META_KEY = "__phase";
    const scorecardActionHistoryBySessionId = new Map();
    const scorecardPendingWinnerSessionByScorecardId = new Map();
    const SCORE_EVENT_TYPES = {
      increment: "increment",
      undo: "undo",
      bonusRound: "bonus_round"
    };

    function normalizeScorecardBonusPhase(value) {
      const normalized = String(value || "").trim().toLowerCase();
      return Object.values(SCORECARD_BONUS_PHASES).includes(normalized) ? normalized : "";
    }

    function getScorecardBonusValues(source, players) {
      const safeSource = source && typeof source === "object" ? source : {};
      const normalized = {};
      normalizeScorecardPlayers(players).forEach((player) => {
        const rawValue = Number(safeSource[player.id] ?? safeSource[player.name]);
        if (Number.isFinite(rawValue)) {
          normalized[player.id] = Math.max(0, rawValue);
        }
      });
      return normalized;
    }

    function getScorecardBonusResultValues(source, players) {
      const safeSource = source && typeof source === "object" ? source : {};
      const normalized = {};
      normalizeScorecardPlayers(players).forEach((player) => {
        const value = String(safeSource[player.id] ?? safeSource[player.name] ?? "").trim().toLowerCase();
        if (value === "correct" || value === "incorrect") {
          normalized[player.id] = value;
        }
      });
      return normalized;
    }

    function normalizeScoreEventType(value) {
      const normalized = String(value || "").trim().toLowerCase();
      return Object.values(SCORE_EVENT_TYPES).includes(normalized) ? normalized : SCORE_EVENT_TYPES.increment;
    }

    function normalizeScoreEvents(events, players) {
      const playerList = normalizeScorecardPlayers(players);
      const validPlayers = new Set(playerList.map((player) => player.id));
      return Array.isArray(events) ? events
        .map((event) => {
          const playerId = String(event?.playerId || event?.player || "").trim();
          const normalizedPlayerId = validPlayers.has(playerId)
            ? playerId
            : getScorecardPlayerByName(playerList, playerId)?.id || "";
          if (!normalizedPlayerId || (validPlayers.size && !validPlayers.has(normalizedPlayerId))) {
            return null;
          }

          const amount = Number(event?.amount);
          return {
            playerId: normalizedPlayerId,
            amount: Number.isFinite(amount) ? amount : 0,
            type: normalizeScoreEventType(event?.type),
            timestamp: String(event?.timestamp || "").trim() || new Date().toISOString()
          };
        })
        .filter(Boolean) : [];
    }

    function buildScoreEvent(playerId, amount, type, timestamp = new Date().toISOString()) {
      return {
        player: String(playerId || "").trim(),
        amount: Number(amount) || 0,
        type: normalizeScoreEventType(type),
        timestamp: String(timestamp || "").trim() || new Date().toISOString()
      };
    }

    function appendScoreEvents(existingEvents, nextEvents, players) {
      return [
        ...normalizeScoreEvents(existingEvents, players),
        ...normalizeScoreEvents(nextEvents, players)
      ];
    }

    function buildScorecardBonusWagers(players, wagers = {}, phase = SCORECARD_BONUS_PHASES.entry) {
      return {
        [SCORECARD_BONUS_META_KEY]: normalizeScorecardBonusPhase(phase) || SCORECARD_BONUS_PHASES.entry,
        ...getScorecardBonusValues(wagers, players)
      };
    }

    function buildScorecardBonusResults(players, results = {}, phase = SCORECARD_BONUS_PHASES.results) {
      return {
        [SCORECARD_BONUS_META_KEY]: normalizeScorecardBonusPhase(phase) || SCORECARD_BONUS_PHASES.results,
        ...getScorecardBonusResultValues(results, players)
      };
    }

    function getScorecardBonusPhase(session) {
      const resultPhase = normalizeScorecardBonusPhase(session?.wagerResults?.[SCORECARD_BONUS_META_KEY]);
      if (resultPhase === SCORECARD_BONUS_PHASES.reveal
        || resultPhase === SCORECARD_BONUS_PHASES.results
        || resultPhase === SCORECARD_BONUS_PHASES.complete) {
        return resultPhase;
      }

      const wagerPhase = normalizeScorecardBonusPhase(session?.wagers?.[SCORECARD_BONUS_META_KEY]);
      return wagerPhase || "";
    }

    function isScorecardBonusRoundActive(session) {
      const phase = getScorecardBonusPhase(session);
      return phase === SCORECARD_BONUS_PHASES.entry
        || phase === SCORECARD_BONUS_PHASES.reveal
        || phase === SCORECARD_BONUS_PHASES.results;
    }

    function getScorecardBonusWagers(session, players) {
      return getScorecardBonusValues(session?.wagers, players);
    }

    function getScorecardBonusResults(session, players) {
      return getScorecardBonusResultValues(session?.wagerResults, players);
    }

    function countScorecardLockedWagers(session, players) {
      return Object.keys(getScorecardBonusWagers(session, players)).length;
    }

    function getScorecardActionHistory(sessionId) {
      if (!sessionId) {
        return [];
      }

      return scorecardActionHistoryBySessionId.get(sessionId) || [];
    }

    function pushScorecardActionHistory(sessionId, action) {
      if (!sessionId || !action || !Array.isArray(action.changes) || !action.changes.length) {
        return;
      }

      const existing = getScorecardActionHistory(sessionId).slice();
      existing.push({
        type: String(action.type || "score").trim() || "score",
        changes: action.changes
          .map((change) => ({
            playerName: String(change?.playerName || "").trim(),
            previousScore: Number(change?.previousScore) || 0,
            nextScore: Number(change?.nextScore) || 0,
            increment: Number(change?.increment) || 0
          }))
          .filter((change) => change.playerName)
      });
      scorecardActionHistoryBySessionId.set(sessionId, existing);
    }

    function popScorecardActionHistory(sessionId) {
      if (!sessionId) {
        return null;
      }

      const existing = getScorecardActionHistory(sessionId).slice();
      const action = existing.pop() || null;
      if (existing.length) {
        scorecardActionHistoryBySessionId.set(sessionId, existing);
      } else {
        scorecardActionHistoryBySessionId.delete(sessionId);
      }
      return action;
    }

    function clearScorecardActionHistory(sessionId) {
      if (!sessionId) {
        return;
      }

      scorecardActionHistoryBySessionId.delete(sessionId);
    }

    function markScorecardPendingWinner(scorecardId, sessionId) {
      const safeScorecardId = String(scorecardId || "").trim();
      const safeSessionId = String(sessionId || "").trim();
      if (!safeScorecardId || !safeSessionId) {
        return;
      }

      scorecardPendingWinnerSessionByScorecardId.set(safeScorecardId, safeSessionId);
    }

    function getScorecardPendingWinnerSessionId(scorecardId) {
      const safeScorecardId = String(scorecardId || "").trim();
      return safeScorecardId ? (scorecardPendingWinnerSessionByScorecardId.get(safeScorecardId) || "") : "";
    }

    function clearScorecardPendingWinner(scorecardId) {
      const safeScorecardId = String(scorecardId || "").trim();
      if (!safeScorecardId) {
        return;
      }

      scorecardPendingWinnerSessionByScorecardId.delete(safeScorecardId);
    }

    function getScorecardWinner(scores, players = []) {
      const playerList = normalizeScorecardPlayers(players);
      const source = scores && typeof scores === "object" ? scores : {};
      const entries = playerList.length
        ? playerList.map((player) => ({
            id: player.id,
            name: player.name,
            score: getScorecardPlayerScore(source, player, playerList)
          }))
        : Object.entries(source).map(([name, score]) => ({
            name,
            score: Number.isFinite(Number(score)) ? Number(score) : 0
          }));
      if (!entries.length) {
        return null;
      }

      const sorted = entries
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return a.name.localeCompare(b.name);
        });

      if (!sorted.length) {
        return null;
      }

      const leaders = sorted.filter((entry) => entry.score === sorted[0].score);
      return leaders.length === 1 ? leaders[0].name : leaders.map((entry) => entry.name).join(", ");
    }

    function getScorecardLeaders(scores, players = []) {
      const playerList = normalizeScorecardPlayers(players);
      const source = scores && typeof scores === "object" ? scores : {};
      const entries = (playerList.length
        ? playerList.map((player) => ({
            name: player.name,
            score: getScorecardPlayerScore(source, player, playerList)
          }))
        : Object.entries(source).map(([name, score]) => ({
            name: String(name || "").trim(),
            score: Number.isFinite(Number(score)) ? Number(score) : 0
          })))
        .filter((entry) => entry.name);
      if (!entries.length) {
        return [];
      }

      const topScore = Math.max(...entries.map((entry) => entry.score));
      return entries
        .filter((entry) => entry.score === topScore)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((entry) => entry.name);
    }

    function mapScorecardRow(row) {
      const players = normalizeScorecardPlayers(row?.players);
      return {
        id: row?.id || "",
        householdId: row?.household_id || "",
        name: String(row?.name || "").trim() || "Scorecard",
        increments: normalizeScorecardIncrements(row?.increments),
        players,
        showHistory: row?.show_history !== false,
        allowNegative: row?.allow_negative === true,
        createdAt: row?.created_at || null,
        archivedAt: row?.archived_at || null
      };
    }

    function mapScorecardSessionRow(row, scorecard) {
      const players = scorecard?.players || [];
      const scores = normalizeScorecardScores(row?.scores, players);
      const wagerPhase = normalizeScorecardBonusPhase(row?.wagers?.[SCORECARD_BONUS_META_KEY]) || SCORECARD_BONUS_PHASES.entry;
      const resultPhase = normalizeScorecardBonusPhase(row?.wager_results?.[SCORECARD_BONUS_META_KEY]) || SCORECARD_BONUS_PHASES.results;
      return {
        id: row?.id || "",
        scorecardId: row?.scorecard_id || "",
        householdId: row?.household_id || "",
        startedAt: row?.started_at || null,
        endedAt: row?.ended_at || null,
        scores,
        wagers: row?.wagers && typeof row.wagers === "object"
          ? buildScorecardBonusWagers(players, row.wagers, wagerPhase)
          : null,
        wagerResults: row?.wager_results && typeof row.wager_results === "object"
          ? buildScorecardBonusResults(players, row.wager_results, resultPhase)
          : null,
        scoreEvents: normalizeScoreEvents(row?.score_events, players),
        winner: String(row?.winner || "").trim() || getScorecardWinner(scores, players),
        isFinalJeopardy: row?.is_final_jeopardy === true,
        createdAt: row?.created_at || null
      };
    }

    function formatScorecardScore(value) {
      const safeValue = Number(value) || 0;
      return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0
      }).format(safeValue);
    }

    function formatScorecardSessionDate(value) {
      if (!value) {
        return "Unknown date";
      }

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "Unknown date";
      }

      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(date);
    }

    function formatScoreEventTime(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "Unknown time";
      }

      return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit"
      }).format(date);
    }

    function formatScoreEventTypeLabel(value) {
      switch (normalizeScoreEventType(value)) {
        case SCORE_EVENT_TYPES.undo:
          return "Undo";
        case SCORE_EVENT_TYPES.bonusRound:
          return "Bonus round";
        default:
          return "Increment";
      }
    }

    function formatScorecardSessionDuration(startedAt, endedAt) {
      const start = startedAt ? new Date(startedAt) : null;
      const end = endedAt ? new Date(endedAt) : null;

      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return "Duration unknown";
      }

      const totalMinutes = Math.max(0, Math.round((end - start) / 60000));
      if (totalMinutes < 60) {
        return `${totalMinutes}m`;
      }

      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
    }

    function formatRelativeTimestamp(value, emptyLabel = "") {
      if (!value) {
        return emptyLabel;
      }

      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) {
        return emptyLabel;
      }

      const diffMs = Date.now() - date.getTime();
      if (diffMs < 60 * 1000) {
        return "just now";
      }

      const diffMinutes = Math.floor(diffMs / (60 * 1000));
      if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
      }

      const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
      if (diffHours < 24) {
        return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
      }

      const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    }

    function normalizeMatchName(value) {
      return String(value || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getMatchTokens(value) {
      return normalizeMatchName(value)
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean);
    }

    function getLastNameToken(value) {
      const tokens = getMatchTokens(value);
      return tokens.length ? tokens[tokens.length - 1] : "";
    }

    function getPrimaryFamilyToken(value) {
      const tokens = getMatchTokens(value);
      for (let index = tokens.length - 1; index >= 0; index -= 1) {
        if (!RSVP_GENERIC_FAMILY_TOKENS.includes(tokens[index])) {
          return tokens[index];
        }
      }
      return tokens.length ? tokens[tokens.length - 1] : "";
    }

    function getFirstNameToken(value) {
      const tokens = getMatchTokens(value);
      return tokens.length ? tokens[0] : "";
    }

    function buildBigrams(value) {
      const normalized = normalizeMatchName(value).replace(/\s+/g, "");
      if (!normalized) return [];
      if (normalized.length === 1) return [normalized];
      const bigrams = [];
      for (let index = 0; index < normalized.length - 1; index += 1) {
        bigrams.push(normalized.slice(index, index + 2));
      }
      return bigrams;
    }

    function getDiceCoefficient(a, b) {
      const first = buildBigrams(a);
      const second = buildBigrams(b);
      if (!first.length || !second.length) {
        return 0;
      }
      const remaining = [...second];
      let matches = 0;
      first.forEach((token) => {
        const idx = remaining.indexOf(token);
        if (idx !== -1) {
          matches += 1;
          remaining.splice(idx, 1);
        }
      });
      return (2 * matches) / (first.length + second.length);
    }

    function scoreInvitedPartyMatch(rsvpName, partyName) {
      const normalizedRsvp = normalizeMatchName(rsvpName);
      const normalizedParty = normalizeMatchName(partyName);
      if (!normalizedRsvp || !normalizedParty) {
        return 0;
      }

      const rsvpTokens = getMatchTokens(normalizedRsvp);
      const partyTokens = getMatchTokens(normalizedParty);
      const overlapCount = rsvpTokens.filter((token) => partyTokens.includes(token)).length;
      const lastNameMatches = getLastNameToken(normalizedRsvp) && getLastNameToken(normalizedRsvp) === getLastNameToken(normalizedParty);
      const primaryFamilyToken = getPrimaryFamilyToken(normalizedRsvp);
      const familyTokenAppearsInParty = primaryFamilyToken && partyTokens.includes(primaryFamilyToken);
      const firstNameMatches = rsvpTokens[0] && rsvpTokens[0] === partyTokens[0];
      const exactMatch = normalizedRsvp === normalizedParty;
      const stringSimilarity = getDiceCoefficient(normalizedRsvp, normalizedParty);

      let score = 0;
      if (lastNameMatches) score += 4.2;
      if (familyTokenAppearsInParty && !lastNameMatches) score += 4.4;
      if (firstNameMatches) score += 1.2;
      if (overlapCount > 0) score += Math.min(2.4, overlapCount * 1.2);
      if (exactMatch) score += 2.4;
      score += stringSimilarity * 2.4;

      return Number(score.toFixed(3));
    }

    function getUniqueSingleNameMatch(rsvpName, invitedParties) {
      const tokens = getMatchTokens(rsvpName);
      if (tokens.length !== 1) {
        return null;
      }

      const targetName = tokens[0];
      const matches = (Array.isArray(invitedParties) ? invitedParties : [])
        .filter((party) => getFirstNameToken(party.name) === targetName)
        .map((party) => ({
          ...party,
          matchScore: Math.max(scoreInvitedPartyMatch(rsvpName, party.name), RSVP_MATCH_AUTO_LINK_THRESHOLD)
        }));

      return matches.length === 1 ? matches[0] : null;
    }

    function getInvitedPartySuggestions(rsvpName, invitedParties, limit = 3, minScore = RSVP_MATCH_SUGGESTION_THRESHOLD) {
      const uniqueSingleNameMatch = getUniqueSingleNameMatch(rsvpName, invitedParties);
      return (Array.isArray(invitedParties) ? invitedParties : [])
        .map((party) => ({
          ...party,
          matchScore: uniqueSingleNameMatch && uniqueSingleNameMatch.id === party.id
            ? uniqueSingleNameMatch.matchScore
            : scoreInvitedPartyMatch(rsvpName, party.name)
        }))
        .filter((party) => party.matchScore >= minScore)
        .sort((a, b) => {
          if (b.matchScore !== a.matchScore) {
            return b.matchScore - a.matchScore;
          }
          return String(a.name || "").localeCompare(String(b.name || ""));
        })
        .slice(0, limit);
    }

    function getBestInvitedPartyMatch(rsvpName, invitedParties) {
      return getInvitedPartySuggestions(rsvpName, invitedParties, 1, 0)[0] || null;
    }

    function isHighConfidenceRsvpMatch(score) {
      return Number(score) >= RSVP_MATCH_AUTO_LINK_THRESHOLD;
    }

    function readLowConfidenceConfirmations() {
      try {
        return JSON.parse(localStorage.getItem(RSVP_LOW_CONFIDENCE_CONFIRM_KEY) || "{}");
      } catch {
        return {};
      }
    }

    function getLowConfidenceConfirmationKey(rsvpId, partyId) {
      return `${rsvpId}:${partyId}`;
    }

    function isLowConfidenceMatchConfirmed(rsvpId, partyId) {
      if (!rsvpId || !partyId) return false;
      const saved = readLowConfidenceConfirmations();
      return Boolean(saved[getLowConfidenceConfirmationKey(rsvpId, partyId)]);
    }

    function setLowConfidenceMatchConfirmed(rsvpId, partyId, confirmed = true) {
      if (!rsvpId || !partyId) return;
      const saved = readLowConfidenceConfirmations();
      const key = getLowConfidenceConfirmationKey(rsvpId, partyId);
      if (confirmed) {
        saved[key] = true;
      } else {
        delete saved[key];
      }
      localStorage.setItem(RSVP_LOW_CONFIDENCE_CONFIRM_KEY, JSON.stringify(saved));
    }

    function mapWeddingRsvp(row) {
      return {
        id: row.id,
        name: row.name || "Unnamed RSVP",
        attending: row.attending === true,
        guestCount: Math.max(0, parseInt(row.guest_count, 10) || 0),
        createdAt: row.created_at || null,
        status: row.status || "active",
        mergedIntoPartyId: row.merged_into_party_id || null
      };
    }

    function mapInvitedParty(row) {
      return {
        id: row.id,
        name: row.name || "Unnamed Party",
        invitedCount: Math.max(0, parseInt(row.invited_count, 10) || 0),
        rsvpId: row.rsvp_id || null,
        createdAt: row.created_at || null
      };
    }

    function buildWeddingRsvpSnapshot(rsvps, invitedParties) {
      const allRsvps = Array.isArray(rsvps) ? rsvps : [];
      const rsvpList = allRsvps.filter((rsvp) => rsvp.status === "active");
      const supersededRsvps = allRsvps.filter((rsvp) => rsvp.status === "superseded");
      const partyList = Array.isArray(invitedParties) ? invitedParties : [];
      const rsvpById = new Map(rsvpList.map((rsvp) => [rsvp.id, rsvp]));
      const hydratedParties = partyList.map((party) => ({
        ...party,
        linkedRsvp: party.rsvpId ? (rsvpById.get(party.rsvpId) || null) : null
      }));
      hydratedParties.forEach((party) => {
        party.matchScore = party.linkedRsvp
          ? scoreInvitedPartyMatch(party.linkedRsvp.name, party.name)
          : null;
        party.supersededRsvps = supersededRsvps
          .filter((rsvp) => rsvp.mergedIntoPartyId === party.id)
          .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      });
      const matchedRsvpIds = new Set(
        hydratedParties
          .map((party) => party.rsvpId)
          .filter(Boolean)
      );
      const unmatchedRsvps = rsvpList.filter((rsvp) => !matchedRsvpIds.has(rsvp.id));
      const reviewItems = [];
      const unmatchedBestMatches = new Map();
      const duplicateMatchesByParty = new Map();

      unmatchedRsvps.forEach((rsvp) => {
        const bestOverallMatch = getBestInvitedPartyMatch(rsvp.name, hydratedParties);
        unmatchedBestMatches.set(rsvp.id, bestOverallMatch);
        if (bestOverallMatch && bestOverallMatch.rsvpId && bestOverallMatch.matchScore >= RSVP_MATCH_DUPLICATE_THRESHOLD) {
          const duplicateMatches = duplicateMatchesByParty.get(bestOverallMatch.id) || [];
          duplicateMatches.push({ rsvp, bestScore: bestOverallMatch.matchScore });
          duplicateMatchesByParty.set(bestOverallMatch.id, duplicateMatches);
        }
      });

      unmatchedRsvps.forEach((rsvp) => {
        const bestOverallMatch = unmatchedBestMatches.get(rsvp.id) || null;
        if (bestOverallMatch && bestOverallMatch.rsvpId && bestOverallMatch.matchScore >= RSVP_MATCH_DUPLICATE_THRESHOLD) {
          const duplicateParty = hydratedParties.find((party) => party.id === bestOverallMatch.id) || null;
          const duplicateMatches = duplicateMatchesByParty.get(bestOverallMatch.id) || [];
          reviewItems.push({
            id: rsvp.id,
            issueType: "duplicate",
            issueLabel: "Duplicate",
            rsvp,
            matchedParty: null,
            competingParty: duplicateParty,
            competingRsvp: rsvpById.get(bestOverallMatch.rsvpId) || null,
            competingRsvps: duplicateMatches
              .map((match) => match.rsvp)
              .filter((matchRsvp) => matchRsvp.id !== rsvp.id)
              .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
            suggestions: [],
            bestScore: bestOverallMatch.matchScore
          });
          return;
        }

        reviewItems.push({
          id: rsvp.id,
          issueType: "unmatched",
          issueLabel: "Unmatched",
          rsvp,
          matchedParty: null,
          competingParty: null,
          competingRsvp: null,
          competingRsvps: [],
          suggestions: getInvitedPartySuggestions(
            rsvp.name,
            hydratedParties.filter((party) => !party.rsvpId),
            3
          ),
          bestScore: bestOverallMatch ? bestOverallMatch.matchScore : 0
        });
      });

      hydratedParties.forEach((party) => {
        if (!party.linkedRsvp) return;

        if (party.linkedRsvp.attending === true && party.linkedRsvp.guestCount > party.invitedCount) {
          reviewItems.push({
            id: party.linkedRsvp.id,
            issueType: "count_mismatch",
            issueLabel: "Count mismatch",
            rsvp: party.linkedRsvp,
            matchedParty: party,
            competingParty: null,
            competingRsvp: null,
            competingRsvps: [],
            suggestions: [],
            bestScore: party.matchScore || 0
          });
          return;
        }

        if (
          (party.matchScore || 0) < RSVP_MATCH_LOW_CONFIDENCE_THRESHOLD
          && !isLowConfidenceMatchConfirmed(party.linkedRsvp.id, party.id)
        ) {
          reviewItems.push({
            id: party.linkedRsvp.id,
            issueType: "low_confidence",
            issueLabel: "Low confidence",
            rsvp: party.linkedRsvp,
            matchedParty: party,
            competingParty: null,
            competingRsvp: null,
            competingRsvps: [],
            suggestions: getInvitedPartySuggestions(party.linkedRsvp.name, hydratedParties, 3, 0),
            bestScore: party.matchScore || 0
          });
        }
      });

      const attendingGuests = hydratedParties.reduce((sum, party) => {
        if (!party.linkedRsvp || party.linkedRsvp.attending !== true) return sum;
        return sum + Math.min(party.linkedRsvp.guestCount, party.invitedCount);
      }, 0);
      const declinedGuests = hydratedParties.reduce((sum, party) => {
        if (!party.linkedRsvp) return sum;
        if (party.linkedRsvp.attending === false) {
          return sum + party.invitedCount;
        }
        if (party.linkedRsvp.attending === true && party.linkedRsvp.guestCount < party.invitedCount) {
          return sum + (party.invitedCount - party.linkedRsvp.guestCount);
        }
        return sum;
      }, 0);
      const pendingGuests = hydratedParties
        .filter((party) => !party.rsvpId)
        .reduce((sum, party) => sum + party.invitedCount, 0);
      const totalInvitedGuests = hydratedParties.reduce((sum, party) => sum + party.invitedCount, 0);

      return {
        rsvps: rsvpList,
        invitedParties: hydratedParties,
        unmatchedRsvps,
        reviewItems,
        stats: {
          attendingGuests,
          declinedGuests,
          pendingGuests,
          totalInvitedGuests,
          reviewCount: reviewItems.length,
          respondedParties: hydratedParties.filter((party) => party.rsvpId).length,
          totalParties: hydratedParties.length
        }
      };
    }

    async function fetchWeddingRsvpSnapshot() {
      const client = getSupabaseClient();
      if (!client) {
        return null;
      }

      const [
        { data: activeRsvpRows, error: activeRsvpError },
        { data: supersededRsvpRows, error: supersededRsvpError },
        { data: partyRows, error: partyError }
      ] = await Promise.all([
        client
          .from("rsvps")
          .select("id, name, attending, guest_count, created_at, status, merged_into_party_id")
          .eq("status", "active")
          .order("created_at", { ascending: false }),
        client
          .from("rsvps")
          .select("id, name, attending, guest_count, created_at, status, merged_into_party_id")
          .eq("status", "superseded")
          .order("created_at", { ascending: false }),
        client
          .from("invited_parties")
          .select("id, name, invited_count, rsvp_id, created_at")
          .order("name", { ascending: true })
      ]);

      if (
        activeRsvpError || supersededRsvpError || partyError
        || !Array.isArray(activeRsvpRows) || !Array.isArray(supersededRsvpRows) || !Array.isArray(partyRows)
      ) {
        return null;
      }

      return buildWeddingRsvpSnapshot(
        [...activeRsvpRows, ...supersededRsvpRows].map(mapWeddingRsvp),
        partyRows.map(mapInvitedParty)
      );
    }

    async function autoLinkHighConfidenceRsvps(snapshot, options = {}) {
      const client = getSupabaseClient();
      if (!client || !snapshot) {
        return snapshot;
      }

      const logPrefix = options.logPrefix || "[rsvp-auto-match]";
      const availableParties = snapshot.invitedParties
        .filter((party) => !party.rsvpId)
        .map((party) => ({ ...party }));
      const updates = [];
      const candidateUpdates = [];

      snapshot.unmatchedRsvps.forEach((rsvp) => {
        const bestOverallMatch = getBestInvitedPartyMatch(rsvp.name, snapshot.invitedParties);
        if (bestOverallMatch && bestOverallMatch.rsvpId && bestOverallMatch.matchScore >= RSVP_MATCH_DUPLICATE_THRESHOLD) {
          return;
        }

        const bestMatch = getInvitedPartySuggestions(rsvp.name, availableParties, 1, 0)[0];
        if (!bestMatch || !isHighConfidenceRsvpMatch(bestMatch.matchScore)) {
          return;
        }
        candidateUpdates.push({
          invitedPartyId: bestMatch.id,
          rsvpId: rsvp.id,
          invitedPartyName: bestMatch.name,
          rsvpName: rsvp.name,
          score: bestMatch.matchScore
        });
      });

      candidateUpdates
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return String(a.rsvpName || "").localeCompare(String(b.rsvpName || ""));
        })
        .forEach((candidate) => {
          const removeIndex = availableParties.findIndex((party) => party.id === candidate.invitedPartyId);
          if (removeIndex === -1) {
            return;
          }
          updates.push(candidate);
          if (removeIndex !== -1) {
            availableParties.splice(removeIndex, 1);
          }
        });

      if (!updates.length) {
        return snapshot;
      }

      for (const update of updates) {
        const { error } = await client
          .from("invited_parties")
          .update({ rsvp_id: update.rsvpId })
          .eq("id", update.invitedPartyId)
          .is("rsvp_id", null);

        if (!error) {
          console.log(
            `${logPrefix} linked "${update.invitedPartyName}" to "${update.rsvpName}" (${update.score.toFixed(2)})`
          );
        }
      }

      const refreshed = await fetchWeddingRsvpSnapshot();
      return refreshed || snapshot;
    }

    function isTodoOverdue(dueDate) {
      if (!dueDate) {
        return false;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const parsed = new Date(dueDate + "T00:00:00");

      if (Number.isNaN(parsed.getTime())) {
        return false;
      }

      parsed.setHours(0, 0, 0, 0);
      return parsed < today;
    }

    // Returns { cssClass, label } for a due date urgency pill, or null if no due date.
    // Used on both the display and admin views.
    function getTodoDuePill(dueDate) {
      if (!dueDate) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const parsed = new Date(dueDate + "T00:00:00");

      if (Number.isNaN(parsed.getTime())) {
        return null;
      }

      parsed.setHours(0, 0, 0, 0);
      const diff = Math.round((parsed - today) / 86400000);

      if (isTodoOverdue(dueDate)) {
        return { cssClass: "todo-due-pill--overdue", label: "Overdue" };
      }
      if (diff === 0) {
        return { cssClass: "todo-due-pill--today", label: "Today" };
      }
      if (diff <= 3) {
        const label = diff === 1
          ? "Tomorrow"
          : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(parsed);
        return { cssClass: "todo-due-pill--soon", label };
      }
      return {
        cssClass: "todo-due-pill--future",
        label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed)
      };
    }

    // Returns the next due date (YYYY-MM-DD) for a recurring todo after it is completed.
    // completedDate: Date object representing the local date of completion.
    function calculateNextDueDate(completedDate, recurrenceType, recurrenceConfig, currentDueDate) {
      const base = new Date(completedDate);
      base.setHours(0, 0, 0, 0);

      if (recurrenceType === "offset") {
        const days = Number((recurrenceConfig && recurrenceConfig.interval_days) || 1);
        base.setDate(base.getDate() + days);
        return formatDateKey(base);
      }

      if (recurrenceType === "scheduled") {
        const freq = recurrenceConfig && recurrenceConfig.frequency;

        if (freq === "weekly") {
          // Weekly uses completedDate as anchor. The % 7 arithmetic naturally
          // lands on the next occurrence of that weekday after today, so early
          // completion already produces the correct upcoming date without the
          // max(completedDate, currentDueDate) adjustment needed for monthly.
          const targetDay = Number(recurrenceConfig.day_of_week ?? 1); // 0=Sun … 6=Sat
          const currentDay = base.getDay();
          // Always advance by at least 1 day — never return the same day.
          const daysToAdd = ((targetDay - currentDay + 7) % 7) || 7;
          base.setDate(base.getDate() + daysToAdd);
          return formatDateKey(base);
        }

        if (freq === "monthly") {
          // For monthly, completing before the target day-of-month would find
          // the current month's occurrence (same as the current due date).
          // Use max(completedDate, currentDueDate) as the anchor so the
          // calculation always advances past the current instance.
          //
          // IMPORTANT: parse the due date string as a local date, not UTC.
          // new Date("2026-04-15") is UTC midnight, which becomes Apr 14 in
          // western timezones — making the max comparison silently wrong.
          if (currentDueDate) {
            const parts = String(currentDueDate).split("-");
            const due = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            if (due > base) {
              base.setTime(due.getTime());
            }
          }
          const rawDay = Number(recurrenceConfig.day_of_month) || 1;
          const targetDay = Math.min(rawDay, 28); // cap for February safety
          // Advance to next month if anchor meets or passes the target day.
          if (base.getDate() >= targetDay) {
            base.setMonth(base.getMonth() + 1);
          }
          base.setDate(targetDay);
          return formatDateKey(base);
        }
      }

      // Fallback: 1 day ahead.
      base.setDate(base.getDate() + 1);
      return formatDateKey(base);
    }

    function normalizeMealType(type) {
      return String(type || "")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");
    }

    function getMealTypePresentation(type) {
      const normalizedType = normalizeMealType(type);
      return mealTypeConfig[normalizedType] || {
        label: type || "Dinner",
        className: "meal-type--fend-for-yourself"
      };
    }

    async function fetchHouseholdConfig() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("households")
        .select("google_cal_id, google_cal_key, total_invited_guests, assistant_name, display_settings, color_scheme")
        .eq("id", DISPLAY_HOUSEHOLD_ID)
        .single();

      if (error || !data) {
        return null;
      }

      return data;
    }

    async function fetchGoogleCalendarEvents(calendarId, apiKey, timeMin, timeMax, maxResults = "250") {
      try {
        const baseParams = {
          key: apiKey,
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: "true",
          orderBy: "startTime",
          maxResults
        };

        const allItems = [];
        let pageToken = null;

        do {
          const params = new URLSearchParams(baseParams);
          if (pageToken) params.set("pageToken", pageToken);

          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`
          );

          if (!response.ok) {
            throw new Error(`Calendar API error: ${response.status} ${response.statusText}`);
          }

          const json = await response.json();
          if (Array.isArray(json.items)) {
            allItems.push(...json.items);
          }
          pageToken = json.nextPageToken || null;
        } while (pageToken);

        return allItems;
      } catch {
        return null;
      }
    }

    function registerServiceWorker() {
      if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
          navigator.serviceWorker.register(`/sw.js?v=${VERSION}`).catch(() => {});
        });
      }
    }

    document.addEventListener('DOMContentLoaded', function() {
      initSupabaseClient();
      init();
    });

    function init() {
      if (isAdminMode) {
        initAdminMode();
      } else {
        initDisplayMode();
      }

      registerServiceWorker();
    }
