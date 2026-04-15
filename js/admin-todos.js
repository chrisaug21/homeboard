    let lastCompletedTodo = null;
    let adminArchivedTodos = [];
    let adminTodoUndoHooksInitialized = false;

    function clearLastCompletedTodo() {
      lastCompletedTodo = null;
    }

    function setLastCompletedTodo(payload) {
      lastCompletedTodo = payload;
    }

    function isUndoableArchivedTodo(todo) {
      return !!(
        todo &&
        lastCompletedTodo &&
        lastCompletedTodo.completedTodoId === todo.id
      );
    }

    function initAdminTodoUndoLifecycleHooks() {
      if (adminTodoUndoHooksInitialized) {
        return;
      }

      if (typeof closeAdminModal !== "function" || typeof setAdminScreen !== "function") {
        window.setTimeout(initAdminTodoUndoLifecycleHooks, 0);
        return;
      }

      const originalCloseAdminModal = closeAdminModal;
      closeAdminModal = function wrappedCloseAdminModal(...args) {
        const modal = document.getElementById("admin-modal");
        if (modal && !modal.hidden) {
          clearLastCompletedTodo();
        }
        return originalCloseAdminModal.apply(this, args);
      };

      const originalSetAdminScreen = setAdminScreen;
      setAdminScreen = function wrappedSetAdminScreen(nextScreen, ...args) {
        if (nextScreen !== adminScreen) {
          clearLastCompletedTodo();
        }
        return originalSetAdminScreen.call(this, nextScreen, ...args);
      };

      const archivedList = document.getElementById("admin-archived-list");
      if (archivedList) {
        archivedList.addEventListener("click", handleAdminArchivedListClick);
        archivedList.addEventListener("keydown", handleAdminArchivedListKeydown);
      }

      adminTodoUndoHooksInitialized = true;
    }

    document.addEventListener("DOMContentLoaded", initAdminTodoUndoLifecycleHooks);

    function buildAdminTodoSkeletonHTML() {
      const activeCard = () => `
        <article class="admin-todo-card admin-todo-card--active admin-skeleton-card" aria-hidden="true">
          <div class="todo-check-btn"><div class="todo-check"></div></div>
          <div class="admin-todo-body">
            <div class="sk" style="width:72%;height:18px;"></div>
            <div class="admin-todo-meta">
              <span class="sk" style="width:92px;height:28px;border-radius:12px;"></span>
              <span class="sk" style="width:74px;height:28px;border-radius:12px;"></span>
            </div>
          </div>
        </article>
      `;

      const archivedCard = () => `
        <article class="admin-todo-card admin-skeleton-card" aria-hidden="true">
          <div class="admin-todo-body">
            <div class="sk" style="width:68%;height:18px;"></div>
            <div class="admin-todo-meta">
              <span class="sk" style="width:90px;height:28px;border-radius:12px;"></span>
            </div>
          </div>
        </article>
      `;

      return {
        active: Array.from({ length: 4 }, activeCard).join(""),
        archived: Array.from({ length: 3 }, archivedCard).join("")
      };
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

    function formatAdminTodoCompletionLabel(todo) {
      const completedValue = todo.completed_at || todo.archived_at;
      if (!completedValue) {
        return "";
      }

      const completedDate = new Date(completedValue);
      if (Number.isNaN(completedDate.getTime())) {
        return "";
      }

      return `Completed ${new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric"
      }).format(completedDate)}`;
    }

    function buildArchivedTodoDetailModalHTML(todo) {
      const notes = String(todo?.description || "").trim();
      const completionLabel = formatAdminTodoCompletionLabel(todo) || "Completed date unavailable";
      const recurrenceLabel = formatTodoRecurrenceLabel(todo?.recurrence_type, todo?.recurrence_config);
      const rows = [
        `
          <div class="admin-detail-row">
            <span class="admin-detail-label">Title</span>
            <span class="admin-detail-value">${escapeHtml(todo?.title || "Untitled task")}</span>
          </div>
        `
      ];

      if (notes) {
        rows.push(`
          <div class="admin-detail-row">
            <span class="admin-detail-label">Notes</span>
            <span class="admin-detail-value">${escapeHtml(notes)}</span>
          </div>
        `);
      }

      if (todo?.assignee) {
        rows.push(`
          <div class="admin-detail-row">
            <span class="admin-detail-label">Assignee</span>
            <span class="admin-detail-value">${escapeHtml(todo.assignee)}</span>
          </div>
        `);
      }

      rows.push(`
        <div class="admin-detail-row">
          <span class="admin-detail-label">Due date</span>
          <span class="admin-detail-value">${escapeHtml(formatLongDate(todo?.due_date))}</span>
        </div>
      `);

      rows.push(`
        <div class="admin-detail-row">
          <span class="admin-detail-label">Completion date</span>
          <span class="admin-detail-value">${escapeHtml(completionLabel)}</span>
        </div>
      `);

      if (recurrenceLabel) {
        rows.push(`
          <div class="admin-detail-row">
            <span class="admin-detail-label">Repeats</span>
            <span class="admin-detail-value">${escapeHtml(recurrenceLabel)}</span>
          </div>
        `);
      }

      return `
        <div class="admin-detail-stack">
          ${rows.join("")}
          <div class="admin-actions admin-actions--end">
            <button class="admin-button admin-button--primary" type="button" data-action="close-modal">Close</button>
          </div>
        </div>
      `;
    }

    function buildAdminTodoDeleteModalHTML(todo) {
      const title = escapeHtml(todo?.title || "this todo");

      if (todo?.recurrence_type) {
        return `
          <div class="admin-detail-stack">
            <p class="admin-field-hint">Choose what to remove for <strong>${title}</strong>.</p>
            <div class="admin-actions admin-actions--stack">
              <button class="admin-button admin-button--secondary" type="button"
                      data-action="remove-todo-occurrence" data-todo-id="${escapeHtml(todo.id)}">
                Remove just this occurrence
              </button>
              <button class="admin-button admin-button--danger" type="button"
                      data-action="remove-todo-series" data-todo-id="${escapeHtml(todo.id)}">
                Stop repeating and remove all
              </button>
              <button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="admin-detail-stack">
          <p class="admin-field-hint">Remove this todo?</p>
          <div class="admin-actions admin-actions--split">
            <button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="admin-button admin-button--danger" type="button"
                    data-action="confirm-remove-todo" data-todo-id="${escapeHtml(todo.id)}">
              Remove
            </button>
          </div>
        </div>
      `;
    }

    function renderAdminTodoCard(todo, options) {
      const title = escapeHtml(todo.title || "Untitled task");
      const assignee = todo.assignee ? escapeHtml(todo.assignee) : "Unassigned";
      const hasDescription = !!String(todo.description || "").trim();
      const overdueClass = options.showComplete && isTodoOverdue(todo.due_date)
        ? " admin-todo-card--overdue"
        : "";

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

      const completionLabel = !options.showComplete
        ? formatAdminTodoCompletionLabel(todo)
        : "";
      const completionMarkup = completionLabel
        ? `<span class="admin-pill admin-pill--completed">${escapeHtml(completionLabel)}</span>`
        : "";
      const undoAction = !options.showComplete && isUndoableArchivedTodo(todo) ? `
        <div style="margin-top:6px;">
          <button class="admin-button admin-button--small admin-button--secondary" type="button"
                  data-action="undo-complete-todo" data-todo-id="${escapeHtml(todo.id)}">
            Undo completion
          </button>
        </div>
      ` : "";
      const meta = `
        <div class="admin-todo-meta">
          ${buildAdminAssigneePill(assignee)}
          ${dueMarkup}
          ${completionMarkup}
        </div>
      `;
      const infoIcon = hasDescription
        ? `<span class="admin-todo-detail-indicator" aria-hidden="true"><i data-lucide="info"></i></span>`
        : "";
      const repeatIcon = options.showComplete && todo.recurrence_type
        ? `<span class="admin-todo-detail-indicator admin-todo-detail-indicator--muted" aria-hidden="true"><i data-lucide="repeat-2"></i></span>`
        : "";
      const indicators = infoIcon || repeatIcon
        ? `<div style="display:flex;gap:4px;flex-shrink:0;">${infoIcon}${repeatIcon}</div>`
        : "";
      const titleMarkup = `
        <div class="admin-todo-title-row">
          <div class="admin-todo-title">${title}</div>
          ${indicators}
        </div>
      `;

      if (options.showComplete) {
        return `
          <article class="admin-todo-card admin-todo-card--active${overdueClass}" data-todo-id="${escapeHtml(todo.id)}" role="button" tabindex="0" aria-label="Edit: ${title}">
            <button class="todo-check-btn" type="button" data-action="archive-todo" data-todo-id="${escapeHtml(todo.id)}" aria-label="Complete ${title}">
              <div class="todo-check">
                <svg class="todo-check-icon" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M1 5L4.5 8.5L11 1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </button>
            <div class="admin-todo-body">
              ${titleMarkup}
              ${meta}
              <div class="admin-todo-secondary-actions">
                <button class="admin-todo-remove-btn" type="button"
                        data-action="prompt-remove-todo" data-todo-id="${escapeHtml(todo.id)}"
                        aria-label="Remove ${title}">
                  <i data-lucide="trash-2"></i>
                  <span>Remove</span>
                </button>
              </div>
            </div>
          </article>
        `;
      }

      return `
        <article class="admin-todo-card admin-todo-card--archived" data-todo-id="${escapeHtml(todo.id)}" role="button" tabindex="0" aria-label="View details for ${title}">
          <div class="admin-todo-body">
            ${titleMarkup}
            ${meta}
            ${undoAction}
          </div>
        </article>
      `;
    }

    function renderAdminTodoLists(todoGroups) {
      adminTodos = todoGroups.active;
      adminArchivedTodos = todoGroups.archived;
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
      refreshIcons();
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
      const requestId = ++adminTodoLoadRequestId;
      adminActiveSummary.textContent = "Loading household tasks…";
      adminArchivedSummary.textContent = "Loading completed household tasks…";
      const skeleton = buildAdminTodoSkeletonHTML();
      adminActiveList.innerHTML = skeleton.active;
      adminArchivedList.innerHTML = skeleton.archived;

      try {
        const todoGroups = await fetchAdminTodos();

        if (requestId !== adminTodoLoadRequestId) {
          return;
        }

        if (!todoGroups) {
          adminActiveSummary.textContent = "Couldn't load household tasks.";
          adminArchivedSummary.textContent = "Couldn't load completed household tasks.";
          adminActiveList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
          adminArchivedList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
          return;
        }

        renderAdminTodoLists(todoGroups);

        ensureAdminHouseholdConfigLoaded()
          .then(() => {
            if (requestId === adminTodoLoadRequestId) {
              renderAdminTodoLists(todoGroups);
            }
          })
          .catch(() => {});
      } catch (error) {
        if (requestId !== adminTodoLoadRequestId) {
          return;
        }

        console.error("Failed to load admin todos.", error);
        adminActiveSummary.textContent = "Couldn't load household tasks.";
        adminArchivedSummary.textContent = "Couldn't load completed household tasks.";
        adminActiveList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
        adminArchivedList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
      }
    }

    async function createAdminTodo(formData) {
      const client = getSupabaseClient();

      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      const title = String(formData.get("title") || "").trim();
      const description = String(formData.get("description") || "").trim();
      const assignee = String(formData.get("assignee") || "").trim();
      const dueDate = String(formData.get("due_date") || "").trim();

      if (!title || adminTodoWritePending) {
        return;
      }

      const recurrenceData = readTodoRecurrenceFromFormData(formData);
      if (!validateTodoRecurrenceFromData(recurrenceData, formData)) {
        return;
      }

      adminTodoWritePending = true;
      setModalSaving(true);

      const { error } = await client
        .from("todos")
        .insert({
          household_id: TODO_HOUSEHOLD_ID,
          title,
          description: description || null,
          assignee: assignee || null,
          due_date: dueDate || null,
          recurrence_type: recurrenceData.recurrence_type,
          recurrence_config: recurrenceData.recurrence_config
        });

      adminTodoWritePending = false;

      if (error) {
        setModalSaving(false, "Add Todo");
        showToast(friendlySaveMessage());
        return;
      }

      closeAdminModal();
      await loadAdminTodos();
    }

    async function updateAdminTodo(id, formData) {
      const client = getSupabaseClient();
      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      const title = String(formData.get("title") || "").trim();
      const description = String(formData.get("description") || "").trim();
      const assignee = String(formData.get("assignee") || "").trim();
      const dueDate = String(formData.get("due_date") || "").trim();

      if (!title || adminTodoWritePending) return;

      const recurrenceData = readTodoRecurrenceFromFormData(formData);
      if (!validateTodoRecurrenceFromData(recurrenceData, formData)) {
        return;
      }

      adminTodoWritePending = true;
      setModalSaving(true);

      const { error } = await client
        .from("todos")
        .update({
          title,
          description: description || null,
          assignee: assignee || null,
          due_date: dueDate || null,
          recurrence_type: recurrenceData.recurrence_type,
          recurrence_config: recurrenceData.recurrence_config
        })
        .eq("id", id)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null)
        .is("deleted_at", null);

      adminTodoWritePending = false;

      if (error) {
        setModalSaving(false, "Save Changes");
        showToast(friendlySaveMessage());
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

      // Recurrence pre-population
      const recurrenceEnabled = isEdit && !!todo.recurrence_type;
      const recurrenceType = (isEdit && todo.recurrence_type) || "offset";
      const recurrenceConfig = (isEdit && todo.recurrence_config) || {};

      let intervalValue = 1;
      let intervalUnit = "days";
      if (recurrenceType === "offset" && recurrenceConfig.interval_days) {
        const d = recurrenceConfig.interval_days;
        if (d % 30 === 0 && d >= 30) {
          intervalValue = d / 30;
          intervalUnit = "months";
        } else if (d % 7 === 0 && d >= 7) {
          intervalValue = d / 7;
          intervalUnit = "weeks";
        } else {
          intervalValue = d;
        }
      }
      const initialHintUnit = intervalUnit === "weeks"
        ? (intervalValue === 1 ? "week" : "weeks")
        : intervalUnit === "months"
          ? (intervalValue === 1 ? "month" : "months")
          : (intervalValue === 1 ? "day" : "days");
      const initialHintText = `Next occurrence will be created ${intervalValue} ${initialHintUnit} after completion.`;

      const scheduledFreq = (recurrenceType === "scheduled" && recurrenceConfig.frequency) || "weekly";
      const dayOfWeek = (scheduledFreq === "weekly" && recurrenceConfig.day_of_week !== undefined)
        ? recurrenceConfig.day_of_week
        : 1;
      const dayOfMonth = (scheduledFreq === "monthly" && recurrenceConfig.day_of_month)
        ? recurrenceConfig.day_of_month
        : 1;

      const dayOptions = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        .map((d, i) => `<option value="${i}"${dayOfWeek === i ? " selected" : ""}>${d}</option>`)
        .join("");

      return `
        <form data-modal-form="todo" novalidate>
          <div class="admin-field">
            <label for="modal-todo-title">Title</label>
            <input id="modal-todo-title" name="title" type="text" maxlength="140" required
              value="${isEdit ? escapeHtml(todo.title || "") : ""}"
              placeholder="${isEdit ? "" : "What needs doing?"}">
          </div>
          <div class="admin-field">
            <label for="modal-todo-description">Notes</label>
            <textarea id="modal-todo-description" name="description" rows="3" maxlength="2000" placeholder="Add details if this task needs context...">${isEdit ? escapeHtml(todo.description || "") : ""}</textarea>
          </div>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="modal-todo-assignee">Assignee</label>
              <select id="modal-todo-assignee" name="assignee">
                ${assigneeOptions}
              </select>
            </div>
            <div class="admin-field">
              <label for="modal-todo-due" id="modal-todo-due-label">${recurrenceEnabled ? "First due date" : "Due date"}</label>
              <input id="modal-todo-due" name="due_date" type="date"
                value="${isEdit ? escapeHtml(todo.due_date || "") : ""}"
                ${recurrenceEnabled ? "required" : ""}>
            </div>
          </div>
          <hr style="border:none;border-top:1px solid var(--border);margin:12px 0 8px;">
          <label class="admin-settings-toggle admin-settings-toggle--block">
            <input type="checkbox" name="recurrence_enabled" id="modal-todo-recurrence"
                   onchange="handleTodoRecurrenceChange(this.form)"
                   ${recurrenceEnabled ? "checked" : ""}>
            <span>Repeat this task</span>
          </label>
          <div id="modal-todo-recurrence-section"${!recurrenceEnabled ? " hidden" : ""}>
            <div class="admin-field">
              <label for="modal-todo-recurrence-type">Repeats</label>
              <select id="modal-todo-recurrence-type" name="recurrence_type"
                      onchange="handleTodoRecurrenceTypeChange(this.form)">
                <option value="offset"${recurrenceType !== "scheduled" ? " selected" : ""}>After an interval</option>
                <option value="scheduled"${recurrenceType === "scheduled" ? " selected" : ""}>On a set schedule</option>
              </select>
            </div>
            <div id="modal-todo-offset-config"${recurrenceType === "scheduled" ? " hidden" : ""}>
              <div class="admin-form-row">
                <div class="admin-field">
                  <label for="modal-todo-interval-value">Repeat every</label>
                  <input type="number" id="modal-todo-interval-value" name="interval_value"
                         min="1" max="365" value="${intervalValue}"
                         oninput="handleTodoIntervalChange(this.form)">
                </div>
                <div class="admin-field">
                  <label for="modal-todo-interval-unit">&nbsp;</label>
                  <select id="modal-todo-interval-unit" name="interval_unit"
                          onchange="handleTodoIntervalChange(this.form)">
                    <option value="days"${intervalUnit === "days" ? " selected" : ""}>days</option>
                    <option value="weeks"${intervalUnit === "weeks" ? " selected" : ""}>weeks</option>
                    <option value="months"${intervalUnit === "months" ? " selected" : ""}>months</option>
                  </select>
                </div>
              </div>
              <p class="admin-field-hint" id="modal-todo-interval-hint">${initialHintText}</p>
            </div>
            <div id="modal-todo-scheduled-config"${recurrenceType !== "scheduled" ? " hidden" : ""}>
              <div class="admin-field">
                <label for="modal-todo-scheduled-freq">Frequency</label>
                <select id="modal-todo-scheduled-freq" name="scheduled_frequency"
                        onchange="handleTodoScheduledFreqChange(this.form)">
                  <option value="weekly"${scheduledFreq !== "monthly" ? " selected" : ""}>Every week on a specific day</option>
                  <option value="monthly"${scheduledFreq === "monthly" ? " selected" : ""}>Every month on a specific date</option>
                </select>
              </div>
              <div id="modal-todo-weekly-config"${scheduledFreq === "monthly" ? " hidden" : ""}>
                <div class="admin-field">
                  <label for="modal-todo-day-of-week">Day of the week</label>
                  <select id="modal-todo-day-of-week" name="day_of_week">
                    ${dayOptions}
                  </select>
                </div>
              </div>
              <div id="modal-todo-monthly-config"${scheduledFreq !== "monthly" ? " hidden" : ""}>
                <div class="admin-field">
                  <label for="modal-todo-day-of-month">Day of the month (1–28)</label>
                  <input type="number" id="modal-todo-day-of-month" name="day_of_month"
                         min="1" max="28" value="${dayOfMonth}">
                  <p class="admin-field-hint">Use a day between 1 and 28 so it works in February.</p>
                </div>
              </div>
            </div>
          </div>
          <div class="admin-actions">
            <button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="admin-button admin-button--primary" type="submit">${isEdit ? "Save Changes" : "Add Todo"}</button>
          </div>
        </form>
      `;
    }

    function handleTodoRecurrenceChange(form) {
      if (!form) return;
      const enabledEl = form.querySelector('[name="recurrence_enabled"]');
      const enabled = enabledEl && enabledEl.checked;
      const section = document.getElementById("modal-todo-recurrence-section");
      const dueLabel = document.getElementById("modal-todo-due-label");
      const dueInput = form.querySelector('[name="due_date"]');
      if (section) section.hidden = !enabled;
      if (dueLabel) dueLabel.textContent = enabled ? "First due date" : "Due date";
      if (dueInput) dueInput.required = !!enabled;
    }

    function handleTodoRecurrenceTypeChange(form) {
      if (!form) return;
      const typeEl = form.querySelector('[name="recurrence_type"]');
      if (!typeEl) return;
      const type = typeEl.value;
      const offsetConfig = document.getElementById("modal-todo-offset-config");
      const scheduledConfig = document.getElementById("modal-todo-scheduled-config");
      if (offsetConfig) offsetConfig.hidden = type !== "offset";
      if (scheduledConfig) scheduledConfig.hidden = type !== "scheduled";
    }

    function handleTodoScheduledFreqChange(form) {
      if (!form) return;
      const freqEl = form.querySelector('[name="scheduled_frequency"]');
      if (!freqEl) return;
      const freq = freqEl.value;
      const weeklyConfig = document.getElementById("modal-todo-weekly-config");
      const monthlyConfig = document.getElementById("modal-todo-monthly-config");
      if (weeklyConfig) weeklyConfig.hidden = freq !== "weekly";
      if (monthlyConfig) monthlyConfig.hidden = freq !== "monthly";
    }

    function handleTodoIntervalChange(form) {
      if (!form) return;
      const hint = document.getElementById("modal-todo-interval-hint");
      if (!hint) return;
      const valEl = form.querySelector('[name="interval_value"]');
      const unitEl = form.querySelector('[name="interval_unit"]');
      const val = parseInt(String(valEl ? valEl.value : "1").trim(), 10) || 1;
      const unit = unitEl ? unitEl.value : "days";
      const unitLabel = unit === "weeks"
        ? (val === 1 ? "week" : "weeks")
        : unit === "months"
          ? (val === 1 ? "month" : "months")
          : (val === 1 ? "day" : "days");
      hint.textContent = `Next occurrence will be created ${val} ${unitLabel} after completion.`;
    }

    function readTodoRecurrenceFromFormData(formData) {
      const enabled = formData.get("recurrence_enabled") === "on";
      if (!enabled) {
        return { recurrence_type: null, recurrence_config: null };
      }

      const type = String(formData.get("recurrence_type") || "offset").trim();

      if (type === "offset") {
        const rawVal = parseInt(String(formData.get("interval_value") || "1").trim(), 10);
        const intervalValue = Number.isNaN(rawVal) ? 1 : rawVal;
        const unit = String(formData.get("interval_unit") || "days").trim();
        const intervalDays = unit === "weeks" ? intervalValue * 7 : unit === "months" ? intervalValue * 30 : intervalValue;
        return { recurrence_type: "offset", recurrence_config: { interval_days: intervalDays } };
      }

      if (type === "scheduled") {
        const freq = String(formData.get("scheduled_frequency") || "weekly").trim();
        if (freq === "monthly") {
          const rawDom = parseInt(String(formData.get("day_of_month") || "1").trim(), 10);
          const dayOfMonth = Number.isNaN(rawDom) ? 1 : rawDom;
          return { recurrence_type: "scheduled", recurrence_config: { frequency: "monthly", day_of_month: dayOfMonth } };
        }
        const rawDow = parseInt(String(formData.get("day_of_week") || "1").trim(), 10);
        const dayOfWeek = Number.isNaN(rawDow) ? 1 : rawDow;
        return { recurrence_type: "scheduled", recurrence_config: { frequency: "weekly", day_of_week: dayOfWeek } };
      }

      return { recurrence_type: null, recurrence_config: null };
    }

    function validateTodoRecurrenceFromData(recurrenceData, formData) {
      if (!recurrenceData.recurrence_type) return true;

      const form = document.querySelector('#admin-modal-body form[data-modal-form="todo"]');

      const dueValue = String(formData.get("due_date") || "").trim();
      if (!dueValue) {
        const dueInput = form && form.querySelector('[name="due_date"]');
        setFieldError(dueInput, "A start date is required when repeating is turned on.");
        if (dueInput) dueInput.focus();
        return false;
      }

      if (recurrenceData.recurrence_type === "offset") {
        const intervalDays = recurrenceData.recurrence_config.interval_days;
        if (!intervalDays || intervalDays < 1 || !Number.isInteger(intervalDays)) {
          const valEl = form && form.querySelector('[name="interval_value"]');
          setFieldError(valEl, "Enter a number of 1 or more.");
          if (valEl) valEl.focus();
          return false;
        }
      }

      if (
        recurrenceData.recurrence_type === "scheduled" &&
        recurrenceData.recurrence_config.frequency === "monthly"
      ) {
        const dom = recurrenceData.recurrence_config.day_of_month;
        if (!dom || dom < 1 || dom > 28 || !Number.isInteger(dom)) {
          const domEl = form && form.querySelector('[name="day_of_month"]');
          setFieldError(domEl, "Enter a day between 1 and 28.");
          if (domEl) domEl.focus();
          return false;
        }
      }

      return true;
    }

    async function openAddTodoModal() {
      try {
        await ensureAdminHouseholdConfigLoaded();
      } catch {
        showToast(friendlyLoadMessage());
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
        showToast(friendlyLoadMessage());
        return;
      }
      adminModalType = "edit-todo";
      adminModalContext = { id: todo.id };
      openAdminModal("Edit Todo", buildTodoFormHTML(todo));
    }

    function openAdminTodoDeleteModal(todo) {
      adminModalType = "delete-todo";
      adminModalContext = { id: todo.id };
      openAdminModal("Remove Todo", buildAdminTodoDeleteModalHTML(todo));
    }

    function openArchivedTodoDetailModal(todo) {
      adminModalType = "archived-todo-detail";
      adminModalContext = { id: todo.id };
      openAdminModal("Completed Todo", buildArchivedTodoDetailModalHTML(todo));
    }

    async function archiveAdminTodoWithAnimation(todoId, cardEl) {
      const client = getSupabaseClient();
      if (!client || adminTodoWritePending) {
        if (!client) showToast(friendlySaveMessage());
        return;
      }

      const todo = adminTodos.find((t) => t.id === todoId);
      const isRecurring = !!(todo && todo.recurrence_type);
      clearLastCompletedTodo();

      adminTodoWritePending = true;
      cardEl.classList.add("is-completing");

      const now = new Date().toISOString();
      const archivePayload = isRecurring
        ? { archived_at: now, completed_at: now }
        : { archived_at: now };

      const { error: archiveError } = await client
        .from("todos")
        .update(archivePayload)
        .eq("id", todoId)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null)
        .is("deleted_at", null);

      if (archiveError) {
        adminTodoWritePending = false;
        cardEl.classList.remove("is-completing");
        showToast(friendlySaveMessage());
        return;
      }

      if (isRecurring) {
        const nextDueDate = calculateNextDueDate(new Date(), todo.recurrence_type, todo.recurrence_config, todo.due_date);
        const templateId = todo.recurrence_template_id || todo.id;

        const { data: generatedTodo, error: insertError } = await client
          .from("todos")
          .insert({
            household_id: TODO_HOUSEHOLD_ID,
            title: todo.title,
            description: todo.description || null,
            assignee: todo.assignee || null,
            recurrence_type: todo.recurrence_type,
            recurrence_config: todo.recurrence_config,
            recurrence_template_id: templateId,
            due_date: nextDueDate
          })
          .select("id")
          .single();

        if (insertError) {
          // Best-effort rollback: undo the archive so the card stays active.
          await client
            .from("todos")
            .update({ archived_at: null, completed_at: null, completed: false })
            .eq("id", todoId)
            .eq("household_id", TODO_HOUSEHOLD_ID)
            .is("deleted_at", null);
          adminTodoWritePending = false;
          cardEl.classList.remove("is-completing");
          showToast(friendlySaveMessage());
          return;
        }

        setLastCompletedTodo({
          type: "recurring",
          completedTodoId: todoId,
          generatedTodoId: generatedTodo?.id || null,
          title: todo.title || ""
        });
      } else {
        setLastCompletedTodo({
          type: "non-recurring",
          completedTodoId: todoId,
          generatedTodoId: null,
          title: todo?.title || ""
        });
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

      const removeBtn = event.target.closest("[data-action='prompt-remove-todo']");
      if (removeBtn) {
        const todoId = removeBtn.getAttribute("data-todo-id");
        const todo = adminTodos.find((item) => item.id === todoId);
        if (todo) {
          openAdminTodoDeleteModal(todo);
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

    function handleAdminArchivedListClick(event) {
      const undoBtn = event.target.closest("[data-action='undo-complete-todo']");
      if (undoBtn) {
        undoAdminTodoCompletion(undoBtn.getAttribute("data-todo-id"));
        return;
      }

      const card = event.target.closest(".admin-todo-card--archived");
      if (!card) {
        return;
      }

      const todo = adminArchivedTodos.find((item) => item.id === card.getAttribute("data-todo-id"));
      if (todo) {
        openArchivedTodoDetailModal(todo);
      }
    }

    function handleAdminArchivedListKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.key === " ") event.preventDefault();

      const undoBtn = event.target.closest("[data-action='undo-complete-todo']");
      if (undoBtn) {
        undoAdminTodoCompletion(undoBtn.getAttribute("data-todo-id"));
        return;
      }

      const card = event.target.closest(".admin-todo-card--archived");
      if (!card) {
        return;
      }

      const todo = adminArchivedTodos.find((item) => item.id === card.getAttribute("data-todo-id"));
      if (todo) {
        openArchivedTodoDetailModal(todo);
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

      const removeBtn = event.target.closest("[data-action='prompt-remove-todo']");
      if (removeBtn) {
        const todoId = removeBtn.getAttribute("data-todo-id");
        const todo = adminTodos.find((item) => item.id === todoId);
        if (todo) {
          openAdminTodoDeleteModal(todo);
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

    async function fetchAdminTodos() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("todos")
        .select("id, title, description, assignee, due_date, archived_at, completed_at, deleted_at, created_at, recurrence_type, recurrence_config, recurrence_template_id")
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      const active = [];
      const archived = [];

      data.forEach((todo) => {
        if (todo.deleted_at) {
          return;
        }

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

    async function undoAdminTodoCompletion(todoId) {
      const client = getSupabaseClient();
      if (!client || adminTodoWritePending || !lastCompletedTodo) {
        if (!client) showToast(friendlySaveMessage());
        return;
      }

      if (lastCompletedTodo.completedTodoId !== todoId) {
        return;
      }

      const completedTodo = adminArchivedTodos.find((todo) => todo.id === todoId);
      if (!completedTodo) {
        return;
      }

      adminTodoWritePending = true;

      if (lastCompletedTodo.type === "non-recurring") {
        const { error } = await client
          .from("todos")
          .update({ archived_at: null, completed: false })
          .eq("id", todoId)
          .eq("household_id", TODO_HOUSEHOLD_ID)
          .is("deleted_at", null);

        adminTodoWritePending = false;

        if (error) {
          showToast(friendlySaveMessage());
          return;
        }

        clearLastCompletedTodo();
        await loadAdminTodos();
        return;
      }

      const originalArchivedAt = completedTodo.archived_at || new Date().toISOString();
      const originalCompletedAt = completedTodo.completed_at || originalArchivedAt;
      const { error: unarchiveError } = await client
        .from("todos")
        .update({ archived_at: null, completed_at: null, completed: false })
        .eq("id", todoId)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("deleted_at", null);

      if (unarchiveError) {
        adminTodoWritePending = false;
        showToast(friendlySaveMessage());
        return;
      }

      if (!lastCompletedTodo.generatedTodoId) {
        await client
          .from("todos")
          .update({ archived_at: originalArchivedAt, completed_at: originalCompletedAt, completed: true })
          .eq("id", todoId)
          .eq("household_id", TODO_HOUSEHOLD_ID)
          .is("deleted_at", null);

        adminTodoWritePending = false;
        await loadAdminTodos();
        showToast(friendlySaveMessage());
        return;
      }

      const { data: deletedTodo, error: deleteError } = await client
        .from("todos")
        .delete()
        .eq("id", lastCompletedTodo.generatedTodoId)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("deleted_at", null)
        .is("archived_at", null)
        .select("id")
        .single();

      if (deleteError || !deletedTodo?.id) {
        await client
          .from("todos")
          .update({ archived_at: originalArchivedAt, completed_at: originalCompletedAt, completed: true })
          .eq("id", todoId)
          .eq("household_id", TODO_HOUSEHOLD_ID)
          .is("deleted_at", null);

        adminTodoWritePending = false;
        await loadAdminTodos();
        showToast(friendlySaveMessage());
        return;
      }

      adminTodoWritePending = false;
      clearLastCompletedTodo();
      await loadAdminTodos();
    }

    async function removeAdminTodo(todoId) {
      const client = getSupabaseClient();
      if (!client || adminTodoWritePending) {
        if (!client) showToast(friendlySaveMessage());
        return false;
      }

      adminTodoWritePending = true;
      const now = new Date().toISOString();
      const { error } = await client
        .from("todos")
        .update({ deleted_at: now })
        .eq("id", todoId)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null)
        .is("deleted_at", null);

      adminTodoWritePending = false;

      if (error) {
        showToast(friendlySaveMessage());
        return false;
      }

      closeAdminModal();
      await loadAdminTodos();
      return true;
    }

    async function removeAdminRecurringTodoOccurrence(todoId) {
      const client = getSupabaseClient();
      if (!client || adminTodoWritePending) {
        if (!client) showToast(friendlySaveMessage());
        return false;
      }

      const todo = adminTodos.find((t) => t.id === todoId);
      if (!todo) return false;

      adminTodoWritePending = true;
      const now = new Date().toISOString();
      const templateId = todo.recurrence_template_id || todo.id;

      const { error: deleteError } = await client
        .from("todos")
        .update({ deleted_at: now })
        .eq("id", todoId)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null)
        .is("deleted_at", null);

      if (deleteError) {
        adminTodoWritePending = false;
        showToast(friendlySaveMessage());
        return false;
      }

      const nextDueDate = calculateNextDueDate(new Date(), todo.recurrence_type, todo.recurrence_config, todo.due_date);
      const { error: insertError } = await client
        .from("todos")
        .insert({
          household_id: TODO_HOUSEHOLD_ID,
          title: todo.title,
          description: todo.description || null,
          assignee: todo.assignee || null,
          recurrence_type: todo.recurrence_type,
          recurrence_config: todo.recurrence_config,
          recurrence_template_id: templateId,
          due_date: nextDueDate
        });

      if (insertError) {
        await client
          .from("todos")
          .update({ deleted_at: null })
          .eq("id", todoId)
          .eq("household_id", TODO_HOUSEHOLD_ID);
        adminTodoWritePending = false;
        showToast(friendlySaveMessage());
        return false;
      }

      adminTodoWritePending = false;
      closeAdminModal();
      await loadAdminTodos();
      return true;
    }

    async function removeAdminTodoSeries(todoId) {
      const client = getSupabaseClient();
      if (!client || adminTodoWritePending) {
        if (!client) showToast(friendlySaveMessage());
        return false;
      }

      const todo = adminTodos.find((t) => t.id === todoId);
      if (!todo) return false;

      adminTodoWritePending = true;
      const now = new Date().toISOString();
      const templateId = todo.recurrence_template_id || todo.id;

      const { error } = await client
        .from("todos")
        .update({ deleted_at: now })
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null)
        .is("deleted_at", null)
        .or(`id.eq.${templateId},recurrence_template_id.eq.${templateId}`);

      adminTodoWritePending = false;

      if (error) {
        showToast(friendlySaveMessage());
        return false;
      }

      closeAdminModal();
      await loadAdminTodos();
      return true;
    }
