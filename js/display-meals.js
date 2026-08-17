    async function fetchEnabledMealSlots() {
      const client = getSupabaseClient();
      if (!client) return ["dinner"];

      const { data, error } = await client
        .from("households")
        .select("display_settings")
        .eq("id", getDisplayHouseholdId())
        .single();

      if (error || !data) return ["dinner"];
      return normalizeMealSlots(data.display_settings?.meal_slots);
    }

    function mapSupabaseMeal(meal) {
      return {
        dayOfWeek: Number(meal.day_of_week),
        name: meal.meal_name || "—",
        type: meal.meal_type || "fend_for_yourself"
      };
    }

    async function fetchMealsForSlots(slots) {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const monday = getMonday(new Date());
      const { data, error } = await client
        .from("meal_plan")
        .select("day_of_week, meal_name, meal_type, meal_slot")
        .eq("household_id", getDisplayHouseholdId())
        .eq("week_start", formatDateKey(monday))
        .in("meal_slot", slots)
        .is("user_id", null)
        .order("day_of_week", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      const mealsBySlot = {};
      slots.forEach((slot) => {
        mealsBySlot[slot] = [];
      });
      data.forEach((row) => {
        if (!mealsBySlot[row.meal_slot]) mealsBySlot[row.meal_slot] = [];
        mealsBySlot[row.meal_slot].push(mapSupabaseMeal(row));
      });
      return mealsBySlot;
    }

    async function fetchWeeklyNote() {
      const client = getSupabaseClient();
      if (!client) return null;
      const monday = getMonday(new Date());
      const { data, error } = await client
        .from("meal_plan_notes")
        .select("note")
        .eq("household_id", getDisplayHouseholdId())
        .eq("week_start", formatDateKey(monday))
        .maybeSingle();
      if (error) return null;
      if (!data) return "";
      return data.note || "";
    }

    function buildMealScreenPanelHTML(slot, mealItems, weeklyNote) {
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
        const mealName = meal ? meal.name : "—";

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

      return `
        <div class="panel">
          <div class="screen-title-row">
            <div class="eyebrow"><i data-lucide="utensils-crossed"></i> Meal Plan - ${escapeHtml(MEAL_SLOT_LABELS[slot] || slot)}</div>
          </div>
          <div class="meals-layout">${mealCards.join("") + noteCard}</div>
        </div>
      `;
    }

    function renderMealScreens(mealsBySlot, weeklyNote, slots) {
      let existingMealScreens = Array.from(track.querySelectorAll(".screen--meals"));
      existingMealScreens.forEach((screen, index) => {
        if (index >= slots.length) {
          screen.remove();
        }
      });

      existingMealScreens = Array.from(track.querySelectorAll(".screen--meals"));

      slots.forEach((slot, index) => {
        let screen = existingMealScreens[index];
        if (!screen) {
          screen = document.createElement("section");
          screen.className = "screen screen--meals";
          track.appendChild(screen);
        }

        screen.dataset.screenKey = `meal_${slot}`;
        screen.dataset.mealSlot = slot;
        screen.classList.remove("screen--empty-hidden");
        if (!screen.classList.contains("screen--disabled")) {
          screen.removeAttribute("aria-hidden");
        }
        screen.innerHTML = buildMealScreenPanelHTML(slot, mealsBySlot[slot] || [], weeklyNote);
      });

      const displaySettings = normalizeDisplaySettings(cachedHouseholdConfig?.display_settings);
      const screenOrder = Array.isArray(displaySettings.screen_order) ? displaySettings.screen_order : DISPLAY_SCREEN_KEYS;
      applyScreenOrder(screenOrder);
      reconcileRotationState();
    }

    async function renderMealsWithData() {
      markPending("meals");
      renderMealSkeleton();
      const slots = await fetchEnabledMealSlots();
      const [mealsBySlot, weeklyNote] = await Promise.all([
        fetchMealsForSlots(slots),
        fetchWeeklyNote()
      ]);

      if (mealsBySlot === null) {
        renderScreenError(
          document.querySelector(".screen--meals .meals-layout") || document.getElementById("meal-grid"),
          "Something went wrong loading your data — tap to retry",
          renderMealsWithData
        );
      } else {
        renderMealScreens(mealsBySlot, weeklyNote || "", slots);
      }
      resolveScreen("meals");
    }

    // Lightweight periodic refresh (no skeleton, no pending-screen tracking) used by the
    // 5-min narrow refresh interval after the initial load has already completed.
    async function refreshMealsQuietly() {
      const slots = await fetchEnabledMealSlots();
      const [mealsBySlot, weeklyNote] = await Promise.all([
        fetchMealsForSlots(slots),
        fetchWeeklyNote()
      ]);

      if (mealsBySlot === null) {
        return;
      }

      if (typeof weeklyNote === "string") {
        lastWeeklyNote = weeklyNote;
      }

      renderMealScreens(mealsBySlot, lastWeeklyNote || "", slots);
    }
