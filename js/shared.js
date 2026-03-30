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

    const VERSION = "0.9.8";
    const rotationIntervalMs = 30000;
    const displayApp = document.getElementById("display-app");
    const adminApp = document.getElementById("admin-app");
    const LAST_SYNCED_KEY = "homeboard_last_synced";
    const DISPLAY_SCREEN_KEYS = ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns"];

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

    function expandLegacyCalendarScreen(screenKey) {
      if (screenKey === "calendar") {
        return ["upcoming_calendar", "monthly_calendar"];
      }

      return [screenKey];
    }

    function normalizeDisplayScreenList(screenList, fallback = DISPLAY_SCREEN_KEYS) {
      if (!Array.isArray(screenList) || screenList.length === 0) {
        return [...fallback];
      }

      const normalized = [];
      screenList.forEach((key) => {
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

      settings.active_screens = normalizeDisplayScreenList(settings.active_screens);
      settings.screen_order = normalizeDisplayScreenList(settings.screen_order);
      settings.timer_intervals = normalizeTimerIntervals(settings.timer_intervals);
      delete settings.calendar_view;

      return settings;
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

    // Returns { cssClass, label } for a due date urgency pill, or null if no due date.
    // Used on both the display and admin views.
    function getTodoDuePill(dueDate) {
      if (!dueDate) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const parsed = new Date(dueDate + "T00:00:00");
      parsed.setHours(0, 0, 0, 0);
      const diff = Math.round((parsed - today) / 86400000);

      if (diff < 0) {
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
