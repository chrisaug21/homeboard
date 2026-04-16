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
