    const track = document.getElementById("screen-track");
    const viewport = document.getElementById("viewport");
    const displayNav = document.getElementById("display-nav");
    const navLeft = document.getElementById("nav-left");
    const navRight = document.getElementById("nav-right");
    const householdNameEl = document.getElementById("household-name");
    const monthTitleEl = document.getElementById("month-title");

    let currentIndex = 0;
    let autoRotateId = null;
    let autoRotateToken = 0;
    let pointerStartX = null;
    let pointerDeltaX = 0;
    let rsvpScrollId = null;
    // Number of days shown in the Upcoming view — read from display_settings.upcoming_days
    let UPCOMING_DAYS = 5;
    // Per-screen rotation timers in seconds (keyed by screen type, fallback 30s)
    let screenTimers = {};

    let calendarEventsMap = new Map();
    let cachedHouseholdConfig = null;
    let cachedDisplayTodos = null;
    let cachedSupabaseCountdowns = null;
    let cachedCalendarCountdowns = [];
    let cachedWeddingSnapshot = null;
    let celebrationBag = [];
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
      meals: track.querySelector(".screen--meals")
    };

    function getRegisteredScreens(screenName) {
      if (screenName === "countdowns") {
        return Array.from(track.querySelectorAll(".countdown-screen"));
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
        initialLoadComplete = true;
        localStorage.setItem(LAST_SYNCED_KEY, new Date().toISOString());
        updateLastSyncedLabel();
        resetAutoRotate();
      }
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
      return getVisibleScreens().length;
    }

    function getVisibleScreens() {
      return Array.from(track.children).filter((screen) =>
        !screen.classList.contains("screen--disabled")
        && !screen.classList.contains("screen--empty-hidden")
      );
    }

    function getScreenKeyForElement(screen) {
      if (!screen) return "generic";
      if (screen.classList.contains("screen--calendar")) return "upcoming_calendar";
      if (screen.classList.contains("screen--month")) return "monthly_calendar";
      if (screen.classList.contains("screen--todos")) return "todos";
      if (screen.classList.contains("screen--meals")) return "meals";
      if (screen.classList.contains("countdown-screen")) return "countdowns";
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
        case "rsvp":
          return { icon: "heart", label: "Wedding RSVP" };
        default:
          return { icon: "layout-grid", label: "Screen" };
      }
    }

    function getDisplayNavItems() {
      const visibleScreens = getVisibleScreens();
      const items = [];
      const seen = new Set();

      visibleScreens.forEach((screen, index) => {
        const screenKey = getScreenKeyForElement(screen);
        if (screenKey === "countdowns" && seen.has("countdowns")) {
          return;
        }
        if (screenKey !== "generic" && seen.has(screenKey)) {
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

    function getAssigneeMarkup(assignee) {
      const memberColor = getConfiguredMemberColor(cachedHouseholdConfig?.display_settings?.members, assignee);

      if (!memberColor) {
        return `<span class="todo-assignee todo-assignee--other">${escapeHtml(assignee)}</span>`;
      }

      return `
        <span class="todo-assignee todo-assignee--custom" style="background:${escapeHtml(hexToRgba(memberColor, 0.16))};color:${escapeHtml(memberColor)}">
          ${escapeHtml(assignee)}
        </span>
      `;
    }

    function mapSupabaseTodo(todo) {
      return {
        id: todo.id,
        title: todo.title || "Untitled task",
        assignee: todo.assignee || "",
        duePill: getTodoDuePill(todo.due_date),
        isOverdue: isTodoOverdue(todo.due_date)
      };
    }

    function getDisplayCelebrationAnimationName() {
      if (!celebrationBag.length) {
        celebrationBag = [
          "confetti-burst",
          "star-shower",
          "fireworks",
          "bubble-float",
          "thumbs-up-bounce",
          "sparkle-trail",
          "ink-splash"
        ];

        for (let index = celebrationBag.length - 1; index > 0; index -= 1) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          const current = celebrationBag[index];
          celebrationBag[index] = celebrationBag[swapIndex];
          celebrationBag[swapIndex] = current;
        }
      }

      return celebrationBag.pop();
    }

    function getTodoCelebrationOrigin(cardEl) {
      const trigger = cardEl?.querySelector(".todo-check-btn") || cardEl;
      const rect = trigger?.getBoundingClientRect?.();

      if (!rect) {
        return {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2
        };
      }

      return {
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2)
      };
    }

    function createCelebrationLayer(animationName, origin) {
      const host = document.getElementById("display-app");
      if (!host) {
        return null;
      }

      const layer = document.createElement("div");
      layer.className = `todo-celebration-layer todo-celebration-layer--${animationName}`;
      layer.setAttribute("aria-hidden", "true");
      layer.style.setProperty("--origin-x", `${origin.x}px`);
      layer.style.setProperty("--origin-y", `${origin.y}px`);
      host.appendChild(layer);
      return layer;
    }

    function waitForCelebration(duration = 1800) {
      return new Promise((resolve) => {
        window.setTimeout(resolve, duration);
      });
    }

    function getCelebrationPalette() {
      const styles = getComputedStyle(document.documentElement);
      const accent = String(styles.getPropertyValue("--amber") || "").trim() || "#b45309";
      return [accent, "#ffffff", "#fbbf24", "#22c55e"];
    }

    function getCelebrationPaletteNoWhite() {
      const styles = getComputedStyle(document.documentElement);
      const accent = String(styles.getPropertyValue("--amber") || "").trim() || "#b45309";
      return [accent, "#fbbf24", "#f97316", "#14b8a6", "#a855f7", "#22c55e"];
    }

    function createConfettiInstance(layer) {
      if (!layer || typeof confetti === "undefined") {
        return null;
      }

      const canvas = document.createElement("canvas");
      canvas.className = "todo-celebration-canvas";
      layer.appendChild(canvas);
      return {
        canvas,
        fire: confetti.create(canvas, {
          resize: true,
          useWorker: true
        })
      };
    }

    function playFallbackParticleBurst(origin) {
      const layer = createCelebrationLayer("fallback-burst", origin);
      if (!layer) {
        return Promise.resolve();
      }

      const colors = getCelebrationPalette();
      const particles = Array.from({ length: 14 }, (_, index) => {
        const particle = document.createElement("span");
        const angle = (Math.PI * 2 * index) / 14;
        const distance = 46 + Math.random() * 38;
        const driftY = 28 + Math.random() * 52;
        const size = 7 + Math.random() * 8;
        particle.className = "todo-fallback-particle";
        particle.style.left = `${origin.x}px`;
        particle.style.top = `${origin.y}px`;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.background = colors[index % colors.length];
        particle.style.setProperty("--burst-x", `${Math.cos(angle) * distance}px`);
        particle.style.setProperty("--burst-y", `${Math.sin(angle) * distance + driftY}px`);
        particle.style.setProperty("--burst-rotate", `${160 + Math.random() * 180}deg`);
        layer.appendChild(particle);
        return particle;
      });

      return waitForCelebration(1500).finally(() => {
        particles.forEach((particle) => particle.remove());
        layer.remove();
      });
    }

    function playCanvasConfettiBurst() {
      const layer = createCelebrationLayer("confetti-burst", {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      });
      const instance = createConfettiInstance(layer);
      const colors = getCelebrationPalette();

      if (!instance) {
        layer?.remove();
        return playFallbackParticleBurst({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2
        });
      }

      instance.fire({
        particleCount: 120,
        spread: 80,
        startVelocity: 42,
        ticks: 360,
        origin: { x: 0.5, y: 0.48 },
        colors
      });

      return waitForCelebration(4400).finally(() => layer.remove());
    }

    function playCanvasStarShower() {
      const layer = createCelebrationLayer("star-shower", {
        x: window.innerWidth / 2,
        y: 0
      });
      const instance = createConfettiInstance(layer);
      const colors = getCelebrationPalette();

      if (!instance) {
        layer?.remove();
        return playFallbackParticleBurst({
          x: window.innerWidth / 2,
          y: Math.max(window.innerHeight * 0.22, 120)
        });
      }

      const start = Date.now();
      const duration = 5400;
      const frame = () => {
        if (Date.now() - start >= duration) {
          return;
        }

        instance.fire({
          particleCount: 10,
          angle: 90,
          spread: 40,
          startVelocity: 18,
          gravity: 0.7,
          ticks: 460,
          scalar: 1.05,
          origin: { x: 0.15 + (Math.random() * 0.7), y: -0.08 },
          shapes: ["star"],
          colors
        });

        window.setTimeout(frame, 340);
      };

      frame();
      return waitForCelebration(5800).finally(() => layer.remove());
    }

    function playCanvasFireworks() {
      const layer = createCelebrationLayer("fireworks", {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      });
      const instance = createConfettiInstance(layer);
      const colors = getCelebrationPaletteNoWhite();

      if (!instance) {
        layer?.remove();
        return playFallbackParticleBurst({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2
        });
      }

      const bursts = [
        { x: 0.16, y: 0.22, delay: 0 },
        { x: 0.82, y: 0.2, delay: 900 },
        { x: 0.7, y: 0.52, delay: 1800 }
      ];

      bursts.forEach((burst) => {
        window.setTimeout(() => {
          instance.fire({
            particleCount: 42,
            spread: 62,
            startVelocity: 34,
            ticks: 320,
            origin: { x: burst.x, y: burst.y },
            colors
          });
        }, burst.delay);
      });

      return waitForCelebration(4500).finally(() => layer.remove());
    }

    function createGsapPiece(className, content = "") {
      const element = document.createElement("span");
      element.className = className;
      if (content) {
        element.textContent = content;
      }
      return element;
    }

    function playRippleRings(origin) {
      const layer = createCelebrationLayer("ripple-rings", origin);
      if (!layer) {
        return Promise.resolve();
      }
      const accent = String(getComputedStyle(document.documentElement).getPropertyValue("--amber") || "").trim() || "#b45309";
      Array.from({ length: 3 }, (_, index) => {
        const ring = document.createElement("span");
        ring.className = "todo-ripple-ring";
        ring.style.left = `${origin.x}px`;
        ring.style.top = `${origin.y}px`;
        ring.style.borderColor = accent;
        ring.style.animationDelay = `${index * 120}ms`;
        layer.appendChild(ring);
        return ring;
      });

      return waitForCelebration(1600).finally(() => layer.remove());
    }

    function playGsapBubbleFloat(origin) {
      if (typeof gsap === "undefined") {
        return playFallbackParticleBurst(origin);
      }

      const layer = createCelebrationLayer("bubble-float", origin);
      if (!layer) {
        return Promise.resolve();
      }

      const colors = getCelebrationPaletteNoWhite();
      const pieces = Array.from({ length: 7 }, (_, index) => {
        const piece = createGsapPiece("todo-gsap-piece todo-gsap-piece--bubble");
        const size = 18 + Math.round(Math.random() * 12);
        const baseX = (Math.random() * 24) - 12;
        const amplitude = 18 + Math.random() * 28;
        const frequency = 1.3 + Math.random() * 1.4;
        const phase = Math.random() * Math.PI * 2;
        const duration = 4.75 + Math.random() * 0.22;
        const delay = index * (0.1 + Math.random() * 0.1);
        const riseDistance = Math.max(window.innerHeight * 0.74, 460) + (Math.random() * 60);
        piece.style.left = `${origin.x}px`;
        piece.style.top = `${origin.y}px`;
        piece.style.width = `${size}px`;
        piece.style.height = `${size}px`;
        piece.style.background = colors[index % colors.length];
        piece.style.opacity = "0.12";
        layer.appendChild(piece);
        gsap.to(piece, {
          y: -riseDistance,
          duration,
          delay,
          ease: "none",
          onUpdate() {
            const progress = this.progress();
            const sway = Math.sin((progress * Math.PI * 2 * frequency) + phase) * amplitude;
            const grow = progress < 0.72
              ? 0.52 + (progress * 0.72)
              : 1.04 + ((progress - 0.72) * 0.12);
            const opacity = progress > 0.9
              ? Math.max(0, 0.64 * (1 - ((progress - 0.9) / 0.1)))
              : 0.64;

            gsap.set(piece, {
              x: baseX + sway,
              scale: grow,
              opacity
            });
          }
        });
        return piece;
      });

      return waitForCelebration(5000).finally(() => {
        gsap.killTweensOf(pieces);
        layer.remove();
      });
    }

    function playGsapThumbsUp(origin) {
      if (typeof gsap === "undefined") {
        return playFallbackParticleBurst(origin);
      }

      const layer = createCelebrationLayer("thumbs-up-bounce", origin);
      if (!layer) {
        return Promise.resolve();
      }

      const thumb = createGsapPiece("todo-thumbs-up", "👍");
      thumb.style.left = `${origin.x}px`;
      thumb.style.top = `${origin.y}px`;
      layer.appendChild(thumb);

      const timeline = gsap.timeline();
      timeline
        .fromTo(thumb,
          { scale: 0, opacity: 0, y: 18 },
          { scale: 1, opacity: 1, y: -18, duration: 0.7, ease: "back.out(2.5)" }
        )
        .to(thumb, { duration: 1.7, y: -22 })
        .to(thumb, { duration: 0.42, rotation: -10, y: -26, ease: "power1.inOut" })
        .to(thumb, { duration: 0.42, rotation: 10, y: -21, ease: "power1.inOut" })
        .to(thumb, { duration: 0.36, rotation: 0, y: -24, ease: "power1.inOut" })
        .to(thumb, { opacity: 0, y: -78, duration: 0.82, ease: "power2.out" });

      return waitForCelebration(4000).finally(() => {
        timeline.kill();
        layer.remove();
      });
    }

    function playGsapInkSplash(origin) {
      if (typeof gsap === "undefined") {
        return playFallbackParticleBurst(origin);
      }

      const layer = createCelebrationLayer("ink-splash", origin);
      if (!layer) {
        return Promise.resolve();
      }

      const colors = getCelebrationPalette();
      const blobs = Array.from({ length: 7 }, (_, index) => {
        const blob = createGsapPiece("todo-gsap-piece todo-gsap-piece--ink");
        const angle = (-0.9 + ((Math.PI * 1.8 * index) / 7)) + ((Math.random() - 0.5) * 0.38);
        const distance = 48 + Math.random() * 72;
        const size = 30 + Math.random() * 50;
        const delay = index * (0.04 + Math.random() * 0.02);

        blob.style.left = `${origin.x}px`;
        blob.style.top = `${origin.y}px`;
        blob.style.width = `${size}px`;
        blob.style.height = `${size * (0.82 + Math.random() * 0.36)}px`;
        blob.style.background = colors[index % colors.length];
        blob.style.borderRadius = `${48 + Math.random() * 30}% ${52 + Math.random() * 26}% ${46 + Math.random() * 28}% ${54 + Math.random() * 24}%`;
        blob.style.opacity = "0.9";
        layer.appendChild(blob);

        const timeline = gsap.timeline({ delay });
        timeline
          .fromTo(blob,
            { x: 0, y: 0, scale: 0, opacity: 0.9, rotation: -18 + (Math.random() * 36) },
            {
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance,
              scale: 1,
              duration: 0.55,
              ease: "back.out(1.7)"
            }
          )
          .to(blob, {
            scale: 1.15,
            duration: 0.2,
            ease: "power1.out"
          })
          .to(blob, {
            scale: 0,
            opacity: 0,
            duration: 0.45,
            ease: "power2.in"
          });
        return blob;
      });

      const ring = document.createElement("span");
      ring.className = "todo-ink-ring";
      ring.style.left = `${origin.x}px`;
      ring.style.top = `${origin.y}px`;
      ring.style.borderColor = colors[0];
      layer.appendChild(ring);
      gsap.fromTo(ring,
        { scale: 0.18, opacity: 0.75 },
        { scale: 8.5, opacity: 0, duration: 0.8, ease: "power2.out" }
      );

      return waitForCelebration(2800).finally(() => {
        gsap.killTweensOf([...blobs, ring]);
        layer.remove();
      });
    }

    function playTodoCelebration(cardEl) {
      if (!cardEl || document.documentElement.getAttribute("data-mode") !== "display") {
        return Promise.resolve();
      }

      const animationName = getDisplayCelebrationAnimationName();
      const origin = getTodoCelebrationOrigin(cardEl);
      console.log(`Celebration: ${animationName} | confetti loaded: ${typeof confetti !== "undefined"} | gsap loaded: ${typeof gsap !== "undefined"}`);

      switch (animationName) {
        case "confetti-burst":
          return playCanvasConfettiBurst();
        case "star-shower":
          return playCanvasStarShower();
        case "fireworks":
          return playCanvasFireworks();
        case "bubble-float":
          return playGsapBubbleFloat(origin);
        case "thumbs-up-bounce":
          return playGsapThumbsUp(origin);
        case "sparkle-trail":
          return playRippleRings(origin);
        case "ink-splash":
          return playGsapInkSplash(origin);
        default:
          return playRippleRings(origin);
      }
    }

    function renderTodoItems(todoItems) {
      cachedDisplayTodos = todoItems;
      const list = document.getElementById("todo-list");

      if (!todoItems.length) {
        list.innerHTML = `
          <article class="todo-card todo-card--empty">
            <div class="todo-copy">
              <div class="todo-title">All clear!</div>
              <div class="todo-meta">No open household tasks.</div>
            </div>
          </article>
        `;
        return;
      }

      list.innerHTML = todoItems.map((todo) => {
        const pill = todo.duePill
          ? `<span class="todo-due-pill ${escapeHtml(todo.duePill.cssClass)}">${escapeHtml(todo.duePill.label)}</span>`
          : "";
        const assignee = todo.assignee ? getAssigneeMarkup(todo.assignee) : "";
        const overdueClass = todo.isOverdue ? " todo-card--overdue" : "";
        return `
          <article class="todo-card${overdueClass}" data-todo-id="${escapeHtml(todo.id)}">
            <button class="todo-check-btn" type="button" aria-label="Complete ${escapeHtml(todo.title)}">
              <div class="todo-check">
                <svg class="todo-check-icon" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M1 5L4.5 8.5L11 1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </button>
            <div class="todo-copy">
              <div class="todo-title">${escapeHtml(todo.title)}</div>
              <div class="todo-pills">${assignee}${pill}</div>
            </div>
          </article>
        `;
      }).join("");

      list.querySelectorAll(".todo-check-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const card = btn.closest("[data-todo-id]");
          if (card && !card.classList.contains("is-completing")) {
            completeTodoFromDisplay(card.dataset.todoId, card);
          }
        });
      });
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

    async function completeTodoFromDisplay(todoId, cardEl) {
      const client = getSupabaseClient();
      if (!client) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      cardEl.classList.add("is-completing");
      console.log("[todo-complete] completion reached reset path");
      resetAutoRotate("todo-complete");
      playTodoCelebration(cardEl).catch(() => {});

      const { error } = await client
        .from("todos")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", todoId)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null);
      if (error) {
        cardEl.classList.remove("is-completing");
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      window.setTimeout(() => {
        if (!cardEl.isConnected) {
          return;
        }

        cardEl.classList.add("is-done");
        cardEl.addEventListener("transitionend", () => {
          cardEl.remove();
          const list = document.getElementById("todo-list");
          if (list && !list.querySelector("[data-todo-id]")) {
            renderTodoItems([]);
          }
        }, { once: true });
      }, TODO_CELEBRATION_FADE_DELAY_MS);
    }

    async function fetchTodos() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("todos")
        .select("id, title, due_date, assignee, archived_at, created_at")
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data.map(mapSupabaseTodo);
    }

    function mapSupabaseMeal(meal) {
      return {
        dayOfWeek: Number(meal.day_of_week),
        name: meal.meal_name || "—",
        type: meal.meal_type || "fend_for_yourself"
      };
    }

    async function fetchMeals() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const monday = getMonday(new Date());
      const { data, error } = await client
        .from("meal_plan")
        .select("day_of_week, meal_name, meal_type")
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .eq("week_start", formatDateKey(monday))
        .eq("meal_slot", "dinner")
        .is("user_id", null)
        .order("day_of_week", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data.map(mapSupabaseMeal);
    }

    async function fetchWeeklyNote() {
      const client = getSupabaseClient();
      if (!client) return null;
      const monday = getMonday(new Date());
      const { data, error } = await client
        .from("meal_plan_notes")
        .select("note")
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .eq("week_start", formatDateKey(monday))
        .maybeSingle();
      if (error) return null;
      if (!data) return "";
      return data.note || "";
    }

    function parseUnsplashData(raw) {
      if (!raw) return { imageUrl: null, imageCredit: null };
      try {
        const parsed = JSON.parse(raw);
        return { imageUrl: parsed.url || null, imageCredit: parsed.credit || null };
      } catch {
        // Legacy: raw URL stored before JSON format
        return { imageUrl: raw, imageCredit: null };
      }
    }

    function mapSupabaseCountdown(countdown) {
      const { imageUrl, imageCredit } = parseUnsplashData(countdown.unsplash_image_url);
      return {
        name: countdown.name || "Upcoming Event",
        icon: countdown.icon || "calendar",
        eventDate: countdown.event_date,
        days: getDaysUntil(countdown.event_date),
        caption: formatLongDate(countdown.event_date),
        image_url: imageUrl,
        image_credit: imageCredit,
        daysBeforeVisible: countdown.days_before_visible ?? null
      };
    }

    async function fetchCountdowns() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await client
        .from("countdowns")
        .select("name, icon, event_date, unsplash_image_url, days_before_visible")
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .gte("event_date", formatDateKey(today))
        .order("event_date", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data.map(mapSupabaseCountdown).filter((item) => {
        if (item.daysBeforeVisible === null) return true;
        return item.days !== null && item.days <= item.daysBeforeVisible;
      });
    }

    async function fetchWeddingSnapshotWithAutoMatch() {
      const snapshot = await fetchWeddingRsvpSnapshot();
      if (!snapshot) {
        return null;
      }
      const nextSnapshot = await autoLinkHighConfidenceRsvps(snapshot, {
        logPrefix: "[display-rsvp-auto-match]"
      });
      cachedWeddingSnapshot = nextSnapshot;
      return nextSnapshot;
    }

    function buildCalendarEventsMap(items) {
      const map = new Map();
      const fmt = (dt) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(dt));

      items.forEach((item) => {
        const startRaw = item.start && (item.start.dateTime || item.start.date);
        const endRaw = item.end && (item.end.dateTime || item.end.date);

        if (!startRaw) {
          return;
        }

        const isAllDay = !item.start.dateTime;
        const title = item.summary || "Untitled event";

        // Walk each calendar day the event spans and add it to the map.
        const start = new Date(isAllDay ? startRaw + "T00:00:00" : startRaw);
        start.setHours(0, 0, 0, 0);
        const end = new Date(isAllDay ? endRaw + "T00:00:00" : (endRaw || startRaw));
        end.setHours(0, 0, 0, 0);
        // Google all-day end dates are exclusive, so step back one day.
        if (isAllDay) {
          end.setDate(end.getDate() - 1);
        }

        const isMultiDay = start.toDateString() !== end.toDateString();
        const startTime = (!isAllDay && startRaw) ? fmt(startRaw) : null;
        const endTime = (!isAllDay && endRaw) ? fmt(endRaw) : null;

        const cursor = new Date(start);
        while (cursor <= end) {
          const key = formatDateKey(cursor);
          if (!map.has(key)) {
            map.set(key, []);
          }

          // For multi-day timed events, label each day correctly:
          // first day → start time, middle days → "All day", last day → "ends HH:MM"
          let timeForDay;
          if (isAllDay || !isMultiDay) {
            timeForDay = isAllDay ? "All day" : startTime;
          } else if (cursor.toDateString() === start.toDateString()) {
            timeForDay = startTime || "All day";
          } else if (cursor.toDateString() === end.toDateString()) {
            timeForDay = endTime ? `ends ${endTime}` : "All day";
          } else {
            timeForDay = "All day";
          }

          map.get(key).push({
            title,
            time: timeForDay,
            isAllDay,
            location: item.location || null,
            description: item.description || null
          });
          cursor.setDate(cursor.getDate() + 1);
        }
      });

      return map;
    }

    function extractCalendarCountdowns(items) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const results = [];

      items.forEach((item) => {
        const summary = item.summary || "";
        const description = item.description || "";
        const combinedText = summary + " " + description;

        // Match #countdown optionally followed by a Lucide icon name token.
        const match = combinedText.match(/#countdown(?:\s+([a-z][a-z0-9-]*))?/i);
        if (!match) {
          return;
        }

        const icon = match[1] ? match[1].toLowerCase() : "calendar";
        const startRaw = item.start && (item.start.dateTime || item.start.date);

        if (!startRaw) {
          return;
        }

        const eventDate = item.start.date || startRaw.slice(0, 10);
        const days = getDaysUntil(eventDate);

        if (days === null || days < 0) {
          return;
        }

        // Strip the #countdown tag (and optional icon token) from the display name.
        const name = summary.replace(/#countdown(?:\s+[a-z][a-z0-9-]*)?/i, "").trim() || "Upcoming Event";

        results.push({
          name,
          icon,
          days,
          caption: formatLongDate(eventDate)
        });
      });

      return results;
    }

    function renderCalendar() {
      const grid = document.getElementById("calendar-grid");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayKey = today.toDateString();

      // Offset start date by weekOffset × UPCOMING_DAYS days
      const startDate = new Date(today);
      startDate.setDate(today.getDate() + weekOffset * UPCOMING_DAYS);

      const fragment = document.createDocumentFragment();

      for (let index = 0; index < UPCOMING_DAYS; index++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index);
        const events = calendarEventsMap.get(formatDateKey(date)) || [];
        const dateKey = formatDateKey(date);

        const column = document.createElement("article");
        column.className = "day-column" + (date.toDateString() === todayKey ? " today" : "");

        const eventsMarkup = events.length
          ? events.map((event) => `
              <div class="event-card" role="button" tabindex="0"
                   data-event-title="${escapeHtml(event.title)}"
                   data-event-time="${escapeHtml(event.time)}"
                   data-event-location="${escapeHtml(event.location || "")}"
                   data-event-description="${escapeHtml(event.description || "")}"
                   data-event-isallday="${event.isAllDay ? "true" : "false"}"
                   data-event-date="${escapeHtml(dateKey)}">
                <div class="event-time">${escapeHtml(event.time)}</div>
                <div class="event-title">${escapeHtml(event.title)}</div>
              </div>
            `).join("")
          : '<div class="event-empty">Nothing scheduled</div>';

        column.innerHTML = `
          <div class="day-header">
            <div class="day-name">${formatCalendarLabel(date)}</div>
          </div>
          <div class="event-list">${eventsMarkup}</div>
        `;

        fragment.appendChild(column);
      }

      grid.replaceChildren(fragment);
    }

    // Measures how many event chips fit in a rendered month cell.
    // Two numbers: maxFull (no overflow pill) and maxWithPill (space reserved for pill).
    // Called synchronously after Pass 1 of renderMonthCalendar so layout is already computed.
    function measureMonthCellCapacity(monthGridEl) {
      const cell = monthGridEl.querySelector(".month-day:not(.month-day--outside)") ||
                   monthGridEl.querySelector(".month-day");
      if (!cell) return { maxFull: 2, maxWithPill: 1 };

      const cellStyle = getComputedStyle(cell);
      const paddingV = parseFloat(cellStyle.paddingTop) + parseFloat(cellStyle.paddingBottom);
      const cellInnerH = cell.clientHeight - paddingV;

      const dateEl = cell.querySelector(".month-date");
      const eventsEl = cell.querySelector(".month-events");
      if (!dateEl || !eventsEl) return { maxFull: 2, maxWithPill: 1 };

      const cellGap = parseFloat(cellStyle.gap) || 6;
      const dateH = dateEl.offsetHeight + cellGap;
      const availableH = cellInnerH - dateH;
      if (availableH <= 0) return { maxFull: 1, maxWithPill: 0 };

      // Append a hidden probe chip to measure real chip height at this screen size
      const probe = document.createElement("div");
      probe.className = "month-event month-event--wrap";
      probe.textContent = "Sample event title";
      probe.style.cssText = "visibility:hidden;pointer-events:none;";
      eventsEl.appendChild(probe);
      const chipH = probe.offsetHeight;
      const chipsGap = parseFloat(getComputedStyle(eventsEl).gap) || 4;
      eventsEl.removeChild(probe);

      if (chipH <= 0) return { maxFull: 2, maxWithPill: 1 };

      const maxFull = Math.max(1, Math.floor((availableH + chipsGap) / (chipH + chipsGap)));
      // Overflow pill is roughly the same height as a chip; reserve space for it
      const maxWithPill = Math.max(0, Math.floor((availableH - chipH - chipsGap + chipsGap) / (chipH + chipsGap)));

      return { maxFull, maxWithPill };
    }

    function renderMonthCalendarCells(monthGridEl, displayedMonth, start, cellsNeeded, capacity, today) {
      const cells = Array.from({ length: cellsNeeded }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const isToday = date.toDateString() === today.toDateString();
        const isOutsideMonth = date.getMonth() !== displayedMonth.getMonth();
        const allEvents = isOutsideMonth ? [] : (calendarEventsMap.get(formatDateKey(date)) || []);
        const dateKey = formatDateKey(date);

        // Determine how many events to show
        const hasOverflow = allEvents.length > capacity.maxFull;
        const showCount = hasOverflow
          ? Math.max(1, capacity.maxWithPill)
          : allEvents.length;
        const visibleEvents = allEvents.slice(0, showCount);
        const overflowCount = allEvents.length - visibleEvents.length;
        const wrapClass = " month-event--wrap";

        const eventChips = visibleEvents.map((event) => `
          <div class="month-event${wrapClass}"
               data-event-title="${escapeHtml(event.title)}"
               data-event-time="${escapeHtml(event.time)}"
               data-event-location="${escapeHtml(event.location || "")}"
               data-event-description="${escapeHtml(event.description || "")}"
               data-event-isallday="${event.isAllDay ? "true" : "false"}"
               data-event-date="${escapeHtml(dateKey)}"
               role="button" tabindex="0">${escapeHtml(event.title)}</div>
        `).join("");

        const overflowPill = overflowCount > 0
          ? `<div class="month-more-pill" data-date-key="${escapeHtml(dateKey)}" role="button" tabindex="0">+${overflowCount} more</div>`
          : "";

        return `
          <article class="month-day${isToday ? " month-day--today" : ""}${isOutsideMonth ? " month-day--outside" : ""}">
            <div class="month-date">${date.getDate()}</div>
            <div class="month-events">${eventChips}${overflowPill}</div>
          </article>
        `;
      });

      monthGridEl.innerHTML = cells.join("");
    }

    function renderMonthCalendar() {
      const weekdaysEl = document.getElementById("month-weekdays");
      const monthGridEl = document.getElementById("month-grid");
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const displayedMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
      const start = getMonthGridStart(displayedMonth);
      const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      monthTitleEl.textContent = formatMonthYear(displayedMonth);
      weekdaysEl.innerHTML = weekdayNames.map((name) => `<div class="month-weekday">${name}</div>`).join("");

      const daysInMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0).getDate();
      const cellsNeeded = (displayedMonth.getDay() + daysInMonth) > 35 ? 42 : 35;

      // Pass 1: render empty cell skeletons so the browser can compute cell height
      monthGridEl.innerHTML = Array.from({ length: cellsNeeded }, (_, i) => {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        const isToday = date.toDateString() === today.toDateString();
        const isOutside = date.getMonth() !== displayedMonth.getMonth();
        return `<article class="month-day${isToday ? " month-day--today" : ""}${isOutside ? " month-day--outside" : ""}">
          <div class="month-date">${date.getDate()}</div>
          <div class="month-events"></div>
        </article>`;
      }).join("");

      // Accessing clientHeight here forces synchronous layout — no visual flicker
      // because both innerHTML writes happen in the same JS task before any paint.
      const capacity = measureMonthCellCapacity(monthGridEl);

      // Pass 2: render cells with correctly measured event counts
      renderMonthCalendarCells(monthGridEl, displayedMonth, start, cellsNeeded, capacity, today);
    }

    async function renderTodos() {
      markPending("todos");
      renderTodoSkeleton();
      let remoteTodos = await fetchTodos();
      if (remoteTodos === null) {
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        remoteTodos = await fetchTodos();
      }
      if (remoteTodos === null) {
        renderScreenError(
          document.getElementById("todo-list"),
          "Something went wrong loading your data \u2014 tap to retry",
          renderTodos
        );
      } else {
        renderTodoItems(remoteTodos);
      }
      resolveScreen("todos");
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

    function stopRsvpAutoScroll() {
      if (rsvpScrollId !== null) {
        window.cancelAnimationFrame(rsvpScrollId);
        rsvpScrollId = null;
      }
    }

    function startRsvpAutoScroll() {
      stopRsvpAutoScroll();

      const container = document.querySelector(".names-list");
      const list = document.getElementById("rsvp-names");

      if (!container || !list) {
        return;
      }

      const maxScroll = Math.max(list.scrollHeight - container.clientHeight, 0);
      container.scrollTop = 0;

      if (!maxScroll) {
        return;
      }

      let direction = 1;
      let lastTimestamp = 0;
      let pauseUntil = 0;
      const speed = 18;

      const step = (timestamp) => {
        if (!lastTimestamp) {
          lastTimestamp = timestamp;
          pauseUntil = timestamp + 1600;
        }

        const delta = timestamp - lastTimestamp;
        lastTimestamp = timestamp;

        if (timestamp >= pauseUntil) {
          const nextScrollTop = container.scrollTop + direction * speed * (delta / 1000);

          if (nextScrollTop >= maxScroll) {
            container.scrollTop = maxScroll;
            direction = -1;
            pauseUntil = timestamp + 1600;
          } else if (nextScrollTop <= 0) {
            container.scrollTop = 0;
            direction = 1;
            pauseUntil = timestamp + 1600;
          } else {
            container.scrollTop = nextScrollTop;
          }
        }

        rsvpScrollId = window.requestAnimationFrame(step);
      };

      rsvpScrollId = window.requestAnimationFrame(step);
    }

    function reconcileRotationState() {
      const visibleScreens = getVisibleScreens();
      const screenCount = visibleScreens.length;

      if (!screenCount) {
        return;
      }

      currentIndex = Math.min(currentIndex, screenCount - 1);
      track.style.transform = "translateX(-" + (currentIndex * 100) + "%)";
      renderProgress();
      refreshIcons();
    }

    function renderMeals(mealItems, weeklyNote) {
      const mealGrid = document.getElementById("meal-grid");
      const monday = getMonday(new Date());
      const todayKey = new Date().toDateString();
      const mealsByDay = new Map();

      mealItems.forEach((meal) => {
        mealsByDay.set(meal.dayOfWeek, meal);
      });

      const mealCards = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        const isToday = date.toDateString() === todayKey;
        const meal = mealsByDay.get(index);
        const mealType = meal ? getMealTypePresentation(meal.type) : null;
        const mealName = meal ? meal.name : "\u2014";

        return `
          <article class="meal-card${isToday ? " today" : ""}">
            <div class="meal-day">${escapeHtml(formatCalendarLabel(date))}</div>
            <div class="meal-name">${escapeHtml(mealName)}</div>
            <div class="meal-type ${mealType ? mealType.className : "meal-type--fend-for-yourself"}">${escapeHtml(mealType ? mealType.label : "Open")}</div>
          </article>
        `;
      });

      const noteText = weeklyNote || "";
      const noteCard = noteText
        ? `
          <article class="meal-note-card">
            <div class="meal-note-label">This Week</div>
            <div class="meal-note-text">${escapeHtml(noteText).replace(/\n/g, "<br>")}</div>
          </article>
        `
        : `
          <article class="meal-note-card meal-note-card--empty">
            <div class="meal-note-label">This Week</div>
            <div class="meal-note-empty">No note this week</div>
          </article>
        `;

      mealGrid.innerHTML = mealCards.join("") + noteCard;
    }

    async function renderMealsWithData() {
      markPending("meals");
      renderMealSkeleton();
      const [remoteMeals, weeklyNote] = await Promise.all([fetchMeals(), fetchWeeklyNote()]);
      if (remoteMeals === null) {
        renderScreenError(
          document.getElementById("meal-grid"),
          "Something went wrong loading your data \u2014 tap to retry",
          renderMealsWithData
        );
      } else {
        renderMeals(remoteMeals, weeklyNote || "");
      }
      resolveScreen("meals");
    }

    function renderCountdowns(countdownItems) {
      let existingCountdownScreens = Array.from(track.querySelectorAll(".countdown-screen"));
      existingCountdownScreens.forEach((screen, index) => {
        if (index > 0) {
          screen.remove();
        }
      });

      existingCountdownScreens = Array.from(track.querySelectorAll(".countdown-screen"));
      let firstCountdownScreen = existingCountdownScreens[0];

      if (!firstCountdownScreen) {
        firstCountdownScreen = document.createElement("section");
        firstCountdownScreen.className = "screen countdown-screen";
        const rsvpScreen = track.querySelector(".rsvp-screen");
        track.insertBefore(firstCountdownScreen, rsvpScreen || null);
      }

      if (!countdownItems.length) {
        firstCountdownScreen.innerHTML = "";
        firstCountdownScreen.classList.add("screen--empty-hidden");
        firstCountdownScreen.setAttribute("aria-hidden", "true");
        reconcileRotationState();
        return;
      }

      firstCountdownScreen.classList.remove("screen--empty-hidden");
      if (!firstCountdownScreen.classList.contains("screen--disabled")) {
        firstCountdownScreen.removeAttribute("aria-hidden");
      }
      const countdownTemplate = (item, index) => {
        const hasImage = Boolean(item.image_url);
        const variantIndex = index % 4;
        const variantClass = variantIndex > 0 ? ` countdown-card--variant-${variantIndex + 1}` : "";
        const daysLabel = item.days === 1 ? "day" : "days";

        return `
        <div class="panel">
          <div class="screen-title-row">
            <div class="eyebrow"><i data-lucide="sparkles"></i> Looking Forward</div>
          </div>
          <div class="countdown-layout">
            <article class="countdown-card${variantClass}${hasImage ? " countdown-card--photo" : ""}">
              ${hasImage ? `
              <div class="countdown-photo-wrap">
                <img class="countdown-photo" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" onerror="this.closest('.countdown-card').classList.remove('countdown-card--photo'); this.closest('.countdown-photo-wrap').remove();">
                ${item.image_credit ? `<div class="countdown-photo-credit">${escapeHtml(item.image_credit)}</div>` : ""}
              </div>` : ""}
              <div class="countdown-copy">
                <div class="countdown-icon"><i data-lucide="${escapeHtml(item.icon || "calendar")}"></i></div>
                <div class="countdown-name">${escapeHtml(item.name)}</div>
                <div class="countdown-days">
                  <span class="countdown-value">${escapeHtml(item.days)}</span>
                  <span class="countdown-unit">${daysLabel}</span>
                </div>
                <div class="countdown-caption">${escapeHtml(item.caption)}</div>
              </div>
            </article>
          </div>
        </div>
      `;
      };

      firstCountdownScreen.innerHTML = countdownTemplate(countdownItems[0], 0);

      countdownItems.slice(1).forEach((item, index) => {
        const section = document.createElement("section");
        section.className = `screen countdown-screen${firstCountdownScreen.classList.contains("screen--disabled") ? " screen--disabled" : ""}`;
        if (section.classList.contains("screen--disabled")) {
          section.setAttribute("aria-hidden", "true");
        }
        section.innerHTML = countdownTemplate(item, index + 1);
        // Insert after the last existing countdown-screen to keep them grouped
        const allCountdowns = track.querySelectorAll(".countdown-screen");
        const lastCountdown = allCountdowns[allCountdowns.length - 1];
        lastCountdown.insertAdjacentElement("afterend", section);
      });

      reconcileRotationState();
    }

    // wide=true: fetch 24-month window and rebuild the full event store.
    // wide=false: fetch 3-month rolling window and merge into the existing store.
    // Countdowns are only re-extracted on wide fetches (they cover the full 24-month range).
    async function refreshCalendarData(wide = false) {
      if (!cachedHouseholdConfig || !cachedHouseholdConfig.google_cal_id) {
        return false;
      }

      const apiKey = cachedHouseholdConfig.google_cal_key || GOOGLE_CAL_KEY;

      if (!apiKey || apiKey.startsWith("%%")) {
        return false;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let timeMin, timeMax, maxResults;
      if (wide) {
        // 24-month window: 12 months back, 12 months forward
        // timeMax is the first day after the window (exclusive upper bound for Google Calendar)
        timeMin = new Date(today.getFullYear(), today.getMonth() - 12, 1);
        timeMax = new Date(today.getFullYear(), today.getMonth() + 13, 1);
        maxResults = "2500";
        console.log(`[calendar] wide fetch — timeMin: ${timeMin.toISOString()}, timeMax: ${timeMax.toISOString()}`);
      } else {
        // 3-month rolling window: 1 month back, 2 months forward
        // timeMax is the first day after the window (exclusive upper bound for Google Calendar)
        timeMin = getMonthGridStart(new Date(today.getFullYear(), today.getMonth() - 1, 1));
        timeMax = new Date(today.getFullYear(), today.getMonth() + 3, 1);
        maxResults = "500";
      }

      const items = await fetchGoogleCalendarEvents(cachedHouseholdConfig.google_cal_id, apiKey, timeMin, timeMax, maxResults);

      if (!items) {
        return false;
      }

      const freshMap = buildCalendarEventsMap(items);

      if (wide) {
        // Complete replacement — wide fetch is the source of truth
        calendarEventsMap = freshMap;
        cachedCalendarCountdowns = extractCalendarCountdowns(items);
        lastWideFetch = Date.now(); // stamp only after successful completion
      } else {
        // Merge: overwrite keys from freshMap, then delete stale keys within the
        // refreshed window that are no longer present (days that became empty).
        // Countdowns intentionally not updated — wide fetch (every 24h) keeps them fresh.
        freshMap.forEach((events, key) => {
          calendarEventsMap.set(key, events);
        });
        const cursor = new Date(timeMin);
        while (cursor < timeMax) {
          const key = formatDateKey(cursor);
          if (!freshMap.has(key)) {
            calendarEventsMap.delete(key);
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }

      renderCalendar();
      renderMonthCalendar();

      const base = cachedSupabaseCountdowns !== null ? cachedSupabaseCountdowns : [];
      const merged = [...base, ...cachedCalendarCountdowns]
        .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));

      if (merged.length > 0) {
        renderCountdowns(merged);
      } else if (cachedSupabaseCountdowns !== null) {
        // Both sources loaded but found no countdowns — remove the screen.
        renderCountdowns([]);
      }

      return true;
    }

    async function renderCalendarAndCountdowns() {
      renderCalendarSkeleton();
      renderMonthCalendarSkeleton();
      renderCountdownSkeleton();
      markPending("calendar");
      markPending("countdowns");

      const [householdConfig, supabaseCountdowns] = await Promise.all([
        fetchHouseholdConfig(),
        fetchCountdowns()
      ]);

      cachedHouseholdConfig = householdConfig;
      cachedSupabaseCountdowns = supabaseCountdowns;

      updateHouseholdName(householdConfig);
      applyDisplaySettings(householdConfig);
      if (cachedDisplayTodos !== null) {
        renderTodoItems(cachedDisplayTodos);
      }

      const calendarLoaded = await refreshCalendarData(true); // wide fetch on initial load

      if (!calendarLoaded) {
        renderCalendarError();
      }
      resolveScreen("calendar");

      // refreshCalendarData renders countdowns when it succeeds.
      // Handle the case where Google Cal didn't load.
      if (!calendarLoaded) {
        if (supabaseCountdowns !== null && supabaseCountdowns.length > 0) {
          renderCountdowns(supabaseCountdowns);
        } else if (supabaseCountdowns === null) {
          // Both data sources failed — show error on countdown screen.
          renderCountdownError();
        } else {
          // Both succeeded but found no countdowns — remove the screen.
          renderCountdowns([]);
        }
      }
      resolveScreen("countdowns");
    }

    function formatGuestCountLabel(count) {
      const safeCount = Math.max(0, Number(count) || 0);
      return `${safeCount} ${safeCount === 1 ? "guest" : "guests"}`;
    }

    function shouldHideRsvpScreen() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return formatDateKey(today) > RSVP_RETIRE_AFTER_DATE;
    }

    function removeRsvpScreen() {
      const rsvpScreen = document.querySelector(".rsvp-screen");

      stopRsvpAutoScroll();

      if (rsvpScreen) {
        rsvpScreen.remove();
        reconcileRotationState();
      }
    }

    function renderRsvpBoard(snapshot) {
      const list = document.getElementById("rsvp-names");
      const totalEl = document.getElementById("rsvp-total");
      const stats = snapshot.stats || {};
      const reviewCount = stats.reviewCount || 0;
      const attendingGuestCount = stats.attendingGuests || 0;
      const attendingRows = (snapshot.invitedParties || [])
        .filter((party) => party.linkedRsvp && party.linkedRsvp.attending === true)
        .map((party) => ({
          name: party.linkedRsvp.name,
          guestCount: Math.min(party.linkedRsvp.guestCount, party.invitedCount),
          isUnderCount: party.linkedRsvp.guestCount < party.invitedCount,
          createdAt: party.linkedRsvp.createdAt || null
        }))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      totalEl.textContent = String(attendingGuestCount);
      totalEl.classList.toggle("hero-number--empty", attendingGuestCount === 0);
      totalEl.classList.toggle("hero-number--active", attendingGuestCount > 0);
      document.getElementById("rsvp-total-label").textContent = "guests attending so far";
      document.getElementById("rsvp-parties-responded").textContent = `${stats.respondedParties || 0} / ${stats.totalParties || 0} parties responded`;
      document.getElementById("rsvp-declined-count").textContent = String(stats.declinedGuests || 0);
      document.getElementById("rsvp-pending-count").textContent = String(stats.pendingGuests || 0);
      document.getElementById("rsvp-review-count").textContent = String(reviewCount);
      document.getElementById("rsvp-names-title").textContent = "Guest List";
      const reviewCountEl = document.getElementById("rsvp-review-count");
      const reviewTrigger = document.getElementById("rsvp-review-trigger");
      if (reviewCountEl) {
        reviewCountEl.classList.toggle("rsvp-stat-value--clear", reviewCount === 0);
        reviewCountEl.classList.toggle("rsvp-stat-value--flagged", reviewCount > 0);
      }
      if (reviewTrigger) {
        reviewTrigger.disabled = reviewCount === 0;
        reviewTrigger.classList.toggle("breakdown-row--disabled", reviewCount === 0);
      }

      if (!attendingRows.length) {
        stopRsvpAutoScroll();
        list.classList.add("names-scroll--empty");
        list.innerHTML = `
          <div class="rsvp-empty-state">
            <div class="rsvp-empty-icon"><i data-lucide="heart"></i></div>
            <div class="rsvp-empty-headline">No RSVPs yet</div>
            <div class="rsvp-empty-copy">Confirmed guests will appear here as responses come in</div>
          </div>
        `;
        refreshIcons();
        return;
      }

      list.classList.remove("names-scroll--empty");
      list.innerHTML = attendingRows.map((row) => `
        <div class="name-pill name-pill--attending${row.isUnderCount ? " name-pill--undercount" : ""}">
          <span>${escapeHtml(row.name)}</span>
          <span class="name-status">${escapeHtml(formatGuestCountLabel(row.guestCount))}</span>
        </div>
      `).join("");

      startRsvpAutoScroll();
    }

    async function renderRsvpBoardWithData() {
      markPending("rsvp");

      if (shouldHideRsvpScreen()) {
        removeRsvpScreen();
        resolveScreen("rsvp");
        return;
      }

      cachedWeddingSnapshot = null;
      renderRsvpSkeleton();

      const snapshot = await fetchWeddingSnapshotWithAutoMatch();

      if (snapshot === null) {
        cachedWeddingSnapshot = null;
        renderRsvpError();
      } else {
        renderRsvpBoard(snapshot);
      }

      resolveScreen("rsvp");
    }

    function renderProgress() {
      const visibleScreens = getVisibleScreens();
      const activeScreenKey = getScreenKeyForElement(visibleScreens[currentIndex]);
      displayNav.innerHTML = getDisplayNavItems().map((item) =>
        buildDisplayNavButtonMarkup(item, item.key === activeScreenKey)
      ).join("");
      refreshIcons();
    }

    function updateHouseholdName(config) {
      const name = config && config.assistant_name && config.assistant_name.trim()
        ? config.assistant_name.trim()
        : "Homeboard";
      if (householdNameEl) householdNameEl.textContent = name;
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
      DISPLAY_SCREEN_KEYS.forEach((name) => {
        getRegisteredScreens(name).forEach((screen) => {
          if (activeScreens.includes(name)) {
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
      const rsvpScreen = track.querySelector(".rsvp-screen");
      const anchor = rsvpScreen || null;
      for (const screenName of screenOrder) {
        getRegisteredScreens(screenName).forEach((screen) => {
          if (screen.parentElement === track) {
            track.insertBefore(screen, anchor);
          }
        });
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
      const defaultScreens = [...DISPLAY_SCREEN_KEYS];
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

    function updateLastSyncedLabel() {
      const el = document.getElementById("display-last-synced");
      if (!el) return;
      el.textContent = formatRelativeTimestamp(localStorage.getItem(LAST_SYNCED_KEY), "");
    }

    let isSyncing = false;

    async function runFullSync() {
      if (isSyncing) return;
      isSyncing = true;
      const syncBtn = document.getElementById("display-sync-btn");
      if (syncBtn) syncBtn.classList.add("is-syncing");

      try {
        // Re-fetch all data in parallel
        const [remoteTodos, remoteMeals, weeklyNote] = await Promise.all([
          fetchTodos(),
          fetchMeals(),
          fetchWeeklyNote()
        ]);

        if (remoteTodos !== null) renderTodoItems(remoteTodos);
        if (remoteMeals !== null) renderMeals(remoteMeals, weeklyNote || "");

        // Re-fetch calendar (wide fetch refreshes countdowns too)
        const [newConfig, newSupabaseCountdowns] = await Promise.all([
          fetchHouseholdConfig(),
          fetchCountdowns()
        ]);

        if (newConfig) {
          cachedHouseholdConfig = newConfig;
          updateHouseholdName(newConfig);
          applyDisplaySettings(newConfig);
          if (cachedDisplayTodos !== null) {
            renderTodoItems(cachedDisplayTodos);
          }
        }

        if (newSupabaseCountdowns !== null) {
          cachedSupabaseCountdowns = newSupabaseCountdowns;
        }

        await refreshCalendarData(true);

        // Re-fetch RSVP if visible
        if (!shouldHideRsvpScreen() && track.querySelector(".rsvp-screen")) {
          const snapshot = await fetchWeddingSnapshotWithAutoMatch();
          if (snapshot !== null) {
            renderRsvpBoard(snapshot);
          } else {
            cachedWeddingSnapshot = null;
          }
        }

        // Check for service worker updates
        if ("serviceWorker" in navigator) {
          try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
              await registration.update();
              if (registration.waiting) {
                navigator.serviceWorker.addEventListener("controllerchange", () => {
                  window.location.reload();
                }, { once: true });
                registration.waiting.postMessage({ type: "SKIP_WAITING" });
                return; // Page will reload
              }
            }
          } catch {
            // SW not available — ignore
          }
        }

        localStorage.setItem(LAST_SYNCED_KEY, new Date().toISOString());
        updateLastSyncedLabel();
      } finally {
        isSyncing = false;
        const btn = document.getElementById("display-sync-btn");
        if (btn) btn.classList.remove("is-syncing");
      }
    }

    function goToScreen(index) {
      const screenCount = getScreenCount();
      if (!screenCount) {
        return;
      }
      const isForwardWrap = index >= screenCount;
      const isBackwardWrap = index < 0;

      if (isForwardWrap) {
        // Teleport track to appear one screen to the right of the first screen,
        // then animate forward (left) into it — so wrap feels like a continuation.
        track.style.transition = "none";
        track.style.transform = "translateX(100%)";
        void track.getBoundingClientRect();
        track.style.transition = "";
      } else if (isBackwardWrap) {
        // Teleport track to appear one screen to the left of the last screen,
        // then animate backward (right) into it.
        track.style.transition = "none";
        track.style.transform = "translateX(-" + (screenCount * 100) + "%)";
        void track.getBoundingClientRect();
        track.style.transition = "";
      }

      currentIndex = (index + screenCount) % screenCount;
      track.style.transform = "translateX(-" + (currentIndex * 100) + "%)";
      renderProgress();
    }

    function navigateToScreenIndex(index) {
      goToScreen(index);
      resetAutoRotate();
    }

    function getTimerForCurrentScreen() {
      const screen = getVisibleScreens()[currentIndex];
      if (!screen) return (screenTimers.default || 30) * 1000;
      if (screen.classList.contains("screen--calendar")) return (screenTimers.upcoming_calendar || 30) * 1000;
      if (screen.classList.contains("screen--month")) return (screenTimers.monthly_calendar || 60) * 1000;
      if (screen.classList.contains("screen--todos")) return (screenTimers.todos || 45) * 1000;
      if (screen.classList.contains("screen--meals")) return (screenTimers.meals || 30) * 1000;
      if (screen.classList.contains("countdown-screen")) return (screenTimers.countdowns || 15) * 1000;
      return (screenTimers.default || 30) * 1000;
    }

    function resetAutoRotate(reason = "unknown") {
      window.clearTimeout(autoRotateId);
      autoRotateToken += 1;
      const token = autoRotateToken;
      const delay = getTimerForCurrentScreen();
      console.log(`[rotation] reset via ${reason}; token=${token}; delayMs=${delay}`);
      autoRotateId = window.setTimeout(() => autoAdvanceAndSchedule(token), delay);
    }

    function autoAdvanceAndSchedule(token) {
      if (token !== autoRotateToken) {
        console.log(`[rotation] skipped stale auto-rotate callback; token=${token}; current=${autoRotateToken}`);
        return;
      }

      nextScreen();
      const nextDelay = getTimerForCurrentScreen();
      autoRotateId = window.setTimeout(() => autoAdvanceAndSchedule(token), nextDelay);
    }

    function nextScreen() {
      goToScreen(currentIndex + 1);
    }

    function previousScreen() {
      goToScreen(currentIndex - 1);
    }

    function manualNavigate(direction) {
      if (direction === "next") {
        navigateToScreenIndex(currentIndex + 1);
      } else {
        navigateToScreenIndex(currentIndex - 1);
      }
    }

    function handlePointerDown(event) {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      pointerStartX = event.clientX;
      pointerDeltaX = 0;
    }

    function handlePointerMove(event) {
      if (pointerStartX === null) {
        return;
      }

      pointerDeltaX = event.clientX - pointerStartX;
    }

    function handlePointerUp() {
      if (pointerStartX === null) {
        return;
      }

      if (Math.abs(pointerDeltaX) >= 60) {
        manualNavigate(pointerDeltaX < 0 ? "next" : "previous");
      }

      pointerStartX = null;
      pointerDeltaX = 0;
    }

    function handleKeydown(event) {
      if (event.key === "ArrowRight") {
        manualNavigate("next");
      }

      if (event.key === "ArrowLeft") {
        manualNavigate("previous");
      }
    }

    function openEventDetailModal(event, dateStr) {
      const titleEl = document.getElementById("event-detail-title");
      const bodyEl = document.getElementById("event-detail-body");

      titleEl.textContent = event.title;

      const timeLabel = event.isAllDay ? "All day" : event.time;
      const dateLabel = formatLongDate(dateStr);

      let html = `
        <div class="event-detail-row">
          <i data-lucide="clock"></i>
          <span class="event-detail-text">${escapeHtml(dateLabel)} &middot; ${escapeHtml(timeLabel)}</span>
        </div>
      `;

      if (event.location) {
        html += `
          <div class="event-detail-row">
            <i data-lucide="map-pin"></i>
            <span class="event-detail-text">${escapeHtml(event.location)}</span>
          </div>
        `;
      }

      if (event.description) {
        html += `
          <div class="event-detail-row">
            <i data-lucide="align-left"></i>
            <span class="event-detail-text">${escapeHtml(event.description).replace(/\n/g, "<br>")}</span>
          </div>
        `;
      }

      bodyEl.innerHTML = html;
      document.getElementById("event-detail-modal").hidden = false;
      resetAutoRotate("event-detail-open");
      refreshIcons();
    }

    function closeEventDetailModal() {
      document.getElementById("event-detail-modal").hidden = true;
      resetAutoRotate("event-detail-close");
    }

    function openDayDetailModal(dateKey) {
      const date = new Date(dateKey + "T00:00:00");
      document.getElementById("day-detail-title").textContent = formatHeaderDate(date);

      const allEvents = calendarEventsMap.get(dateKey) || [];
      const bodyEl = document.getElementById("day-detail-body");

      if (!allEvents.length) {
        bodyEl.innerHTML = `<p class="event-detail-text" style="color:var(--muted);">No events this day.</p>`;
      } else {
        bodyEl.innerHTML = allEvents.map((event) => `
          <div class="day-event-item" role="button" tabindex="0"
               data-event-title="${escapeHtml(event.title)}"
               data-event-time="${escapeHtml(event.time)}"
               data-event-location="${escapeHtml(event.location || "")}"
               data-event-description="${escapeHtml(event.description || "")}"
               data-event-isallday="${event.isAllDay ? "true" : "false"}"
               data-event-date="${escapeHtml(dateKey)}">
            <div class="day-event-item-time">${escapeHtml(event.time)}</div>
            <div class="day-event-item-title">${escapeHtml(event.title)}</div>
          </div>
        `).join("");
      }

      document.getElementById("day-detail-modal").hidden = false;
      resetAutoRotate("day-detail-open");
    }

    function closeDayDetailModal() {
      document.getElementById("day-detail-modal").hidden = true;
      resetAutoRotate("day-detail-close");
    }

    function openRsvpDetailModal(title, names) {
      const titleEl = document.getElementById("rsvp-detail-title");
      const bodyEl = document.getElementById("rsvp-detail-body");
      if (!titleEl || !bodyEl) return;

      titleEl.textContent = title;
      if (!Array.isArray(names) || !names.length) {
        bodyEl.innerHTML = `<p class="event-detail-text" style="color:var(--muted);">No parties to show.</p>`;
      } else {
        bodyEl.innerHTML = `
          <div class="rsvp-detail-list">
            ${names.map((name) => `<div class="rsvp-detail-item">${escapeHtml(name)}</div>`).join("")}
          </div>
        `;
      }
      document.getElementById("rsvp-detail-modal").hidden = false;
      resetAutoRotate("rsvp-detail-open");
    }

    function closeRsvpDetailModal() {
      document.getElementById("rsvp-detail-modal").hidden = true;
      resetAutoRotate("rsvp-detail-close");
    }

    function getDisplayReviewResponseLabel(rsvp) {
      if (!rsvp) {
        return "";
      }
      return rsvp.attending
        ? `Attending • ${formatGuestCountLabel(rsvp.guestCount)}`
        : "Declining";
    }

    function openRsvpReviewModal() {
      const reviewItems = cachedWeddingSnapshot?.reviewItems || [];
      const count = reviewItems.length;
      if (!count) return;
      const bodyEl = document.getElementById("rsvp-review-body");
      bodyEl.innerHTML = `
        <div class="rsvp-review-copy">
          <p><strong>${count}</strong> RSVP${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} a closer look.</p>
          <div class="rsvp-detail-list rsvp-review-list">
            ${reviewItems.map((item) => `
              <div class="rsvp-detail-item rsvp-review-item">
                <div class="rsvp-review-item-header">
                  <span>${escapeHtml(item.rsvp?.name || "Unnamed RSVP")}</span>
                  <span class="rsvp-review-badge">${escapeHtml(item.issueLabel || "Review")}</span>
                </div>
                <div class="rsvp-review-item-meta">${escapeHtml(getDisplayReviewResponseLabel(item.rsvp))}</div>
              </div>
            `).join("")}
          </div>
          <p class="rsvp-review-cta">Open the RSVP tab in the admin on your phone to sort these out.</p>
        </div>
      `;
      document.getElementById("rsvp-review-modal").hidden = false;
      resetAutoRotate("rsvp-review-open");
    }

    function closeRsvpReviewModal() {
      document.getElementById("rsvp-review-modal").hidden = true;
      resetAutoRotate("rsvp-review-close");
    }

    function initDisplayMode() {
      displayApp.hidden = false;
      adminApp.hidden = true;
      const versionEl = document.getElementById("version-label");
      if (versionEl) versionEl.textContent = `v${VERSION}`;
      updateLastSyncedLabel();
      window.setInterval(updateLastSyncedLabel, 30000);
      const syncBtn = document.getElementById("display-sync-btn");
      if (syncBtn) syncBtn.addEventListener("click", runFullSync);
      renderCalendarAndCountdowns();
      renderTodos();
      renderMealsWithData();
      renderRsvpBoardWithData();
      renderProgress();

      viewport.addEventListener("pointerdown", handlePointerDown, { passive: true });
      viewport.addEventListener("pointermove", handlePointerMove, { passive: true });
      viewport.addEventListener("pointerup", handlePointerUp, { passive: true });
      viewport.addEventListener("pointercancel", handlePointerUp, { passive: true });

      navLeft.addEventListener("pointerup", () => manualNavigate("previous"));
      navRight.addEventListener("pointerup", () => manualNavigate("next"));
      displayNav.addEventListener("click", (event) => {
        const button = event.target.closest("[data-display-nav-target]");
        if (!button) return;
        const targetIndex = Number(button.getAttribute("data-display-nav-target"));
        if (Number.isNaN(targetIndex)) return;
        navigateToScreenIndex(targetIndex);
      });
      window.addEventListener("keydown", handleKeydown);

      // Every 5 min: narrow refresh; automatically escalate to wide if 24h have passed
      window.setInterval(() => {
        const needsWide = (Date.now() - lastWideFetch) >= 24 * 60 * 60 * 1000;
        refreshCalendarData(needsWide);
        if (!shouldHideRsvpScreen() && track.querySelector(".rsvp-screen")) {
          renderRsvpBoardWithData();
        }
      }, 5 * 60 * 1000);

      // Week navigation — each click resets the rotation timer
      document.getElementById("week-prev").addEventListener("click", () => { weekOffset--; renderCalendar(); resetAutoRotate(); });
      document.getElementById("week-next").addEventListener("click", () => { weekOffset++; renderCalendar(); resetAutoRotate(); });
      document.getElementById("week-today").addEventListener("click", () => { weekOffset = 0; renderCalendar(); resetAutoRotate(); });

      // Month navigation — each click resets the rotation timer
      document.getElementById("month-prev").addEventListener("click", () => { monthOffset--; renderMonthCalendar(); resetAutoRotate(); });
      document.getElementById("month-next").addEventListener("click", () => { monthOffset++; renderMonthCalendar(); resetAutoRotate(); });
      document.getElementById("month-today").addEventListener("click", () => { monthOffset = 0; renderMonthCalendar(); resetAutoRotate(); });

      // Week view: tap/keyboard event card → event detail modal
      function activateCalendarGridItem(e) {
        const card = e.target.closest(".event-card[data-event-title]");
        if (card) {
          openEventDetailModal({
            title: card.dataset.eventTitle,
            time: card.dataset.eventTime,
            location: card.dataset.eventLocation || null,
            description: card.dataset.eventDescription || null,
            isAllDay: card.dataset.eventIsallday === "true"
          }, card.dataset.eventDate);
        }
      }
      document.getElementById("calendar-grid").addEventListener("click", activateCalendarGridItem);
      document.getElementById("calendar-grid").addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (e.key === " ") e.preventDefault();
        activateCalendarGridItem(e);
      });

      // Month view: tap/keyboard event chip → event detail; tap "+N more" → day detail
      function activateMonthGridItem(e) {
        const eventEl = e.target.closest(".month-event[data-event-title]");
        const morePill = e.target.closest(".month-more-pill");
        if (eventEl) {
          openEventDetailModal({
            title: eventEl.dataset.eventTitle,
            time: eventEl.dataset.eventTime,
            location: eventEl.dataset.eventLocation || null,
            description: eventEl.dataset.eventDescription || null,
            isAllDay: eventEl.dataset.eventIsallday === "true"
          }, eventEl.dataset.eventDate);
          return;
        }
        if (morePill) {
          openDayDetailModal(morePill.dataset.dateKey);
        }
      }
      document.getElementById("month-grid").addEventListener("click", activateMonthGridItem);
      document.getElementById("month-grid").addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (e.key === " ") e.preventDefault();
        activateMonthGridItem(e);
      });

      // Day detail: tap/keyboard event row → event detail modal (on top)
      function activateDayDetailItem(e) {
        const item = e.target.closest(".day-event-item");
        if (item) {
          openEventDetailModal({
            title: item.dataset.eventTitle,
            time: item.dataset.eventTime,
            location: item.dataset.eventLocation || null,
            description: item.dataset.eventDescription || null,
            isAllDay: item.dataset.eventIsallday === "true"
          }, item.dataset.eventDate);
        }
      }
      document.getElementById("day-detail-body").addEventListener("click", activateDayDetailItem);
      document.getElementById("day-detail-body").addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (e.key === " ") e.preventDefault();
        activateDayDetailItem(e);
      });

      // Modal close handlers
      document.getElementById("event-detail-close").addEventListener("click", closeEventDetailModal);
      document.getElementById("event-detail-backdrop").addEventListener("click", closeEventDetailModal);
      document.getElementById("day-detail-close").addEventListener("click", closeDayDetailModal);
      document.getElementById("day-detail-backdrop").addEventListener("click", closeDayDetailModal);
      document.getElementById("rsvp-detail-close").addEventListener("click", closeRsvpDetailModal);
      document.getElementById("rsvp-detail-backdrop").addEventListener("click", closeRsvpDetailModal);
      document.getElementById("rsvp-review-close").addEventListener("click", closeRsvpReviewModal);
      document.getElementById("rsvp-review-backdrop").addEventListener("click", closeRsvpReviewModal);

      const declinedTrigger = document.getElementById("rsvp-declined-trigger");
      const pendingTrigger = document.getElementById("rsvp-pending-trigger");
      const reviewTrigger = document.getElementById("rsvp-review-trigger");
      if (declinedTrigger) {
        declinedTrigger.addEventListener("click", () => {
          const declinedNames = (cachedWeddingSnapshot?.invitedParties || [])
            .filter((party) => party.linkedRsvp && party.linkedRsvp.attending === false)
            .map((party) => party.name);
          openRsvpDetailModal("Declined Parties", declinedNames);
        });
      }
      if (pendingTrigger) {
        pendingTrigger.addEventListener("click", () => {
          const pendingNames = (cachedWeddingSnapshot?.invitedParties || [])
            .filter((party) => !party.rsvpId)
            .map((party) => party.name);
          openRsvpDetailModal("Pending Parties", pendingNames);
        });
      }
      if (reviewTrigger) {
        reviewTrigger.addEventListener("click", openRsvpReviewModal);
      }

      refreshIcons();
    }
