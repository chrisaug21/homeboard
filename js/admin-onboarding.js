    const ADMIN_ONBOARDING_TOTAL_STEPS = 3;
    const adminOnboardingFeatureCards = [
      {
        icon: "check-square",
        title: "To-dos",
        description: "Assign tasks to household members, set due dates, and keep track of what needs doing."
      },
      {
        icon: "calendar",
        title: "Calendar",
        description: "See upcoming events at a glance. Connect Google Calendar to pull in events automatically."
      },
      {
        icon: "timer",
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
      memberNames: [],
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

    function buildAdminOnboardingMemberNames() {
      const displayName = String(adminCurrentUser?.displayName || "").trim();
      return [displayName];
    }

    function renderAdminOnboardingStep1() {
      const firstName = escapeHtml(adminOnboardingState.memberNames[0] || "");
      const additionalRows = adminOnboardingState.memberNames.slice(1).map((name, index) => `
        <div class="admin-onboarding-member-row" data-onboarding-member-row="${index + 1}">
          <input
            class="admin-input"
            type="text"
            maxlength="40"
            value="${escapeHtml(name)}"
            data-onboarding-member-input="${index + 1}"
            placeholder="Member name"
            autocomplete="off"
          >
          <button class="admin-settings-member-remove" type="button" data-onboarding-remove-member="${index + 1}" aria-label="Remove member"${adminOnboardingBusy ? " disabled" : ""}>
            <i data-lucide="x"></i>
          </button>
        </div>
      `).join("");

      return `
        <div class="admin-onboarding-copy">
          <h1 class="admin-onboarding-title" id="admin-onboarding-title">Who&apos;s in your household?</h1>
          <p class="admin-onboarding-note">Add everyone who&apos;ll appear in Homeboard — family members, partners, kids. You can always add more later.</p>
        </div>
        ${adminOnboardingState.error ? `<p class="admin-onboarding-error">${escapeHtml(adminOnboardingState.error)}</p>` : ""}
        <form id="admin-onboarding-step1-form" novalidate>
          <div class="admin-onboarding-members">
            <div class="admin-onboarding-member-row admin-onboarding-member-row--locked">
              <input class="admin-input" type="text" maxlength="40" value="${firstName}" readonly aria-readonly="true">
              <span class="admin-onboarding-member-lock">You</span>
            </div>
            ${additionalRows}
          </div>
          <button class="admin-onboarding-link-button" type="button" id="admin-onboarding-add-member"${adminOnboardingBusy ? " disabled" : ""}>Add another member</button>
          <div class="admin-onboarding-actions">
            <span></span>
            <div class="admin-onboarding-actions-group">
              <button class="admin-button admin-button--primary" type="submit"${adminOnboardingBusy ? " disabled" : ""}>Continue</button>
            </div>
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
          <p class="admin-onboarding-note">This controls how Homeboard looks on your wall display. You can change it anytime in Settings.</p>
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
      } else {
        body.innerHTML = renderAdminOnboardingStep3();
      }

      refreshIcons();
    }

    function openAdminOnboarding(mode = "tour") {
      const root = getAdminOnboardingRoot();
      if (!root) {
        return;
      }

      adminOnboardingState = {
        isOpen: true,
        mode,
        step: 1,
        canDismiss: mode === "tour",
        selectedTheme: "warm",
        memberNames: buildAdminOnboardingMemberNames(),
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

    function collectAdminOnboardingNames() {
      const names = adminOnboardingState.memberNames.map((name) => String(name || "").trim());
      const duplicateNames = new Set();
      const seen = new Set();

      names.forEach((name) => {
        const normalized = name.toLowerCase();
        if (!normalized) {
          return;
        }
        if (seen.has(normalized)) {
          duplicateNames.add(normalized);
          return;
        }
        seen.add(normalized);
      });

      if (names.some((name) => !name)) {
        adminOnboardingState.error = "Add a name for every household member before continuing.";
        return null;
      }

      if (duplicateNames.size > 0) {
        adminOnboardingState.error = "Each household member should only be listed once.";
        return null;
      }

      adminOnboardingState.error = "";
      adminOnboardingState.memberNames = names;
      return names;
    }

    async function saveAdminOnboardingMembers() {
      const client = getSupabaseClient();
      const names = collectAdminOnboardingNames();
      if (!client || !names || !adminCurrentUser?.id) {
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

        const additionalNames = names.slice(1).filter((name) => !existingMemberNames.has(name.toLowerCase()));
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
        if (Number.isInteger(index) && index > 0) {
          adminOnboardingState.memberNames.splice(index, 1);
          adminOnboardingState.error = "";
          renderAdminOnboarding();
        }
        return;
      }

      if (event.target.closest("#admin-onboarding-add-member")) {
        adminOnboardingState.memberNames.push("");
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
      if (!Number.isInteger(index) || index < 1) {
        return;
      }
      adminOnboardingState.memberNames[index] = String(input.value || "").slice(0, 40);
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
        relaunchButton.addEventListener("click", () => openAdminOnboarding("tour"));
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
