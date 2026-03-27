    const adminTodoForm = document.getElementById("admin-todo-form");
    const adminSubmitButton = document.getElementById("admin-submit-button");
    const adminActiveList = document.getElementById("admin-active-list");
    const adminArchivedList = document.getElementById("admin-archived-list");
    const adminActiveSummary = document.getElementById("admin-active-summary");
    const adminArchivedSummary = document.getElementById("admin-archived-summary");
    const adminScreens = Array.from(document.querySelectorAll("[data-admin-screen]"));
    const adminNavButtons = Array.from(document.querySelectorAll("[data-admin-nav]"));
    const adminMealList = document.getElementById("admin-meal-list");
    const adminMealNoteWrap = document.getElementById("admin-meal-note-wrap");
    const adminMealWeekLabel = document.getElementById("admin-meal-week-label");
    const adminWeekPrevBtn = document.getElementById("admin-week-prev");
    const adminWeekNextBtn = document.getElementById("admin-week-next");
    const adminWeekTodayBtn = document.getElementById("admin-week-today");
    const toastEl = document.getElementById("toast");
    const adminCountdownForm = document.getElementById("admin-countdown-form");
    const adminCountdownName = document.getElementById("admin-countdown-name");
    const adminCountdownDate = document.getElementById("admin-countdown-date");
    const adminCountdownIcon = document.getElementById("admin-countdown-icon");
    const adminCountdownSubmitButton = document.getElementById("admin-countdown-submit-button");
    const adminCountdownClearButton = document.getElementById("admin-countdown-clear-button");
    const adminCalEventList = document.getElementById("admin-cal-event-list");
    const adminCalEventsNote = document.getElementById("admin-cal-events-note");
    const adminSavedCountdownList = document.getElementById("admin-saved-countdown-list");
    const adminSavedCountdownsNote = document.getElementById("admin-saved-countdowns-note");

    let toastTimeoutId = null;
    let adminTodoWritePending = false;
    let adminMealWritePending = false;
    let adminCurrentNote = "";
    let adminNoteWritePending = false;
    let adminEditingNote = false;
    let adminScreen = "todos";
    let adminWeekOffset = 0;
    let adminCurrentMonday = null;
    let adminEditingDay = null;
    let adminMealPlanRows = [];
    let adminCountdownWritePending = false;
    let adminCountdownEditPending = false;
    let adminEditingCountdownId = null;
    const adminPendingPhotos = new Map();
    let adminCalEvents = [];
    let adminSavedCountdowns = [];
    const refreshingCountdowns = new Set();
    let adminCalMonthDate = (() => {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    })();

    function buildMealTypeOptionsHTML(selectedType) {
      return mealTypeOptions.map((option) =>
        `<option value="${escapeHtml(option.value)}"${option.value === selectedType ? " selected" : ""}>${escapeHtml(option.adminLabel)}</option>`
      ).join("");
    }

    function formatAdminTodoDate(dueDate) {
      if (!dueDate) {
        return "No due date";
      }

      const parsedDate = parseLocalDateString(dueDate);

      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        return "No due date";
      }

      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric"
      }).format(parsedDate);
    }

    function formatAdminWeekRange(monday) {
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      return `Week of ${new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric"
      }).format(monday)} to ${new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric"
      }).format(sunday)}`;
    }

    function formatAdminDayLabel(date) {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric"
      }).format(date);
    }

    function showToast(message) {
      window.clearTimeout(toastTimeoutId);
      toastEl.textContent = message;
      toastEl.classList.add("is-visible");

      toastTimeoutId = window.setTimeout(() => {
        toastEl.classList.remove("is-visible");
      }, 2800);
    }

    function setAdminBusyState(isBusy) {
      adminTodoWritePending = isBusy;
      adminSubmitButton.disabled = isBusy;
      adminSubmitButton.textContent = isBusy ? "Saving…" : "Add Todo";
    }


    function renderAdminTodoCard(todo, options) {
      const title = escapeHtml(todo.title || "Untitled task");
      const assignee = todo.assignee ? escapeHtml(todo.assignee) : "Unassigned";
      const dueLabel = formatAdminTodoDate(todo.due_date);
      const actionMarkup = options.showComplete
        ? `<button class="admin-button admin-button--secondary" type="button" data-action="archive-todo" data-todo-id="${escapeHtml(todo.id)}" aria-label="Complete ${title}">Complete</button>`
        : "";

      return `
        <article class="admin-todo-card">
          <div class="admin-todo-head">
            <div class="admin-todo-title">${title}</div>
            ${actionMarkup}
          </div>
          <div class="admin-todo-meta">
            <span class="admin-pill">${assignee}</span>
            <span class="admin-pill admin-pill--due">${escapeHtml(dueLabel)}</span>
          </div>
        </article>
      `;
    }

    function renderAdminTodoLists(todoGroups) {
      const activeCount = todoGroups.active.length;
      const archivedCount = todoGroups.archived.length;

      adminActiveSummary.textContent = activeCount
        ? `${activeCount} active household ${activeCount === 1 ? "task" : "tasks"}`
        : "No active household tasks right now.";
      adminArchivedSummary.textContent = archivedCount
        ? `${archivedCount} completed ${archivedCount === 1 ? "task" : "tasks"}`
        : "No completed household tasks yet.";

      adminActiveList.innerHTML = activeCount
        ? todoGroups.active.map((todo) => renderAdminTodoCard(todo, { showComplete: true })).join("")
        : '<div class="admin-empty">No active tasks right now.</div>';

      adminArchivedList.innerHTML = archivedCount
        ? todoGroups.archived.map((todo) => renderAdminTodoCard(todo, { showComplete: false })).join("")
        : '<div class="admin-empty">Nothing archived yet.</div>';
    }

    async function loadAdminTodos() {
      adminActiveSummary.textContent = "Loading household tasks…";
      adminArchivedSummary.textContent = "Loading completed household tasks…";
      adminActiveList.innerHTML = '<div class="admin-empty">Loading household tasks…</div>';
      adminArchivedList.innerHTML = '<div class="admin-empty">Loading completed household tasks…</div>';

      const todoGroups = await fetchAdminTodos();

      if (!todoGroups) {
        adminActiveSummary.textContent = "Couldn't load household tasks.";
        adminArchivedSummary.textContent = "Couldn't load completed household tasks.";
        adminActiveList.innerHTML = '<div class="admin-empty">Supabase is unavailable right now.</div>';
        adminArchivedList.innerHTML = '<div class="admin-empty">Supabase is unavailable right now.</div>';
        return;
      }

      renderAdminTodoLists(todoGroups);
    }

    async function createAdminTodo(formData) {
      const client = getSupabaseClient();

      if (!client) {
        showToast("Couldn't save todo. Supabase is unavailable.");
        return;
      }

      const title = String(formData.get("title") || "").trim();
      const assignee = String(formData.get("assignee") || "").trim();
      const dueDate = String(formData.get("due_date") || "").trim();

      if (!title || adminTodoWritePending) {
        return;
      }

      setAdminBusyState(true);

      const { error } = await client
        .from("todos")
        .insert({
          household_id: TODO_HOUSEHOLD_ID,
          title,
          assignee: assignee || null,
          due_date: dueDate || null
        });

      if (error) {
        setAdminBusyState(false);
        showToast("Couldn't save todo. Please try again.");
        return;
      }

      adminTodoForm.reset();
      await loadAdminTodos();
      setAdminBusyState(false);
    }

    async function archiveAdminTodo(todoId) {
      const client = getSupabaseClient();

      if (!client || adminTodoWritePending) {
        if (!client) {
          showToast("Couldn't complete todo. Supabase is unavailable.");
        }
        return;
      }

      adminTodoWritePending = true;

      const { error } = await client
        .from("todos")
        .update({
          archived_at: new Date().toISOString()
        })
        .eq("id", todoId)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null);

      if (error) {
        adminTodoWritePending = false;
        showToast("Couldn't complete todo. Please try again.");
        return;
      }

      await loadAdminTodos();
      adminTodoWritePending = false;
    }

    function handleAdminTodoSubmit(event) {
      event.preventDefault();
      createAdminTodo(new FormData(event.currentTarget));
    }

    function handleAdminActiveListClick(event) {
      const button = event.target.closest("[data-action='archive-todo']");

      if (!button) {
        return;
      }

      archiveAdminTodo(button.getAttribute("data-todo-id"));
    }

    async function fetchAdminMealPlan(monday) {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("meal_plan")
        .select("id, day_of_week, meal_name, meal_type, week_start")
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .eq("week_start", formatDateKey(monday))
        .eq("meal_slot", "dinner")
        .is("user_id", null)
        .order("day_of_week", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data.map((meal) => ({
        id: meal.id,
        dayOfWeek: Number(meal.day_of_week),
        mealName: meal.meal_name || "",
        mealType: normalizeMealType(meal.meal_type || "cooking"),
        weekStart: meal.week_start
      }));
    }

    function getAdminMealByDay(dayOfWeek) {
      return adminMealPlanRows.find((meal) => meal.dayOfWeek === dayOfWeek) || null;
    }

    function getAdminWeekMonday() {
      const monday = getMonday(new Date());
      monday.setDate(monday.getDate() + adminWeekOffset * 7);
      return monday;
    }

    function renderAdminMealCard(index, date, meal) {
      const dayLabel = escapeHtml(formatAdminDayLabel(date));

      if (adminEditingDay === index) {
        const currentName = meal ? escapeHtml(meal.mealName) : "";
        const currentType = meal ? meal.mealType : "cooking";

        return `
          <form class="admin-meal-inline-form" data-inline-meal-day="${index}">
            <div class="admin-meal-inline-header">
              <span class="admin-meal-day">${dayLabel}</span>
              <button class="admin-button admin-button--secondary admin-meal-inline-cancel" type="button">Cancel</button>
            </div>
            <div class="admin-field">
              <input
                class="admin-meal-inline-name"
                name="meal_name"
                type="text"
                maxlength="140"
                placeholder="What\u2019s for dinner?"
                value="${currentName}"
                autocomplete="off"
                aria-label="Dinner name"
              >
            </div>
            <div class="admin-field">
              <select name="meal_type" aria-label="Meal type">${buildMealTypeOptionsHTML(currentType)}</select>
            </div>
            <div class="admin-actions">
              <button class="admin-button admin-button--primary" type="submit">Save</button>
            </div>
          </form>
        `;
      }

      const mealType = meal ? getMealTypePresentation(meal.mealType) : null;

      return `
        <button class="admin-meal-card" type="button" data-admin-meal-day="${index}">
          <div class="admin-meal-card-top">
            <div class="admin-meal-day">${dayLabel}</div>
            <span class="admin-pill admin-pill--due">${escapeHtml(mealType ? mealType.label : "Tap to add")}</span>
          </div>
          <div class="admin-meal-name${meal && meal.mealName ? "" : " admin-meal-name--empty"}">${escapeHtml(meal && meal.mealName ? meal.mealName : "No dinner set yet.")}</div>
        </button>
      `;
    }

    function renderAdminMealPlan() {
      const offsetLabels = { "-1": "Last week", "0": "This week", "1": "Next week" };
      const offsetLabel = offsetLabels[String(adminWeekOffset)] || (adminWeekOffset > 0 ? `+${adminWeekOffset} weeks` : `${adminWeekOffset} weeks`);
      const sunday = new Date(adminCurrentMonday);
      sunday.setDate(adminCurrentMonday.getDate() + 6);
      const fmt = (d) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
      adminMealWeekLabel.textContent = `${offsetLabel} \u00b7 ${fmt(adminCurrentMonday)}\u2013${fmt(sunday)}`;
      adminWeekPrevBtn.disabled = adminWeekOffset <= -1;
      adminWeekNextBtn.disabled = adminWeekOffset >= 1;
      if (adminWeekTodayBtn) adminWeekTodayBtn.disabled = adminWeekOffset === 0;

      adminMealList.innerHTML = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(adminCurrentMonday);
        date.setDate(adminCurrentMonday.getDate() + index);
        return renderAdminMealCard(index, date, getAdminMealByDay(index));
      }).join("");

      if (adminEditingDay !== null) {
        const nameInput = adminMealList.querySelector(".admin-meal-inline-name");
        if (nameInput) {
          nameInput.focus();
          nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
        }
      }

      refreshIcons();
    }

    async function fetchAdminMealNote(monday) {
      const client = getSupabaseClient();
      if (!client) return null;
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

    function renderAdminMealNote() {
      if (!adminMealNoteWrap) return;

      if (adminEditingNote) {
        adminMealNoteWrap.innerHTML = `
          <form class="admin-meal-inline-form" id="admin-meal-note-form">
            <div class="admin-meal-inline-header">
              <span class="admin-meal-day">Weekly Note</span>
              <button class="admin-button admin-button--secondary admin-meal-inline-cancel" type="button" id="admin-meal-note-cancel">Cancel</button>
            </div>
            <div class="admin-field">
              <textarea
                id="admin-meal-note-input"
                class="admin-meal-note-textarea"
                maxlength="280"
                placeholder="Add a note for this week\u2026"
                rows="3"
                aria-label="Weekly note"
              >${escapeHtml(adminCurrentNote)}</textarea>
            </div>
            <div class="admin-actions">
              <button class="admin-button admin-button--primary" type="submit">Save Note</button>
            </div>
          </form>
        `;
        const noteInput = adminMealNoteWrap.querySelector("#admin-meal-note-input");
        if (noteInput) {
          noteInput.focus();
          noteInput.setSelectionRange(noteInput.value.length, noteInput.value.length);
        }
      } else {
        adminMealNoteWrap.innerHTML = `
          <button class="admin-meal-card" type="button" id="admin-meal-note-card">
            <div class="admin-meal-card-top">
              <div class="admin-meal-day">Weekly Note</div>
              <span class="admin-pill">${adminCurrentNote ? "Tap to edit" : "Tap to add"}</span>
            </div>
            <div class="admin-meal-name${adminCurrentNote ? "" : " admin-meal-name--empty"}">${escapeHtml(adminCurrentNote || "No note this week.")}</div>
          </button>
        `;
      }

      refreshIcons();
    }

    async function saveAdminMealNote() {
      if (adminNoteWritePending || adminMealWritePending) return;
      const textarea = adminMealNoteWrap && adminMealNoteWrap.querySelector("#admin-meal-note-input");
      if (!textarea) return;
      const noteText = textarea.value.trim();
      const client = getSupabaseClient();
      if (!client) {
        showToast("Couldn\u2019t save note. Supabase is unavailable.");
        return;
      }
      adminNoteWritePending = true;
      const savedWeekStart = formatDateKey(adminCurrentMonday);
      const submitBtn = adminMealNoteWrap.querySelector("[type='submit']");
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving\u2026"; }

      const { error } = await client
        .from("meal_plan_notes")
        .upsert(
          { household_id: DISPLAY_HOUSEHOLD_ID, week_start: savedWeekStart, note: noteText },
          { onConflict: "household_id,week_start" }
        );

      adminNoteWritePending = false;

      if (error) {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Save Note"; }
        showToast("Couldn\u2019t save note. Please try again.");
        return;
      }

      // If the week changed while awaiting, discard the stale result
      if (formatDateKey(adminCurrentMonday) !== savedWeekStart) return;

      adminCurrentNote = noteText;
      adminEditingNote = false;
      renderAdminMealNote();
      showToast("Note saved.");
    }

    function handleAdminMealNoteClick(event) {
      if (adminNoteWritePending) return;

      if (event.target.closest("#admin-meal-note-cancel")) {
        adminEditingNote = false;
        renderAdminMealNote();
        return;
      }
      if (event.target.closest("#admin-meal-note-card")) {
        adminEditingNote = true;
        renderAdminMealNote();
      }
    }

    function handleAdminMealNoteSubmit(event) {
      if (!event.target.closest("#admin-meal-note-form")) return;
      event.preventDefault();
      saveAdminMealNote();
    }

    async function loadAdminMealPlan() {
      adminCurrentMonday = getAdminWeekMonday();
      adminMealWeekLabel.textContent = "Loading\u2026";
      adminWeekPrevBtn.disabled = true;
      adminWeekNextBtn.disabled = true;
      adminMealList.innerHTML = '<div class="admin-empty">Loading meals\u2026</div>';
      adminEditingNote = false;
      if (adminMealNoteWrap) adminMealNoteWrap.innerHTML = "";

      const [mealRows, noteText] = await Promise.all([
        fetchAdminMealPlan(adminCurrentMonday),
        fetchAdminMealNote(adminCurrentMonday)
      ]);

      if (!mealRows) {
        adminMealWeekLabel.textContent = "Couldn\u2019t load meals.";
        adminWeekPrevBtn.disabled = adminWeekOffset <= -1;
        adminWeekNextBtn.disabled = adminWeekOffset >= 1;
        adminMealList.innerHTML = '<div class="admin-empty">Supabase is unavailable right now.</div>';
        return;
      }

      adminMealPlanRows = mealRows;
      if (noteText === null) {
        showToast("Couldn\u2019t load this week\u2019s note.");
        adminCurrentNote = "";
      } else {
        adminCurrentNote = noteText;
      }
      renderAdminMealPlan();
      renderAdminMealNote();
    }

    async function saveAdminMeal(dayOfWeek, mealName, mealType) {
      const client = getSupabaseClient();

      if (!client || adminMealWritePending || adminNoteWritePending) {
        if (!client) showToast("Couldn\u2019t save meal. Supabase is unavailable.");
        return;
      }

      adminMealWritePending = true;
      const submitBtn = adminMealList.querySelector(`[data-inline-meal-day="${dayOfWeek}"] [type="submit"]`);
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving\u2026";
      }

      const savedWeekStart = formatDateKey(adminCurrentMonday);
      const weekStart = savedWeekStart;
      const existingMeal = getAdminMealByDay(dayOfWeek);
      let responseError = null;
      let savedMeal = null;

      if (existingMeal) {
        const { data, error } = await client
          .from("meal_plan")
          .update({ meal_name: mealName, meal_type: mealType })
          .eq("id", existingMeal.id)
          .eq("household_id", DISPLAY_HOUSEHOLD_ID)
          .eq("week_start", weekStart)
          .eq("meal_slot", "dinner")
          .is("user_id", null)
          .select("id, day_of_week, meal_name, meal_type, week_start")
          .maybeSingle();

        responseError = error;
        savedMeal = data;
      } else {
        const { data, error } = await client
          .from("meal_plan")
          .insert({
            household_id: DISPLAY_HOUSEHOLD_ID,
            user_id: null,
            week_start: weekStart,
            day_of_week: dayOfWeek,
            meal_slot: "dinner",
            meal_name: mealName,
            meal_type: mealType
          })
          .select("id, day_of_week, meal_name, meal_type, week_start")
          .single();

        responseError = error;
        savedMeal = data;
      }

      adminMealWritePending = false;

      if (responseError || !savedMeal) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Save";
        }
        showToast("Couldn\u2019t save meal. Please try again.");
        return;
      }

      // Update in-memory state so we can re-render without a full reload
      if (existingMeal) {
        const rowIdx = adminMealPlanRows.findIndex((m) => m.dayOfWeek === dayOfWeek);
        if (rowIdx !== -1) {
          adminMealPlanRows[rowIdx] = { ...adminMealPlanRows[rowIdx], mealName, mealType };
        }
      } else {
        adminMealPlanRows.push({
          id: savedMeal.id,
          dayOfWeek,
          mealName,
          mealType,
          weekStart: savedMeal.week_start
        });
      }

      // If the week changed while awaiting, discard the stale result
      if (formatDateKey(adminCurrentMonday) !== savedWeekStart) return;

      adminEditingDay = null;
      renderAdminMealPlan();
      showToast("Saved!");
    }

    function setAdminScreen(nextScreen) {
      adminScreen = nextScreen;

      adminScreens.forEach((screen) => {
        const isActive = screen.getAttribute("data-admin-screen") === nextScreen;
        screen.hidden = !isActive;
        screen.classList.toggle("is-active", isActive);
      });

      adminNavButtons.forEach((button) => {
        const isActive = button.getAttribute("data-admin-nav") === nextScreen;
        button.classList.toggle("is-active", isActive);
        if (isActive) {
          button.setAttribute("aria-current", "page");
        } else {
          button.removeAttribute("aria-current");
        }
      });
    }

    function handleAdminNavClick(event) {
      const button = event.target.closest("[data-admin-nav]");

      if (!button) {
        return;
      }

      const target = button.getAttribute("data-admin-nav");
      setAdminScreen(target);

      if (target === "countdowns") {
        loadAdminCountdowns();
      }
    }

    function handleAdminMealListClick(event) {
      if (adminMealWritePending) return;

      if (event.target.closest(".admin-meal-inline-cancel")) {
        adminEditingDay = null;
        renderAdminMealPlan();
        return;
      }

      const dayBtn = event.target.closest("[data-admin-meal-day]");
      if (dayBtn && !event.target.closest("form")) {
        adminEditingDay = Number(dayBtn.getAttribute("data-admin-meal-day"));
        renderAdminMealPlan();
      }
    }

    function handleAdminMealInlineSubmit(event) {
      if (!event.target.classList.contains("admin-meal-inline-form")) {
        return;
      }
      event.preventDefault();
      const form = event.target;
      const formData = new FormData(form);
      const dayOfWeek = Number(form.getAttribute("data-inline-meal-day"));
      const mealName = String(formData.get("meal_name") || "").trim();
      const mealType = normalizeMealType(formData.get("meal_type"));
      if (!mealName) {
        const nameInput = form.querySelector("[name='meal_name']");
        if (nameInput) nameInput.focus();
        return;
      }
      saveAdminMeal(dayOfWeek, mealName, mealType);
    }

    function handleAdminWeekPrev() {
      if (adminWeekOffset <= -1 || adminMealWritePending || adminNoteWritePending) return;
      adminWeekOffset--;
      adminEditingDay = null;
      loadAdminMealPlan();
    }

    function handleAdminWeekNext() {
      if (adminWeekOffset >= 1 || adminMealWritePending || adminNoteWritePending) return;
      adminWeekOffset++;
      adminEditingDay = null;
      loadAdminMealPlan();
    }

    function handleAdminWeekToday() {
      if (adminWeekOffset === 0 || adminMealWritePending || adminNoteWritePending) return;
      adminWeekOffset = 0;
      adminEditingDay = null;
      loadAdminMealPlan();
    }

    async function fetchAdminCalendarEvents() {
      const config = await fetchHouseholdConfig();

      if (!config || !config.google_cal_id) {
        return null;
      }

      const apiKey = config.google_cal_key || GOOGLE_CAL_KEY;

      if (!apiKey || apiKey.startsWith("%%")) {
        return null;
      }

      const start = new Date(adminCalMonthDate.getFullYear(), adminCalMonthDate.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(adminCalMonthDate.getFullYear(), adminCalMonthDate.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);

      return fetchGoogleCalendarEvents(config.google_cal_id, apiKey, start, end);
    }

    function updateAdminCalMonthLabel() {
      const label = document.getElementById("admin-cal-month-label");
      if (label) {
        label.textContent = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(adminCalMonthDate);
      }
    }

    async function loadAdminCalendarMonth() {
      adminCalEventsNote.textContent = "Loading\u2026";
      adminCalEventList.innerHTML = '<div class="admin-empty">Loading\u2026</div>';
      updateAdminCalMonthLabel();
      const calItems = await fetchAdminCalendarEvents();
      adminCalEvents = calItems || [];
      if (!calItems) {
        adminCalEventsNote.textContent = "Google Calendar not configured for this household.";
        adminCalEventList.innerHTML = '<div class="admin-empty">Add a google_cal_id to the households table to enable this.</div>';
      } else {
        adminCalEventsNote.textContent = calItems.length ? "Tap an event to flag it as a countdown." : "No events this month.";
        renderAdminCalEventList();
      }
      refreshIcons();
    }

    function handleAdminCalPrev() {
      adminCalMonthDate = new Date(adminCalMonthDate.getFullYear(), adminCalMonthDate.getMonth() - 1, 1);
      loadAdminCalendarMonth();
    }

    function handleAdminCalNext() {
      adminCalMonthDate = new Date(adminCalMonthDate.getFullYear(), adminCalMonthDate.getMonth() + 1, 1);
      loadAdminCalendarMonth();
    }

    async function fetchAdminSavedCountdowns() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await client
        .from("countdowns")
        .select("id, name, icon, event_date, unsplash_image_url, days_before_visible, photo_keyword")
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .gte("event_date", formatDateKey(today))
        .order("event_date", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data;
    }

    function isCountdownAlreadySaved(name, date) {
      const normalizedName = String(name).toLowerCase().trim();
      return adminSavedCountdowns.some(
        (c) => c.name.toLowerCase().trim() === normalizedName && c.event_date === date
      );
    }

    function renderAdminCalEventList() {
      if (!adminCalEvents.length) {
        adminCalEventList.innerHTML = '<div class="admin-empty">No upcoming calendar events found.</div>';
        return;
      }

      adminCalEventList.innerHTML = adminCalEvents.map((item) => {
        const startRaw = item.start && (item.start.dateTime || item.start.date);
        const eventDate = item.start && item.start.date
          ? item.start.date
          : (startRaw ? startRaw.slice(0, 10) : "");
        const name = item.summary || "Untitled event";
        const saved = isCountdownAlreadySaved(name, eventDate);
        const dateLabel = eventDate
          ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
              new Date(eventDate + "T00:00:00")
            )
          : "";

        return `
          <button
            class="admin-cal-event-card${saved ? " is-saved" : ""}"
            type="button"
            data-cal-name="${escapeHtml(name)}"
            data-cal-date="${escapeHtml(eventDate)}"
            aria-pressed="${saved ? "true" : "false"}"
          >
            <div class="admin-cal-event-name">${escapeHtml(name)}</div>
            <div class="admin-cal-event-meta">
              ${saved ? '<span class="admin-pill admin-pill--due">Saved</span>' : ""}
              <span class="admin-pill">${escapeHtml(dateLabel)}</span>
            </div>
          </button>
        `;
      }).join("");
    }

    function renderAdminSavedCountdowns() {
      const count = adminSavedCountdowns.length;
      adminSavedCountdownsNote.textContent = count
        ? `${count} saved ${count === 1 ? "countdown" : "countdowns"}`
        : "No countdowns saved yet.";

      if (!count) {
        adminSavedCountdownList.innerHTML = '<div class="admin-empty">Nothing here yet.</div>';
        return;
      }

      adminSavedCountdownList.innerHTML = adminSavedCountdowns.map((c) => {
        const dateLabel = c.event_date
          ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
              new Date(c.event_date + "T00:00:00")
            )
          : "No date";

        let imageUrl = null;
        let imageCredit = null;
        if (c.unsplash_image_url) {
          try {
            const parsed = JSON.parse(c.unsplash_image_url);
            imageUrl = parsed.url || null;
            imageCredit = parsed.credit || null;
          } catch {
            imageUrl = c.unsplash_image_url;
          }
        }

        const thumbnailUrl = imageUrl ? unsplashThumbnailUrl(imageUrl) : null;
        const daysBeforeLabel = c.days_before_visible != null
          ? `Shows ${c.days_before_visible}d before`
          : null;

        if (c.id === adminEditingCountdownId) {
          const daysBeforeValue = c.days_before_visible != null ? String(c.days_before_visible) : "";
          const id = escapeHtml(c.id);
          return `
            <article class="admin-saved-countdown-card admin-saved-countdown-card--editing" data-countdown-id="${id}">
              <form class="admin-countdown-edit-form" data-countdown-id="${id}" data-original-name="${escapeHtml(c.name)}">
                <div class="admin-countdown-edit-header">
                  <span class="admin-countdown-edit-title">${escapeHtml(c.name)}</span>
                </div>
                <div class="admin-field">
                  <label for="admin-edit-cd-name-${id}">Name</label>
                  <input id="admin-edit-cd-name-${id}" name="name" type="text" maxlength="140" value="${escapeHtml(c.name)}" required autocomplete="off">
                </div>
                <div class="admin-form-row">
                  <div class="admin-field">
                    <label for="admin-edit-cd-date-${id}">Date</label>
                    <input id="admin-edit-cd-date-${id}" name="event_date" type="date" value="${escapeHtml(c.event_date || "")}" required>
                  </div>
                  <div class="admin-field">
                    <label for="admin-edit-cd-days-${id}">Show starting</label>
                    <input id="admin-edit-cd-days-${id}" name="days_before_visible" type="number" min="1" max="365" value="${escapeHtml(daysBeforeValue)}" placeholder="e.g. 30">
                    <p class="admin-field-hint">Days before event to appear. Optional.</p>
                  </div>
                </div>
                <div class="admin-form-row">
                  <div class="admin-field">
                    <label for="admin-edit-cd-keyword-${id}">Photo keyword</label>
                    <div class="admin-icon-row">
                      <input id="admin-edit-cd-keyword-${id}" name="photo_keyword" type="text" maxlength="100" value="${escapeHtml(c.photo_keyword || "")}" placeholder="e.g. beach, mountains" autocomplete="off">
                      <button class="admin-button admin-button--secondary" type="button" data-action="get-photo-edit" data-countdown-id="${id}">Get photo</button>
                    </div>
                    <p class="admin-field-hint">Optional. Used for Unsplash photo fetch.</p>
                  </div>
                  <div class="admin-field">
                    <label for="admin-edit-cd-icon-${id}">Icon</label>
                    <div class="admin-icon-row">
                      <input id="admin-edit-cd-icon-${id}" name="icon" type="text" maxlength="60" value="${escapeHtml(c.icon || "calendar")}" placeholder="e.g. plane, heart, gem" autocomplete="off">
                      <a href="https://lucide.dev/icons" target="_blank" rel="noopener noreferrer" class="admin-icon-link">Browse ↗</a>
                    </div>
                    <p class="admin-field-hint">Lucide icon name. Optional.</p>
                  </div>
                </div>
                <div class="admin-form-photo-preview" id="admin-edit-photo-pending-${id}" hidden></div>
                ${thumbnailUrl ? `
                <div class="admin-edit-photo-preview">
                  <img class="admin-edit-photo-thumb" src="${escapeHtml(thumbnailUrl)}" alt="" aria-hidden="true" onerror="this.closest('.admin-edit-photo-preview').remove();">
                  <div class="admin-edit-photo-meta">
                    ${imageCredit ? `<span class="admin-edit-photo-credit">${escapeHtml(imageCredit)}</span>` : ""}
                    <button class="admin-button admin-button--ghost-danger" type="button" data-action="remove-photo" data-countdown-id="${id}" aria-label="Remove photo" style="margin-left:0">Remove photo</button>
                  </div>
                </div>` : ""}
                <div class="admin-actions">
                  <button class="admin-button admin-button--secondary" type="button" data-action="cancel-edit" data-countdown-id="${id}" aria-label="Cancel edit">Cancel</button>
                  <button class="admin-button admin-button--primary" type="submit">Save changes</button>
                </div>
              </form>
            </article>
          `;
        }

        return `
          <article class="admin-saved-countdown-card" data-countdown-id="${escapeHtml(c.id)}">
            <div class="admin-countdown-card-main">
              ${thumbnailUrl ? `
              <button class="admin-countdown-preview-btn" type="button" data-action="view-photo" data-full-url="${escapeHtml(imageUrl)}" data-credit="${escapeHtml(imageCredit || "")}" aria-label="View photo for ${escapeHtml(c.name)}">
                <img class="admin-countdown-preview" src="${escapeHtml(thumbnailUrl)}" alt="" aria-hidden="true" onerror="this.closest('.admin-countdown-preview-btn').remove();">
              </button>` : ""}
              <div class="admin-countdown-card-body">
                <div class="admin-saved-countdown-name">${escapeHtml(c.name)}</div>
                <div class="admin-countdown-card-meta">
                  <span class="admin-countdown-meta-item">${escapeHtml(dateLabel)}</span>
                  <span class="admin-countdown-meta-item"><i data-lucide="${escapeHtml(c.icon || "calendar")}" style="width:13px;height:13px;vertical-align:middle;margin-right:3px;"></i>${escapeHtml(c.icon || "calendar")}</span>
                  ${daysBeforeLabel ? `<span class="admin-countdown-meta-item">${escapeHtml(daysBeforeLabel)}</span>` : ""}
                </div>
              </div>
            </div>
            <div class="admin-countdown-actions">
              <button class="admin-button admin-button--secondary admin-countdown-action-btn" type="button" data-action="edit-countdown" data-countdown-id="${escapeHtml(c.id)}" aria-label="Edit ${escapeHtml(c.name)}">Edit</button>
              <button class="admin-button admin-button--secondary admin-countdown-action-btn" type="button" data-action="refresh-photo" data-countdown-id="${escapeHtml(c.id)}" data-countdown-name="${escapeHtml(c.name)}" data-photo-keyword="${escapeHtml(c.photo_keyword || "")}" aria-label="Refresh photo for ${escapeHtml(c.name)}">Refresh photo</button>
              <button class="admin-button admin-button--ghost-danger" type="button" data-action="delete-countdown" data-countdown-id="${escapeHtml(c.id)}" aria-label="Delete ${escapeHtml(c.name)}">Delete</button>
            </div>
          </article>
        `;
      }).join("");
    }

    async function loadAdminCountdowns({ preserveScroll = false } = {}) {
      const savedScrollY = preserveScroll ? window.scrollY : 0;
      updateAdminCalMonthLabel();
      adminCalEventsNote.textContent = "Loading calendar events\u2026";
      adminCalEventList.innerHTML = '<div class="admin-empty">Loading\u2026</div>';
      adminSavedCountdownsNote.textContent = "Loading\u2026";
      adminSavedCountdownList.innerHTML = '<div class="admin-empty">Loading\u2026</div>';

      const [calItems, savedRows] = await Promise.all([
        fetchAdminCalendarEvents(),
        fetchAdminSavedCountdowns()
      ]);

      adminCalEvents = calItems || [];
      adminSavedCountdowns = savedRows || [];

      if (!calItems) {
        adminCalEventsNote.textContent = "Google Calendar not configured for this household.";
        adminCalEventList.innerHTML = '<div class="admin-empty">Add a google_cal_id to the households table to enable this.</div>';
      } else {
        adminCalEventsNote.textContent = calItems.length ? "Tap an event to flag it as a countdown." : "No events this month.";
        renderAdminCalEventList();
      }

      if (!savedRows) {
        adminSavedCountdownsNote.textContent = "Couldn\u2019t load saved countdowns.";
        adminSavedCountdownList.innerHTML = '<div class="admin-empty">Supabase is unavailable right now.</div>';
      } else {
        renderAdminSavedCountdowns();
      }

      refreshIcons();

      if (preserveScroll) {
        requestAnimationFrame(() => window.scrollTo({ top: savedScrollY, behavior: "instant" }));
      }
    }

    function openAdminLightbox(fullUrl, credit) {
      const lightbox = document.getElementById("admin-lightbox");
      const img = document.getElementById("admin-lightbox-img");
      const creditEl = document.getElementById("admin-lightbox-credit");
      if (!lightbox || !img) return;
      img.src = fullUrl;
      if (creditEl) creditEl.textContent = credit || "";
      lightbox.hidden = false;
      document.body.style.overflow = "hidden";
    }

    function closeAdminLightbox() {
      const lightbox = document.getElementById("admin-lightbox");
      if (!lightbox || lightbox.hidden) return;
      lightbox.hidden = true;
      const img = document.getElementById("admin-lightbox-img");
      if (img) img.src = "";
      document.body.style.overflow = "";
    }

    function unsplashThumbnailUrl(url) {
      try {
        const u = new URL(url);
        u.searchParams.set("w", "200");
        return u.toString();
      } catch {
        return url;
      }
    }

    async function fetchUnsplashPhoto(query) {
      if (!UNSPLASH_ACCESS_KEY || UNSPLASH_ACCESS_KEY.startsWith("%%")) return null;
      try {
        const cleanQuery = query.replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        const response = await fetch(
          `https://api.unsplash.com/photos/random?query=${encodeURIComponent(cleanQuery)}&orientation=portrait&order_by=editorial&content_filter=high`,
          { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }
        );
        if (!response.ok) return null;
        const data = await response.json();
        const url = data.urls && data.urls.regular;
        const photographerName = data.user && data.user.name;
        const photographerProfile = data.user && data.user.links && data.user.links.html;
        if (!url) return null;
        return {
          url,
          credit: photographerName ? `Photo: ${photographerName} \u00b7 Unsplash` : "Photo: Unsplash",
          photographerProfile: photographerProfile || null
        };
      } catch {
        return null;
      }
    }

    async function updateCountdownPhoto(id, photo) {
      const client = getSupabaseClient();
      if (!client) return false;
      const { error } = await client
        .from("countdowns")
        .update({ unsplash_image_url: JSON.stringify({ url: photo.url, credit: photo.credit, photographerProfile: photo.photographerProfile || null }) })
        .eq("id", id)
        .eq("household_id", DISPLAY_HOUSEHOLD_ID);
      return !error;
    }

    async function refreshCountdownPhoto(id, name, photoKeyword) {
      if (refreshingCountdowns.has(id)) return;
      refreshingCountdowns.add(id);

      const card = adminSavedCountdownList.querySelector(`[data-countdown-id="${id}"]`)?.closest(".admin-saved-countdown-card");
      if (card) card.classList.add("admin-countdown-card--refreshing");

      showToast("Fetching new photo\u2026");
      try {
        const photo = await fetchUnsplashPhoto(photoKeyword || name);
        if (!photo) {
          showToast("Couldn\u2019t find a photo. Try again.");
          return;
        }
        const ok = await updateCountdownPhoto(id, photo);
        if (!ok) {
          showToast("Couldn\u2019t save photo. Please try again.");
          return;
        }
        await loadAdminCountdowns({ preserveScroll: true });
        showToast("Photo updated.");
      } finally {
        refreshingCountdowns.delete(id);
        if (card) card.classList.remove("admin-countdown-card--refreshing");
      }
    }

    async function removeCountdownPhoto(id) {
      const client = getSupabaseClient();
      if (!client) return;
      const { error } = await client
        .from("countdowns")
        .update({ unsplash_image_url: null })
        .eq("id", id)
        .eq("household_id", DISPLAY_HOUSEHOLD_ID);
      if (error) {
        showToast("Couldn\u2019t remove photo. Please try again.");
        return;
      }
      await loadAdminCountdowns({ preserveScroll: true });
    }

    async function saveAdminCountdown(formData) {
      const client = getSupabaseClient();

      if (!client) {
        showToast("Couldn't save countdown. Supabase is unavailable.");
        return;
      }

      const name = String(formData.get("name") || "").trim();
      const eventDate = String(formData.get("event_date") || "").trim();
      const icon = String(formData.get("icon") || "").trim() || "calendar";
      const daysBeforeRaw = String(formData.get("days_before_visible") || "").trim();
      const daysBeforeVisible = daysBeforeRaw !== "" ? parseInt(daysBeforeRaw, 10) || null : null;
      const photoKeyword = String(formData.get("photo_keyword") || "").trim();

      if (!name || !eventDate || adminCountdownWritePending) {
        return;
      }

      if (isCountdownAlreadySaved(name, eventDate)) {
        showToast("Already saved.");
        return;
      }

      adminCountdownWritePending = true;
      adminCountdownSubmitButton.disabled = true;
      adminCountdownSubmitButton.textContent = "Saving\u2026";

      const { data: insertedRow, error } = await client
        .from("countdowns")
        .insert({
          household_id: DISPLAY_HOUSEHOLD_ID,
          name,
          icon,
          event_date: eventDate,
          days_before_visible: daysBeforeVisible,
          photo_keyword: photoKeyword || null
        })
        .select("id")
        .single();

      if (error || !insertedRow) {
        adminCountdownWritePending = false;
        adminCountdownSubmitButton.disabled = false;
        adminCountdownSubmitButton.textContent = "Save Countdown";
        showToast("Couldn\u2019t save countdown. Please try again.");
        return;
      }

      adminCountdownWritePending = false;
      adminCountdownSubmitButton.disabled = false;
      adminCountdownSubmitButton.textContent = "Save Countdown";
      adminCountdownForm.reset();
      const pendingCreatePreview = document.getElementById("admin-create-photo-pending");
      if (pendingCreatePreview) pendingCreatePreview.hidden = true;

      const pendingPhoto = adminPendingPhotos.get("create");
      adminPendingPhotos.delete("create");

      await loadAdminCountdowns();

      if (pendingPhoto) {
        updateCountdownPhoto(insertedRow.id, pendingPhoto).then(async (ok) => {
          if (ok) await loadAdminCountdowns();
        }).catch((e) => console.warn("Background photo save failed:", e));
      } else {
        fetchUnsplashPhoto(photoKeyword || name).then(async (photo) => {
          if (!photo) return;
          const ok = await updateCountdownPhoto(insertedRow.id, photo);
          if (ok) await loadAdminCountdowns();
        }).catch((e) => console.warn("Background photo fetch failed:", e));
      }
    }

    async function updateAdminCountdown(id, name, eventDate, icon, daysBeforeVisible, photoKeyword, originalName) {
      const client = getSupabaseClient();
      if (!client) {
        showToast("Couldn\u2019t update countdown. Supabase is unavailable.");
        return;
      }

      adminCountdownEditPending = true;
      const submitBtn = adminSavedCountdownList.querySelector(`[data-countdown-id="${id}"] form [type="submit"]`);
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving\u2026";
      }

      const { error } = await client
        .from("countdowns")
        .update({ name, event_date: eventDate, icon, days_before_visible: daysBeforeVisible, photo_keyword: photoKeyword || null })
        .eq("id", id)
        .eq("household_id", DISPLAY_HOUSEHOLD_ID);

      adminCountdownEditPending = false;

      if (error) {
        showToast("Couldn\u2019t update countdown. Please try again.");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Save changes";
        }
        return;
      }

      adminEditingCountdownId = null;
      const pendingPhoto = adminPendingPhotos.get(id);
      adminPendingPhotos.delete(id);

      await loadAdminCountdowns({ preserveScroll: true });

      if (pendingPhoto) {
        updateCountdownPhoto(id, pendingPhoto).then(async (ok) => {
          if (ok) await loadAdminCountdowns({ preserveScroll: true });
        }).catch((e) => console.warn("Background photo save failed:", e));
      } else if (photoKeyword || name !== originalName) {
        fetchUnsplashPhoto(photoKeyword || name).then(async (photo) => {
          if (!photo) return;
          const ok = await updateCountdownPhoto(id, photo);
          if (ok) await loadAdminCountdowns({ preserveScroll: true });
        }).catch((e) => console.warn("Background photo fetch failed:", e));
      }
    }

    function handleAdminSavedCountdownListSubmit(event) {
      const form = event.target.closest(".admin-countdown-edit-form");
      if (!form) return;
      event.preventDefault();
      const id = form.getAttribute("data-countdown-id");
      const originalName = form.getAttribute("data-original-name");
      const formData = new FormData(form);
      const name = String(formData.get("name") || "").trim();
      const eventDate = String(formData.get("event_date") || "").trim();
      const icon = String(formData.get("icon") || "").trim() || "calendar";
      const daysBeforeRaw = String(formData.get("days_before_visible") || "").trim();
      const daysBeforeVisible = daysBeforeRaw !== "" ? parseInt(daysBeforeRaw, 10) || null : null;
      const photoKeyword = String(formData.get("photo_keyword") || "").trim();
      if (!name || !eventDate || adminCountdownEditPending) return;
      updateAdminCountdown(id, name, eventDate, icon, daysBeforeVisible, photoKeyword, originalName);
    }

    async function deleteAdminCountdown(id) {
      const client = getSupabaseClient();

      if (!client) {
        showToast("Couldn't delete countdown. Supabase is unavailable.");
        return;
      }

      const { error } = await client
        .from("countdowns")
        .delete()
        .eq("id", id)
        .eq("household_id", DISPLAY_HOUSEHOLD_ID);

      if (error) {
        showToast("Couldn't delete countdown. Please try again.");
        return;
      }

      await loadAdminCountdowns();
    }

    function syncAdminCountdownForm(name, date) {
      adminCountdownName.value = name;
      adminCountdownDate.value = date;
      adminCountdownIcon.value = "";
      adminCountdownIcon.focus();
    }

    function handleAdminCountdownCalListClick(event) {
      const card = event.target.closest("[data-cal-name]");

      if (!card) {
        return;
      }

      syncAdminCountdownForm(
        card.getAttribute("data-cal-name"),
        card.getAttribute("data-cal-date")
      );
    }

    function handleAdminCountdownSubmit(event) {
      event.preventDefault();
      saveAdminCountdown(new FormData(event.currentTarget));
    }

    function setFormPhotoPreview(container, photo) {
      if (!container) return;
      const thumbUrl = unsplashThumbnailUrl(photo.url);
      container.innerHTML = `
        <img src="${escapeHtml(thumbUrl)}" alt="" aria-hidden="true">
        <div class="admin-form-photo-preview-meta">
          <span>${escapeHtml(photo.credit || "")}</span>
        </div>
      `;
      container.hidden = false;
    }

    async function handleGetPhotoCreate() {
      const keywordInput = document.getElementById("admin-countdown-photo-keyword");
      const nameInput = document.getElementById("admin-countdown-name");
      const previewContainer = document.getElementById("admin-create-photo-pending");
      const btn = adminCountdownForm.querySelector("[data-action='get-photo-create']");
      if (!keywordInput || !previewContainer) return;
      const query = keywordInput.value.trim() || (nameInput && nameInput.value.trim()) || "";
      if (!query) return;
      if (btn) { btn.disabled = true; btn.textContent = "Loading\u2026"; }
      const photo = await fetchUnsplashPhoto(query);
      if (btn) { btn.disabled = false; btn.textContent = "Get photo"; }
      if (!photo) {
        showToast("Couldn\u2019t find a photo. Try a different keyword.");
        return;
      }
      adminPendingPhotos.set("create", photo);
      setFormPhotoPreview(previewContainer, photo);
    }

    async function handleGetPhotoEdit(btn) {
      const id = btn.getAttribute("data-countdown-id");
      const form = adminSavedCountdownList.querySelector(`.admin-countdown-edit-form[data-countdown-id="${id}"]`);
      if (!form) return;
      const keywordInput = form.querySelector(`[name="photo_keyword"]`);
      const nameInput = form.querySelector(`[name="name"]`);
      const previewContainer = document.getElementById(`admin-edit-photo-pending-${id}`);
      const query = (keywordInput && keywordInput.value.trim()) || (nameInput && nameInput.value.trim()) || "";
      if (!query) return;
      btn.disabled = true;
      btn.textContent = "Loading\u2026";
      const photo = await fetchUnsplashPhoto(query);
      btn.disabled = false;
      btn.textContent = "Get photo";
      if (!photo) {
        showToast("Couldn\u2019t find a photo. Try a different keyword.");
        return;
      }
      adminPendingPhotos.set(id, photo);
      setFormPhotoPreview(previewContainer, photo);
    }

    function handleAdminSavedCountdownListClick(event) {
      const viewPhotoBtn = event.target.closest("[data-action='view-photo']");
      if (viewPhotoBtn) {
        openAdminLightbox(
          viewPhotoBtn.getAttribute("data-full-url"),
          viewPhotoBtn.getAttribute("data-credit")
        );
        return;
      }

      const editBtn = event.target.closest("[data-action='edit-countdown']");
      if (editBtn) {
        const scrollY = window.scrollY;
        adminEditingCountdownId = editBtn.getAttribute("data-countdown-id");
        renderAdminSavedCountdowns();
        refreshIcons();
        requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "instant" }));
        return;
      }

      const cancelBtn = event.target.closest("[data-action='cancel-edit']");
      if (cancelBtn) {
        const scrollY = window.scrollY;
        adminPendingPhotos.delete(cancelBtn.getAttribute("data-countdown-id"));
        adminEditingCountdownId = null;
        renderAdminSavedCountdowns();
        refreshIcons();
        requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: "instant" }));
        return;
      }

      const getPhotoEditBtn = event.target.closest("[data-action='get-photo-edit']");
      if (getPhotoEditBtn) {
        handleGetPhotoEdit(getPhotoEditBtn);
        return;
      }

      const removePhotoBtn = event.target.closest("[data-action='remove-photo']");
      if (removePhotoBtn) {
        removeCountdownPhoto(removePhotoBtn.getAttribute("data-countdown-id"));
        return;
      }

      const refreshBtn = event.target.closest("[data-action='refresh-photo']");
      if (refreshBtn) {
        refreshCountdownPhoto(
          refreshBtn.getAttribute("data-countdown-id"),
          refreshBtn.getAttribute("data-countdown-name"),
          refreshBtn.getAttribute("data-photo-keyword")
        );
        return;
      }

      const deleteBtn = event.target.closest("[data-action='delete-countdown']");
      if (deleteBtn) {
        deleteAdminCountdown(deleteBtn.getAttribute("data-countdown-id"));
      }
    }

    function handleAdminCountdownClear() {
      adminCountdownForm.reset();
      adminPendingPhotos.delete("create");
      const previewContainer = document.getElementById("admin-create-photo-pending");
      if (previewContainer) previewContainer.hidden = true;
    }

    async function fetchAdminTodos() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("todos")
        .select("id, title, assignee, due_date, archived_at, created_at")
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .order("created_at", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      const active = [];
      const archived = [];

      data.forEach((todo) => {
        if (todo.archived_at) {
          archived.push(todo);
        } else {
          active.push(todo);
        }
      });

      archived.sort((left, right) => {
        return new Date(right.archived_at).getTime() - new Date(left.archived_at).getTime();
      });

      return { active, archived };
    }

    function initAdminMode() {
      document.body.classList.add("admin-mode");
      displayApp.hidden = true;
      adminApp.hidden = false;
      setAdminScreen("todos");
      adminNavButtons.forEach((button) => button.addEventListener("click", handleAdminNavClick));
      adminTodoForm.addEventListener("submit", handleAdminTodoSubmit);
      adminActiveList.addEventListener("click", handleAdminActiveListClick);
      adminMealList.addEventListener("click", handleAdminMealListClick);
      adminMealList.addEventListener("submit", handleAdminMealInlineSubmit);
      if (adminMealNoteWrap) adminMealNoteWrap.addEventListener("click", handleAdminMealNoteClick);
      if (adminMealNoteWrap) adminMealNoteWrap.addEventListener("submit", handleAdminMealNoteSubmit);
      adminWeekPrevBtn.addEventListener("click", handleAdminWeekPrev);
      adminWeekNextBtn.addEventListener("click", handleAdminWeekNext);
      if (adminWeekTodayBtn) adminWeekTodayBtn.addEventListener("click", handleAdminWeekToday);
      adminCountdownForm.addEventListener("submit", handleAdminCountdownSubmit);
      adminCountdownForm.addEventListener("click", (e) => {
        if (e.target.closest("[data-action='get-photo-create']")) handleGetPhotoCreate();
      });
      adminCountdownClearButton.addEventListener("click", handleAdminCountdownClear);
      adminCalEventList.addEventListener("click", handleAdminCountdownCalListClick);
      adminSavedCountdownList.addEventListener("click", handleAdminSavedCountdownListClick);
      adminSavedCountdownList.addEventListener("submit", handleAdminSavedCountdownListSubmit);
      const lightbox = document.getElementById("admin-lightbox");
      if (lightbox) lightbox.addEventListener("click", closeAdminLightbox);
      const adminCalPrevBtn = document.getElementById("admin-cal-prev");
      const adminCalNextBtn = document.getElementById("admin-cal-next");
      if (adminCalPrevBtn) adminCalPrevBtn.addEventListener("click", handleAdminCalPrev);
      if (adminCalNextBtn) adminCalNextBtn.addEventListener("click", handleAdminCalNext);
      const adminVersionEl = document.getElementById("admin-version-label");
      if (adminVersionEl) adminVersionEl.textContent = `v${VERSION}`;
      loadAdminTodos();
      loadAdminMealPlan();
      refreshIcons();
    }
