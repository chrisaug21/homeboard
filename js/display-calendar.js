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
          caption: formatLongDate(eventDate),
          screenKey: item.id
            ? `countdown_calendar_${String(item.id).trim()}`
            : `countdown_calendar_${eventDate}_${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "event"}`
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

      const [householdConfig, householdMembers, supabaseCountdowns] = await Promise.all([
        fetchHouseholdConfig(),
        fetchHouseholdMembers(),
        fetchCountdowns()
      ]);

      cachedHouseholdConfig = householdConfig;
      cachedDisplayHouseholdMembers = householdMembers || [];
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
