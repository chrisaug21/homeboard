    const track = document.getElementById("screen-track");
    const viewport = document.getElementById("viewport");
    const displayNav = document.getElementById("display-nav");
    const navLeft = document.getElementById("nav-left");
    const navRight = document.getElementById("nav-right");
    const householdNameEl = document.getElementById("household-name");
    const monthTitleEl = document.getElementById("month-title");

    let currentIndex = 0;
    let activeScreenKey = "";
    let autoRotateId = null;
    let autoRotateToken = 0;
    let isScreenTransitioning = false;
    let screenTransitionFallbackId = null;
    let pendingScreenOrder = null;
    let pendingReconcile = false;
    let pointerStartX = null;
    let pointerDeltaX = 0;
    let rsvpScrollId = null;
    // Number of days shown in the Upcoming view — read from display_settings.upcoming_days
    let UPCOMING_DAYS = 5;
    // Per-screen rotation timers in seconds (keyed by screen type, fallback 30s)
    let screenTimers = {};

    let calendarEventsMap = new Map();
    let cachedHouseholdConfig = null;
    let cachedDisplayHouseholdMembers = null;
    let cachedDisplayTodos = null;
    let cachedSupabaseCountdowns = null;
    let cachedCalendarCountdowns = [];
    let cachedWeddingSnapshot = null;
    let cachedScorecards = [];
    let cachedScorecardSessionsById = new Map();
    let displayScorecardBonusStateById = new Map();
    const displayScorecardBonusPeekTimerByKey = new Map();
    const displayScorecardBonusAdvanceTimerById = new Map();
    let scorecardSelectionById = new Map();
    let celebrationBag = [];
    let scorecardCelebrationRunId = 0;
    let scorecardCelebrationTimers = [];
    let displayScorecardArchiveConfirmId = "";
    let monthOffset = 0;
    let weekOffset = 0;
    let lastWideFetch = 0; // ms timestamp of last 24-month fetch
    let initialLoadComplete = false;
    const TODO_CELEBRATION_FADE_DELAY_MS = 450;
    const pendingScreens = new Set();
    const displayScreenRegistry = {
      upcoming_calendar: track.querySelector(".screen--calendar"),
      monthly_calendar: track.querySelector(".screen--month"),
      todos: track.querySelector(".screen--todos"),
      meals: track.querySelector(".screen--meals"),
      rsvp: track.querySelector(".rsvp-screen")
    };

    function getRegisteredScreens(screenName) {
      if (screenName === "countdowns") {
        return Array.from(track.querySelectorAll(".countdown-screen"));
      }
      if (screenName === "scorecards") {
        return Array.from(track.querySelectorAll(".scorecard-screen"));
      }

      const screen = displayScreenRegistry[screenName];
      return screen ? [screen] : [];
    }

    function markPending(screenId) {
      pendingScreens.add(screenId);
    }

    function resolveScreen(screenId) {
      pendingScreens.delete(screenId);
      if (!initialLoadComplete && pendingScreens.size === 0) {
        const firstEntry = getOrderedVisibleScreenEntries()[0] || null;
        if (firstEntry) {
          activeScreenKey = firstEntry.key;
          currentIndex = 0;
          track.style.transform = "translateX(0%)";
        }
        initialLoadComplete = true;
        localStorage.setItem(LAST_SYNCED_KEY, new Date().toISOString());
        updateLastSyncedLabel();
        renderProgress();
        resetAutoRotate();
      }
    }

    function clearScreenTransitionFallback() {
      if (screenTransitionFallbackId !== null) {
        window.clearTimeout(screenTransitionFallbackId);
        screenTransitionFallbackId = null;
      }
    }

    function flushPendingDisplayState() {
      if (pendingScreenOrder) {
        const queuedOrder = pendingScreenOrder;
        pendingScreenOrder = null;
        applyScreenOrder(queuedOrder);
      }

      if (pendingReconcile) {
        pendingReconcile = false;
        reconcileRotationState();
      }
    }

    function finishScreenTransition() {
      if (!isScreenTransitioning) {
        return;
      }

      isScreenTransitioning = false;
      clearScreenTransitionFallback();
      flushPendingDisplayState();
    }

    function beginScreenTransition() {
      isScreenTransitioning = true;
      clearScreenTransitionFallback();
      screenTransitionFallbackId = window.setTimeout(() => {
        finishScreenTransition();
      }, 700);
    }

    function pauseAutoRotate(reason = "unknown") {
      window.clearTimeout(autoRotateId);
      autoRotateId = null;
      autoRotateToken += 1;
      console.log(`[rotation] paused via ${reason}; token=${autoRotateToken}`);
    }

    function renderScreenError(containerEl, label, retryFn) {
      containerEl.innerHTML = `
        <div class="screen-error">
          <i data-lucide="wifi-off"></i>
          <p class="screen-error-msg">${escapeHtml(label)}</p>
          <button class="screen-error-retry" type="button">Tap to retry</button>
        </div>
      `;
      refreshIcons();
      containerEl.querySelector(".screen-error-retry").addEventListener("click", retryFn);
    }

    function renderCalendarSkeleton() {
      const grid = document.getElementById("calendar-grid");
      const skCol = () => `
        <article class="day-column">
          <div class="day-header"><div class="sk" style="width:70%;height:13px;"></div></div>
          <div class="event-list">
            <div class="event-card">
              <div class="sk" style="width:38%;height:11px;margin-bottom:5px;"></div>
              <div class="sk" style="width:82%;height:13px;"></div>
            </div>
            <div class="event-card">
              <div class="sk" style="width:32%;height:11px;margin-bottom:5px;"></div>
              <div class="sk" style="width:66%;height:13px;"></div>
            </div>
          </div>
        </article>
      `;
      grid.innerHTML = Array.from({ length: 5 }, skCol).join("");
    }

    function renderMonthCalendarSkeleton() {
      const weekdaysEl = document.getElementById("month-weekdays");
      const monthGridEl = document.getElementById("month-grid");
      const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      monthTitleEl.textContent = formatMonthYear(new Date());
      weekdaysEl.innerHTML = weekdayNames.map((n) => `<div class="month-weekday">${n}</div>`).join("");
      monthGridEl.innerHTML = Array.from({ length: 35 }, () => `
        <article class="month-day">
          <div class="sk" style="width:18px;height:13px;border-radius:4px;"></div>
        </article>
      `).join("");
    }

    function renderTodoSkeleton() {
      const list = document.getElementById("todo-list");
      const skRow = () => `
        <article class="todo-card">
          <div class="todo-check-btn" aria-hidden="true">
            <div class="todo-check"></div>
          </div>
          <div class="todo-copy">
            <div class="sk" style="width:72%;height:14px;margin-bottom:8px;"></div>
            <div class="sk" style="width:48%;height:20px;border-radius:999px;"></div>
          </div>
        </article>
      `;
      list.innerHTML = Array.from({ length: 6 }, skRow).join("");
    }

    function renderMealSkeleton() {
      const grid = document.getElementById("meal-grid");
      const skMealCard = `
        <article class="meal-card">
          <div class="sk" style="width:55%;height:11px;"></div>
          <div class="sk" style="width:72%;height:15px;"></div>
          <div class="sk" style="width:58px;height:20px;border-radius:20px;"></div>
        </article>
      `;
      grid.innerHTML = Array.from({ length: 7 }, () => skMealCard).join("") +
        `<article class="meal-note-card meal-note-card--empty"></article>`;
    }

    function renderCountdownSkeleton() {
      const screen = document.querySelector(".countdown-screen");

      if (!screen) {
        return;
      }

      screen.innerHTML = `
        <div class="panel">
          <div class="screen-title-row">
            <div class="eyebrow"><i data-lucide="sparkles"></i> Looking Forward</div>
          </div>
          <div class="countdown-layout">
            <article class="countdown-card">
              <div class="countdown-copy">
                <div class="sk" style="width:96px;height:96px;border-radius:28px;margin:0 auto 20px;"></div>
                <div class="sk" style="width:55%;height:22px;margin:0 auto 16px;"></div>
                <div class="sk" style="width:30%;height:72px;margin:0 auto 14px;border-radius:12px;"></div>
                <div class="sk" style="width:42%;height:14px;margin:0 auto;"></div>
              </div>
            </article>
          </div>
        </div>
      `;
      refreshIcons();
    }

    function renderRsvpSkeleton() {
      stopRsvpAutoScroll();
      const sk = (w, h, extra = "") =>
        `<span class="sk" style="width:${w};height:${h}px;display:inline-block;${extra}"></span>`;
      const skPill = () =>
        `<div class="name-pill"><span class="sk" style="width:60%;height:14px;"></span></div>`;

      document.getElementById("rsvp-total").innerHTML = sk("80px", 52, "border-radius:10px;");
      document.getElementById("rsvp-total-label").innerHTML = sk("130px", 12, "margin-top:6px;");
      document.getElementById("rsvp-parties-responded").innerHTML = sk("110px", 12);
      document.getElementById("rsvp-declined-count").innerHTML = sk("38px", 20);
      document.getElementById("rsvp-pending-count").innerHTML = sk("38px", 20);
      document.getElementById("rsvp-review-count").innerHTML = sk("38px", 20);
      document.getElementById("rsvp-names-title").innerHTML = sk("90px", 14);
      document.getElementById("rsvp-names").innerHTML = Array.from({ length: 8 }, skPill).join("");
    }

    async function retryCalendar() {
      renderCalendarSkeleton();
      renderMonthCalendarSkeleton();
      const loaded = await refreshCalendarData();
      if (!loaded) {
        renderCalendarError();
      }
    }

    function renderCalendarError() {
      renderScreenError(
        document.getElementById("calendar-grid"),
        "Couldn't load calendar \u2014 tap to retry",
        retryCalendar
      );
      renderScreenError(
        document.getElementById("month-grid"),
        "Couldn't load calendar \u2014 tap to retry",
        retryCalendar
      );
    }

    async function retryCountdowns() {
      renderCountdownSkeleton();
      const newSupabaseCountdowns = await fetchCountdowns();
      await refreshCalendarData();

      if (newSupabaseCountdowns !== null) {
        cachedSupabaseCountdowns = newSupabaseCountdowns;
      }

      const base = cachedSupabaseCountdowns !== null ? cachedSupabaseCountdowns : [];
      const merged = [...base, ...cachedCalendarCountdowns]
        .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));

      if (merged.length > 0) {
        renderCountdowns(merged);
      } else if (cachedSupabaseCountdowns !== null) {
        renderCountdowns([]);
      } else {
        renderCountdownError();
      }
    }

    function renderCountdownError() {
      const screen = document.querySelector(".countdown-screen");

      if (!screen) {
        return;
      }

      screen.innerHTML = `
        <div class="panel">
          <div class="screen-title-row">
            <div class="eyebrow"><i data-lucide="sparkles"></i> Looking Forward</div>
          </div>
          <div class="countdown-error">
            <i data-lucide="wifi-off"></i>
            <p class="screen-error-msg">Something went wrong loading your data \u2014 tap to retry</p>
            <button class="screen-error-retry" type="button">Tap to retry</button>
          </div>
        </div>
      `;
      refreshIcons();
      screen.querySelector(".screen-error-retry").addEventListener("click", retryCountdowns);
    }

    function renderRsvpError() {
      stopRsvpAutoScroll();
      document.getElementById("rsvp-total").textContent = "\u2014";
      document.getElementById("rsvp-total-label").textContent = "";
      document.getElementById("rsvp-parties-responded").textContent = "";
      document.getElementById("rsvp-declined-count").textContent = "\u2014";
      document.getElementById("rsvp-pending-count").textContent = "\u2014";
      document.getElementById("rsvp-review-count").textContent = "\u2014";
      document.getElementById("rsvp-names-title").textContent = "";
      const list = document.getElementById("rsvp-names");
      document.getElementById("rsvp-total").classList.remove("hero-number--empty", "hero-number--active");
      list.classList.remove("names-scroll--empty");
      list.innerHTML = `
        <div class="screen-error">
          <i data-lucide="wifi-off"></i>
          <p class="screen-error-msg">Something went wrong loading your data \u2014 tap to retry</p>
          <button class="screen-error-retry" type="button">Tap to retry</button>
        </div>
      `;
      refreshIcons();
      list.querySelector(".screen-error-retry").addEventListener("click", renderRsvpBoardWithData);
    }

    function getScreenCount() {
      return getOrderedVisibleScreenEntries().length;
    }

    function getVisibleScreens() {
      return Array.from(track.children).filter((screen) =>
        !screen.classList.contains("screen--disabled")
        && !screen.classList.contains("screen--empty-hidden")
      );
    }

    function getOrderedVisibleScreenEntries() {
      return getVisibleScreens().map((screen, index) => ({
        screen,
        key: getOrderKeyForScreen(screen),
        groupKey: getScreenKeyForElement(screen),
        index
      }));
    }

    function syncActiveScreenState() {
      const entries = getOrderedVisibleScreenEntries();
      if (!entries.length) {
        currentIndex = 0;
        activeScreenKey = "";
        return entries;
      }

      const activeIndex = activeScreenKey
        ? entries.findIndex((entry) => entry.key === activeScreenKey)
        : -1;

      if (activeIndex >= 0) {
        currentIndex = activeIndex;
        activeScreenKey = entries[activeIndex].key;
        return entries;
      }

      currentIndex = Math.min(currentIndex, entries.length - 1);
      activeScreenKey = entries[currentIndex]?.key || entries[0].key;
      currentIndex = Math.max(0, entries.findIndex((entry) => entry.key === activeScreenKey));
      if (currentIndex < 0) {
        currentIndex = 0;
        activeScreenKey = entries[0].key;
      }

      return entries;
    }

    function getActiveScreenEntry() {
      const entries = syncActiveScreenState();
      return entries[currentIndex] || null;
    }

    function getOrderKeyForScreen(screen) {
      if (!screen) {
        return "";
      }

      const explicitKey = String(screen.dataset.screenKey || "").trim();
      return explicitKey || getScreenKeyForElement(screen);
    }

    function getScreenKeyForElement(screen) {
      if (!screen) return "generic";
      if (screen.classList.contains("screen--calendar")) return "upcoming_calendar";
      if (screen.classList.contains("screen--month")) return "monthly_calendar";
      if (screen.classList.contains("screen--todos")) return "todos";
      if (screen.classList.contains("screen--meals")) return "meals";
      if (screen.classList.contains("countdown-screen")) return "countdowns";
      if (screen.classList.contains("scorecard-screen")) return "scorecards";
      if (screen.classList.contains("rsvp-screen")) return "rsvp";
      return "generic";
    }

    function getUpcomingNavDays() {
      const configuredDays = Number(cachedHouseholdConfig?.display_settings?.upcoming_days);
      return configuredDays === 5 || configuredDays === 7 ? configuredDays : 7;
    }

    function getDisplayNavIconConfig(screenKey) {
      switch (screenKey) {
        case "todos":
          return { icon: "list-todo", label: "To-do list" };
        case "meals":
          return { icon: "utensils-crossed", label: "Dinner plan" };
        case "upcoming_calendar":
          return { icon: "calendar-days", label: "Upcoming calendar", badge: String(getUpcomingNavDays()) };
        case "monthly_calendar":
          return { icon: "calendar-days", label: "Monthly calendar", badge: "30" };
        case "countdowns":
          return { icon: "hourglass", label: "Countdowns" };
        case "scorecards":
          return { icon: "trophy", label: "Scorecards" };
        case "rsvp":
          return { icon: "heart", label: "Wedding RSVP" };
        default:
          return { icon: "layout-grid", label: "Screen" };
      }
    }

    function getDisplayNavItems() {
      const visibleScreens = getOrderedVisibleScreenEntries();
      const visibleIndexByKey = new Map();
      visibleScreens.forEach((entry, index) => {
        const screenKey = entry.groupKey;
        if (!visibleIndexByKey.has(screenKey)) {
          visibleIndexByKey.set(screenKey, index);
        }
      });

      const configuredOrder = normalizeDisplaySettings(cachedHouseholdConfig?.display_settings).screen_order;
      const items = [];
      const seen = new Set();

      configuredOrder.forEach((screenKey) => {
        const normalizedKey = isScorecardScreenKey(screenKey) ? "scorecards" : screenKey;
        const targetIndex = visibleIndexByKey.get(normalizedKey);
        if (targetIndex === undefined || seen.has(normalizedKey)) {
          return;
        }

        items.push({
          key: normalizedKey,
          targetIndex
        });

        if (normalizedKey !== "generic") {
          seen.add(normalizedKey);
        }
      });

      visibleScreens.forEach((entry, index) => {
        const screenKey = entry.groupKey;
        if (seen.has(screenKey)) {
          return;
        }

        items.push({
          key: screenKey,
          targetIndex: index
        });

        if (screenKey !== "generic") {
          seen.add(screenKey);
        }
      });

      return items;
    }

    function buildDisplayNavButtonMarkup(item, isActive) {
      const iconConfig = getDisplayNavIconConfig(item.key);
      const badgeMarkup = iconConfig.badge
        ? `<span class="display-nav-badge" aria-hidden="true">${escapeHtml(iconConfig.badge)}</span>`
        : "";
      const calendarClass = iconConfig.badge ? " display-nav-icon--calendar" : "";
      const iconMarkup = iconConfig.badge
        ? `
          <svg class="display-nav-calendar-svg" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="2.25" y="3.75" width="15.5" height="14" rx="3" stroke="currentColor" stroke-width="1.75"/>
            <path d="M2.75 7.25H17.25" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            <path d="M6.25 2.5V5.25" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            <path d="M13.75 2.5V5.25" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
          </svg>
        `
        : `<i data-lucide="${escapeHtml(iconConfig.icon)}"></i>`;
      const activeClass = isActive ? " is-active" : "";
      const ariaCurrent = isActive ? ' aria-current="page"' : "";

      return `
        <button
          class="display-nav-button${activeClass}"
          type="button"
          data-display-nav-target="${item.targetIndex}"
          aria-label="${escapeHtml(iconConfig.label)}"${ariaCurrent}>
          <span class="display-nav-icon${calendarClass}" aria-hidden="true">
            ${iconMarkup}
            ${badgeMarkup}
          </span>
        </button>
      `;
    }

    function getDisplayHouseholdMembers() {
      if (cachedDisplayHouseholdMembers !== null) {
        return cachedDisplayHouseholdMembers;
      }

      return normalizeHouseholdMembers(cachedHouseholdConfig?.display_settings?.members || []);
    }

    function getAssigneeMarkup(assignee, assigneeMemberId = "") {
      const resolvedAssignee = resolveTodoAssignee(getDisplayHouseholdMembers(), assigneeMemberId, assignee);
      if (!resolvedAssignee?.name) {
        return "";
      }

      const memberColor = String(resolvedAssignee.color || "").trim();

      if (!memberColor) {
        return `<span class="todo-assignee todo-assignee--other">${escapeHtml(resolvedAssignee.name)}</span>`;
      }

      return `
        <span class="todo-assignee todo-assignee--custom" style="background:${escapeHtml(hexToRgba(memberColor, 0.16))};color:${escapeHtml(memberColor)}">
          ${escapeHtml(resolvedAssignee.name)}
        </span>
      `;
    }

    let displayToastTimeoutId = null;
    function showDisplayToast(message) {
      const el = document.getElementById("toast");
      if (!el) return;
      window.clearTimeout(displayToastTimeoutId);
      el.textContent = message;
      el.classList.add("is-visible");
      displayToastTimeoutId = window.setTimeout(() => el.classList.remove("is-visible"), 2800);
    }

    function refreshIcons() {
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
        // Fallback: any icon inside .countdown-icon that wasn't recognized → use "calendar"
        let needsRetry = false;
        document.querySelectorAll(".countdown-icon i[data-lucide]").forEach((el) => {
          if (!el.querySelector("svg")) {
            el.setAttribute("data-lucide", "calendar");
            needsRetry = true;
          }
        });
        if (needsRetry) window.lucide.createIcons();
      }
    }

    function reconcileRotationState() {
      if (isScreenTransitioning) {
        pendingReconcile = true;
        return;
      }

      const visibleScreens = syncActiveScreenState();
      const screenCount = visibleScreens.length;

      if (!screenCount) {
        return;
      }

      track.style.transform = "translateX(-" + (currentIndex * 100) + "%)";
      renderProgress();
      refreshIcons();
    }

    function findFirstNonScorecardScreenIndex() {
      const visibleScreens = getOrderedVisibleScreenEntries();
      const targetIndex = visibleScreens.findIndex((entry) => !entry.screen.classList.contains("scorecard-screen"));
      return targetIndex >= 0 ? targetIndex : 0;
    }

    function renderProgress() {
      if (!initialLoadComplete || !cachedHouseholdConfig) {
        displayNav.innerHTML = "";
        displayNav.hidden = true;
        return;
      }

      const activeEntry = getActiveScreenEntry();
      if (!activeEntry) {
        displayNav.innerHTML = "";
        displayNav.hidden = true;
        return;
      }

      displayNav.innerHTML = getDisplayNavItems().map((item) =>
        buildDisplayNavButtonMarkup(item, item.key === activeEntry.groupKey)
      ).join("");
      displayNav.hidden = false;
      refreshIcons();
    }

    function renderFooterBrandText(label) {
      if (!householdNameEl) return;

      const textEl = document.createElement("span");
      textEl.className = "household-name__text";
      textEl.textContent = label;
      householdNameEl.replaceChildren(textEl);
    }

    function renderFooterBrandLogo() {
      if (!householdNameEl) return;

      const img = document.createElement("img");
      img.className = "household-logo";
      img.src = "homeboard_logo.svg";
      img.alt = "Homeboard";
      img.width = 120;
      img.decoding = "async";
      img.onerror = () => {
        renderFooterBrandText("Homeboard");
      };

      householdNameEl.replaceChildren(img);
    }

    function updateHouseholdName(config) {
      const customName = config && config.assistant_name && config.assistant_name.trim()
        ? config.assistant_name
        : "";

      if (customName) {
        renderFooterBrandText(customName);
        return;
      }

      renderFooterBrandLogo();
    }

    function applyColorScheme(scheme) {
      const validSchemes = ["warm", "dark", "slate"];
      const chosen = validSchemes.includes(scheme) ? scheme : "warm";
      if (chosen === "warm") {
        document.documentElement.removeAttribute("data-scheme");
      } else {
        document.documentElement.setAttribute("data-scheme", chosen);
      }
    }

    function applyActiveScreens(activeScreens) {
      const normalizedScreens = Array.isArray(activeScreens) ? activeScreens : [];
      const hasIndividualScorecardFlags = normalizedScreens.some((key) => isScorecardScreenKey(key));
      DISPLAY_SCREEN_KEYS.forEach((name) => {
        getRegisteredScreens(name).forEach((screen) => {
          const isEnabled = name === "scorecards"
            ? normalizedScreens.includes("scorecards")
              && (!hasIndividualScorecardFlags || normalizedScreens.includes(buildScorecardScreenKey(screen.dataset.scorecardId)))
            : normalizedScreens.includes(name);
          if (isEnabled) {
            screen.classList.remove("screen--disabled");
            if (!screen.classList.contains("screen--empty-hidden")) {
              screen.removeAttribute("aria-hidden");
            }
          } else {
            screen.classList.add("screen--disabled");
            screen.setAttribute("aria-hidden", "true");
          }
        });
      });

      reconcileRotationState();
    }

    function applyScreenOrder(screenOrder) {
      if (isScreenTransitioning) {
        pendingScreenOrder = Array.isArray(screenOrder) ? [...screenOrder] : [];
        return;
      }

      const orderedKeys = Array.isArray(screenOrder) ? screenOrder : [];
      const currentScreenKey = activeScreenKey || getOrderKeyForScreen(getVisibleScreens()[currentIndex]);
      const allScreens = Array.from(track.children);
      const placed = new Set();
      const nextOrder = [];

      orderedKeys.forEach((screenKey) => {
        if (isScorecardScreenKey(screenKey)) {
          const scorecardScreen = allScreens.find((screen) => getOrderKeyForScreen(screen) === screenKey);
          if (scorecardScreen && !placed.has(scorecardScreen)) {
            nextOrder.push(scorecardScreen);
            placed.add(scorecardScreen);
          }
          return;
        }

        allScreens.forEach((screen) => {
          if (placed.has(screen) || getScreenKeyForElement(screen) !== screenKey) {
            return;
          }
          nextOrder.push(screen);
          placed.add(screen);
        });
      });

      // Any scorecard screen not matched by screen_order (e.g. added since last settings save)
      // would fall to the catch-all end and appear split from the configured scorecards.
      // Instead, group them immediately after the last already-placed scorecard screen.
      const unplacedScorecards = allScreens.filter(
        (screen) => screen.classList.contains("scorecard-screen") && !placed.has(screen)
      );
      if (unplacedScorecards.length > 0) {
        let lastScorecardIndex = -1;
        for (let i = nextOrder.length - 1; i >= 0; i--) {
          if (nextOrder[i].classList.contains("scorecard-screen")) {
            lastScorecardIndex = i;
            break;
          }
        }
        if (lastScorecardIndex >= 0) {
          nextOrder.splice(lastScorecardIndex + 1, 0, ...unplacedScorecards);
          unplacedScorecards.forEach((screen) => placed.add(screen));
        }
      }

      allScreens.forEach((screen) => {
        if (!placed.has(screen)) {
          nextOrder.push(screen);
        }
      });

      nextOrder.forEach((screen) => track.appendChild(screen));

      if (currentScreenKey) {
        const visibleScreens = getOrderedVisibleScreenEntries();
        const nextIndex = visibleScreens.findIndex((entry) => entry.key === currentScreenKey);
        if (nextIndex >= 0) {
          currentIndex = nextIndex;
          activeScreenKey = currentScreenKey;
        }
      }
    }

    function applyDisplaySettings(config) {
      if (!config) return;
      const ds = normalizeDisplaySettings(config.display_settings);

      // Apply upcoming days
      const upcomingDays = Number(ds.upcoming_days);
      if (upcomingDays === 5 || upcomingDays === 7) {
        UPCOMING_DAYS = upcomingDays;
      }

      // Apply per-screen timers (seed with defaults, then overlay saved values)
      screenTimers = {
        upcoming_calendar: 30,
        monthly_calendar: 60,
        todos: 45,
        meals: 30,
        countdowns: 15,
        scorecards: 30,
        rsvp: 30,
        default: 30
      };
      if (ds.timer_intervals && typeof ds.timer_intervals === "object") {
        for (const [key, val] of Object.entries(ds.timer_intervals)) {
          const parsed = parseInt(val, 10);
          if (parsed > 0) screenTimers[key] = parsed;
        }
      }

      // Apply color scheme
      applyColorScheme(config.color_scheme || "warm");

      // Apply active screens (must come before screen order)
      const defaultScreens = getConfigurableDisplayScreenKeys();
      const activeScreens = Array.isArray(ds.active_screens) && ds.active_screens.length > 0
        ? ds.active_screens
        : defaultScreens;
      applyActiveScreens(activeScreens);

      // Apply screen order
      const screenOrder = Array.isArray(ds.screen_order) && ds.screen_order.length > 0
        ? ds.screen_order
        : defaultScreens;
      applyScreenOrder(screenOrder);
    }
