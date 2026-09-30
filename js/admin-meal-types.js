    // Settings > Display > Meal types: toggle standard types, add custom ones, and pick an
    // Iconify icon per type via search-and-select (never free-typed icon names).
    const ICONIFY_SEARCH_URL = "https://api.iconify.design/search";
    const ICONIFY_SEARCH_PREFIXES = "lucide,mdi,tabler";
    const ICONIFY_SEARCH_LIMIT = 48;
    const ICONIFY_SEARCH_DEBOUNCE_MS = 300;
    const MEAL_TYPE_ICON_SUGGESTIONS = [
      "lucide:chef-hat", "mdi:pot-steam", "lucide:utensils", "lucide:package", "lucide:bike", "lucide:shopping-bag",
      "lucide:sandwich", "lucide:sparkles", "mdi:pizza", "mdi:hamburger", "mdi:noodles", "mdi:food-takeout-box",
      "mdi:grill", "mdi:silverware-fork-knife", "mdi:baguette", "mdi:coffee", "mdi:cupcake", "mdi:fish",
      "mdi:food-drumstick", "mdi:taco", "mdi:soup", "mdi:carrot", "mdi:glass-wine", "mdi:heart"
    ];

    // Parses trusted, already-escaped markup into real nodes (scripts never run) and swaps it in,
    // instead of assigning to innerHTML directly.
    function setMealTypeMarkup(element, markup) {
      const parsed = new DOMParser().parseFromString(markup, "text/html");
      element.replaceChildren(...parsed.body.childNodes);
    }

    let mealTypeEditor = null;
    let mealTypeSearchTimer = null;
    let mealTypeSearchRequestId = 0;
    let mealTypeSavePending = false;

    function getAdminMealTypeSettings() {
      return normalizeMealTypeSettings(adminHouseholdSettings?.display_settings?.meal_types);
    }

    function buildMealTypeIconButtonHTML(pickTarget, icon, label) {
      return `<button type="button" class="admin-meal-type-icon-btn" data-mt-pick="${escapeHtml(pickTarget)}" aria-label="Change icon for ${escapeHtml(label)}">${buildMealTypeIconHTML(icon)}</button>`;
    }

    function buildMealTypeEditorListHTML() {
      const editor = mealTypeEditor;
      const standardRows = STANDARD_MEAL_TYPES.map((type) => {
        const icon = editor.icons[type.value] || type.icon;
        return `
          <div class="admin-meal-type-row">
            <label class="admin-settings-toggle admin-meal-type-toggle">
              <input type="checkbox" data-mt-toggle="${type.value}"${editor.enabled.includes(type.value) ? " checked" : ""}>
              <span>${escapeHtml(type.label)}</span>
            </label>
            ${buildMealTypeIconButtonHTML(`standard:${type.value}`, icon, type.label)}
          </div>`;
      }).join("");

      const customRows = editor.custom.map((entry) => `
        <div class="admin-meal-type-row admin-meal-type-row--input">
          <input type="text" class="admin-input admin-meal-type-label-input" data-mt-custom-label="${escapeHtml(entry.key)}" maxlength="${MEAL_TYPE_CUSTOM_LABEL_MAX}" value="${escapeHtml(entry.label)}" aria-label="Custom meal type name" autocomplete="off">
          ${buildMealTypeIconButtonHTML(`custom:${entry.key}`, entry.icon, entry.label)}
          <button type="button" class="admin-settings-member-remove" data-mt-remove="${escapeHtml(entry.key)}" aria-label="Remove ${escapeHtml(entry.label)}"><i data-lucide="trash-2"></i></button>
        </div>`).join("");

      const canAdd = editor.custom.length < MEAL_TYPE_CUSTOM_MAX;
      return `
        <form data-modal-form="meal-types" novalidate>
          <p class="admin-panel-note" style="margin-top:0">Choose which meal types appear when planning meals. Tap an icon to change it.</p>
          <div class="admin-settings-subsection-label">Default</div>
          <div class="admin-meal-type-list">${standardRows}</div>
          <div class="admin-settings-subsection-label">Custom</div>
          <div class="admin-meal-type-list">
            ${customRows || `<p class="admin-field-hint" style="margin:0">No custom types yet.</p>`}
            ${canAdd ? `
              <div class="admin-meal-type-row admin-meal-type-row--input">
                <input type="text" class="admin-input admin-meal-type-label-input" data-mt-new-label maxlength="${MEAL_TYPE_CUSTOM_LABEL_MAX}" placeholder="New type, e.g. Meal Prep" value="${escapeHtml(editor.newLabel)}" aria-label="New custom meal type name" autocomplete="off">
                ${buildMealTypeIconButtonHTML("new", editor.newIcon, "new type")}
                <button type="button" class="admin-button admin-button--secondary admin-button--small" data-mt-add>Add</button>
              </div>` : `<p class="admin-field-hint" style="margin:0">Custom type limit reached.</p>`}
          </div>
          <p class="admin-field-hint">Removing a type or turning it off never changes meals already planned.</p>
          <div class="admin-actions">
            <button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="admin-button admin-button--primary" type="submit">Save</button>
          </div>
        </form>`;
    }

    function buildMealTypeIconResultsHTML(icons, statusText) {
      const editor = mealTypeEditor;
      if (statusText) return `<p class="admin-field-hint" style="margin:0">${escapeHtml(statusText)}</p>`;
      return `<div class="admin-meal-type-icon-grid">${icons.map((icon) =>
        `<button type="button" class="admin-meal-type-icon-option${icon === editor.pickerCurrent ? " is-selected" : ""}" data-mt-icon="${escapeHtml(icon)}" aria-label="${escapeHtml(icon.split(":")[1].replaceAll("-", " "))}" title="${escapeHtml(icon)}">${buildMealTypeIconHTML(icon)}</button>`
      ).join("")}</div>`;
    }

    function buildMealTypeIconPickerHTML() {
      const editor = mealTypeEditor;
      return `
        <div class="admin-meal-type-picker">
          <button type="button" class="admin-button admin-button--secondary admin-button--small" data-mt-picker-back>&larr; Back</button>
          <div class="admin-field">
            <label for="meal-type-icon-search">Search icons</label>
            <input id="meal-type-icon-search" type="search" data-mt-search placeholder="e.g. pizza, grill, soup" autocomplete="off" value="${escapeHtml(editor.pickerQuery)}">
          </div>
          <div data-mt-results>${buildMealTypeIconResultsHTML(MEAL_TYPE_ICON_SUGGESTIONS)}</div>
          ${editor.pickerTarget.startsWith("standard:") ? `<button type="button" class="admin-button admin-button--secondary admin-button--small" data-mt-icon-reset>Reset to default icon</button>` : ""}
          <p class="admin-field-hint">Icons by Iconify.</p>
        </div>`;
    }

    function renderMealTypeEditor() {
      const body = document.getElementById("admin-modal-body");
      const title = document.getElementById("admin-modal-title");
      if (!body || !mealTypeEditor) return;
      const picking = mealTypeEditor.view === "picker";
      if (title) title.textContent = picking ? "Choose Icon" : "Meal Types";
      setMealTypeMarkup(body, picking ? buildMealTypeIconPickerHTML() : buildMealTypeEditorListHTML());
      if (typeof refreshIcons === "function") refreshIcons();
      if (picking) {
        const search = body.querySelector("[data-mt-search]");
        if (search) search.focus();
      }
    }

    function openMealTypesModal() {
      const settings = getAdminMealTypeSettings();
      mealTypeEditor = {
        view: "list",
        enabled: [...settings.enabled],
        icons: { ...settings.icons },
        custom: settings.custom.map((entry) => ({ ...entry })),
        newLabel: "",
        newIcon: MEAL_TYPE_FALLBACK_ICON,
        pickerTarget: "",
        pickerCurrent: "",
        pickerQuery: ""
      };
      adminModalType = "meal-types";
      adminModalContext = null;
      openAdminModal("Meal Types", buildMealTypeEditorListHTML());
    }

    function openMealTypeIconPicker(target) {
      const editor = mealTypeEditor;
      const [kind, key] = target.split(":");
      if (kind === "standard") {
        const type = STANDARD_MEAL_TYPES.find((entry) => entry.value === key);
        editor.pickerCurrent = editor.icons[key] || (type ? type.icon : "");
      } else if (kind === "custom") {
        const entry = editor.custom.find((item) => item.key === key);
        editor.pickerCurrent = entry ? entry.icon : "";
      } else {
        editor.pickerCurrent = editor.newIcon;
      }
      editor.pickerTarget = target;
      editor.pickerQuery = "";
      editor.view = "picker";
      renderMealTypeEditor();
    }

    function applyMealTypeIcon(icon) {
      const editor = mealTypeEditor;
      const [kind, ...rest] = editor.pickerTarget.split(":");
      const key = rest.join(":");
      if (kind === "standard") {
        const type = STANDARD_MEAL_TYPES.find((entry) => entry.value === key);
        if (!icon || (type && icon === type.icon)) delete editor.icons[key];
        else editor.icons[key] = icon;
      } else if (kind === "custom") {
        const entry = editor.custom.find((item) => item.key === key);
        if (entry) entry.icon = icon || MEAL_TYPE_FALLBACK_ICON;
      } else {
        editor.newIcon = icon || MEAL_TYPE_FALLBACK_ICON;
      }
      editor.view = "list";
      renderMealTypeEditor();
    }

    async function runMealTypeIconSearch(query) {
      const results = document.querySelector("#admin-modal-body [data-mt-results]");
      if (!results) return;
      const trimmed = query.trim();
      const requestId = ++mealTypeSearchRequestId;
      if (trimmed.length < 2) {
        setMealTypeMarkup(results, buildMealTypeIconResultsHTML(MEAL_TYPE_ICON_SUGGESTIONS));
        return;
      }
      setMealTypeMarkup(results, buildMealTypeIconResultsHTML([], "Searching…"));
      try {
        const url = `${ICONIFY_SEARCH_URL}?query=${encodeURIComponent(trimmed)}&limit=${ICONIFY_SEARCH_LIMIT}&prefixes=${ICONIFY_SEARCH_PREFIXES}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("search failed");
        const payload = await response.json();
        if (requestId !== mealTypeSearchRequestId) return;
        const icons = (Array.isArray(payload.icons) ? payload.icons : []).map((icon) => sanitizeMealTypeIcon(icon)).filter(Boolean);
        setMealTypeMarkup(results, buildMealTypeIconResultsHTML(icons, icons.length ? "" : "No icons found. Try another word."));
      } catch {
        if (requestId !== mealTypeSearchRequestId) return;
        setMealTypeMarkup(results, buildMealTypeIconResultsHTML([], "Couldn't search icons right now. Please try again."));
      }
    }

    function isMealTypeLabelTaken(label, ignoreKey = "") {
      const lower = label.trim().toLowerCase();
      return STANDARD_MEAL_TYPES.some((type) => type.label.toLowerCase() === lower)
        || mealTypeEditor.custom.some((entry) => entry.key !== ignoreKey && entry.label.toLowerCase() === lower);
    }

    function handleMealTypeEditorClick(event) {
      if (adminModalType !== "meal-types" || !mealTypeEditor) return;
      const target = event.target;

      const pick = target.closest("[data-mt-pick]");
      if (pick) { openMealTypeIconPicker(pick.getAttribute("data-mt-pick")); return; }

      if (target.closest("[data-mt-picker-back]")) { mealTypeEditor.view = "list"; renderMealTypeEditor(); return; }

      const iconOption = target.closest("[data-mt-icon]");
      if (iconOption) { applyMealTypeIcon(sanitizeMealTypeIcon(iconOption.getAttribute("data-mt-icon"))); return; }

      if (target.closest("[data-mt-icon-reset]")) { applyMealTypeIcon(""); return; }

      const remove = target.closest("[data-mt-remove]");
      if (remove) {
        const key = remove.getAttribute("data-mt-remove");
        mealTypeEditor.custom = mealTypeEditor.custom.filter((entry) => entry.key !== key);
        renderMealTypeEditor();
        return;
      }

      if (target.closest("[data-mt-add]")) {
        const label = mealTypeEditor.newLabel.trim().slice(0, MEAL_TYPE_CUSTOM_LABEL_MAX);
        if (!label) { showToast("Enter a name for the new meal type."); return; }
        if (isMealTypeLabelTaken(label)) { showToast(`"${label}" is already a meal type.`); return; }
        const existingKeys = mealTypeEditor.custom.map((entry) => entry.key);
        mealTypeEditor.custom.push({ key: buildCustomMealTypeKey(label, existingKeys), label, icon: mealTypeEditor.newIcon });
        mealTypeEditor.newLabel = "";
        mealTypeEditor.newIcon = MEAL_TYPE_FALLBACK_ICON;
        renderMealTypeEditor();
      }
    }

    function handleMealTypeEditorInput(event) {
      if (adminModalType !== "meal-types" || !mealTypeEditor) return;
      const target = event.target;

      if (target.matches("[data-mt-search]")) {
        mealTypeEditor.pickerQuery = target.value;
        window.clearTimeout(mealTypeSearchTimer);
        mealTypeSearchTimer = window.setTimeout(() => runMealTypeIconSearch(target.value), ICONIFY_SEARCH_DEBOUNCE_MS);
      } else if (target.matches("[data-mt-new-label]")) {
        mealTypeEditor.newLabel = target.value;
      } else if (target.matches("[data-mt-custom-label]")) {
        const entry = mealTypeEditor.custom.find((item) => item.key === target.getAttribute("data-mt-custom-label"));
        if (entry) entry.label = target.value;
      }
    }

    function handleMealTypeEditorChange(event) {
      if (adminModalType !== "meal-types" || !mealTypeEditor) return;
      const toggle = event.target.closest("[data-mt-toggle]");
      if (!toggle) return;
      const key = toggle.getAttribute("data-mt-toggle");
      mealTypeEditor.enabled = STANDARD_MEAL_TYPES.map((type) => type.value).filter((value) =>
        value === key ? toggle.checked : mealTypeEditor.enabled.includes(value));
    }

    async function saveMealTypeSettings() {
      const editor = mealTypeEditor;
      if (!editor || mealTypeSavePending) return;

      const custom = [];
      for (const entry of editor.custom) {
        const label = entry.label.trim().slice(0, MEAL_TYPE_CUSTOM_LABEL_MAX);
        if (!label) { showToast("Custom meal types need a name."); return; }
        if (custom.some((other) => other.label.toLowerCase() === label.toLowerCase())
          || STANDARD_MEAL_TYPES.some((type) => type.label.toLowerCase() === label.toLowerCase())) {
          showToast(`"${label}" is used more than once.`);
          return;
        }
        custom.push({ key: entry.key, label, icon: entry.icon });
      }
      if (editor.enabled.length + custom.length === 0) {
        showToast("At least one meal type must stay enabled.");
        return;
      }

      const client = getSupabaseClient();
      if (!client) { showToast(friendlySaveMessage()); return; }

      const mealTypes = { enabled: editor.enabled, icons: editor.icons, custom };
      const newDs = { ...adminHouseholdSettings.display_settings, meal_types: mealTypes };

      mealTypeSavePending = true;
      try {
        const { data, error } = await client
          .from("households")
          .update({ display_settings: newDs })
          .eq("id", getAdminHouseholdId())
          .select();
        if (error || !data || data.length === 0) {
          showToast(friendlySaveMessage());
          return;
        }
        adminHouseholdSettings.display_settings = newDs;
        setActiveMealTypeSettings(mealTypes);
        mealTypeEditor = null;
        closeAdminModal();
        if (typeof loadAdminMealPlan === "function") loadAdminMealPlan();
        showToast("Meal types saved.");
      } finally {
        mealTypeSavePending = false;
      }
    }

    function initMealTypeListeners() {
      const openBtn = document.getElementById("settings-meal-types-btn");
      if (openBtn) openBtn.addEventListener("click", openMealTypesModal);
      const body = document.getElementById("admin-modal-body");
      if (!body) return;
      body.addEventListener("click", handleMealTypeEditorClick);
      body.addEventListener("input", handleMealTypeEditorInput);
      body.addEventListener("change", handleMealTypeEditorChange);
    }
