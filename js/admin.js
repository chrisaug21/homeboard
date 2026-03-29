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
    const adminCalEventList = document.getElementById("admin-cal-event-list");
    const adminCalEventsNote = document.getElementById("admin-cal-events-note");
    const adminSavedCountdownList = document.getElementById("admin-saved-countdown-list");
    const adminSavedCountdownsNote = document.getElementById("admin-saved-countdowns-note");
    const adminTodoAddButton = document.getElementById("admin-todo-add-button");
    const adminCountdownAddButton = document.getElementById("admin-countdown-add-button");

    // Person color palette — distinct from status colors (amber, sage, rose)
    const PERSON_COLOR_PALETTE = [
      "#2563eb", "#9333ea", "#0891b2", "#be123c",
      "#c2410c", "#0f766e", "#6d28d9", "#16a34a"
    ];

    // Screen definitions for settings UI
    const CONFIGURABLE_SCREENS = [...DISPLAY_SCREEN_KEYS];
    const SCREEN_LABELS = {
      upcoming_calendar: "Upcoming Calendar",
      monthly_calendar: "Monthly Calendar",
      todos: "To-Do List",
      meals: "Meal Plan",
      countdowns: "Countdowns"
    };
    const TIMER_SCREEN_KEYS = [...DISPLAY_SCREEN_KEYS];
    const TIMER_LABELS = {
      upcoming_calendar: "Upcoming Calendar",
      monthly_calendar: "Monthly Calendar",
      todos: "To-Do List",
      meals: "Meal Plan",
      countdowns: "Countdowns"
    };
    const TIMER_DEFAULTS = { upcoming_calendar: 30, monthly_calendar: 60, todos: 45, meals: 30, countdowns: 15 };

    // Loaded from Supabase at admin init; falls back to defaults so todo form always works
    let adminHouseholdSettings = {
      assistant_name: "",
      color_scheme: "warm",
      google_cal_id: "",
      display_settings: {
        members: []
      }
    };
    let assistantSavePending = false;
    let displaySavePending = false;
    let integrationsSavePending = false;
    let membersSavePending = false;
    let pendingMemberRemovalIndex = null;
    let adminHouseholdConfigPromise = null;
    let adminHouseholdConfigLoaded = false;

    let toastTimeoutId = null;
    let adminTodoWritePending = false;
    let adminMealWritePending = false;
    let adminCurrentNote = "";
    let adminNoteWritePending = false;
    let adminScreen = "todos";
    let adminWeekOffset = 0;
    let adminCurrentMonday = null;
    let adminMealPlanRows = [];
    let adminCountdownWritePending = false;
    let adminCountdownEditPending = false;
    let adminModalType = null;
    let adminModalContext = null;
    let adminTodos = [];
    let adminArchivedMonth = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })();
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

    function setAdminConfigDependentUiDisabled(disabled) {
      const elementIds = [
        "settings-assistant-name",
        "settings-assistant-save",
        "settings-member-input",
        "settings-member-add-btn",
        "settings-display-save",
        "settings-integrations-save"
      ];

      elementIds.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
          element.disabled = disabled;
        }
      });

      const displayInputs = document.querySelectorAll("#admin-screen-settings input, #admin-screen-settings select, #admin-screen-settings button");
      displayInputs.forEach((element) => {
        if (element.id !== "settings-sync-btn") {
          element.disabled = disabled;
        }
      });
    }

    async function ensureAdminHouseholdConfigLoaded(forceReload = false) {
      if (forceReload || !adminHouseholdConfigPromise) {
        setAdminConfigDependentUiDisabled(true);
        adminHouseholdConfigLoaded = false;
        adminHouseholdConfigPromise = loadAdminHouseholdConfig()
          .then(() => {
            adminHouseholdConfigLoaded = true;
            setAdminConfigDependentUiDisabled(false);
          })
          .catch((error) => {
            adminHouseholdConfigLoaded = false;
            setAdminConfigDependentUiDisabled(true);
            adminHouseholdConfigPromise = null;
            throw error;
          });
      }

      await adminHouseholdConfigPromise;
      return adminHouseholdConfigLoaded;
    }

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

    function setModalSaving(isBusy, defaultLabel) {
      const btn = document.querySelector("#admin-modal-body [type='submit']");
      if (btn) {
        btn.disabled = isBusy;
        if (isBusy) {
          if (!btn.dataset.savedLabel) btn.dataset.savedLabel = btn.textContent;
          btn.textContent = "Saving\u2026";
        } else {
          btn.textContent = defaultLabel || btn.dataset.savedLabel || "Save";
          delete btn.dataset.savedLabel;
        }
      }
    }

    function openAdminModal(title, bodyHTML) {
      const modal = document.getElementById("admin-modal");
      const modalTitle = document.getElementById("admin-modal-title");
      const modalBody = document.getElementById("admin-modal-body");
      if (!modal || !modalTitle || !modalBody) return;
      modalTitle.textContent = title;
      modalBody.innerHTML = bodyHTML;
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      const firstInput = modalBody.querySelector("input:not([type='hidden']), select, textarea");
      if (firstInput) {
        firstInput.focus();
        if (firstInput.value && (firstInput.type === "text" || firstInput.type === "number")) {
          firstInput.setSelectionRange(firstInput.value.length, firstInput.value.length);
        }
      }
      refreshIcons();
    }

    function closeAdminModal() {
      const modal = document.getElementById("admin-modal");
      if (!modal || modal.hidden) return;
      modal.hidden = true;
      const modalBody = document.getElementById("admin-modal-body");
      if (modalBody) modalBody.innerHTML = "";
      document.body.style.overflow = "";
      // Clean up any pending photos
      if (adminModalType === "edit-countdown" && adminModalContext && adminModalContext.id) {
        adminPendingPhotos.delete(adminModalContext.id);
      } else if (adminModalType === "add-countdown") {
        adminPendingPhotos.delete("modal-create");
      }
      adminModalType = null;
      adminModalContext = null;
    }

    function handleEscapeKey(event) {
      if (event.key === "Escape") closeAdminModal();
    }

    function handleAdminModalClick(event) {
      if (event.target.classList.contains("admin-modal-backdrop")) {
        closeAdminModal();
        return;
      }
      if (event.target.closest("[data-action='close-modal']")) {
        closeAdminModal();
        return;
      }
      if (event.target.closest("[data-action='get-photo-modal']")) {
        handleGetPhotoModal();
        return;
      }
      const viewPhotoBtn = event.target.closest("[data-action='view-photo']");
      if (viewPhotoBtn) {
        openAdminLightbox(
          viewPhotoBtn.getAttribute("data-full-url"),
          viewPhotoBtn.getAttribute("data-credit")
        );
        return;
      }
      const removePhotoBtn = event.target.closest("[data-action='remove-photo-modal']");
      if (removePhotoBtn) {
        // Stage the removal — only persist to Supabase when the user clicks Save
        const preview = removePhotoBtn.closest(".admin-edit-photo-preview");
        if (preview) preview.hidden = true;
        const form = removePhotoBtn.closest("form");
        if (form && !form.querySelector("[name='remove_photo']")) {
          const hidden = document.createElement("input");
          hidden.type = "hidden";
          hidden.name = "remove_photo";
          hidden.value = "1";
          form.appendChild(hidden);
        }
      }
    }

    function handleAdminModalSubmit(event) {
      const form = event.target.closest("form[data-modal-form]");
      if (!form) return;
      event.preventDefault();
      const formType = form.getAttribute("data-modal-form");
      const formData = new FormData(form);

      if (formType === "todo") {
        const todoTitle = String(formData.get("title") || "").trim();
        if (!todoTitle) {
          const titleInput = form.querySelector("[name='title']");
          if (titleInput) {
            titleInput.style.borderColor = "var(--rose)";
            titleInput.focus();
            titleInput.addEventListener("input", () => { titleInput.style.borderColor = ""; }, { once: true });
          }
          return;
        }
        if (adminModalType === "edit-todo") {
          updateAdminTodo(adminModalContext.id, formData);
        } else {
          createAdminTodo(formData);
        }
      } else if (formType === "meal") {
        const dayOfWeek = Number(form.getAttribute("data-meal-day"));
        const mealName = String(formData.get("meal_name") || "").trim();
        const mealType = normalizeMealType(formData.get("meal_type"));
        if (!mealName) {
          const nameInput = form.querySelector("[name='meal_name']");
          if (nameInput) nameInput.focus();
          return;
        }
        saveAdminMeal(dayOfWeek, mealName, mealType);
      } else if (formType === "note") {
        saveAdminMealNote(formData);
      } else if (formType === "countdown") {
        if (adminModalType === "edit-countdown") {
          const id = form.getAttribute("data-countdown-id");
          const originalName = form.getAttribute("data-original-name");
          const name = String(formData.get("name") || "").trim();
          const eventDate = String(formData.get("event_date") || "").trim();
          const icon = String(formData.get("icon") || "").trim() || "calendar";
          const daysBeforeRaw = String(formData.get("days_before_visible") || "").trim();
          const daysBeforeVisible = daysBeforeRaw !== "" ? parseInt(daysBeforeRaw, 10) || null : null;
          const photoKeyword = String(formData.get("photo_keyword") || "").trim();
          const removePhoto = formData.get("remove_photo") === "1";
          if (!name || !eventDate || adminCountdownEditPending) return;
          updateAdminCountdown(id, name, eventDate, icon, daysBeforeVisible, photoKeyword, originalName, removePhoto);
        } else {
          saveAdminCountdown(formData);
        }
      }
    }

    async function handleGetPhotoModal() {
      const modalBody = document.getElementById("admin-modal-body");
      if (!modalBody) return;
      const keywordInput = modalBody.querySelector("[name='photo_keyword']");
      const nameInput = modalBody.querySelector("[name='name']");
      const previewContainer = modalBody.querySelector(".admin-modal-photo-pending");
      const btn = modalBody.querySelector("[data-action='get-photo-modal']");
      const query = (keywordInput && keywordInput.value.trim()) || (nameInput && nameInput.value.trim()) || "";
      if (!query) return;
      // Capture modal context before the async gap to avoid race conditions
      const capturedModalType = adminModalType;
      const capturedContextId = adminModalContext && adminModalContext.id;
      if (btn) { btn.disabled = true; btn.textContent = "Loading\u2026"; }
      const photo = await fetchUnsplashPhoto(query);
      if (btn) { btn.disabled = false; btn.textContent = "Get photo"; }
      if (!photo) {
        showToast("Couldn\u2019t find a photo. Try a different keyword.");
        return;
      }
      const photoKey = capturedModalType === "edit-countdown" ? capturedContextId : "modal-create";
      adminPendingPhotos.set(photoKey, photo);
      setFormPhotoPreview(previewContainer, photo);
    }


    function renderAdminTodoCard(todo, options) {
      const title = escapeHtml(todo.title || "Untitled task");
      const assignee = todo.assignee ? escapeHtml(todo.assignee) : "Unassigned";

      // Active cards use the urgency-coded pill from display view; archived use plain date.
      let dueMarkup = "";
      if (options.showComplete) {
        const duePill = getTodoDuePill(todo.due_date);
        if (duePill) {
          dueMarkup = `<span class="todo-due-pill ${escapeHtml(duePill.cssClass)}">${escapeHtml(duePill.label)}</span>`;
        }
      } else if (todo.due_date) {
        dueMarkup = `<span class="admin-pill admin-pill--due">${escapeHtml(formatAdminTodoDate(todo.due_date))}</span>`;
      }

      const meta = `
        <div class="admin-todo-meta">
          <span class="admin-pill">${assignee}</span>
          ${dueMarkup}
        </div>
      `;

      if (options.showComplete) {
        return `
          <article class="admin-todo-card admin-todo-card--active" data-todo-id="${escapeHtml(todo.id)}" role="button" tabindex="0" aria-label="Edit: ${title}">
            <button class="todo-check-btn" type="button" data-action="archive-todo" data-todo-id="${escapeHtml(todo.id)}" aria-label="Complete ${title}">
              <div class="todo-check">
                <svg class="todo-check-icon" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M1 5L4.5 8.5L11 1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </button>
            <div class="admin-todo-body">
              <div class="admin-todo-title">${title}</div>
              ${meta}
            </div>
          </article>
        `;
      }

      return `
        <article class="admin-todo-card" aria-label="${title}">
          <div class="admin-todo-body">
            <div class="admin-todo-title">${title}</div>
            ${meta}
          </div>
        </article>
      `;
    }

    function renderAdminTodoLists(todoGroups) {
      adminTodos = todoGroups.active;
      const activeCount = todoGroups.active.length;

      // Filter archived todos to the selected month
      const filteredArchived = todoGroups.archived.filter((todo) => {
        if (!todo.archived_at) return false;
        const d = new Date(todo.archived_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === adminArchivedMonth;
      });
      const archivedCount = filteredArchived.length;

      const monthLabel = getArchivedMonthDisplay();

      adminActiveSummary.textContent = activeCount
        ? `${activeCount} active household ${activeCount === 1 ? "task" : "tasks"}`
        : "No active household tasks right now.";
      adminArchivedSummary.textContent = archivedCount
        ? `${archivedCount} completed ${archivedCount === 1 ? "task" : "tasks"}`
        : `No completed tasks in ${monthLabel}.`;

      adminActiveList.innerHTML = activeCount
        ? todoGroups.active.map((todo) => renderAdminTodoCard(todo, { showComplete: true })).join("")
        : '<div class="admin-empty">No active tasks right now.</div>';

      adminArchivedList.innerHTML = archivedCount
        ? filteredArchived.map((todo) => renderAdminTodoCard(todo, { showComplete: false })).join("")
        : `<div class="admin-empty">Nothing completed in ${escapeHtml(monthLabel)}.</div>`;

      updateArchiveMonthLabel();
    }

    function getArchivedMonthDisplay() {
      const [year, month] = adminArchivedMonth.split("-").map(Number);
      return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
        new Date(year, month - 1, 1)
      );
    }

    function updateArchiveMonthLabel() {
      const labelEl = document.getElementById("admin-archive-month-label");
      if (labelEl) labelEl.textContent = getArchivedMonthDisplay();
    }

    function handleArchiveMonthPrev() {
      const [year, month] = adminArchivedMonth.split("-").map(Number);
      const d = new Date(year, month - 2, 1);
      adminArchivedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      loadAdminTodos();
    }

    function handleArchiveMonthNext() {
      const [year, month] = adminArchivedMonth.split("-").map(Number);
      const d = new Date(year, month, 1);
      adminArchivedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      loadAdminTodos();
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

      adminTodoWritePending = true;
      setModalSaving(true);

      const { error } = await client
        .from("todos")
        .insert({
          household_id: TODO_HOUSEHOLD_ID,
          title,
          assignee: assignee || null,
          due_date: dueDate || null
        });

      adminTodoWritePending = false;

      if (error) {
        setModalSaving(false, "Add Todo");
        showToast("Couldn't save todo. Please try again.");
        return;
      }

      closeAdminModal();
      await loadAdminTodos();
    }

    async function updateAdminTodo(id, formData) {
      const client = getSupabaseClient();
      if (!client) {
        showToast("Couldn\u2019t save todo. Supabase is unavailable.");
        return;
      }

      const title = String(formData.get("title") || "").trim();
      const assignee = String(formData.get("assignee") || "").trim();
      const dueDate = String(formData.get("due_date") || "").trim();

      if (!title || adminTodoWritePending) return;

      adminTodoWritePending = true;
      setModalSaving(true);

      const { error } = await client
        .from("todos")
        .update({
          title,
          assignee: assignee || null,
          due_date: dueDate || null
        })
        .eq("id", id)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null);

      adminTodoWritePending = false;

      if (error) {
        setModalSaving(false, "Save Changes");
        showToast("Couldn\u2019t update todo. Please try again.");
        return;
      }

      closeAdminModal();
      await loadAdminTodos();
    }

    function buildTodoFormHTML(todo) {
      const isEdit = !!todo;
      const currentAssignee = isEdit ? (todo.assignee || "") : "";
      // Read members from settings
      const memberNames = (adminHouseholdSettings.display_settings.members || []).map((m) => m.name);
      // Preserve any existing assignee that isn't in the current list (e.g. old data)
      const extraMember = currentAssignee && !memberNames.includes(currentAssignee)
        ? [currentAssignee]
        : [];
      const assigneeOptions = ["", ...memberNames, ...extraMember].map((name) =>
        `<option value="${escapeHtml(name)}"${name === currentAssignee ? " selected" : ""}>${escapeHtml(name || "Unassigned")}</option>`
      ).join("");
      return `
        <form data-modal-form="todo" novalidate>
          <div class="admin-field">
            <label for="modal-todo-title">Title</label>
            <input id="modal-todo-title" name="title" type="text" maxlength="140" required
              value="${isEdit ? escapeHtml(todo.title || "") : ""}"
              placeholder="${isEdit ? "" : "What needs doing?"}">
          </div>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="modal-todo-assignee">Assignee</label>
              <select id="modal-todo-assignee" name="assignee">
                ${assigneeOptions}
              </select>
            </div>
            <div class="admin-field">
              <label for="modal-todo-due">Due date</label>
              <input id="modal-todo-due" name="due_date" type="date"
                value="${isEdit ? escapeHtml(todo.due_date || "") : ""}">
            </div>
          </div>
          <div class="admin-actions">
            <button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="admin-button admin-button--primary" type="submit">${isEdit ? "Save Changes" : "Add Todo"}</button>
          </div>
        </form>
      `;
    }

    async function openAddTodoModal() {
      try {
        await ensureAdminHouseholdConfigLoaded();
      } catch {
        showToast("Couldn’t load household settings.");
        return;
      }
      adminModalType = "add-todo";
      adminModalContext = null;
      openAdminModal("Add Todo", buildTodoFormHTML(null));
    }

    async function openEditTodoModal(todo) {
      try {
        await ensureAdminHouseholdConfigLoaded();
      } catch {
        showToast("Couldn’t load household settings.");
        return;
      }
      adminModalType = "edit-todo";
      adminModalContext = { id: todo.id };
      openAdminModal("Edit Todo", buildTodoFormHTML(todo));
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


    async function archiveAdminTodoWithAnimation(todoId, cardEl) {
      const client = getSupabaseClient();
      if (!client || adminTodoWritePending) {
        if (!client) showToast("Couldn\u2019t complete todo. Supabase is unavailable.");
        return;
      }
      adminTodoWritePending = true;
      cardEl.classList.add("is-completing");

      const { error } = await client
        .from("todos")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", todoId)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null);

      if (error) {
        adminTodoWritePending = false;
        cardEl.classList.remove("is-completing");
        showToast("Couldn\u2019t complete todo. Please try again.");
        return;
      }

      cardEl.classList.add("is-done");
      cardEl.addEventListener("transitionend", async () => {
        adminTodoWritePending = false;
        await loadAdminTodos();
      }, { once: true });
    }

    function handleAdminActiveListClick(event) {
      // Checkbox click — animate and archive.
      const archiveBtn = event.target.closest("[data-action='archive-todo']");
      if (archiveBtn) {
        const card = archiveBtn.closest(".admin-todo-card");
        if (card && !card.classList.contains("is-completing")) {
          archiveAdminTodoWithAnimation(archiveBtn.getAttribute("data-todo-id"), card);
        }
        return;
      }

      // Tapping anywhere else on an active card opens the edit modal.
      const card = event.target.closest(".admin-todo-card--active");
      if (card && !card.classList.contains("is-completing")) {
        const id = card.getAttribute("data-todo-id");
        const todo = adminTodos.find((t) => t.id === id);
        if (todo) openEditTodoModal(todo);
      }
    }

    function handleAdminActiveListKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.key === " ") event.preventDefault();

      const archiveBtn = event.target.closest("[data-action='archive-todo']");
      if (archiveBtn) {
        const card = archiveBtn.closest(".admin-todo-card");
        if (card && !card.classList.contains("is-completing")) {
          archiveAdminTodoWithAnimation(archiveBtn.getAttribute("data-todo-id"), card);
        }
        return;
      }

      const card = event.target.closest(".admin-todo-card--active");
      if (card && !card.classList.contains("is-completing")) {
        const id = card.getAttribute("data-todo-id");
        const todo = adminTodos.find((t) => t.id === id);
        if (todo) openEditTodoModal(todo);
      }
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

    function buildMealFormHTML(dayIndex, date, meal) {
      const dayLabel = escapeHtml(formatAdminDayLabel(date));
      const currentName = meal ? escapeHtml(meal.mealName) : "";
      const currentType = meal ? meal.mealType : "cooking";

      return `
        <form data-modal-form="meal" data-meal-day="${dayIndex}" novalidate>
          <p class="admin-panel-note" style="margin-top:0">${dayLabel}</p>
          <div class="admin-field">
            <label for="modal-meal-name">Dinner</label>
            <input id="modal-meal-name" name="meal_name" type="text" maxlength="140"
              placeholder="What\u2019s for dinner?" value="${currentName}" autocomplete="off">
          </div>
          <div class="admin-field">
            <label for="modal-meal-type">Type</label>
            <select id="modal-meal-type" name="meal_type">${buildMealTypeOptionsHTML(currentType)}</select>
          </div>
          <div class="admin-actions">
            <button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="admin-button admin-button--primary" type="submit">Save</button>
          </div>
        </form>
      `;
    }

    function openMealModal(dayIndex, date, meal) {
      adminModalType = "edit-meal";
      adminModalContext = { dayIndex };
      openAdminModal(formatAdminDayLabel(date), buildMealFormHTML(dayIndex, date, meal));
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
      adminMealNoteWrap.innerHTML = `
        <button class="admin-meal-card" type="button" data-action="edit-meal-note">
          <div class="admin-meal-day">Weekly Note</div>
          <div class="admin-meal-name${adminCurrentNote ? "" : " admin-meal-name--empty"}">${escapeHtml(adminCurrentNote || "No note this week.")}</div>
        </button>
      `;
      refreshIcons();
    }

    function buildMealNoteFormHTML() {
      return `
        <form data-modal-form="note" novalidate>
          <div class="admin-field">
            <textarea
              id="admin-meal-note-input"
              name="note"
              class="admin-meal-note-textarea"
              maxlength="280"
              placeholder="Add a note for this week\u2026"
              rows="3"
              aria-label="Weekly note"
            >${escapeHtml(adminCurrentNote)}</textarea>
          </div>
          <div class="admin-actions">
            <button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="admin-button admin-button--primary" type="submit">Save Note</button>
          </div>
        </form>
      `;
    }

    function openMealNoteModal() {
      adminModalType = "note";
      adminModalContext = null;
      openAdminModal("Weekly Note", buildMealNoteFormHTML());
    }

    async function saveAdminMealNote(formData) {
      if (adminNoteWritePending || adminMealWritePending) return;
      const noteText = String(formData.get("note") || "").trim();
      const client = getSupabaseClient();
      if (!client) {
        showToast("Couldn\u2019t save note. Supabase is unavailable.");
        return;
      }
      adminNoteWritePending = true;
      setModalSaving(true);
      const savedWeekStart = formatDateKey(adminCurrentMonday);

      const { error } = await client
        .from("meal_plan_notes")
        .upsert(
          { household_id: DISPLAY_HOUSEHOLD_ID, week_start: savedWeekStart, note: noteText },
          { onConflict: "household_id,week_start" }
        );

      adminNoteWritePending = false;

      if (error) {
        setModalSaving(false, "Save Note");
        showToast("Couldn\u2019t save note. Please try again.");
        return;
      }

      // If the week changed while awaiting, discard the stale result
      if (formatDateKey(adminCurrentMonday) !== savedWeekStart) {
        closeAdminModal();
        return;
      }

      adminCurrentNote = noteText;
      closeAdminModal();
      renderAdminMealNote();
      showToast("Note saved.");
    }

    function handleAdminMealNoteClick(event) {
      if (event.target.closest("[data-action='edit-meal-note']")) {
        openMealNoteModal();
      }
    }

    async function loadAdminMealPlan() {
      adminCurrentMonday = getAdminWeekMonday();
      adminMealWeekLabel.textContent = "Loading\u2026";
      adminWeekPrevBtn.disabled = true;
      adminWeekNextBtn.disabled = true;
      adminMealList.innerHTML = '<div class="admin-empty">Loading meals\u2026</div>';
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
      const submitBtn = document.querySelector("#admin-modal-body [type='submit']");
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

      closeAdminModal();
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

      if (target === "settings") {
        ensureAdminHouseholdConfigLoaded()
          .then(() => loadAdminSettings())
          .catch(() => showToast("Couldn’t load household settings."));
      }
    }

    function handleAdminMealListClick(event) {
      if (adminMealWritePending) return;

      const dayBtn = event.target.closest("[data-admin-meal-day]");
      if (dayBtn) {
        const dayIndex = Number(dayBtn.getAttribute("data-admin-meal-day"));
        const date = new Date(adminCurrentMonday);
        date.setDate(adminCurrentMonday.getDate() + dayIndex);
        openMealModal(dayIndex, date, getAdminMealByDay(dayIndex));
      }
    }

    function handleAdminWeekPrev() {
      if (adminWeekOffset <= -1 || adminMealWritePending || adminNoteWritePending) return;
      adminWeekOffset--;
      loadAdminMealPlan();
    }

    function handleAdminWeekNext() {
      if (adminWeekOffset >= 1 || adminMealWritePending || adminNoteWritePending) return;
      adminWeekOffset++;
      loadAdminMealPlan();
    }

    function handleAdminWeekToday() {
      if (adminWeekOffset === 0 || adminMealWritePending || adminNoteWritePending) return;
      adminWeekOffset = 0;
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
      const submitBtn = document.querySelector("#admin-modal-body [type='submit']");
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving\u2026"; }

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
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Save Countdown"; }
        showToast("Couldn\u2019t save countdown. Please try again.");
        return;
      }

      adminCountdownWritePending = false;

      const pendingPhoto = adminPendingPhotos.get("modal-create");
      adminPendingPhotos.delete("modal-create");

      closeAdminModal();
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

    async function updateAdminCountdown(id, name, eventDate, icon, daysBeforeVisible, photoKeyword, originalName, removePhoto) {
      const client = getSupabaseClient();
      if (!client) {
        showToast("Couldn\u2019t update countdown. Supabase is unavailable.");
        return;
      }

      adminCountdownEditPending = true;
      const submitBtn = document.querySelector("#admin-modal-body [type='submit']");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving\u2026";
      }

      const updatePayload = { name, event_date: eventDate, icon, days_before_visible: daysBeforeVisible, photo_keyword: photoKeyword || null };
      if (removePhoto) updatePayload.unsplash_image_url = null;

      const { error } = await client
        .from("countdowns")
        .update(updatePayload)
        .eq("id", id)
        .eq("household_id", DISPLAY_HOUSEHOLD_ID);

      adminCountdownEditPending = false;

      if (error) {
        showToast("Couldn\u2019t update countdown. Please try again.");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Save Changes";
        }
        return;
      }

      const pendingPhoto = adminPendingPhotos.get(id);
      adminPendingPhotos.delete(id);

      closeAdminModal();
      await loadAdminCountdowns({ preserveScroll: true });

      if (!removePhoto) {
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

    function handleAdminCountdownCalListClick(event) {
      const card = event.target.closest("[data-cal-name]");
      if (!card) return;
      openAddCountdownModal({
        name: card.getAttribute("data-cal-name"),
        date: card.getAttribute("data-cal-date")
      });
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
      // If there's an existing saved photo preview in the same form, hide it so only one shows
      const form = container.closest("form");
      if (form) {
        const existing = form.querySelector(".admin-edit-photo-preview");
        if (existing) existing.hidden = true;
      }
    }

    function buildCountdownFormHTML(countdown, prefill) {
      // countdown: object for edit, null for add
      // prefill: { name, date } for pre-filling from calendar event (add only)
      const p = prefill || {};
      const isEdit = !!countdown;
      const id = isEdit ? escapeHtml(countdown.id) : "";
      const name = isEdit ? escapeHtml(countdown.name) : escapeHtml(p.name || "");
      const eventDate = isEdit ? escapeHtml(countdown.event_date || "") : escapeHtml(p.date || "");
      const daysBeforeValue = isEdit && countdown.days_before_visible != null ? String(countdown.days_before_visible) : "";
      const photoKeyword = isEdit ? escapeHtml(countdown.photo_keyword || "") : "";
      const icon = isEdit ? escapeHtml(countdown.icon || "") : "";

      let existingPhotoHTML = "";
      if (isEdit && countdown.unsplash_image_url) {
        let imageUrl = null;
        let imageCredit = null;
        try {
          const parsed = JSON.parse(countdown.unsplash_image_url);
          imageUrl = parsed.url || null;
          imageCredit = parsed.credit || null;
        } catch {
          imageUrl = countdown.unsplash_image_url;
        }
        if (imageUrl) {
          const thumbnailUrl = unsplashThumbnailUrl(imageUrl);
          existingPhotoHTML = `
            <div class="admin-edit-photo-preview">
              <button class="admin-countdown-preview-btn" type="button" data-action="view-photo"
                data-full-url="${escapeHtml(imageUrl)}" data-credit="${escapeHtml(imageCredit || "")}"
                aria-label="View full photo">
                <img class="admin-edit-photo-thumb" src="${escapeHtml(thumbnailUrl)}" alt="" aria-hidden="true"
                  onerror="this.closest('.admin-edit-photo-preview').remove();">
              </button>
              <div class="admin-edit-photo-meta">
                ${imageCredit ? `<span class="admin-edit-photo-credit">${escapeHtml(imageCredit)}</span>` : ""}
                <button class="admin-button admin-button--ghost-danger" type="button"
                  data-action="remove-photo-modal" data-countdown-id="${id}"
                  aria-label="Remove photo" style="margin-left:0">Remove photo</button>
              </div>
            </div>
          `;
        }
      }

      const formAttrs = isEdit
        ? `data-countdown-id="${id}" data-original-name="${name}"`
        : "";
      const submitLabel = isEdit ? "Save Changes" : "Save Countdown";

      return `
        <form data-modal-form="countdown" ${formAttrs} novalidate>
          <div class="admin-field">
            <label for="modal-cd-name">Name</label>
            <input id="modal-cd-name" name="name" type="text" maxlength="140" required
              value="${name}" placeholder="e.g. Portugal trip" autocomplete="off">
          </div>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="modal-cd-date">Date</label>
              <input id="modal-cd-date" name="event_date" type="date" required value="${eventDate}">
            </div>
            <div class="admin-field">
              <label for="modal-cd-days">Show starting</label>
              <input id="modal-cd-days" name="days_before_visible" type="number" min="1" max="365"
                value="${daysBeforeValue}" placeholder="e.g. 30">
              <p class="admin-field-hint">Days before event. Optional.</p>
            </div>
          </div>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="modal-cd-keyword">Photo keyword</label>
              <div class="admin-icon-row">
                <input id="modal-cd-keyword" name="photo_keyword" type="text" maxlength="100"
                  value="${photoKeyword}" placeholder="e.g. beach, mountains" autocomplete="off">
                <button class="admin-button admin-button--secondary" type="button"
                  data-action="get-photo-modal">Get photo</button>
              </div>
              <p class="admin-field-hint">Optional. Previews before you save.</p>
            </div>
            <div class="admin-field">
              <label for="modal-cd-icon">Icon &mdash; <a href="https://lucide.dev/icons" target="_blank" rel="noopener noreferrer" class="admin-icon-link">Browse ↗</a></label>
              <input id="modal-cd-icon" name="icon" type="text" maxlength="60"
                value="${icon}" placeholder="e.g. plane, heart, gem" autocomplete="off">
              <p class="admin-field-hint">Lucide icon name. Optional.</p>
            </div>
          </div>
          ${existingPhotoHTML}
          <div class="admin-modal-photo-pending" hidden></div>
          <div class="admin-actions">
            <button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="admin-button admin-button--primary" type="submit">${submitLabel}</button>
          </div>
        </form>
      `;
    }

    function openAddCountdownModal(prefill) {
      adminModalType = "add-countdown";
      adminModalContext = null;
      openAdminModal("Add Countdown", buildCountdownFormHTML(null, prefill));
    }

    function openEditCountdownModal(countdown) {
      adminModalType = "edit-countdown";
      adminModalContext = { id: countdown.id };
      openAdminModal("Edit Countdown", buildCountdownFormHTML(countdown));
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
        const id = editBtn.getAttribute("data-countdown-id");
        const countdown = adminSavedCountdowns.find((c) => c.id === id);
        if (countdown) openEditCountdownModal(countdown);
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

    async function fetchAdminTodos() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("todos")
        .select("id, title, assignee, due_date, archived_at, created_at")
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .order("due_date", { ascending: true, nullsFirst: false })
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

    // ── Settings ─────────────────────────────────────────────────────────────

    async function loadAdminHouseholdConfig() {
      const client = getSupabaseClient();
      if (!client) {
        throw new Error("Supabase client unavailable");
      }

      const { data, error } = await client
        .from("households")
        .select("assistant_name, color_scheme, google_cal_id, display_settings")
        .eq("id", DISPLAY_HOUSEHOLD_ID)
        .single();

      if (error || !data) {
        throw new Error("Failed to load household config");
      }

      const ds = normalizeDisplaySettings(data.display_settings);
      ds.members = Array.isArray(data.display_settings?.members)
        ? data.display_settings.members
          .map((member) => ({
            name: String(member?.name || "").trim(),
            color: String(member?.color || "").trim()
          }))
          .filter((member) => member.name)
        : [];

      adminHouseholdSettings = {
        assistant_name: data.assistant_name || "",
        color_scheme: data.color_scheme || "warm",
        google_cal_id: data.google_cal_id || "",
        display_settings: ds
      };

      // Apply the color scheme in admin mode too
      if (typeof applyColorScheme === "function") {
        applyColorScheme(adminHouseholdSettings.color_scheme);
      }

      return adminHouseholdSettings;
    }

    function renderSettingsMembersList(members) {
      const list = document.getElementById("settings-members-list");
      if (!list) return;

      if (!members || members.length === 0) {
        list.innerHTML = `<p class="admin-panel-note" style="margin:0">No members yet. Add one below.</p>`;
        return;
      }

      list.innerHTML = members.map((m, i) => `
        ${pendingMemberRemovalIndex === i ? `
          <div class="admin-settings-member-row admin-settings-member-row--confirm" data-member-index="${i}">
            <span class="admin-settings-member-confirm-text">Remove ${escapeHtml(m.name)}?</span>
            <div class="admin-settings-member-actions">
              <button type="button" class="admin-button admin-button--danger admin-button--small" data-member-confirm="${i}"${membersSavePending ? " disabled" : ""}>Confirm</button>
              <button type="button" class="admin-button admin-button--secondary admin-button--small" data-member-cancel="${i}"${membersSavePending ? " disabled" : ""}>Cancel</button>
            </div>
          </div>
        ` : `
          <div class="admin-settings-member-row" data-member-index="${i}">
            <span class="admin-settings-member-color" style="background:${escapeHtml(m.color || "#999")}"></span>
            <span class="admin-settings-member-name">${escapeHtml(m.name)}</span>
            <button type="button" class="admin-settings-member-remove" data-member-remove="${i}" aria-label="Remove ${escapeHtml(m.name)}"${membersSavePending ? " disabled" : ""}>
              <i data-lucide="x"></i>
            </button>
          </div>
        `}
      `).join("");

      refreshIcons();
    }

    function renderSettingsScreenOrder(screenOrder) {
      const list = document.getElementById("settings-screen-order");
      if (!list) return;

      const ds = adminHouseholdSettings.display_settings || {};
      const activeScreens = Array.isArray(ds.active_screens) ? ds.active_screens : CONFIGURABLE_SCREENS;

      list.innerHTML = screenOrder.map((name, i) => {
        const isActive = activeScreens.includes(name);
        return `
          <li class="admin-settings-order-item${isActive ? "" : " is-inactive"}" data-screen-name="${escapeHtml(name)}">
            <span class="admin-settings-order-item-name">${escapeHtml(SCREEN_LABELS[name] || name)}</span>
            <div class="admin-settings-order-arrows">
              <button type="button" class="admin-settings-order-btn" data-order-dir="up" data-order-index="${i}" aria-label="Move up"${i === 0 ? " disabled" : ""}>
                <i data-lucide="chevron-up"></i>
              </button>
              <button type="button" class="admin-settings-order-btn" data-order-dir="down" data-order-index="${i}" aria-label="Move down"${i === screenOrder.length - 1 ? " disabled" : ""}>
                <i data-lucide="chevron-down"></i>
              </button>
            </div>
          </li>
        `;
      }).join("");

      refreshIcons();
    }

    function renderSettingsTimerList(timerIntervals) {
      const list = document.getElementById("settings-timer-list");
      if (!list) return;

      list.innerHTML = TIMER_SCREEN_KEYS.map((key) => {
        const val = (timerIntervals && timerIntervals[key] != null)
          ? timerIntervals[key]
          : TIMER_DEFAULTS[key];
        return `
          <div class="admin-settings-timer-row">
            <span class="admin-settings-timer-label">${escapeHtml(TIMER_LABELS[key])}</span>
            <input class="admin-settings-timer-input" type="number" min="5" max="600"
              name="timer_${key}" value="${Number(val)}" aria-label="${escapeHtml(TIMER_LABELS[key])} timer">
            <span class="admin-settings-timer-unit">s</span>
          </div>
        `;
      }).join("");
    }

    function loadAdminSettings() {
      const ds = adminHouseholdSettings.display_settings || {};
      const activeScreens = Array.isArray(ds.active_screens) ? ds.active_screens : CONFIGURABLE_SCREENS;
      const screenOrder = Array.isArray(ds.screen_order) ? ds.screen_order : CONFIGURABLE_SCREENS;
      const timerIntervals = ds.timer_intervals || {};
      const upcomingDays = ds.upcoming_days || 5;
      const members = Array.isArray(ds.members) ? ds.members : [];

      // Household
      const nameInput = document.getElementById("settings-assistant-name");
      if (nameInput) nameInput.value = adminHouseholdSettings.assistant_name || "";

      renderSettingsMembersList(members);

      // Active screen checkboxes
      CONFIGURABLE_SCREENS.forEach((name) => {
        const cb = document.querySelector(`[name="screen_${name}"]`);
        if (cb) cb.checked = activeScreens.includes(name);
      });
      enforceMinOneActiveScreen();

      // Screen order
      renderSettingsScreenOrder(screenOrder);

      // Timers
      renderSettingsTimerList(timerIntervals);

      // Upcoming days
      const daysSelect = document.getElementById("settings-upcoming-days");
      if (daysSelect) daysSelect.value = String(upcomingDays);

      // Color scheme
      const schemeRadio = document.querySelector(`[name="color_scheme"][value="${adminHouseholdSettings.color_scheme || "warm"}"]`);
      if (schemeRadio) schemeRadio.checked = true;

      // Google Cal ID
      const calIdInput = document.getElementById("settings-google-cal-id");
      if (calIdInput) calIdInput.value = adminHouseholdSettings.google_cal_id || "";

      // Last synced
      updateAdminLastSyncedLabel();
    }

    function updateAdminLastSyncedLabel() {
      const el = document.getElementById("settings-last-synced");
      if (!el) return;
      const label = formatRelativeTimestamp(localStorage.getItem(LAST_SYNCED_KEY), "Never synced");
      el.textContent = label === "Never synced" ? label : `Last synced ${label}`;
    }

    async function refreshAdminData() {
      await Promise.all([
        loadAdminTodos(),
        loadAdminMealPlan(),
        loadAdminCalendarMonth(),
        loadAdminCountdowns({ preserveScroll: true }),
        ensureAdminHouseholdConfigLoaded(true).then(() => loadAdminSettings())
      ]);
    }

    async function saveAssistantSection() {
      const client = getSupabaseClient();
      if (!client || assistantSavePending || !adminHouseholdConfigLoaded) return;

      assistantSavePending = true;
      const saveBtn = document.getElementById("settings-assistant-save");
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

      try {
        const nameInput = document.getElementById("settings-assistant-name");
        const newName = nameInput ? nameInput.value.trim() : "";

        adminHouseholdSettings.assistant_name = newName;

        const { data, error } = await client
          .from("households")
          .update({ assistant_name: newName || null })
          .eq("id", DISPLAY_HOUSEHOLD_ID)
          .select();

        if (error) {
          showToast("Error saving assistant name.");
        } else if (!data || data.length === 0) {
          showToast("Warning: no rows updated — check household ID.");
        } else {
          showToast("Assistant name saved.");
        }
      } finally {
        assistantSavePending = false;
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save"; }
      }
    }

    async function persistMemberList(updatedMembers, successMessage) {
      const client = getSupabaseClient();
      if (!client || membersSavePending || !adminHouseholdConfigLoaded) {
        return false;
      }

      membersSavePending = true;
      const addButton = document.getElementById("settings-member-add-btn");
      if (addButton) {
        addButton.disabled = true;
        addButton.textContent = "Saving…";
      }
      renderSettingsMembersList(adminHouseholdSettings.display_settings.members || []);

      try {
        const newDisplaySettings = {
          ...adminHouseholdSettings.display_settings,
          members: updatedMembers
        };

        const { error } = await client
          .from("households")
          .update({ display_settings: newDisplaySettings })
          .eq("id", DISPLAY_HOUSEHOLD_ID);

        if (error) {
          showToast("Couldn’t save household members. Please try again.");
          return false;
        }

        adminHouseholdSettings.display_settings = newDisplaySettings;
        pendingMemberRemovalIndex = null;
        renderSettingsMembersList(updatedMembers);
        showToast(successMessage);
        return true;
      } finally {
        membersSavePending = false;
        if (addButton) {
          addButton.disabled = false;
          addButton.textContent = "Save";
        }
        renderSettingsMembersList(adminHouseholdSettings.display_settings.members || []);
      }
    }

    async function saveDisplaySection() {
      const client = getSupabaseClient();
      if (!client || displaySavePending || !adminHouseholdConfigLoaded) return;

      displaySavePending = true;
      const saveBtn = document.getElementById("settings-display-save");
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

      try {
        // Active screens
        const activeScreens = CONFIGURABLE_SCREENS.filter((name) => {
          const cb = document.querySelector(`[name="screen_${name}"]`);
          return cb && cb.checked;
        });
        // At least one must remain active
        if (activeScreens.length === 0) {
          showToast("At least one screen must stay active.");
          return;
        }

        // Screen order — read from rendered list
        const orderItems = document.querySelectorAll(".admin-settings-order-item");
        const screenOrder = Array.from(orderItems).map((el) => el.getAttribute("data-screen-name")).filter(Boolean);

        // Timers
        const timerIntervals = {};
        TIMER_SCREEN_KEYS.forEach((key) => {
          const input = document.querySelector(`[name="timer_${key}"]`);
          if (input) {
            const val = parseInt(input.value, 10);
            timerIntervals[key] = val > 0 ? val : TIMER_DEFAULTS[key];
          } else {
            timerIntervals[key] = TIMER_DEFAULTS[key];
          }
        });

        // Other display settings
        const daysSelect = document.getElementById("settings-upcoming-days");
        const upcomingDays = daysSelect ? Number(daysSelect.value) : 5;

        const schemeRadio = document.querySelector("[name='color_scheme']:checked");
        const colorScheme = schemeRadio ? schemeRadio.value : "warm";

        const newDs = {
          ...adminHouseholdSettings.display_settings,
          active_screens: activeScreens,
          screen_order: screenOrder,
          timer_intervals: timerIntervals,
          upcoming_days: upcomingDays
        };

        const { data, error } = await client
          .from("households")
          .update({ color_scheme: colorScheme, display_settings: newDs })
          .eq("id", DISPLAY_HOUSEHOLD_ID)
          .select();
        if (error) {
          showToast("Error saving display settings.");
        } else if (!data || data.length === 0) {
          showToast("Warning: no rows updated — check household ID.");
        } else {
          adminHouseholdSettings.display_settings = newDs;
          adminHouseholdSettings.color_scheme = colorScheme;
          showToast("Display settings saved.");
        }
      } finally {
        displaySavePending = false;
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save"; }
      }
    }

    async function saveIntegrationsSection() {
      const client = getSupabaseClient();
      if (!client || integrationsSavePending || !adminHouseholdConfigLoaded) return;

      integrationsSavePending = true;
      const saveBtn = document.getElementById("settings-integrations-save");
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

      try {
        const calIdInput = document.getElementById("settings-google-cal-id");
        const newCalId = calIdInput ? calIdInput.value.trim() : "";

        adminHouseholdSettings.google_cal_id = newCalId;

        const { data, error } = await client
          .from("households")
          .update({ google_cal_id: newCalId || null })
          .eq("id", DISPLAY_HOUSEHOLD_ID)
          .select();
        if (error) {
          showToast("Error saving integration settings.");
        } else if (!data || data.length === 0) {
          showToast("Warning: no rows updated — check household ID.");
        } else {
          showToast("Integration settings saved.");
        }
      } finally {
        integrationsSavePending = false;
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save"; }
      }
    }

    let adminSyncing = false;

    async function runAdminSync() {
      if (adminSyncing) return;
      adminSyncing = true;
      const btn = document.getElementById("settings-sync-btn");
      if (btn) btn.classList.add("is-syncing");

      try {
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

        await refreshAdminData();
        localStorage.setItem(LAST_SYNCED_KEY, new Date().toISOString());
        updateAdminLastSyncedLabel();
        showToast("Sync complete.");
      } finally {
        adminSyncing = false;
        const b = document.getElementById("settings-sync-btn");
        if (b) b.classList.remove("is-syncing");
      }
    }

    function handleSettingsMemberListClick(event) {
      const removeBtn = event.target.closest("[data-member-remove]");
      if (removeBtn) {
        pendingMemberRemovalIndex = parseInt(removeBtn.getAttribute("data-member-remove"), 10);
        renderSettingsMembersList(adminHouseholdSettings.display_settings.members || []);
        return;
      }

      const cancelBtn = event.target.closest("[data-member-cancel]");
      if (cancelBtn) {
        pendingMemberRemovalIndex = null;
        renderSettingsMembersList(adminHouseholdSettings.display_settings.members || []);
        return;
      }

      const confirmBtn = event.target.closest("[data-member-confirm]");
      if (!confirmBtn) return;

      const idx = parseInt(confirmBtn.getAttribute("data-member-confirm"), 10);
      const members = adminHouseholdSettings.display_settings.members || [];
      if (!members[idx]) {
        return;
      }
      const updated = members.filter((_, i) => i !== idx);
      persistMemberList(updated, `${members[idx].name} removed.`);
    }

    async function handleSettingsMemberAdd() {
      const input = document.getElementById("settings-member-input");
      if (!input || membersSavePending) return;
      const name = input.value.trim();
      if (!name) return;

      const members = adminHouseholdSettings.display_settings.members || [];
      if (members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
        showToast(`"${name}" is already a member.`);
        return;
      }

      const color = PERSON_COLOR_PALETTE[members.length % PERSON_COLOR_PALETTE.length];
      const updated = [...members, { name, color }];
      const didSave = await persistMemberList(updated, `${name} added.`);
      if (didSave) {
        input.value = "";
        input.focus();
      }
    }

    function handleSettingsScreenOrderClick(event) {
      const btn = event.target.closest("[data-order-dir]");
      if (!btn || btn.disabled) return;

      const dir = btn.getAttribute("data-order-dir");
      const idx = parseInt(btn.getAttribute("data-order-index"), 10);
      const ds = adminHouseholdSettings.display_settings;
      const order = Array.isArray(ds.screen_order) ? [...ds.screen_order] : [...CONFIGURABLE_SCREENS];

      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= order.length) return;

      [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
      ds.screen_order = order;
      renderSettingsScreenOrder(order);
    }

    function enforceMinOneActiveScreen() {
      const checkboxes = Array.from(document.querySelectorAll("#settings-screen-toggles [type='checkbox']"));
      const checkedBoxes = checkboxes.filter((cb) => cb.checked);
      checkboxes.forEach((cb) => {
        // Disable the last checked box so the user can't uncheck it
        cb.disabled = checkedBoxes.length === 1 && cb.checked;
      });
    }

    function handleSettingsScreenToggleChange() {
      // Update state so renderSettingsScreenOrder shows the right active/inactive styling
      const ds = adminHouseholdSettings.display_settings;
      ds.active_screens = CONFIGURABLE_SCREENS.filter((name) => {
        const cb = document.querySelector(`[name="screen_${name}"]`);
        return cb && cb.checked;
      });
      const order = Array.isArray(ds.screen_order) ? ds.screen_order : [...CONFIGURABLE_SCREENS];
      renderSettingsScreenOrder(order);
      enforceMinOneActiveScreen();
    }

    function initSettingsListeners() {
      const memberList = document.getElementById("settings-members-list");
      if (memberList) memberList.addEventListener("click", handleSettingsMemberListClick);

      const memberAddBtn = document.getElementById("settings-member-add-btn");
      if (memberAddBtn) memberAddBtn.addEventListener("click", handleSettingsMemberAdd);

      const memberInput = document.getElementById("settings-member-input");
      if (memberInput) {
        memberInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); handleSettingsMemberAdd(); }
        });
      }

      const screenToggles = document.getElementById("settings-screen-toggles");
      if (screenToggles) screenToggles.addEventListener("change", handleSettingsScreenToggleChange);

      const screenOrder = document.getElementById("settings-screen-order");
      if (screenOrder) screenOrder.addEventListener("click", handleSettingsScreenOrderClick);

      const assistantSave = document.getElementById("settings-assistant-save");
      if (assistantSave) assistantSave.addEventListener("click", saveAssistantSection);

      const displaySave = document.getElementById("settings-display-save");
      if (displaySave) displaySave.addEventListener("click", saveDisplaySection);

      const integrationsSave = document.getElementById("settings-integrations-save");
      if (integrationsSave) integrationsSave.addEventListener("click", saveIntegrationsSection);

      const syncBtn = document.getElementById("settings-sync-btn");
      if (syncBtn) syncBtn.addEventListener("click", runAdminSync);
    }

    // ─────────────────────────────────────────────────────────────────────────

    function initAdminMode() {
      document.body.classList.add("admin-mode");
      displayApp.hidden = true;
      adminApp.hidden = false;
      setAdminScreen("todos");
      adminNavButtons.forEach((button) => button.addEventListener("click", handleAdminNavClick));
      adminActiveList.addEventListener("click", handleAdminActiveListClick);
      adminActiveList.addEventListener("keydown", handleAdminActiveListKeydown);
      adminMealList.addEventListener("click", handleAdminMealListClick);
      if (adminMealNoteWrap) adminMealNoteWrap.addEventListener("click", handleAdminMealNoteClick);
      adminWeekPrevBtn.addEventListener("click", handleAdminWeekPrev);
      adminWeekNextBtn.addEventListener("click", handleAdminWeekNext);
      if (adminWeekTodayBtn) adminWeekTodayBtn.addEventListener("click", handleAdminWeekToday);
      adminCalEventList.addEventListener("click", handleAdminCountdownCalListClick);
      adminSavedCountdownList.addEventListener("click", handleAdminSavedCountdownListClick);
      if (adminTodoAddButton) adminTodoAddButton.addEventListener("click", openAddTodoModal);
      const archiveMonthPrev = document.getElementById("admin-archive-month-prev");
      const archiveMonthNext = document.getElementById("admin-archive-month-next");
      if (archiveMonthPrev) archiveMonthPrev.addEventListener("click", handleArchiveMonthPrev);
      if (archiveMonthNext) archiveMonthNext.addEventListener("click", handleArchiveMonthNext);
      if (adminCountdownAddButton) adminCountdownAddButton.addEventListener("click", () => openAddCountdownModal());
      const adminModal = document.getElementById("admin-modal");
      if (adminModal) {
        adminModal.addEventListener("click", handleAdminModalClick);
        adminModal.addEventListener("submit", handleAdminModalSubmit);
      }
      document.addEventListener("keydown", handleEscapeKey);
      const lightbox = document.getElementById("admin-lightbox");
      if (lightbox) lightbox.addEventListener("click", closeAdminLightbox);
      const adminCalPrevBtn = document.getElementById("admin-cal-prev");
      const adminCalNextBtn = document.getElementById("admin-cal-next");
      if (adminCalPrevBtn) adminCalPrevBtn.addEventListener("click", handleAdminCalPrev);
      if (adminCalNextBtn) adminCalNextBtn.addEventListener("click", handleAdminCalNext);
      const adminVersionEl = document.getElementById("admin-version-label");
      if (adminVersionEl) adminVersionEl.textContent = `v${VERSION}`;
      setAdminConfigDependentUiDisabled(true);
      updateAdminLastSyncedLabel();
      window.setInterval(updateAdminLastSyncedLabel, 30000);
      loadAdminTodos();
      loadAdminMealPlan();
      initSettingsListeners();
      ensureAdminHouseholdConfigLoaded()
        .then(() => {
          if (adminScreen === "settings") {
            loadAdminSettings();
          }
        })
        .catch(() => showToast("Couldn’t load household settings."));
      refreshIcons();
    }
