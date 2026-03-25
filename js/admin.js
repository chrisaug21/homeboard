    const adminTodoForm = document.getElementById("admin-todo-form");
    const adminSubmitButton = document.getElementById("admin-submit-button");
    const adminActiveList = document.getElementById("admin-active-list");
    const adminArchivedList = document.getElementById("admin-archived-list");
    const adminActiveSummary = document.getElementById("admin-active-summary");
    const adminArchivedSummary = document.getElementById("admin-archived-summary");
    const adminScreens = Array.from(document.querySelectorAll("[data-admin-screen]"));
    const adminNavButtons = Array.from(document.querySelectorAll("[data-admin-nav]"));
    const adminMealList = document.getElementById("admin-meal-list");
    const adminMealForm = document.getElementById("admin-meal-form");
    const adminMealWeekLabel = document.getElementById("admin-meal-week-label");
    const adminMealEditorTitle = document.getElementById("admin-meal-editor-title");
    const adminMealEditorNote = document.getElementById("admin-meal-editor-note");
    const adminMealDayOfWeek = document.getElementById("admin-meal-day-of-week");
    const adminMealName = document.getElementById("admin-meal-name");
    const adminMealType = document.getElementById("admin-meal-type");
    const adminMealSubmitButton = document.getElementById("admin-meal-submit-button");
    const adminMealCancelButton = document.getElementById("admin-meal-cancel-button");
    const toastEl = document.getElementById("toast");

    let toastTimeoutId = null;
    let adminTodoWritePending = false;
    let adminMealWritePending = false;
    let adminScreen = "todos";
    let adminSelectedMealDay = 0;
    let adminMealPlanRows = [];

    function populateAdminMealTypeOptions() {
      adminMealType.innerHTML = mealTypeOptions.map((option) => `
        <option value="${option.value}">${option.adminLabel}</option>
      `).join("");
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

    function setAdminMealBusyState(isBusy) {
      adminMealWritePending = isBusy;
      adminMealSubmitButton.disabled = isBusy;
      adminMealSubmitButton.textContent = isBusy ? "Saving…" : "Save Dinner";
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

    async function fetchAdminMealPlan() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const monday = getMonday(new Date());
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

    function syncAdminMealForm(dayOfWeek) {
      adminSelectedMealDay = dayOfWeek;
      const monday = getMonday(new Date());
      const date = new Date(monday);
      date.setDate(monday.getDate() + dayOfWeek);
      const meal = getAdminMealByDay(dayOfWeek);

      adminMealDayOfWeek.value = String(dayOfWeek);
      adminMealEditorTitle.textContent = `Edit ${new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date)} Dinner`;
      adminMealEditorNote.textContent = `Shared dinner for ${formatAdminDayLabel(date)}.`;
      adminMealName.value = meal ? meal.mealName : "";
      adminMealType.value = meal ? meal.mealType : "cooking";
    }

    function renderAdminMealPlan() {
      const monday = getMonday(new Date());

      adminMealWeekLabel.textContent = `${formatAdminWeekRange(monday)} · Shared dinners only`;
      adminMealList.innerHTML = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        const meal = getAdminMealByDay(index);
        const mealType = meal ? getMealTypePresentation(meal.mealType) : null;

        return `
          <button
            class="admin-meal-card${index === adminSelectedMealDay ? " is-selected" : ""}"
            type="button"
            data-admin-meal-day="${index}"
            aria-pressed="${index === adminSelectedMealDay ? "true" : "false"}"
          >
            <div class="admin-meal-card-top">
              <div class="admin-meal-day">${escapeHtml(formatAdminDayLabel(date))}</div>
              <span class="admin-pill admin-pill--due">${escapeHtml(mealType ? mealType.label : "Tap to add")}</span>
            </div>
            <div class="admin-meal-name${meal && meal.mealName ? "" : " admin-meal-name--empty"}">${escapeHtml(meal && meal.mealName ? meal.mealName : "No dinner set yet.")}</div>
          </button>
        `;
      }).join("");

      syncAdminMealForm(adminSelectedMealDay);
    }

    async function loadAdminMealPlan() {
      adminMealWeekLabel.textContent = "Loading this week's dinners…";
      adminMealList.innerHTML = '<div class="admin-empty">Loading this week\u2019s dinners\u2026</div>';

      const mealRows = await fetchAdminMealPlan();

      if (!mealRows) {
        adminMealWeekLabel.textContent = "Couldn't load this week's dinners.";
        adminMealList.innerHTML = '<div class="admin-empty">Supabase is unavailable right now.</div>';
        return;
      }

      adminMealPlanRows = mealRows;
      renderAdminMealPlan();
    }

    async function saveAdminMeal(formData) {
      const client = getSupabaseClient();

      if (!client) {
        showToast("Couldn't save meal. Supabase is unavailable.");
        return;
      }

      const dayOfWeek = Number(formData.get("day_of_week"));
      const mealName = String(formData.get("meal_name") || "").trim();
      const mealType = normalizeMealType(formData.get("meal_type"));

      if (!mealName || adminMealWritePending) {
        return;
      }

      setAdminMealBusyState(true);

      const monday = getMonday(new Date());
      const weekStart = formatDateKey(monday);
      const existingMeal = getAdminMealByDay(dayOfWeek);
      let responseError = null;
      let savedMeal = null;

      if (existingMeal) {
        const { data, error } = await client
          .from("meal_plan")
          .update({
            meal_name: mealName,
            meal_type: mealType
          })
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

      if (responseError) {
        setAdminMealBusyState(false);
        showToast("Couldn't save meal. Please try again.");
        return;
      }

      if (!savedMeal) {
        setAdminMealBusyState(false);
        showToast("Couldn't save meal. Please try again.");
        return;
      }

      adminSelectedMealDay = dayOfWeek;
      await loadAdminMealPlan();
      setAdminMealBusyState(false);
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

      setAdminScreen(button.getAttribute("data-admin-nav"));
    }

    function handleAdminMealListClick(event) {
      const button = event.target.closest("[data-admin-meal-day]");

      if (!button) {
        return;
      }

      syncAdminMealForm(Number(button.getAttribute("data-admin-meal-day")));
      renderAdminMealPlan();
      adminMealName.focus();
    }

    function handleAdminMealSubmit(event) {
      event.preventDefault();
      saveAdminMeal(new FormData(event.currentTarget));
    }

    function handleAdminMealReset() {
      syncAdminMealForm(adminSelectedMealDay);
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
      populateAdminMealTypeOptions();
      adminNavButtons.forEach((button) => button.addEventListener("click", handleAdminNavClick));
      adminTodoForm.addEventListener("submit", handleAdminTodoSubmit);
      adminActiveList.addEventListener("click", handleAdminActiveListClick);
      adminMealList.addEventListener("click", handleAdminMealListClick);
      adminMealForm.addEventListener("submit", handleAdminMealSubmit);
      adminMealCancelButton.addEventListener("click", handleAdminMealReset);
      loadAdminTodos();
      loadAdminMealPlan();
      refreshIcons();
    }
