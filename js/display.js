    const track = document.getElementById("screen-track");
    const viewport = document.getElementById("viewport");
    const progressDots = document.getElementById("progress-dots");
    const navLeft = document.getElementById("nav-left");
    const navRight = document.getElementById("nav-right");
    const householdNameEl = document.getElementById("household-name");
    const monthTitleEl = document.getElementById("month-title");

    let currentIndex = 0;
    let autoRotateId = null;
    let pointerStartX = null;
    let pointerDeltaX = 0;
    let rsvpScrollId = null;
    let calendarEventsMap = new Map();
    let cachedHouseholdConfig = null;
    let cachedSupabaseCountdowns = null;
    let cachedCalendarCountdowns = [];
    let initialLoadComplete = false;
    const pendingScreens = new Set();

    function markPending(screenId) {
      pendingScreens.add(screenId);
    }

    function resolveScreen(screenId) {
      pendingScreens.delete(screenId);
      if (!initialLoadComplete && pendingScreens.size === 0) {
        initialLoadComplete = true;
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
          <div class="todo-check" aria-hidden="true"></div>
          <div class="todo-copy">
            <div class="sk" style="width:70%;height:14px;margin-bottom:6px;"></div>
            <div class="sk" style="width:44%;height:11px;"></div>
          </div>
          <div></div>
          <div class="sk" style="width:60px;height:22px;border-radius:20px;"></div>
        </article>
      `;
      list.innerHTML = Array.from({ length: 4 }, skRow).join("");
      document.getElementById("todo-open-count").textContent = "\u2026";
      document.getElementById("todo-next-up").textContent = "\u2026";
      document.getElementById("todo-next-text").textContent = "";
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
      document.getElementById("rsvp-attending-count").innerHTML = sk("38px", 20);
      document.getElementById("rsvp-declined-count").innerHTML = sk("38px", 20);
      document.getElementById("rsvp-pending-count").innerHTML = sk("38px", 20);
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
            <p class="screen-error-msg">Couldn't load countdowns \u2014 tap to retry</p>
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
      document.getElementById("rsvp-attending-count").textContent = "\u2014";
      document.getElementById("rsvp-declined-count").textContent = "\u2014";
      document.getElementById("rsvp-pending-count").textContent = "\u2014";
      document.getElementById("rsvp-names-title").textContent = "";
      const list = document.getElementById("rsvp-names");
      list.innerHTML = `
        <div class="screen-error">
          <i data-lucide="wifi-off"></i>
          <p class="screen-error-msg">Couldn't load RSVP data \u2014 tap to retry</p>
          <button class="screen-error-retry" type="button">Tap to retry</button>
        </div>
      `;
      refreshIcons();
      list.querySelector(".screen-error-retry").addEventListener("click", renderRsvpBoardWithData);
    }

    function getScreenCount() {
      return track.children.length;
    }

    function getAssigneeClass(assignee) {
      if (assignee === "Chris") {
        return "todo-assignee todo-assignee--chris";
      }

      if (assignee === "Bailey") {
        return "todo-assignee todo-assignee--bailey";
      }

      if (assignee === "Shared") {
        return "todo-assignee todo-assignee--shared";
      }

      return "";
    }

    function formatTodoDueDate(dueDate) {
      if (!dueDate) {
        return "No due date";
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const parsedDate = new Date(dueDate + "T00:00:00");
      parsedDate.setHours(0, 0, 0, 0);
      const diffInDays = Math.round((parsedDate - today) / 86400000);

      if (diffInDays === 0) {
        return "Due today";
      }

      if (diffInDays === 1) {
        return "Due tomorrow";
      }

      if (diffInDays > 1 && diffInDays < 7) {
        return "Due " + new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(parsedDate);
      }

      if (diffInDays < 0) {
        return "Past due";
      }

      return "Due " + new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric"
      }).format(parsedDate);
    }

    function getTodoBadge(todo) {
      if (todo.due_date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const parsedDate = new Date(todo.due_date + "T00:00:00");
        parsedDate.setHours(0, 0, 0, 0);
        const diffInDays = Math.round((parsedDate - today) / 86400000);

        if (diffInDays <= 0) {
          return "Due Today";
        }

        if (diffInDays < 7) {
          return "Upcoming";
        }
      }

      if (todo.assignee) {
        return "Assigned";
      }

      return "Unassigned";
    }

    function mapSupabaseTodo(todo) {
      const normalizedAssignee = todo.assignee || "";

      return {
        title: todo.title || "Untitled task",
        assignee: normalizedAssignee,
        meta: normalizedAssignee ? formatTodoDueDate(todo.due_date) : (todo.due_date ? formatTodoDueDate(todo.due_date) : "Shared task"),
        badge: getTodoBadge(todo)
      };
    }

    function renderTodoItems(todoItems) {
      const list = document.getElementById("todo-list");

      if (!todoItems.length) {
        list.innerHTML = `
          <article class="todo-card">
            <div class="todo-check" aria-hidden="true"></div>
            <div class="todo-copy">
              <div class="todo-title">No open tasks</div>
              <div class="todo-meta">Everything is cleared for now.</div>
            </div>
            <div></div>
            <div class="todo-badge">Clear</div>
          </article>
        `;

        document.getElementById("todo-open-count").textContent = "0";
        document.getElementById("todo-next-up").textContent = "All Set";
        document.getElementById("todo-next-text").textContent = "No active household tasks right now.";
        return;
      }

      list.innerHTML = todoItems.map((todo) => `
        <article class="todo-card">
          <div class="todo-check" aria-hidden="true"></div>
          <div class="todo-copy">
            <div class="todo-title">${escapeHtml(todo.title)}</div>
            <div class="todo-meta">${escapeHtml(todo.meta)}</div>
          </div>
          ${todo.assignee ? `<div class="${getAssigneeClass(todo.assignee)}">${escapeHtml(todo.assignee)}</div>` : '<div></div>'}
          <div class="todo-badge">${escapeHtml(todo.badge)}</div>
        </article>
      `).join("");

      document.getElementById("todo-open-count").textContent = String(todoItems.length);
      document.getElementById("todo-next-up").textContent = "Today";
      document.getElementById("todo-next-text").textContent = todoItems.length
        ? todoItems[0].title + "."
        : "No open tasks right now.";
    }

    async function fetchTodos() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("todos")
        .select("title, due_date, assignee, archived_at, created_at")
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null)
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

    function mapSupabaseCountdown(countdown) {
      return {
        name: countdown.name || "Upcoming Event",
        icon: countdown.icon || "calendar",
        eventDate: countdown.event_date,
        days: getDaysUntil(countdown.event_date),
        caption: formatLongDate(countdown.event_date)
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
        .select("name, icon, event_date")
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .gte("event_date", formatDateKey(today))
        .order("event_date", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data.map(mapSupabaseCountdown);
    }

    function mapSupabaseRsvp(row) {
      const guestCount = Number(row.guest_count);

      return {
        name: row.name || "Unnamed Guest",
        attending: row.attending,
        guestCount: Number.isFinite(guestCount) && guestCount > 0 ? guestCount : 1
      };
    }

    async function fetchRsvps() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("rsvps")
        .select("name, attending, guest_count")
        .order("name", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data.map(mapSupabaseRsvp);
    }

    function buildCalendarEventsMap(items) {
      const map = new Map();

      items.forEach((item) => {
        const startRaw = item.start && (item.start.dateTime || item.start.date);
        const endRaw = item.end && (item.end.dateTime || item.end.date);

        if (!startRaw) {
          return;
        }

        const isAllDay = !item.start.dateTime;
        const title = item.summary || "Untitled event";
        const time = isAllDay
          ? "All day"
          : new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(startRaw));

        // Walk each calendar day the event spans and add it to the map.
        const start = new Date(isAllDay ? startRaw + "T00:00:00" : startRaw);
        start.setHours(0, 0, 0, 0);
        const end = new Date(isAllDay ? endRaw + "T00:00:00" : (endRaw || startRaw));
        end.setHours(0, 0, 0, 0);
        // Google all-day end dates are exclusive, so step back one day.
        if (isAllDay) {
          end.setDate(end.getDate() - 1);
        }

        const cursor = new Date(start);
        while (cursor <= end) {
          const key = formatDateKey(cursor);
          if (!map.has(key)) {
            map.set(key, []);
          }
          map.get(key).push({ title, time });
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
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const todayKey = new Date().toDateString();
      const fragment = document.createDocumentFragment();

      for (let index = 0; index < 5; index++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index);
        const events = calendarEventsMap.get(formatDateKey(date)) || [];

        const column = document.createElement("article");
        column.className = "day-column" + (date.toDateString() === todayKey ? " today" : "");

        const eventsMarkup = events.length
          ? events.map((event) => `
              <div class="event-card">
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

    function renderMonthCalendar() {
      const weekdaysEl = document.getElementById("month-weekdays");
      const monthGridEl = document.getElementById("month-grid");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = getMonthGridStart(today);
      const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      monthTitleEl.textContent = formatMonthYear(today);
      weekdaysEl.innerHTML = weekdayNames.map((name) => `<div class="month-weekday">${name}</div>`).join("");
      const cells = Array.from({ length: 35 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const isToday = date.toDateString() === today.toDateString();
        const isOutsideMonth = date.getMonth() !== today.getMonth();
        const events = isOutsideMonth ? [] : (calendarEventsMap.get(formatDateKey(date)) || []).slice(0, 2);

        return `
          <article class="month-day${isToday ? " month-day--today" : ""}${isOutsideMonth ? " month-day--outside" : ""}">
            <div class="month-date">${date.getDate()}</div>
            <div class="month-events">
              ${events.map((event) => `<div class="month-event">${event.title}</div>`).join("")}
            </div>
          </article>
        `;
      });

      monthGridEl.innerHTML = cells.join("");
    }

    async function renderTodos() {
      markPending("todos");
      renderTodoSkeleton();
      const remoteTodos = await fetchTodos();
      if (remoteTodos === null) {
        renderScreenError(
          document.getElementById("todo-list"),
          "Couldn't load tasks \u2014 tap to retry",
          renderTodos
        );
        document.getElementById("todo-open-count").textContent = "\u2014";
        document.getElementById("todo-next-up").textContent = "\u2014";
        document.getElementById("todo-next-text").textContent = "";
      } else {
        renderTodoItems(remoteTodos);
      }
      resolveScreen("todos");
    }

    function refreshIcons() {
      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
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
      const screenCount = getScreenCount();

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
          "Couldn't load meal plan \u2014 tap to retry",
          renderMealsWithData
        );
      } else {
        renderMeals(remoteMeals, weeklyNote || "");
      }
      resolveScreen("meals");
    }

    function renderCountdowns(countdownItems) {
      const existingCountdownScreens = Array.from(track.querySelectorAll(".countdown-screen"));
      existingCountdownScreens.forEach((screen, index) => {
        if (index > 0) {
          screen.remove();
        }
      });

      if (!countdownItems.length) {
        existingCountdownScreens.forEach((screen) => screen.remove());
        reconcileRotationState();
        return;
      }

      const firstCountdownScreen = existingCountdownScreens[0];
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
              ${hasImage ? `<img class="countdown-photo" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" onerror="this.closest('.countdown-card').classList.remove('countdown-card--photo'); this.remove();">` : ""}
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
        section.className = "screen countdown-screen";
        section.innerHTML = countdownTemplate(item, index + 1);
        track.insertBefore(section, document.querySelector(".rsvp-screen"));
      });

      reconcileRotationState();
    }

    async function refreshCalendarData() {
      if (!cachedHouseholdConfig || !cachedHouseholdConfig.google_cal_id) {
        return false;
      }

      const apiKey = cachedHouseholdConfig.google_cal_key || GOOGLE_CAL_KEY;

      if (!apiKey || apiKey.startsWith("%%")) {
        return false;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const timeMin = getMonthGridStart(today);
      const timeMax = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      timeMax.setDate(timeMax.getDate() + 5);

      const items = await fetchGoogleCalendarEvents(cachedHouseholdConfig.google_cal_id, apiKey, timeMin, timeMax);

      if (!items) {
        return false;
      }

      calendarEventsMap = buildCalendarEventsMap(items);
      cachedCalendarCountdowns = extractCalendarCountdowns(items);

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

      const calendarLoaded = await refreshCalendarData();

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

    function getRsvpStatusLabel(attending) {
      if (attending === true) {
        return "Attending";
      }

      if (attending === false) {
        return "Declined";
      }

      return "Pending";
    }

    function getRsvpStatusClass(attending) {
      if (attending === true) {
        return " name-pill--attending";
      }

      if (attending === false) {
        return " name-pill--declined";
      }

      return " name-pill--pending";
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

    function renderRsvpBoard(rows, totalInvitedGuests) {
      const list = document.getElementById("rsvp-names");
      const attendingGuests = rows
        .filter((row) => row.attending === true)
        .reduce((sum, row) => sum + row.guestCount, 0);
      const responseCount = rows.filter((row) => row.attending === true).length;
      const declinedGuests = rows
        .filter((row) => row.attending === false)
        .reduce((sum, row) => sum + row.guestCount, 0);
      const invitedTotal = Number(totalInvitedGuests) || 0;
      const pendingGuests = invitedTotal > 0
        ? Math.max(0, invitedTotal - attendingGuests - declinedGuests)
        : rows.filter((row) => row.attending === null).length;

      document.getElementById("rsvp-total").textContent = String(attendingGuests);
      document.getElementById("rsvp-total-label").textContent = "guests attending so far";
      document.getElementById("rsvp-attending-count").textContent = String(responseCount);
      document.getElementById("rsvp-declined-count").textContent = String(declinedGuests);
      document.getElementById("rsvp-pending-count").textContent = String(pendingGuests);
      document.getElementById("rsvp-names-title").textContent = "Guest List";

      if (!rows.length) {
        stopRsvpAutoScroll();
        list.innerHTML = `
          <div class="name-pill name-pill--pending">
            <span>No RSVPs yet</span>
            <span class="name-status">Pending</span>
          </div>
        `;
        return;
      }

      list.innerHTML = rows.map((row) => `
        <div class="name-pill${getRsvpStatusClass(row.attending)}">
          <span>${escapeHtml(row.name)}</span>
          <span class="name-status">${escapeHtml(getRsvpStatusLabel(row.attending))}</span>
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

      renderRsvpSkeleton();

      const [remoteRsvps, householdConfig] = await Promise.all([
        fetchRsvps(),
        fetchHouseholdConfig()
      ]);

      if (remoteRsvps === null) {
        renderRsvpError();
      } else {
        const totalInvitedGuests = householdConfig ? householdConfig.total_invited_guests : null;
        renderRsvpBoard(remoteRsvps, totalInvitedGuests);
      }

      resolveScreen("rsvp");
    }

    function renderProgress() {
      const screenCount = getScreenCount();
      progressDots.innerHTML = Array.from({ length: screenCount }, (_, index) => {
        const isRsvpScreen = track.children[index] && track.children[index].classList.contains("rsvp-screen");
        const activeClass = index === currentIndex ? " active" + (isRsvpScreen ? " rsvp-active" : "") : "";
        return `<span class="dot${activeClass}" aria-hidden="true"></span>`;
      }).join("");
    }

    function updateHouseholdName(config) {
      const name = config && config.assistant_name && config.assistant_name.trim()
        ? config.assistant_name.trim()
        : "Homeboard";
      if (householdNameEl) householdNameEl.textContent = name;
    }

    function goToScreen(index) {
      const screenCount = getScreenCount();
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

    function resetAutoRotate() {
      window.clearInterval(autoRotateId);
      autoRotateId = window.setInterval(nextScreen, rotationIntervalMs);
    }

    function nextScreen() {
      goToScreen(currentIndex + 1);
    }

    function previousScreen() {
      goToScreen(currentIndex - 1);
    }

    function manualNavigate(direction) {
      if (direction === "next") {
        nextScreen();
      } else {
        previousScreen();
      }

      resetAutoRotate();
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

    function initDisplayMode() {
      displayApp.hidden = false;
      adminApp.hidden = true;
      const versionEl = document.getElementById("version-label");
      if (versionEl) versionEl.textContent = `v${VERSION}`;
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
      window.addEventListener("keydown", handleKeydown);

      window.setInterval(refreshCalendarData, 5 * 60 * 1000);

      refreshIcons();
    }
