    function buildAdminMealSkeletonHTML() {
      return Array.from({ length: 7 }, () => `
        <article class="admin-meal-card admin-skeleton-card" aria-hidden="true">
          <div class="admin-meal-card-top">
            <div class="sk" style="width:92px;height:12px;"></div>
            <span class="sk" style="width:78px;height:28px;border-radius:12px;"></span>
          </div>
          <div class="sk" style="width:78%;height:20px;"></div>
        </article>
      `).join("");
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

    function formatAdminMealCardDayLabel(date) {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
      }).format(date).toUpperCase();
    }

    function buildMealTypeOptionsHTML(selectedType) {
      return mealTypeOptions.map((option) =>
        `<option value="${escapeHtml(option.value)}"${option.value === selectedType ? " selected" : ""}>${escapeHtml(option.adminLabel)}</option>`
      ).join("");
    }

    function getAdminWeekMonday() {
      const monday = getMonday(new Date());
      monday.setDate(monday.getDate() + adminWeekOffset * 7);
      return monday;
    }

    function getAdminMealByDay(dayOfWeek) {
      return adminMealPlanRows.find((meal) => meal.dayOfWeek === dayOfWeek) || null;
    }

    function renderAdminMealCard(index, date, meal) {
      const dayLabel = escapeHtml(formatAdminMealCardDayLabel(date));
      const mealType = meal ? getMealTypePresentation(meal.mealType) : null;

      return `
        <div class="admin-meal-day-card">
          <button class="admin-meal-card" type="button" data-admin-meal-day="${index}">
            <div class="admin-meal-card-top">
              <div class="admin-meal-day">${dayLabel}</div>
              <span class="admin-pill admin-pill--due">${escapeHtml(mealType ? mealType.label : "Tap to add")}</span>
            </div>
            <div class="admin-meal-name${meal && meal.mealName ? "" : " admin-meal-name--empty"}">${escapeHtml(meal && meal.mealName ? meal.mealName : "No dinner set yet.")}</div>
          </button>
          <div class="admin-meal-card-arrows">
            <button type="button" class="admin-meal-card-arrow-btn" data-swap-dir="up" data-swap-index="${index}" aria-label="Swap with previous day"${index === 0 ? " disabled" : ""}>
              <i data-lucide="chevron-up"></i>
            </button>
            <button type="button" class="admin-meal-card-arrow-btn" data-swap-dir="down" data-swap-index="${index}" aria-label="Swap with next day"${index === 6 ? " disabled" : ""}>
              <i data-lucide="chevron-down"></i>
            </button>
          </div>
        </div>
      `;
    }

    function filterMealLibraryMatches(query, mealType) {
      const q = String(query || "").trim().toLowerCase();
      const entries = adminMealLibraryEntries || [];
      let matches = q ? entries.filter((entry) => entry.name.toLowerCase().includes(q)) : entries;
      if (mealType) {
        matches = matches.filter((entry) => !entry.mealType || entry.mealType === mealType);
      }
      return matches.map((entry) => entry.name).slice(0, 8);
    }

    function buildMealTypeaheadListHTML(matches) {
      return matches.map((name) =>
        `<li><button type="button" class="admin-typeahead-option" data-meal-suggestion="${escapeHtml(name)}">${escapeHtml(name)}</button></li>`
      ).join("");
    }

    function renderMealTypeaheadSuggestions(form, query) {
      const list = form && form.querySelector("[data-meal-typeahead-list]");
      if (!list) return;
      const mealType = form.querySelector("[name='meal_type']")?.value || "";
      const matches = filterMealLibraryMatches(query, mealType);
      list.innerHTML = buildMealTypeaheadListHTML(matches);
      list.hidden = matches.length === 0;
    }

    function hideMealTypeaheadList(form) {
      const list = form && form.querySelector("[data-meal-typeahead-list]");
      if (list) list.hidden = true;
    }

    async function ensureAdminMealLibraryLoaded() {
      if (adminMealLibraryLoadPromise) return adminMealLibraryLoadPromise;
      adminMealLibraryLoadPromise = (async () => {
        const client = getSupabaseClient();
        if (!client) return;
        const { data, error } = await client
          .from("meal_library")
          .select("id, name, meal_type")
          .eq("household_id", getAdminHouseholdId())
          .order("name", { ascending: true });
        if (!error && Array.isArray(data)) {
          adminMealLibraryEntries = data.map((row) => ({ id: row.id, name: row.name, mealType: row.meal_type || null }));
        }
      })();
      return adminMealLibraryLoadPromise;
    }

    async function recordAdminMealLibraryName(name, mealType) {
      const trimmed = String(name || "").trim();
      if (!trimmed) return;
      await ensureAdminMealLibraryLoaded();
      const existing = adminMealLibraryEntries.find((entry) => entry.name.toLowerCase() === trimmed.toLowerCase());
      if (existing && existing.mealType === mealType) return;

      const client = getSupabaseClient();
      if (!client) return;
      // Best-effort: the meal itself is already saved, so a failure here (e.g. a race
      // with another admin saving the same name) should never surface to the user.
      if (existing) {
        const { error } = await client
          .from("meal_library")
          .update({ meal_type: mealType })
          .eq("id", existing.id)
          .eq("household_id", getAdminHouseholdId());
        if (!error) existing.mealType = mealType;
        return;
      }

      const { data, error } = await client
        .from("meal_library")
        .insert({ household_id: getAdminHouseholdId(), name: trimmed, meal_type: mealType })
        .select("id, name, meal_type")
        .single();
      if (!error && data) {
        adminMealLibraryEntries = [...adminMealLibraryEntries, { id: data.id, name: data.name, mealType: data.meal_type || null }]
          .sort((a, b) => a.name.localeCompare(b.name));
        renderSettingsMealLibraryHint();
      }
    }

    function buildMealLibraryModalRowHTML(entry) {
      if (pendingMealLibraryRemovalId === entry.id) {
        return `
          <div class="admin-settings-member-row admin-settings-member-row--confirm" data-meal-library-id="${entry.id}">
            <span class="admin-settings-member-confirm-text">Remove ${escapeHtml(entry.name)}?</span>
            <div class="admin-settings-member-actions">
              <button type="button" class="admin-button admin-button--danger admin-button--small" data-meal-library-confirm="${entry.id}"${mealLibraryDeletePending ? " disabled" : ""}>Remove</button>
              <button type="button" class="admin-button admin-button--secondary admin-button--small" data-meal-library-cancel="${entry.id}"${mealLibraryDeletePending ? " disabled" : ""}>Cancel</button>
            </div>
          </div>
        `;
      }
      const typePresentation = entry.mealType ? getMealTypePresentation(entry.mealType) : null;
      return `
        <div class="admin-settings-member-row" data-meal-library-id="${entry.id}">
          <span class="admin-settings-member-name">${escapeHtml(entry.name)}</span>
          <div class="admin-settings-member-actions">
            ${typePresentation ? `<span class="admin-pill admin-pill--due">${escapeHtml(typePresentation.label)}</span>` : ""}
            <button type="button" class="admin-settings-member-remove" data-meal-library-remove="${entry.id}" aria-label="Remove ${escapeHtml(entry.name)}">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      `;
    }

    function buildMealLibraryTypeFilterOptionsHTML() {
      return `<option value="">All types</option>` + mealTypeOptions.map((option) =>
        `<option value="${escapeHtml(option.value)}">${escapeHtml(option.adminLabel)}</option>`
      ).join("");
    }

    function renderMealLibraryModalList() {
      const list = document.getElementById("meal-library-modal-list");
      if (!list) return;
      const q = String(document.getElementById("meal-library-modal-search")?.value || "").trim().toLowerCase();
      const typeFilter = document.getElementById("meal-library-modal-type-filter")?.value || "";

      let entries = q
        ? adminMealLibraryEntries.filter((entry) => entry.name.toLowerCase().includes(q))
        : adminMealLibraryEntries;
      if (typeFilter) {
        entries = entries.filter((entry) => entry.mealType === typeFilter);
      }

      if (!entries.length) {
        list.innerHTML = `<p class="admin-panel-note" style="margin:0">${adminMealLibraryEntries.length ? "No matches." : "No saved meals yet."}</p>`;
      } else {
        list.innerHTML = entries.map(buildMealLibraryModalRowHTML).join("");
      }
      refreshIcons();
    }

    function buildMealLibraryModalHTML() {
      return `
        <div class="admin-settings-stack">
          <input type="text" class="admin-input" id="meal-library-modal-search"
            placeholder="Search saved meals…" autocomplete="off" data-meal-library-search>
          <select id="meal-library-modal-type-filter" class="admin-input" data-meal-library-type-filter>
            ${buildMealLibraryTypeFilterOptionsHTML()}
          </select>
          <div id="meal-library-modal-list" class="admin-settings-member-list"></div>
        </div>
      `;
    }

    function openMealLibraryModal() {
      adminModalType = "meal-library";
      adminModalContext = null;
      pendingMealLibraryRemovalId = null;
      openAdminModal("Meal Library", buildMealLibraryModalHTML());
      renderMealLibraryModalList();
      ensureAdminMealLibraryLoaded().then(() => {
        if (adminModalType === "meal-library") renderMealLibraryModalList();
      });
    }

    async function deleteAdminMealLibraryEntry(id) {
      if (mealLibraryDeletePending) return;
      const client = getSupabaseClient();
      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      mealLibraryDeletePending = true;
      renderMealLibraryModalList();

      const { error } = await client
        .from("meal_library")
        .delete()
        .eq("id", id)
        .eq("household_id", getAdminHouseholdId());

      mealLibraryDeletePending = false;

      if (error) {
        showToast(friendlySaveMessage());
        renderMealLibraryModalList();
        return;
      }

      adminMealLibraryEntries = adminMealLibraryEntries.filter((entry) => entry.id !== id);
      pendingMealLibraryRemovalId = null;
      renderMealLibraryModalList();
      renderSettingsMealLibraryHint();
    }

    function renderSettingsMealLibraryHint() {
      const hint = document.getElementById("settings-meal-library-hint");
      if (!hint) return;
      const count = adminMealLibraryEntries.length;
      hint.textContent = count
        ? `${count} saved dinner name${count === 1 ? "" : "s"} used for the Meal Plan typeahead.`
        : "Saved dinner names used for the Meal Plan typeahead.";
    }

    function buildMealFormHTML(dayIndex, date, meal) {
      const dayLabel = escapeHtml(formatAdminDayLabel(date));
      const currentName = meal ? escapeHtml(meal.mealName) : "";
      const currentType = meal ? meal.mealType : "cooking";

      return `
        <form data-modal-form="meal" data-meal-day="${dayIndex}" novalidate>
          <p class="admin-panel-note" style="margin-top:0">${dayLabel}</p>
          <div class="admin-field">
            <label for="modal-meal-type">Type</label>
            <select id="modal-meal-type" name="meal_type">${buildMealTypeOptionsHTML(currentType)}</select>
          </div>
          <div class="admin-field admin-typeahead-field">
            <label for="modal-meal-name">Dinner</label>
            <input id="modal-meal-name" name="meal_name" type="text" maxlength="140"
              placeholder="What\u2019s for dinner?" value="${currentName}" autocomplete="off">
            <ul class="admin-typeahead-list" data-meal-typeahead-list hidden></ul>
          </div>
          <div class="admin-actions">
            <button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="admin-button admin-button--primary" type="submit">Save</button>
          </div>
        </form>
      `;
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

    function openMealModal(dayIndex, date, meal) {
      adminModalType = "edit-meal";
      adminModalContext = { dayIndex };
      openAdminModal(formatAdminDayLabel(date), buildMealFormHTML(dayIndex, date, meal));
      ensureAdminMealLibraryLoaded().then(() => {
        const input = document.getElementById("modal-meal-name");
        if (input && document.activeElement === input) {
          renderMealTypeaheadSuggestions(input.closest("form"), input.value);
        }
      });
    }

    function openMealNoteModal() {
      adminModalType = "note";
      adminModalContext = null;
      openAdminModal("Weekly Note", buildMealNoteFormHTML());
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

    async function fetchAdminMealPlan(monday) {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("meal_plan")
        .select("id, day_of_week, meal_name, meal_type, week_start")
        .eq("household_id", getAdminHouseholdId())
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

    async function fetchAdminMealNote(monday) {
      const client = getSupabaseClient();
      if (!client) return null;
      const { data, error } = await client
        .from("meal_plan_notes")
        .select("note")
        .eq("household_id", getAdminHouseholdId())
        .eq("week_start", formatDateKey(monday))
        .maybeSingle();
      if (error) return null;
      if (!data) return "";
      return data.note || "";
    }

    async function loadAdminMealPlan() {
      adminCurrentMonday = getAdminWeekMonday();
      adminMealWeekLabel.textContent = "Loading\u2026";
      adminWeekPrevBtn.disabled = true;
      adminWeekNextBtn.disabled = true;
      adminMealList.innerHTML = buildAdminMealSkeletonHTML();
      if (adminMealNoteWrap) adminMealNoteWrap.innerHTML = "";

      const [mealRows, noteText] = await Promise.all([
        fetchAdminMealPlan(adminCurrentMonday),
        fetchAdminMealNote(adminCurrentMonday)
      ]);

      if (!mealRows) {
        adminMealWeekLabel.textContent = "Couldn\u2019t load meals.";
        adminWeekPrevBtn.disabled = adminWeekOffset <= -1;
        adminWeekNextBtn.disabled = adminWeekOffset >= 1;
        adminMealList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
        return;
      }

      adminMealPlanRows = mealRows;
      if (noteText === null) {
        showToast(friendlyLoadMessage());
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
        if (!client) showToast(friendlySaveMessage());
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
          .eq("household_id", getAdminHouseholdId())
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
            household_id: getAdminHouseholdId(),
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
        showToast(friendlySaveMessage());
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
      recordAdminMealLibraryName(mealName, mealType);
    }

    async function saveAdminMealNote(formData) {
      if (adminNoteWritePending || adminMealWritePending) return;
      const noteText = String(formData.get("note") || "").trim();
      const client = getSupabaseClient();
      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }
      adminNoteWritePending = true;
      setModalSaving(true);
      const savedWeekStart = formatDateKey(adminCurrentMonday);

      const { error } = await client
        .from("meal_plan_notes")
        .upsert(
          { household_id: getAdminHouseholdId(), week_start: savedWeekStart, note: noteText },
          { onConflict: "household_id,week_start" }
        );

      adminNoteWritePending = false;

      if (error) {
        setModalSaving(false, "Save Note");
        showToast(friendlySaveMessage());
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

    async function writeAdminMealDayContent(dayOfWeek, content, weekStart) {
      const client = getSupabaseClient();
      if (!client) return { error: new Error("Supabase client unavailable"), meal: null };
      const existingMeal = getAdminMealByDay(dayOfWeek);

      if (!content) {
        if (!existingMeal) return { error: null, meal: null };
        const { error } = await client
          .from("meal_plan")
          .delete()
          .eq("id", existingMeal.id)
          .eq("household_id", getAdminHouseholdId())
          .eq("week_start", weekStart)
          .eq("meal_slot", "dinner")
          .is("user_id", null);
        return { error, meal: null };
      }

      if (existingMeal) {
        const { data, error } = await client
          .from("meal_plan")
          .update({ meal_name: content.mealName, meal_type: content.mealType })
          .eq("id", existingMeal.id)
          .eq("household_id", getAdminHouseholdId())
          .eq("week_start", weekStart)
          .eq("meal_slot", "dinner")
          .is("user_id", null)
          .select("id, day_of_week, meal_name, meal_type, week_start")
          .maybeSingle();
        return { error, meal: data };
      }

      const { data, error } = await client
        .from("meal_plan")
        .insert({
          household_id: getAdminHouseholdId(),
          user_id: null,
          week_start: weekStart,
          day_of_week: dayOfWeek,
          meal_slot: "dinner",
          meal_name: content.mealName,
          meal_type: content.mealType
        })
        .select("id, day_of_week, meal_name, meal_type, week_start")
        .single();
      return { error, meal: data };
    }

    async function performAdminMealSwap(dayIndex, targetIndex) {
      if (adminMealWritePending || adminNoteWritePending) return;
      if (targetIndex < 0 || targetIndex > 6) return;

      const sourceMeal = getAdminMealByDay(dayIndex);
      const targetMeal = getAdminMealByDay(targetIndex);
      if (!sourceMeal && !targetMeal) return;

      const sourceContent = sourceMeal ? { mealName: sourceMeal.mealName, mealType: sourceMeal.mealType } : null;
      const targetContent = targetMeal ? { mealName: targetMeal.mealName, mealType: targetMeal.mealType } : null;

      adminMealWritePending = true;
      const savedWeekStart = formatDateKey(adminCurrentMonday);

      const [sourceResult, targetResult] = await Promise.all([
        writeAdminMealDayContent(dayIndex, targetContent, savedWeekStart),
        writeAdminMealDayContent(targetIndex, sourceContent, savedWeekStart)
      ]);

      adminMealWritePending = false;

      if (sourceResult.error || targetResult.error) {
        showToast(friendlySaveMessage());
        // If exactly one write succeeded, the swap is half-applied in the database.
        // Re-fetch rather than leaving the UI showing the pre-swap state.
        const partiallyApplied = Boolean(sourceResult.error) !== Boolean(targetResult.error);
        if (partiallyApplied && formatDateKey(adminCurrentMonday) === savedWeekStart) {
          const freshRows = await fetchAdminMealPlan(adminCurrentMonday);
          if (freshRows && formatDateKey(adminCurrentMonday) === savedWeekStart) {
            adminMealPlanRows = freshRows;
            renderAdminMealPlan();
          }
        }
        return;
      }

      // If the week changed while awaiting, discard the stale result
      if (formatDateKey(adminCurrentMonday) !== savedWeekStart) return;

      adminMealPlanRows = adminMealPlanRows.filter((m) => m.dayOfWeek !== dayIndex && m.dayOfWeek !== targetIndex);
      if (sourceResult.meal) {
        adminMealPlanRows.push({
          id: sourceResult.meal.id,
          dayOfWeek: dayIndex,
          mealName: sourceResult.meal.meal_name,
          mealType: normalizeMealType(sourceResult.meal.meal_type || "cooking"),
          weekStart: sourceResult.meal.week_start
        });
      }
      if (targetResult.meal) {
        adminMealPlanRows.push({
          id: targetResult.meal.id,
          dayOfWeek: targetIndex,
          mealName: targetResult.meal.meal_name,
          mealType: normalizeMealType(targetResult.meal.meal_type || "cooking"),
          weekStart: targetResult.meal.week_start
        });
      }

      renderAdminMealPlan();
    }

    function handleAdminMealListClick(event) {
      if (adminMealWritePending) return;

      const swapBtn = event.target.closest("[data-swap-dir]");
      if (swapBtn) {
        const dayIndex = Number(swapBtn.getAttribute("data-swap-index"));
        const dir = swapBtn.getAttribute("data-swap-dir");
        const targetIndex = dir === "up" ? dayIndex - 1 : dayIndex + 1;
        performAdminMealSwap(dayIndex, targetIndex);
        return;
      }

      const dayBtn = event.target.closest("[data-admin-meal-day]");
      if (dayBtn) {
        const dayIndex = Number(dayBtn.getAttribute("data-admin-meal-day"));
        const date = new Date(adminCurrentMonday);
        date.setDate(adminCurrentMonday.getDate() + dayIndex);
        openMealModal(dayIndex, date, getAdminMealByDay(dayIndex));
      }
    }

    function handleAdminMealNoteClick(event) {
      if (event.target.closest("[data-action='edit-meal-note']")) {
        openMealNoteModal();
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
