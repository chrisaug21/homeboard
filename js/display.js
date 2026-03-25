    const track = document.getElementById("screen-track");
    const viewport = document.getElementById("viewport");
    const progressDots = document.getElementById("progress-dots");
    const navLeft = document.getElementById("nav-left");
    const navRight = document.getElementById("nav-right");
    const clockEl = document.getElementById("clock");
    const dateEl = document.getElementById("today-date");
    const monthTitleEl = document.getElementById("month-title");

    const weekEvents = [
      [
        { title: "Gym", time: "7:00 am" },
        { title: "Team standup", time: "9:30 am" }
      ],
      [
        { title: "Dentist", time: "2:00 pm" }
      ],
      [
        { title: "Dinner with Sarah", time: "7:00 pm" }
      ],
      [
        { title: "Vet appointment", time: "11:00 am" },
        { title: "Soccer practice", time: "5:30 pm" }
      ],
      [
        { title: "Date night", time: "7:30 pm" }
      ],
      [
        { title: "Farmers market", time: "9:00 am" },
        { title: "Movie night", time: "8:00 pm" }
      ],
      [
        { title: "Meal prep", time: "4:00 pm" }
      ]
    ];

    const todos = [
      { title: "Pick up dry cleaning", assignee: "Chris", meta: "Due today before 6pm", badge: "Due Today" },
      { title: "Order more dishwasher pods", assignee: "Shared", meta: "Shared task", badge: "Household" },
      { title: "Call pediatrician", assignee: "Bailey", meta: "This week", badge: "Assigned" },
      { title: "Set out recycling bins", assignee: "Shared", meta: "Thursday night", badge: "Routine" },
      { title: "Book dog groomer", assignee: "", meta: "No due date", badge: "Unassigned" }
    ];

    const meals = [
      { name: "Pesto chicken bowls", type: "Cooking" },
      { name: "HelloFresh meatball subs", type: "HelloFresh" },
      { name: "Sushi downtown", type: "Going out" },
      { name: "Pad thai and spring rolls", type: "Delivery" },
      { name: "Steak frites at Leon's", type: "Date night" },
      { name: "Leftover grain bowls", type: "Fend for yourself" },
      { name: "Roast salmon with potatoes", type: "Cooking" }
    ];

    const countdowns = [
      { name: "Vacation to Portugal", icon: "plane", days: 47, caption: "Leaves on May 8", image_url: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=400" },
      { name: "Hozier concert", icon: "music-4", days: 12, caption: "Saturday night at 8pm" },
      { name: "Wedding", icon: "gem", days: 201, caption: "October 9 countdown" },
      { name: "Lake weekend", icon: "trees", days: 33, caption: "Cabin key pickup on Friday" }
    ];

    let currentIndex = 0;
    let autoRotateId = null;
    let pointerStartX = null;
    let pointerDeltaX = 0;
    let rsvpScrollId = null;
    let calendarEventsMap = new Map();
    let cachedHouseholdConfig = null;
    let cachedSupabaseCountdowns = null;

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
        const events = calendarEventsMap.size > 0
          ? (calendarEventsMap.get(formatDateKey(date)) || [])
          : (weekEvents[index] || []);

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
      const list = document.getElementById("todo-list");
      list.innerHTML = `
        <article class="todo-card">
          <div class="todo-check" aria-hidden="true"></div>
          <div class="todo-copy">
            <div class="todo-title">Loading tasks...</div>
            <div class="todo-meta">Syncing the latest household to-dos.</div>
          </div>
          <div></div>
          <div class="todo-badge">Loading</div>
        </article>
      `;
      document.getElementById("todo-open-count").textContent = "…";
      document.getElementById("todo-next-up").textContent = "Syncing";
      document.getElementById("todo-next-text").textContent = "Checking Supabase for the latest open tasks.";

      const remoteTodos = await fetchTodos();
      renderTodoItems(remoteTodos || todos);
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

    function renderMeals(mealItems) {
      const mealGrid = document.getElementById("meal-grid");
      const monday = getMonday(new Date());
      const todayKey = new Date().toDateString();
      const mealsByDay = new Map();

      mealItems.forEach((meal) => {
        mealsByDay.set(meal.dayOfWeek, meal);
      });

      mealGrid.innerHTML = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        const isToday = date.toDateString() === todayKey;
        const isWide = index === 6;
        const meal = mealsByDay.get(index);
        const mealType = meal ? getMealTypePresentation(meal.type) : null;
        const mealName = meal ? meal.name : "—";

        return `
          <article class="meal-card${isToday ? " today" : ""}${isWide ? " meal-card--wide" : ""}">
            <div class="meal-card-top">
              <div class="meal-day">${formatCalendarLabel(date).toUpperCase()}</div>
              <div class="meal-type ${mealType ? mealType.className : "meal-type--fend-for-yourself"}">${escapeHtml(mealType ? mealType.label : "Open Slot")}</div>
            </div>
            <div class="meal-name">${escapeHtml(mealName)}</div>
          </article>
        `;
      }).join("");
    }

    async function renderMealsWithData() {
      const remoteMeals = await fetchMeals();

      if (remoteMeals === null) {
        renderMeals(meals.map((meal, index) => ({
          dayOfWeek: index,
          name: meal.name,
          type: meal.type
        })));
        return;
      }

      renderMeals(remoteMeals);
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
            <div>
              <div class="eyebrow"><i data-lucide="sparkles"></i> Looking Forward</div>
              <h2 class="screen-title">Countdown Board</h2>
            </div>
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
        return;
      }

      const apiKey = cachedHouseholdConfig.google_cal_key || GOOGLE_CAL_KEY;

      if (!apiKey || apiKey.startsWith("%%")) {
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const timeMin = getMonthGridStart(today);
      const timeMax = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      timeMax.setDate(timeMax.getDate() + 5);

      const items = await fetchGoogleCalendarEvents(cachedHouseholdConfig.google_cal_id, apiKey, timeMin, timeMax);

      if (!items) {
        return;
      }

      calendarEventsMap = buildCalendarEventsMap(items);
      const calendarCountdowns = extractCalendarCountdowns(items);

      renderCalendar();
      renderMonthCalendar();

      const baseCountdowns = cachedSupabaseCountdowns !== null ? cachedSupabaseCountdowns : countdowns;
      const merged = [...baseCountdowns, ...calendarCountdowns]
        .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));

      renderCountdowns(merged.length > 0 ? merged : countdowns);
    }

    async function renderCalendarAndCountdowns() {
      // Render immediately with hardcoded fallback data so screens aren't blank.
      renderCalendar();
      renderMonthCalendar();

      // Fetch household config and Supabase countdowns once; cache both for background refreshes.
      const [householdConfig, supabaseCountdowns] = await Promise.all([
        fetchHouseholdConfig(),
        fetchCountdowns()
      ]);

      cachedHouseholdConfig = householdConfig;
      cachedSupabaseCountdowns = supabaseCountdowns;

      // First real render — reuses refreshCalendarData so refresh and initial load are identical.
      await refreshCalendarData();

      // If Google Cal didn't load (no config or failed), still render countdowns from Supabase.
      if (!cachedHouseholdConfig || !cachedHouseholdConfig.google_cal_id || !calendarEventsMap.size) {
        const baseCountdowns = cachedSupabaseCountdowns !== null ? cachedSupabaseCountdowns : countdowns;
        renderCountdowns(baseCountdowns.length > 0 ? baseCountdowns : countdowns);
      }
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

    function renderRsvpUnavailable() {
      const list = document.getElementById("rsvp-names");
      stopRsvpAutoScroll();
      document.getElementById("rsvp-total").textContent = "—";
      document.getElementById("rsvp-total-label").textContent = "RSVP data unavailable";
      document.getElementById("rsvp-attending-count").textContent = "—";
      document.getElementById("rsvp-declined-count").textContent = "—";
      document.getElementById("rsvp-pending-count").textContent = "—";
      document.getElementById("rsvp-names-title").textContent = "Guest List";
      list.innerHTML = `
        <div class="name-pill name-pill--pending">
          <span>RSVP data unavailable</span>
        </div>
      `;
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
      if (shouldHideRsvpScreen()) {
        removeRsvpScreen();
        return;
      }

      const [remoteRsvps, householdConfig] = await Promise.all([
        fetchRsvps(),
        fetchHouseholdConfig()
      ]);

      if (remoteRsvps === null) {
        renderRsvpUnavailable();
        return;
      }

      const totalInvitedGuests = householdConfig ? householdConfig.total_invited_guests : null;
      renderRsvpBoard(remoteRsvps, totalInvitedGuests);
    }

    function renderProgress() {
      const screenCount = getScreenCount();
      progressDots.innerHTML = Array.from({ length: screenCount }, (_, index) => {
        const isRsvpScreen = track.children[index] && track.children[index].classList.contains("rsvp-screen");
        const activeClass = index === currentIndex ? " active" + (isRsvpScreen ? " rsvp-active" : "") : "";
        return `<span class="dot${activeClass}" aria-hidden="true"></span>`;
      }).join("");
    }

    function updateHeaderTime() {
      const current = new Date();
      clockEl.textContent = formatClock(current);
      dateEl.textContent = formatHeaderDate(current);
    }

    function goToScreen(index) {
      const screenCount = getScreenCount();
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
      renderCalendarAndCountdowns();
      renderTodos();
      renderMealsWithData();
      renderRsvpBoardWithData();
      updateHeaderTime();
      renderProgress();
      resetAutoRotate();

      viewport.addEventListener("pointerdown", handlePointerDown, { passive: true });
      viewport.addEventListener("pointermove", handlePointerMove, { passive: true });
      viewport.addEventListener("pointerup", handlePointerUp, { passive: true });
      viewport.addEventListener("pointercancel", handlePointerUp, { passive: true });

      navLeft.addEventListener("pointerup", () => manualNavigate("previous"));
      navRight.addEventListener("pointerup", () => manualNavigate("next"));
      window.addEventListener("keydown", handleKeydown);

      window.setInterval(updateHeaderTime, 1000);
      window.setInterval(refreshCalendarData, 5 * 60 * 1000);

      refreshIcons();
    }
