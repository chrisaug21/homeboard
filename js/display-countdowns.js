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

    // Ticket / Postcard alternation: one global counter, bumped every time a
    // countdown slide is shown. With template = "auto", even = Ticket, odd =
    // Postcard, so templates never repeat back to back (including at wrap-around).
    let countdownShownCounter = 0;
    const countdownItemsByScreen = new WeakMap();

    function formatCountdownClockTime(timeString) {
      const match = /^(\d{1,2}):(\d{2})/.exec(String(timeString || ""));
      if (!match) return "";
      const hours = Number(match[1]);
      const minutes = match[2];
      const suffix = hours >= 12 ? "PM" : "AM";
      return `${hours % 12 || 12}:${minutes} ${suffix}`;
    }

    function isCountdownTonight(item) {
      const match = /^(\d{1,2}):/.exec(String(item.startTime || ""));
      return Boolean(match) && Number(match[1]) >= 17;
    }

    function mapSupabaseCountdown(countdown) {
      const { imageUrl, imageCredit } = parseUnsplashData(countdown.unsplash_image_url);
      const safeId = String(countdown.id || "").trim();
      const customImageUrl = String(countdown.custom_image_url || "").trim() || null;
      const template = ["ticket", "postcard"].includes(countdown.template) ? countdown.template : "auto";
      return {
        id: safeId,
        name: countdown.name || "Upcoming Event",
        icon: countdown.icon || "calendar",
        eventDate: countdown.event_date,
        days: getDaysUntil(countdown.event_date),
        caption: formatLongDate(countdown.event_date),
        locationName: String(countdown.location_name || "").trim(),
        locationDetail: String(countdown.location_detail || "").trim(),
        locationSource: countdown.location_source === "maps" ? "maps" : "freeform",
        description: String(countdown.description || "").trim(),
        startTime: countdown.start_time || null,
        allDay: Boolean(countdown.all_day),
        focalX: Number.isFinite(Number(countdown.photo_focal_x)) ? Number(countdown.photo_focal_x) : 50,
        focalY: Number.isFinite(Number(countdown.photo_focal_y)) ? Number(countdown.photo_focal_y) : 50,
        template,
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

      // event_date >= today keeps a countdown through its event day; it drops off the next morning.
      const { data, error } = await client
        .from("countdowns")
        .select("id, name, icon, event_date, unsplash_image_url, custom_image_url, days_before_visible, location_name, location_detail, location_source, description, start_time, all_day, photo_focal_x, photo_focal_y, template")
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

    function buildCountdownDetailHTML(iconName, primary, secondary) {
      return `
        <div class="cd-detail">
          <i data-lucide="${iconName}"></i>
          <div class="cd-detail-text">
            <div class="cd-detail-primary">${escapeHtml(primary)}</div>
            ${secondary ? `<div class="cd-detail-secondary">${escapeHtml(secondary)}</div>` : ""}
          </div>
        </div>`;
    }

    function buildCountdownDateDetailHTML(item, isToday) {
      const time = item.startTime ? formatCountdownClockTime(item.startTime) : "";
      let secondary = "";
      if (isToday) {
        const label = isCountdownTonight(item) ? "Tonight" : "Today";
        secondary = time ? `${label} · ${time}` : label;
      } else if (time) {
        secondary = time;
      } else if (item.allDay) {
        secondary = "All day";
      }
      return buildCountdownDetailHTML("calendar", item.caption, secondary);
    }

    function buildCountdownLocationDetailHTML(item) {
      if (!item.locationName) return "";
      const detail = item.locationSource === "maps" ? item.locationDetail : "";
      return buildCountdownDetailHTML("map-pin", item.locationName, detail);
    }

    function buildCountdownNumberBlockHTML(item) {
      const label = `
        <div class="cd-label">
          <span class="cd-label-days">${item.days === 1 ? "day" : "days"}</span>
          <span class="cd-label-togo">to go</span>
        </div>`;
      return `
        <div class="cd-number-block">
          ${label}
          <span class="cd-number">${escapeHtml(item.days)}</span>
        </div>`;
    }

    function buildCountdownTodayPillHTML(item) {
      return `<div class="cd-today-pill">${isCountdownTonight(item) ? "TONIGHT!" : "TODAY!"}</div>`;
    }

    function getCountdownTitleSizeClass(name) {
      const length = String(name || "").length;
      if (length <= 14) return "cd-title--xl";
      if (length <= 28) return "cd-title--l";
      return "cd-title--m";
    }

    function buildCountdownStampHTML(item) {
      const date = parseLocalDateString(item.eventDate);
      const month = date ? new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase() : "";
      const day = date ? String(date.getDate()) : "";
      return `
        <div class="cd-stamp">
          <i data-lucide="${escapeHtml(item.icon || "calendar")}"></i>
          <div class="cd-stamp-date">
            <span class="cd-stamp-month">${escapeHtml(month)}</span>
            <span class="cd-stamp-day">${escapeHtml(day)}</span>
          </div>
        </div>`;
    }

    function buildCountdownPhotoHTML(item) {
      return `<img class="cd-photo" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" style="object-position:${item.focalX}% ${item.focalY}%" onload="handleCountdownPhotoLoad(this)" onerror="handleCountdownPhotoError(this)">`;
    }

    // A photo that is taller than wide switches the Postcard frame to portrait.
    function handleCountdownPhotoLoad(img) {
      const figure = img.closest(".cd-postcard");
      if (figure && img.naturalHeight > img.naturalWidth) {
        figure.classList.add("cd-postcard--portrait");
      }
    }

    // If a photo fails to load, redraw the slide in its no-photo state.
    function handleCountdownPhotoError(img) {
      const screen = img.closest(".countdown-screen");
      const item = screen ? countdownItemsByScreen.get(screen) : null;
      if (!item) return;
      item.image_url = null;
      renderCountdownSlide(screen, item, screen.dataset.countdownTemplate || "ticket");
    }

    function getCountdownTilt(item) {
      const key = String(item.id || item.name || "");
      let hash = 0;
      for (let i = 0; i < key.length; i += 1) hash = (hash + key.charCodeAt(i)) % 1000;
      return hash % 2 === 0 ? "-2deg" : "2deg";
    }

    function buildCountdownTextBlockHTML(item, isToday) {
      const titleClass = isToday ? `cd-title ${getCountdownTitleSizeClass(item.name)}` : "cd-title";
      return `
        ${isToday ? buildCountdownTodayPillHTML(item) : buildCountdownNumberBlockHTML(item)}
        <h2 class="${titleClass}">${escapeHtml(item.name)}</h2>
        ${item.description ? `<p class="cd-description">${escapeHtml(item.description)}</p>` : ""}`;
    }

    function buildCountdownTicketHTML(item, isToday, hasImage) {
      return `
        <div class="cd-art">
          ${hasImage ? buildCountdownPhotoHTML(item) : buildCountdownStampHTML(item)}
          ${hasImage && item.image_credit ? `<div class="cd-credit-chip">${escapeHtml(item.image_credit)}</div>` : ""}
        </div>
        <span class="cd-perf" aria-hidden="true"></span>
        <span class="cd-notch cd-notch--top" aria-hidden="true"></span>
        <span class="cd-notch cd-notch--bottom" aria-hidden="true"></span>
        <div class="cd-info">
          <div class="cd-text${isToday ? " cd-text--today" : ""}">${buildCountdownTextBlockHTML(item, isToday)}</div>
          <div class="cd-details">
            ${buildCountdownDateDetailHTML(item, isToday)}
            ${buildCountdownLocationDetailHTML(item)}
          </div>
        </div>`;
    }

    function buildCountdownPostcardHTML(item, isToday, hasImage) {
      const locationHTML = buildCountdownLocationDetailHTML(item);
      const credit = hasImage && item.image_credit ? `<div class="cd-credit">${escapeHtml(item.image_credit)}</div>` : "";
      const caption = locationHTML || credit
        ? `<figcaption class="cd-caption">${locationHTML}${credit}</figcaption>`
        : `<figcaption class="cd-caption cd-caption--empty"></figcaption>`;
      return `
        <div class="cd-text cd-text--postcard">
          ${buildCountdownTextBlockHTML(item, isToday)}
          <div class="cd-details cd-details--postcard">${buildCountdownDateDetailHTML(item, isToday)}</div>
        </div>
        <figure class="cd-postcard" style="--cd-tilt:${getCountdownTilt(item)}">
          <div class="cd-art">${hasImage ? buildCountdownPhotoHTML(item) : buildCountdownStampHTML(item)}</div>
          ${caption}
        </figure>`;
    }

    function renderCountdownSlide(screen, item, template) {
      const hasImage = Boolean(item.image_url);
      // The ramp warms as the day nears: 31+ days neutral, 8-30 sage,
      // 1-7 fern, and on the day a full marigold panel.
      const days = Number(item.days);
      const isToday = days <= 0;
      const rampClass = isToday ? "countdown-card--today"
        : days <= 7 ? "countdown-card--soon"
        : days <= 30 ? "countdown-card--later"
        : "countdown-card--far";
      const bodyHTML = template === "postcard"
        ? buildCountdownPostcardHTML(item, isToday, hasImage)
        : buildCountdownTicketHTML(item, isToday, hasImage);

      screen.dataset.countdownTemplate = template;
      countdownItemsByScreen.set(screen, item);
      screen.innerHTML = `
        <div class="panel">
          <div class="screen-title-row">
            <div class="eyebrow"><i data-lucide="sparkles"></i> Looking Forward</div>
          </div>
          <div class="countdown-layout">
            <article class="countdown-card countdown-card--${template} ${rampClass}${hasImage ? " countdown-card--photo" : " countdown-card--nophoto"}">
              ${bodyHTML}
            </article>
          </div>
        </div>`;
      if (typeof refreshIcons === "function") refreshIcons();
    }

    // Called each time a countdown slide is about to be shown. Picks its
    // template from the global counter (or the per-countdown override), redraws
    // the slide if it changed, then advances the counter.
    function prepareCountdownSlideForShow(screen) {
      const item = countdownItemsByScreen.get(screen);
      if (!item) return;
      const autoTemplate = countdownShownCounter % 2 === 0 ? "ticket" : "postcard";
      countdownShownCounter += 1;
      const template = item.template === "auto" ? autoTemplate : item.template;
      if (screen.dataset.countdownTemplate !== template) {
        renderCountdownSlide(screen, item, template);
      }
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

      // Provisional template by position; the real one is picked from the
      // global counter when each slide is shown (prepareCountdownSlideForShow).
      const provisionalTemplate = (item, index) => item.template === "auto" ? (index % 2 === 0 ? "ticket" : "postcard") : item.template;

      renderCountdownSlide(firstCountdownScreen, countdownItems[0], provisionalTemplate(countdownItems[0], 0));

      countdownItems.slice(1).forEach((item, index) => {
        const section = document.createElement("section");
        section.className = `screen countdown-screen${firstCountdownScreen.classList.contains("screen--disabled") ? " screen--disabled" : ""}`;
        if (section.classList.contains("screen--disabled")) {
          section.setAttribute("aria-hidden", "true");
        }
        section.dataset.screenKey = String(item?.screenKey || `countdown_${index + 1}`).trim() || `countdown_${index + 1}`;
        renderCountdownSlide(section, item, provisionalTemplate(item, index + 1));
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

    // Moving between two countdown slides fades them into each other instead of
    // sliding. The track jumps to the new slide with no animation, while a copy
    // of the old slide sits on top and fades out as the new one fades in.
    // Returns false (so the normal slide runs) if the effect can't be used.
    function crossfadeCountdownSlides(fromScreen, toScreen, targetTransform) {
      const viewportEl = track.parentElement;
      if (!viewportEl || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
        return false;
      }

      const ghost = document.createElement("div");
      ghost.className = "countdown-crossfade-ghost";
      ghost.setAttribute("aria-hidden", "true");
      const copy = fromScreen.cloneNode(true);
      copy.removeAttribute("data-screen-key");
      ghost.appendChild(copy);
      viewportEl.appendChild(ghost);

      track.style.transition = "none";
      track.style.transform = targetTransform;
      void track.getBoundingClientRect();
      track.style.transition = "";

      toScreen.classList.add("countdown-screen--fade-in");
      window.setTimeout(() => {
        ghost.remove();
        toScreen.classList.remove("countdown-screen--fade-in");
        finishScreenTransition();
      }, 580);
      return true;
    }
