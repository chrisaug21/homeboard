    function parseUnsplashData(raw) {
      if (!raw) return { imageUrl: null, imageCredit: null };
      try {
        const parsed = JSON.parse(raw);
        return { imageUrl: parsed.url || null, imageCredit: parsed.credit || null };
      } catch {
        // Legacy: raw URL stored before JSON format
        return { imageUrl: raw, imageCredit: null };
      }
    }

    function mapSupabaseCountdown(countdown) {
      const { imageUrl, imageCredit } = parseUnsplashData(countdown.unsplash_image_url);
      const safeId = String(countdown.id || "").trim();
      const customImageUrl = String(countdown.custom_image_url || "").trim() || null;
      return {
        id: safeId,
        name: countdown.name || "Upcoming Event",
        icon: countdown.icon || "calendar",
        eventDate: countdown.event_date,
        days: getDaysUntil(countdown.event_date),
        caption: formatLongDate(countdown.event_date),
        image_url: customImageUrl || imageUrl,
        image_credit: customImageUrl ? null : imageCredit,
        daysBeforeVisible: countdown.days_before_visible ?? null,
        screenKey: safeId ? `countdown_supabase_${safeId}` : ""
      };
    }

    async function fetchCountdowns() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await client
        .from("countdowns")
        .select("id, name, icon, event_date, unsplash_image_url, custom_image_url, days_before_visible")
        .eq("household_id", getDisplayHouseholdId())
        .gte("event_date", formatDateKey(today))
        .order("event_date", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data.map(mapSupabaseCountdown).filter((item) => {
        if (item.daysBeforeVisible === null) return true;
        return item.days !== null && item.days <= item.daysBeforeVisible;
      });
    }

    function renderCountdowns(countdownItems) {
      let existingCountdownScreens = Array.from(track.querySelectorAll(".countdown-screen"));
      existingCountdownScreens.forEach((screen, index) => {
        if (index > 0) {
          screen.remove();
        }
      });

      existingCountdownScreens = Array.from(track.querySelectorAll(".countdown-screen"));
      let firstCountdownScreen = existingCountdownScreens[0];

      if (!firstCountdownScreen) {
        firstCountdownScreen = document.createElement("section");
        firstCountdownScreen.className = "screen countdown-screen";
        track.appendChild(firstCountdownScreen);
      }

      if (!countdownItems.length) {
        firstCountdownScreen.innerHTML = "";
        firstCountdownScreen.classList.add("screen--empty-hidden");
        firstCountdownScreen.setAttribute("aria-hidden", "true");
        const displaySettings = normalizeDisplaySettings(cachedHouseholdConfig?.display_settings);
        const screenOrder = Array.isArray(displaySettings.screen_order) ? displaySettings.screen_order : DISPLAY_SCREEN_KEYS;
        applyScreenOrder(screenOrder);
        reconcileRotationState();
        return;
      }

      firstCountdownScreen.dataset.screenKey = String(countdownItems[0]?.screenKey || "countdown_0").trim() || "countdown_0";
      firstCountdownScreen.classList.remove("screen--empty-hidden");
      if (!firstCountdownScreen.classList.contains("screen--disabled")) {
        firstCountdownScreen.removeAttribute("aria-hidden");
      }
      const countdownTemplate = (item, index) => {
        const hasImage = Boolean(item.image_url);
        const variantIndex = index % 4;
        const variantClass = variantIndex > 0 ? ` countdown-card--variant-${variantIndex + 1}` : "";
        const daysLabel = item.days === 1 ? "day" : "days";

        return `
        <div class="panel">
          <div class="screen-title-row">
            <div class="eyebrow"><i data-lucide="sparkles"></i> Looking Forward</div>
          </div>
          <div class="countdown-layout">
            <article class="countdown-card${variantClass}${hasImage ? " countdown-card--photo" : ""}">
              ${hasImage ? `
              <div class="countdown-photo-wrap">
                <img class="countdown-photo" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" onerror="this.closest('.countdown-card').classList.remove('countdown-card--photo'); this.closest('.countdown-photo-wrap').remove();">
                ${item.image_credit ? `<div class="countdown-photo-credit">${escapeHtml(item.image_credit)}</div>` : ""}
              </div>` : ""}
              <div class="countdown-copy">
                <div class="countdown-icon"><i data-lucide="${escapeHtml(item.icon || "calendar")}"></i></div>
                <div class="countdown-name">${escapeHtml(item.name)}</div>
                <div class="countdown-days">
                  <span class="countdown-value">${escapeHtml(item.days)}</span>
                  <span class="countdown-unit">${daysLabel}</span>
                </div>
                <div class="countdown-caption">${escapeHtml(item.caption)}</div>
              </div>
            </article>
          </div>
        </div>
      `;
      };

      firstCountdownScreen.innerHTML = countdownTemplate(countdownItems[0], 0);

      countdownItems.slice(1).forEach((item, index) => {
        const section = document.createElement("section");
        section.className = `screen countdown-screen${firstCountdownScreen.classList.contains("screen--disabled") ? " screen--disabled" : ""}`;
        if (section.classList.contains("screen--disabled")) {
          section.setAttribute("aria-hidden", "true");
        }
        section.dataset.screenKey = String(item?.screenKey || `countdown_${index + 1}`).trim() || `countdown_${index + 1}`;
        section.innerHTML = countdownTemplate(item, index + 1);
        // Insert after the last existing countdown-screen to keep them grouped
        const allCountdowns = track.querySelectorAll(".countdown-screen");
        const lastCountdown = allCountdowns[allCountdowns.length - 1];
        lastCountdown.insertAdjacentElement("afterend", section);
      });

      const displaySettings = normalizeDisplaySettings(cachedHouseholdConfig?.display_settings);
      const screenOrder = Array.isArray(displaySettings.screen_order) ? displaySettings.screen_order : DISPLAY_SCREEN_KEYS;
      applyScreenOrder(screenOrder);
      reconcileRotationState();
    }
