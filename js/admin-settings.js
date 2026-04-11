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
      const configurableScreens = getAdminConfigurableScreens();
      const activeScreens = Array.isArray(ds.active_screens) ? ds.active_screens : configurableScreens;
      const normalizedOrder = normalizeAdminScreenOrder(screenOrder);

      list.innerHTML = normalizedOrder.map((name, i) => {
        const isActive = activeScreens.includes(name);
        return `
          <li class="admin-settings-order-item${isActive ? "" : " is-inactive"}" data-screen-name="${escapeHtml(name)}">
            <span class="admin-settings-order-item-name">${escapeHtml(SCREEN_LABELS[name] || name)}</span>
            <div class="admin-settings-order-arrows">
              <button type="button" class="admin-settings-order-btn" data-order-dir="up" data-order-index="${i}" aria-label="Move up"${i === 0 ? " disabled" : ""}>
                <i data-lucide="chevron-up"></i>
              </button>
              <button type="button" class="admin-settings-order-btn" data-order-dir="down" data-order-index="${i}" aria-label="Move down"${i === normalizedOrder.length - 1 ? " disabled" : ""}>
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
      const timerScreenKeys = getAdminTimerScreenKeys();

      list.innerHTML = timerScreenKeys.map((key) => {
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
      const configurableScreens = getAdminConfigurableScreens();
      const activeScreens = Array.isArray(ds.active_screens) ? ds.active_screens : configurableScreens;
      const screenOrder = normalizeAdminScreenOrder(Array.isArray(ds.screen_order) ? ds.screen_order : configurableScreens);
      const timerIntervals = ds.timer_intervals || {};
      const upcomingDays = ds.upcoming_days || 5;
      const members = Array.isArray(ds.members) ? ds.members : [];
      const assistantInput = document.getElementById("settings-assistant-name");
      const memberInput = document.getElementById("settings-member-input");
      const calIdInput = document.getElementById("settings-google-cal-id");
      const daysSelect = document.getElementById("settings-upcoming-days");

      [assistantInput, memberInput, calIdInput, daysSelect].forEach((element) => {
        if (element) {
          element.classList.remove("admin-input--skeleton");
        }
      });

      const rsvpToggle = document.querySelector("[name='screen_rsvp']")?.closest(".admin-settings-toggle");
      if (rsvpToggle) {
        rsvpToggle.hidden = !configurableScreens.includes("rsvp");
      }

      // Household
      if (assistantInput) assistantInput.value = adminHouseholdSettings.assistant_name || "";

      renderSettingsMembersList(members);

      // Active screen checkboxes
      configurableScreens.forEach((name) => {
        const cb = document.querySelector(`[name="screen_${name}"]`);
        if (cb) cb.checked = activeScreens.includes(name);
      });
      enforceMinOneActiveScreen();

      // Screen order
      renderSettingsScreenOrder(screenOrder);

      // Timers
      renderSettingsTimerList(timerIntervals);

      // Upcoming days
      if (daysSelect) daysSelect.value = String(upcomingDays);

      // Color scheme
      const schemeRadio = document.querySelector(`[name="color_scheme"][value="${adminHouseholdSettings.color_scheme || "warm"}"]`);
      if (schemeRadio) schemeRadio.checked = true;

      // Google Cal ID
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
        loadAdminScorecards(),
        loadAdminRsvpScreen(),
        ensureAdminHouseholdConfigLoaded(true).then(() => loadAdminSettings())
      ]);
    }

    async function saveAssistantSection() {
      const client = getSupabaseClient();
      if (!client || assistantSavePending || !adminHouseholdConfigLoaded) return;

      assistantSavePending = true;
      const saveBtn = document.getElementById("settings-assistant-save");
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving\u2026"; }

      try {
        const nameInput = document.getElementById("settings-assistant-name");
        const newName = nameInput ? nameInput.value.trim() : "";

        const { data, error } = await client
          .from("households")
          .update({ assistant_name: newName || null })
          .eq("id", DISPLAY_HOUSEHOLD_ID)
          .select();

        if (error) {
          showToast(friendlySaveMessage());
        } else if (!data || data.length === 0) {
          showToast(friendlySaveMessage());
        } else {
          adminHouseholdSettings.assistant_name = newName;
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
        addButton.textContent = "Saving\u2026";
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
          showToast(friendlySaveMessage());
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
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving\u2026"; }

      try {
        const configurableScreens = getAdminConfigurableScreens();
        const timerScreenKeys = getAdminTimerScreenKeys();
        // Active screens
        const activeScreens = configurableScreens.filter((name) => {
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
        const screenOrder = buildPersistedScreenOrder(Array.from(orderItems).map((el) => el.getAttribute("data-screen-name")).filter(Boolean));

        // Timers
        const timerIntervals = {};
        timerScreenKeys.forEach((key) => {
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
          showToast(friendlySaveMessage());
        } else if (!data || data.length === 0) {
          showToast(friendlySaveMessage());
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
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving\u2026"; }

      try {
        const calIdInput = document.getElementById("settings-google-cal-id");
        const newCalId = calIdInput ? calIdInput.value.trim() : "";

        const { data, error } = await client
          .from("households")
          .update({ google_cal_id: newCalId || null })
          .eq("id", DISPLAY_HOUSEHOLD_ID)
          .select();
        if (error) {
          showToast(friendlySaveMessage());
        } else if (!data || data.length === 0) {
          showToast(friendlySaveMessage());
        } else {
          adminHouseholdSettings.google_cal_id = newCalId;
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
      const order = normalizeAdminScreenOrder(Array.isArray(ds.screen_order) ? [...ds.screen_order] : [...getAdminConfigurableScreens()]);

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
      ds.active_screens = getAdminConfigurableScreens().filter((name) => {
        const cb = document.querySelector(`[name="screen_${name}"]`);
        return cb && cb.checked;
      });
      const order = normalizeAdminScreenOrder(Array.isArray(ds.screen_order) ? ds.screen_order : [...getAdminConfigurableScreens()]);
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
