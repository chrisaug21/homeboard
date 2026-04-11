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

      const meta = `
        <div class="admin-todo-meta">
          ${buildAdminAssigneePill(assignee)}
          ${dueMarkup}
        </div>
      `;
      const titleMarkup = `
        <div class="admin-todo-title-row">
          <div class="admin-todo-title">${title}</div>
          ${hasDescription ? `<span class="admin-todo-detail-indicator" aria-hidden="true"><i data-lucide="info"></i></span>` : ""}
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
            </div>
          </article>
        `;
      }

      return `
        <article class="admin-todo-card" aria-label="${title}">
          <div class="admin-todo-body">
            ${titleMarkup}
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

      adminTodoWritePending = true;
      setModalSaving(true);

      const { error } = await client
        .from("todos")
        .insert({
          household_id: TODO_HOUSEHOLD_ID,
          title,
          description: description || null,
          assignee: assignee || null,
          due_date: dueDate || null
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

      adminTodoWritePending = true;
      setModalSaving(true);

      const { error } = await client
        .from("todos")
        .update({
          title,
          description: description || null,
          assignee: assignee || null,
          due_date: dueDate || null
        })
        .eq("id", id)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null);

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
      return `
        <form data-modal-form="todo" novalidate>
          <div class="admin-field">
            <label for="modal-todo-title">Title</label>
            <input id="modal-todo-title" name="title" type="text" maxlength="140" required
              value="${isEdit ? escapeHtml(todo.title || "") : ""}"
              placeholder="${isEdit ? "" : "What needs doing?"}">
          </div>
          <div class="admin-field">
            <label for="modal-todo-description">Description</label>
            <textarea id="modal-todo-description" name="description" rows="4" maxlength="2000" placeholder="Add details if this task needs context...">${isEdit ? escapeHtml(todo.description || "") : ""}</textarea>
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

    async function archiveAdminTodo(todoId) {
      const client = getSupabaseClient();

      if (!client || adminTodoWritePending) {
        if (!client) {
          showToast(friendlySaveMessage());
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
        showToast(friendlySaveMessage());
        return;
      }

      await loadAdminTodos();
      adminTodoWritePending = false;
    }


    async function archiveAdminTodoWithAnimation(todoId, cardEl) {
      const client = getSupabaseClient();
      if (!client || adminTodoWritePending) {
        if (!client) showToast(friendlySaveMessage());
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
        showToast(friendlySaveMessage());
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

    async function fetchAdminTodos() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("todos")
        .select("id, title, description, assignee, due_date, archived_at, created_at")
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
