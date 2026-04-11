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

    async function fetchWeeklyNote() {
      const client = getSupabaseClient();
      if (!client) return null;
      const monday = getMonday(new Date());
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

    function renderMeals(mealItems, weeklyNote) {
      const mealGrid = document.getElementById("meal-grid");
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
        const mealName = meal ? meal.name : "\u2014";

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

      mealGrid.innerHTML = mealCards.join("") + noteCard;
    }

    async function renderMealsWithData() {
      markPending("meals");
      renderMealSkeleton();
      const [remoteMeals, weeklyNote] = await Promise.all([fetchMeals(), fetchWeeklyNote()]);
      if (remoteMeals === null) {
        renderScreenError(
          document.getElementById("meal-grid"),
          "Something went wrong loading your data \u2014 tap to retry",
          renderMealsWithData
        );
      } else {
        renderMeals(remoteMeals, weeklyNote || "");
      }
      resolveScreen("meals");
    }
