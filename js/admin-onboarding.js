    const ADMIN_ONBOARDING_TOTAL_STEPS = 4;
    const adminOnboardingFeatureCards = [
      {
        icon: "list-todo",
        title: "To-dos",
        description: "Assign tasks to household members, set due dates, and keep track of what needs doing."
      },
      {
        icon: "calendar",
        title: "Calendar",
        description: "See upcoming events at a glance. Connect Google Calendar to pull in events automatically."
      },
      {
        icon: "hourglass",
        title: "Countdowns",
        description: "Track things you're looking forward to. Add your own events or turn a Google Calendar event into a countdown."
      },
      {
        icon: "utensils",
        title: "Meal Plan",
        description: "Plan your meals for the week — cooking nights, takeout, Hello Fresh, and more."
      },
      {
        icon: "trophy",
        title: "Scorecards",
        description: "Track friendly competitions between household members. Keep score, crown a winner."
      }
    ];

    let adminOnboardingInitialized = false;
    let adminOnboardingBusy = false;
    let adminOnboardingState = {
      isOpen: false,
      mode: "signup",
      step: 1,
      canDismiss: false,
      selectedTheme: "warm",
      memberRows: [],
      error: ""
    };

    function getAdminOnboardingRoot() {
      return document.getElementById("admin-onboarding");
    }

    function getAdminOnboardingBody() {
      return document.getElementById("admin-onboarding-body");
    }

    function getAdminOnboardingCloseButton() {
      return document.getElementById("admin-onboarding-close");
    }

    function isAdminOnboardingComplete() {
      return adminCurrentUser?.preferences?.onboarding_complete === true;
    }

    function shouldAutoLaunchAdminOnboarding() {
      const params = new URLSearchParams(window.location.search);
      return params.get("onboarding") === "true" && !isAdminOnboardingComplete();
    }

    function buildAdminOnboardingDefaultMemberRows() {
      return [
        {
          name: String(adminCurrentUser?.displayName || "").trim(),
          existing: true,
          locked: true
        }
      ];
    }

    async function loadAdminOnboardingMemberRows(mode) {
      if (mode !== "tour") {
        return buildAdminOnboardingDefaultMemberRows();
      }

      const client = getSupabaseClient();
      if (!client) {
        return buildAdminOnboardingDefaultMemberRows();
      }

      const signedInName = String(adminCurrentUser?.displayName || "").trim();
      const signedInNameKey = signedInName.toLowerCase();
      const { data, error } = await client
        .from("household_members")
        .select("id, display_name")
        .eq("household_id", getAdminHouseholdId())
        .eq("is_active", true)
        .order("display_name", { ascending: true });

      if (error || !Array.isArray(data) || data.length === 0) {
        return buildAdminOnboardingDefaultMemberRows();
      }

      const rows = data
        .map((member) => ({
          id: String(member?.id || "").trim(),
          name: String(member?.display_name || "").trim(),
          existing: true,
          locked: String(member?.display_name || "").trim().toLowerCase() === signedInNameKey
        }))
        .filter((member) => member.name);

      const hasLockedRow = rows.some((row) => row.locked);
      if (!hasLockedRow && signedInName) {
        rows.unshift({
          name: signedInName,
          existing: true,
          locked: true
        });
      }

      rows.sort((left, right) => Number(Boolean(right.locked)) - Number(Boolean(left.locked)));
      return rows.length > 0 ? rows : buildAdminOnboardingDefaultMemberRows();
    }

    function renderAdminOnboardingStep1() {
      const memberRows = Array.isArray(adminOnboardingState.memberRows)
        ? adminOnboardingState.memberRows
        : [];
      const rowsMarkup = memberRows.map((row, index) => `
        <div class="admin-onboarding-member-row${row.locked ? " admin-onboarding-member-row--locked" : ""}" data-onboarding-member-row="${index}">
          <input
            class="admin-input"
            type="text"
            maxlength="40"
            value="${escapeHtml(row.name)}"
            data-onboarding-member-input="${index}"
            placeholder="Member name"
            autocomplete="off"
            ${row.locked ? 'readonly aria-readonly="true"' : ""}
          >
          ${row.locked
            ? '<span class="admin-onboarding-member-lock">You</span>'
            : `<button class="admin-settings-member-remove" type="button" data-onboarding-remove-member="${index}" aria-label="Remove member"${adminOnboardingBusy ? " disabled" : ""}>
                <i data-lucide="x"></i>
              </button>`}
        </div>
      `).join("");

      return `
        <div class="admin-onboarding-copy">
          <h1 class="admin-onboarding-title" id="admin-onboarding-title">Who&apos;s in your household?</h1>
          <p class="admin-onboarding-note">Add everyone who&apos;ll appear in Homeboard — family members, partners, kids. You can always add more later.</p>
        </div>
        ${adminOnboardingState.error ? `<p class="admin-onboarding-error">${escapeHtml(adminOnboardingState.error)}</p>` : ""}
        <form id="admin-onboarding-step1-form" novalidate>
          <div class="admin-onboarding-members">${rowsMarkup}</div>
          <div class="admin-onboarding-actions admin-onboarding-actions--step1">
            <button class="admin-button admin-button--secondary admin-onboarding-add-button" type="button" id="admin-onboarding-add-member"${adminOnboardingBusy ? " disabled" : ""}>Add another member</button>
            <button class="admin-button admin-button--primary" type="submit"${adminOnboardingBusy ? " disabled" : ""}>Continue</button>
          </div>
        </form>
      `;
    }

    function renderAdminOnboardingStep2() {
      const options = [
        { value: "warm", label: "Warm" },
        { value: "dark", label: "Dark" },
        { value: "slate", label: "Slate" }
      ];

      return `
        <div class="admin-onboarding-copy">
          <h1 class="admin-onboarding-title" id="admin-onboarding-title">Choose your display style</h1>
          <p class="admin-onboarding-note">Pick the look and feel for your Admin and wall display. You can change it anytime in Settings.</p>
        </div>
        ${adminOnboardingState.error ? `<p class="admin-onboarding-error">${escapeHtml(adminOnboardingState.error)}</p>` : ""}
        <div class="admin-onboarding-theme-grid" role="radiogroup" aria-label="Display style">
          ${options.map((option) => `
            <button
              class="admin-onboarding-theme-card${adminOnboardingState.selectedTheme === option.value ? " is-selected" : ""}"
              type="button"
              data-onboarding-theme="${option.value}"
              data-theme="${option.value}"
              role="radio"
              aria-checked="${adminOnboardingState.selectedTheme === option.value ? "true" : "false"}"
            >
              <span class="admin-onboarding-theme-preview" aria-hidden="true"></span>
              <span class="admin-onboarding-theme-name">${option.label}</span>
            </button>
          `).join("")}
        </div>
        <div class="admin-onboarding-actions">
          <button class="admin-button admin-button--secondary" type="button" id="admin-onboarding-back"${adminOnboardingBusy ? " disabled" : ""}>Back</button>
          <div class="admin-onboarding-actions-group">
            <button class="admin-button admin-button--primary" type="button" id="admin-onboarding-continue-theme"${adminOnboardingBusy ? " disabled" : ""}>Continue</button>
          </div>
        </div>
      `;
    }

    function renderAdminOnboardingStep3() {
      return `
        <div class="admin-onboarding-copy">
          <h1 class="admin-onboarding-title" id="admin-onboarding-title">Here&apos;s what Homeboard does</h1>
          <p class="admin-onboarding-note">A quick look at what you can manage from your Admin.</p>
        </div>
        ${adminOnboardingState.error ? `<p class="admin-onboarding-error">${escapeHtml(adminOnboardingState.error)}</p>` : ""}
        <div class="admin-onboarding-feature-grid">
          ${adminOnboardingFeatureCards.map((feature) => `
            <article class="admin-onboarding-feature-card">
              <span class="admin-onboarding-feature-icon" aria-hidden="true"><i data-lucide="${escapeHtml(feature.icon)}"></i></span>
              <div>
                <h2 class="admin-onboarding-feature-title">${escapeHtml(feature.title)}</h2>
                <p class="admin-onboarding-feature-copy">${escapeHtml(feature.description)}</p>
              </div>
            </article>
          `).join("")}
        </div>
        <div class="admin-onboarding-actions">
          <button class="admin-button admin-button--secondary" type="button" id="admin-onboarding-back"${adminOnboardingBusy ? " disabled" : ""}>Back</button>
          <div class="admin-onboarding-actions-group">
            <button class="admin-button admin-button--primary" type="button" id="admin-onboarding-continue-features"${adminOnboardingBusy ? " disabled" : ""}>Continue</button>
          </div>
        </div>
      `;
    }

    function renderAdminOnboardingStep4() {
      return `
        <div class="admin-onboarding-copy">
          <h1 class="admin-onboarding-title" id="admin-onboarding-title">Set up your wall display</h1>
          <p class="admin-onboarding-note">Homeboard is designed to run on a tablet or screen mounted in your home.</p>
        </div>
        <ol class="admin-onboarding-instruction-list">
          <li class="admin-onboarding-instruction-item">
            <strong>Open Homeboard on your display device</strong>
            <span>Navigate to <span class="admin-onboarding-inline-code">homeboard.chrisaug.com</span> on the tablet or screen you want to mount. It will show a 4-character pairing code.</span>
          </li>
          <li class="admin-onboarding-instruction-item">
            <strong>Enter the code in Settings</strong>
            <span>In your Admin, go to Settings &rarr; Display Setup and enter the code. Your display will pair instantly.</span>
          </li>
        </ol>
        <p class="admin-onboarding-note admin-onboarding-note--subtle">Don&apos;t have a display device set up yet? No problem — you can do this anytime from Settings.</p>
        <div class="admin-onboarding-actions">
          <button class="admin-button admin-button--secondary" type="button" id="admin-onboarding-back"${adminOnboardingBusy ? " disabled" : ""}>Back</button>
          <div class="admin-onboarding-actions-group">
            <button class="admin-button admin-button--primary" type="button" id="admin-onboarding-finish"${adminOnboardingBusy ? " disabled" : ""}>Get started</button>
          </div>
        </div>
      `;
    }

    function renderAdminOnboarding() {
      const root = getAdminOnboardingRoot();
      const body = getAdminOnboardingBody();
      const stepLabel = document.getElementById("admin-onboarding-step-label");
      const closeButton = getAdminOnboardingCloseButton();
      if (!root || !body || !stepLabel || !closeButton) {
        return;
      }

      stepLabel.textContent = `Step ${adminOnboardingState.step} of ${ADMIN_ONBOARDING_TOTAL_STEPS}`;
      closeButton.hidden = !adminOnboardingState.canDismiss;

      if (adminOnboardingState.step === 1) {
        body.innerHTML = renderAdminOnboardingStep1();
      } else if (adminOnboardingState.step === 2) {
        body.innerHTML = renderAdminOnboardingStep2();
      } else if (adminOnboardingState.step === 3) {
        body.innerHTML = renderAdminOnboardingStep3();
      } else {
        body.innerHTML = renderAdminOnboardingStep4();
      }

      refreshIcons();
    }

    async function openAdminOnboarding(mode = "tour") {
      const root = getAdminOnboardingRoot();
      if (!root) {
        return;
      }

      const memberRows = await loadAdminOnboardingMemberRows(mode);
      adminOnboardingState = {
        isOpen: true,
        mode,
        step: 1,
        canDismiss: mode === "tour",
        selectedTheme: "warm",
        memberRows,
        error: ""
      };
      adminOnboardingBusy = false;
      root.hidden = false;
      document.body.style.overflow = "hidden";
      renderAdminOnboarding();
    }

    function closeAdminOnboarding() {
      const root = getAdminOnboardingRoot();
      if (!root) {
        return;
      }

      adminOnboardingState.isOpen = false;
      adminOnboardingState.error = "";
      adminOnboardingBusy = false;
      root.hidden = true;
      document.body.style.overflow = "";
    }

    function removeOnboardingParamFromUrl() {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("onboarding");
      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      window.history.replaceState(window.history.state, "", nextPath);
    }

    function buildNextDisplaySettingsMembers(namesToEnsure) {
      const existingMembers = Array.isArray(adminHouseholdSettings?.display_settings?.members)
        ? adminHouseholdSettings.display_settings.members
            .map((member) => ({
              name: String(member?.name || "").trim(),
              color: String(member?.color || "").trim()
            }))
            .filter((member) => member.name)
        : [];
      const nextMembers = [...existingMembers];
      const existingNames = new Set(nextMembers.map((member) => member.name.toLowerCase()));

      namesToEnsure.forEach((name) => {
        const safeName = String(name || "").trim();
        if (!safeName || existingNames.has(safeName.toLowerCase())) {
          return;
        }
        nextMembers.push({
          name: safeName,
          color: PERSON_COLOR_PALETTE[nextMembers.length % PERSON_COLOR_PALETTE.length]
        });
        existingNames.add(safeName.toLowerCase());
      });

      return {
        ...adminHouseholdSettings.display_settings,
        members: nextMembers
      };
    }

    function collectAdminOnboardingRows() {
      const rows = (adminOnboardingState.memberRows || []).map((row) => ({
        ...row,
        name: String(row?.name || "").trim()
      }));
      const duplicateNames = new Set();
      const seen = new Set();

      rows.forEach((row) => {
        const normalized = row.name.toLowerCase();
        if (!normalized) {
          return;
        }
        if (seen.has(normalized)) {
          duplicateNames.add(normalized);
          return;
        }
        seen.add(normalized);
      });

      if (rows.some((row) => !row.name)) {
        adminOnboardingState.error = "Add a name for every household member before continuing.";
        return null;
      }

      if (duplicateNames.size > 0) {
        adminOnboardingState.error = "Each household member should only be listed once.";
        return null;
      }

      adminOnboardingState.error = "";
      adminOnboardingState.memberRows = rows;
      return rows;
    }

    async function saveAdminOnboardingMembers() {
      const client = getSupabaseClient();
      const rows = collectAdminOnboardingRows();
      if (!client || !rows || !adminCurrentUser?.id) {
        if (!client) {
          adminOnboardingState.error = friendlySaveMessage();
          renderAdminOnboarding();
        }
        return;
      }

      adminOnboardingBusy = true;
      renderAdminOnboarding();

      try {
        const { data: existingMembers, error: existingMembersError } = await client
          .from("household_members")
          .select("display_name")
          .eq("household_id", getAdminHouseholdId());

        if (existingMembersError) {
          adminOnboardingState.error = friendlySaveMessage();
          return;
        }

        const existingMemberNames = new Set(
          (existingMembers || [])
            .map((member) => String(member?.display_name || "").trim().toLowerCase())
            .filter(Boolean)
        );

        const names = rows.map((row) => row.name);
        const additionalNames = rows
          .filter((row) => !row.existing)
          .map((row) => row.name)
          .filter((name) => !existingMemberNames.has(name.toLowerCase()));
        if (additionalNames.length > 0) {
          const { error: insertError } = await client
            .from("household_members")
            .insert(additionalNames.map((name) => ({
              household_id: getAdminHouseholdId(),
              display_name: name
            })));

          if (insertError) {
            adminOnboardingState.error = friendlySaveMessage();
            return;
          }
        }

        const nextDisplaySettings = buildNextDisplaySettingsMembers(names);
        const { error: householdError } = await client
          .from("households")
          .update({ display_settings: nextDisplaySettings })
          .eq("id", getAdminHouseholdId());

        if (householdError) {
          adminOnboardingState.error = friendlySaveMessage();
          return;
        }

        adminOnboardingState.memberRows = rows.map((row) => ({
          ...row,
          existing: true
        }));
        adminHouseholdSettings.display_settings = nextDisplaySettings;
        adminOnboardingState.step = 2;
        adminOnboardingState.error = "";
        if (typeof loadAdminSettings === "function" && adminScreen === "settings") {
          loadAdminSettings();
        }
        if (typeof loadAdminTodos === "function") {
          loadAdminTodos();
        }
      } finally {
        adminOnboardingBusy = false;
        renderAdminOnboarding();
      }
    }

    async function saveAdminOnboardingTheme() {
      const client = getSupabaseClient();
      if (!client || !adminCurrentUser?.id) {
        adminOnboardingState.error = friendlySaveMessage();
        renderAdminOnboarding();
        return;
      }

      adminOnboardingBusy = true;
      renderAdminOnboarding();

      try {
        const selectedTheme = normalizeAdminTheme(adminOnboardingState.selectedTheme);
        const { error: householdError } = await client
          .from("households")
          .update({ color_scheme: selectedTheme })
          .eq("id", getAdminHouseholdId());

        if (householdError) {
          adminOnboardingState.error = friendlySaveMessage();
          return;
        }

        const nextPreferences = {
          ...(adminCurrentUser.preferences || {}),
          admin_theme: selectedTheme
        };
        const { data, error: userError } = await client
          .from("users")
          .update({ preferences: nextPreferences })
          .eq("id", adminCurrentUser.id)
          .select("preferences")
          .single();

        if (userError || !data) {
          adminOnboardingState.error = friendlySaveMessage();
          return;
        }

        adminCurrentUser = {
          ...adminCurrentUser,
          preferences: {
            ...(data.preferences && typeof data.preferences === "object" ? data.preferences : {}),
            admin_theme: normalizeAdminTheme(data.preferences?.admin_theme)
          }
        };
        adminHouseholdSettings.color_scheme = selectedTheme;
        applyAdminTheme(selectedTheme);
        if (typeof loadAdminAccountSettings === "function") {
          loadAdminAccountSettings();
        }
        if (typeof loadAdminSettings === "function" && adminScreen === "settings") {
          loadAdminSettings();
        }
        adminOnboardingState.step = 3;
        adminOnboardingState.error = "";
      } finally {
        adminOnboardingBusy = false;
        renderAdminOnboarding();
      }
    }

    async function completeAdminOnboarding() {
      const client = getSupabaseClient();
      if (!client || !adminCurrentUser?.id) {
        adminOnboardingState.error = friendlySaveMessage();
        renderAdminOnboarding();
        return;
      }

      adminOnboardingBusy = true;
      renderAdminOnboarding();

      try {
        const nextPreferences = {
          ...(adminCurrentUser.preferences || {}),
          onboarding_complete: true
        };
        const { data, error } = await client
          .from("users")
          .update({ preferences: nextPreferences })
          .eq("id", adminCurrentUser.id)
          .select("preferences")
          .single();

        if (error || !data) {
          adminOnboardingState.error = friendlySaveMessage();
          return;
        }

        adminCurrentUser = {
          ...adminCurrentUser,
          preferences: {
            ...(data.preferences && typeof data.preferences === "object" ? data.preferences : {}),
            admin_theme: normalizeAdminTheme(data.preferences?.admin_theme)
          }
        };
        removeOnboardingParamFromUrl();
        if (typeof loadAdminAccountSettings === "function") {
          loadAdminAccountSettings();
        }
        closeAdminOnboarding();
      } finally {
        adminOnboardingBusy = false;
        if (adminOnboardingState.isOpen) {
          renderAdminOnboarding();
        }
      }
    }

    function handleAdminOnboardingBodyClick(event) {
      if (!adminOnboardingState.isOpen) {
        return;
      }
      if (adminOnboardingBusy) {
        return;
      }

      const removeButton = event.target.closest("[data-onboarding-remove-member]");
      if (removeButton) {
        const index = Number(removeButton.getAttribute("data-onboarding-remove-member"));
        const row = adminOnboardingState.memberRows[index];
        if (Number.isInteger(index) && index >= 0 && row && !row.locked) {
          adminOnboardingState.memberRows.splice(index, 1);
          adminOnboardingState.error = "";
          renderAdminOnboarding();
        }
        return;
      }

      if (event.target.closest("#admin-onboarding-add-member")) {
        adminOnboardingState.memberRows.push({
          name: "",
          existing: false,
          locked: false
        });
        adminOnboardingState.error = "";
        renderAdminOnboarding();
        const inputs = Array.from(document.querySelectorAll("[data-onboarding-member-input]"));
        const lastInput = inputs[inputs.length - 1];
        if (lastInput) {
          lastInput.focus();
        }
        return;
      }

      const themeButton = event.target.closest("[data-onboarding-theme]");
      if (themeButton) {
        adminOnboardingState.selectedTheme = normalizeAdminTheme(themeButton.getAttribute("data-onboarding-theme"));
        adminOnboardingState.error = "";
        renderAdminOnboarding();
        return;
      }

      if (event.target.closest("#admin-onboarding-back")) {
        adminOnboardingState.step = Math.max(1, adminOnboardingState.step - 1);
        adminOnboardingState.error = "";
        renderAdminOnboarding();
        return;
      }

      if (event.target.closest("#admin-onboarding-continue-theme")) {
        saveAdminOnboardingTheme();
        return;
      }

      if (event.target.closest("#admin-onboarding-continue-features")) {
        adminOnboardingState.step = 4;
        adminOnboardingState.error = "";
        renderAdminOnboarding();
        return;
      }

      if (event.target.closest("#admin-onboarding-finish")) {
        completeAdminOnboarding();
      }
    }

    function handleAdminOnboardingBodyInput(event) {
      const input = event.target.closest("[data-onboarding-member-input]");
      if (!input) {
        return;
      }
      const index = Number(input.getAttribute("data-onboarding-member-input"));
      if (!Number.isInteger(index) || index < 0 || !adminOnboardingState.memberRows[index]) {
        return;
      }
      adminOnboardingState.memberRows[index].name = String(input.value || "").slice(0, 40);
      adminOnboardingState.error = "";
    }

    function handleAdminOnboardingBodySubmit(event) {
      const form = event.target.closest("#admin-onboarding-step1-form");
      if (!form) {
        return;
      }
      event.preventDefault();
      saveAdminOnboardingMembers();
    }

    function handleAdminOnboardingClose() {
      if (!adminOnboardingState.canDismiss || adminOnboardingBusy) {
        return;
      }
      closeAdminOnboarding();
    }

    function handleAdminOnboardingKeydown(event) {
      if (event.key !== "Escape" || !adminOnboardingState.isOpen || !adminOnboardingState.canDismiss) {
        return;
      }
      event.preventDefault();
      handleAdminOnboardingClose();
    }

    function initAdminOnboarding() {
      if (adminOnboardingInitialized) {
        return;
      }
      adminOnboardingInitialized = true;

      const body = getAdminOnboardingBody();
      const closeButton = getAdminOnboardingCloseButton();
      const relaunchButton = document.getElementById("settings-onboarding-tour-btn");

      if (body) {
        body.addEventListener("click", handleAdminOnboardingBodyClick);
        body.addEventListener("input", handleAdminOnboardingBodyInput);
        body.addEventListener("submit", handleAdminOnboardingBodySubmit);
      }
      if (closeButton) {
        closeButton.addEventListener("click", handleAdminOnboardingClose);
      }
      if (relaunchButton) {
        relaunchButton.addEventListener("click", () => {
          openAdminOnboarding("tour");
        });
      }
      document.addEventListener("keydown", handleAdminOnboardingKeydown);
    }

    async function maybeAutoLaunchAdminOnboarding() {
      if (!shouldAutoLaunchAdminOnboarding() || adminOnboardingState.isOpen) {
        return;
      }

      try {
        await ensureAdminHouseholdConfigLoaded();
      } catch {
        showToast(friendlyLoadMessage());
        return;
      }

      openAdminOnboarding("signup");
    }
