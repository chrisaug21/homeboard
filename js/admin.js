    const adminActiveList = document.getElementById("admin-active-list");
    const adminArchivedList = document.getElementById("admin-archived-list");
    const adminActiveSummary = document.getElementById("admin-active-summary");
    const adminArchivedSummary = document.getElementById("admin-archived-summary");
    const adminScreens = Array.from(document.querySelectorAll("[data-admin-screen]"));
    const adminNavButtons = Array.from(document.querySelectorAll("[data-admin-nav]"));
    const adminSettingsButton = document.getElementById("admin-settings-button");
    const adminMealList = document.getElementById("admin-meal-list");
    const adminMealNoteWrap = document.getElementById("admin-meal-note-wrap");
    const adminMealWeekLabel = document.getElementById("admin-meal-week-label");
    const adminWeekPrevBtn = document.getElementById("admin-week-prev");
    const adminWeekNextBtn = document.getElementById("admin-week-next");
    const adminWeekTodayBtn = document.getElementById("admin-week-today");
    const toastEl = document.getElementById("toast");
    const adminCalEventList = document.getElementById("admin-cal-event-list");
    const adminCalEventsNote = document.getElementById("admin-cal-events-note");
    const adminSavedCountdownList = document.getElementById("admin-saved-countdown-list");
    const adminSavedCountdownsNote = document.getElementById("admin-saved-countdowns-note");
    const adminTodoAddButton = document.getElementById("admin-todo-add-button");
    const adminCountdownAddButton = document.getElementById("admin-countdown-add-button");
    const adminRsvpUnmatchedList = document.getElementById("admin-rsvp-unmatched-list");
    const adminRsvpUnmatchedNote = document.getElementById("admin-rsvp-unmatched-note");
    const adminRsvpGuestList = document.getElementById("admin-rsvp-guest-list");
    const adminRsvpGuestListNote = document.getElementById("admin-rsvp-guest-list-note");
    const adminScorecardList = document.getElementById("admin-scorecard-list");
    const adminScorecardsNote = document.getElementById("admin-scorecards-note");
    const adminScorecardAddButton = document.getElementById("admin-scorecard-add-button");

    // Person color palette — distinct from status colors (amber, sage, rose)
    const PERSON_COLOR_PALETTE = [
      "#2563eb", "#9333ea", "#0891b2", "#be123c",
      "#c2410c", "#0f766e", "#6d28d9", "#16a34a"
    ];
    const SCORECARD_PLAYER_COLOR_PALETTE = [
      "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"
    ];

    // Screen definitions for settings UI
    const CONFIGURABLE_SCREENS = DISPLAY_SCREEN_KEYS.filter((key) => key !== "rsvp");
    const SCREEN_LABELS = {
      upcoming_calendar: "Upcoming Calendar",
      monthly_calendar: "Monthly Calendar",
      todos: "To-Do List",
      meals: "Meal Plan",
      countdowns: "Countdowns",
      scorecards: "Scorecards"
    };
    const TIMER_SCREEN_KEYS = DISPLAY_SCREEN_KEYS.filter((key) => key !== "rsvp");
    const TIMER_LABELS = {
      upcoming_calendar: "Upcoming Calendar",
      monthly_calendar: "Monthly Calendar",
      todos: "To-Do List",
      meals: "Meal Plan",
      countdowns: "Countdowns",
      scorecards: "Scorecards"
    };
    const TIMER_DEFAULTS = { upcoming_calendar: 30, monthly_calendar: 60, todos: 45, meals: 30, countdowns: 15, scorecards: 30 };

    // Loaded from Supabase at admin init; falls back to defaults so todo form always works
    let adminHouseholdSettings = {
      assistant_name: "",
      color_scheme: "warm",
      google_cal_id: "",
      display_settings: {
        members: []
      }
    };
    let assistantSavePending = false;
    let displaySavePending = false;
    let integrationsSavePending = false;
    let membersSavePending = false;
    let pendingMemberRemovalIndex = null;
    let adminHouseholdConfigPromise = null;
    let adminHouseholdConfigLoaded = false;

    let toastTimeoutId = null;
    let adminTodoWritePending = false;
    let adminMealWritePending = false;
    let adminCurrentNote = "";
    let adminNoteWritePending = false;
    let adminScreen = "todos";
    let adminWeekOffset = 0;
    let adminCurrentMonday = null;
    let adminMealPlanRows = [];
    let adminCountdownWritePending = false;
    let adminCountdownEditPending = false;
    let adminModalType = null;
    let adminModalContext = null;
    let adminTodos = [];
    let adminArchivedMonth = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })();
    const adminPendingPhotos = new Map();
    let adminCalEvents = [];
    let adminSavedCountdowns = [];
    let adminWeddingSnapshot = null;
    let adminRsvpWritePending = false;
    let adminScorecardWritePending = false;
    let adminScorecards = [];
    let adminScorecardSessionsById = new Map();
    let adminScorecardBonusStateById = new Map();
    let adminScorecardArchiveConfirmId = "";
    const adminScorecardBonusPeekTimerByKey = new Map();
    const adminScorecardBonusAdvanceTimerById = new Map();
    let adminTodoLoadRequestId = 0;
    const refreshingCountdowns = new Set();
    let adminCalMonthDate = (() => {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    })();

    function setAdminConfigDependentUiDisabled(disabled) {
      const elementIds = [
        "settings-assistant-name",
        "settings-assistant-save",
        "settings-member-input",
        "settings-member-add-btn",
        "settings-display-save",
        "settings-integrations-save"
      ];

      elementIds.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
          element.disabled = disabled;
        }
      });

      const displayInputs = document.querySelectorAll("#admin-screen-settings input, #admin-screen-settings select, #admin-screen-settings button");
      displayInputs.forEach((element) => {
        if (element.id !== "settings-sync-btn") {
          element.disabled = disabled;
        }
      });
    }

    async function ensureAdminHouseholdConfigLoaded(forceReload = false) {
      if (forceReload || !adminHouseholdConfigPromise) {
        setAdminConfigDependentUiDisabled(true);
        adminHouseholdConfigLoaded = false;
        adminHouseholdConfigPromise = loadAdminHouseholdConfig()
          .then(() => {
            adminHouseholdConfigLoaded = true;
            setAdminConfigDependentUiDisabled(false);
          })
          .catch((error) => {
            adminHouseholdConfigLoaded = false;
            setAdminConfigDependentUiDisabled(true);
            adminHouseholdConfigPromise = null;
            throw error;
          });
      }

      await adminHouseholdConfigPromise;
      return adminHouseholdConfigLoaded;
    }

    function buildMealTypeOptionsHTML(selectedType) {
      return mealTypeOptions.map((option) =>
        `<option value="${escapeHtml(option.value)}"${option.value === selectedType ? " selected" : ""}>${escapeHtml(option.adminLabel)}</option>`
      ).join("");
    }

    function formatAdminTodoDate(dueDate) {
      if (!dueDate) {
        return "No due date";
      }

      const parsedDate = parseLocalDateString(dueDate);

      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        return "No due date";
      }

      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric"
      }).format(parsedDate);
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

    function formatAdminGuestCount(count) {
      const safeCount = Math.max(0, Number(count) || 0);
      return `${safeCount} ${safeCount === 1 ? "guest" : "guests"}`;
    }

    function getAdminRsvpStatusMeta(party) {
      if (party.linkedRsvp && party.linkedRsvp.attending === true) {
        const guestCount = Math.min(party.linkedRsvp.guestCount, party.invitedCount);
        const isUnderCount = guestCount < party.invitedCount;
        return {
          label: isUnderCount
            ? `Attending • ${guestCount} of ${party.invitedCount}`
            : `Attending • ${formatAdminGuestCount(guestCount)}`,
          tone: isUnderCount ? "admin-rsvp-status--under-count" : "admin-rsvp-status--attending",
          rank: 0
        };
      }

      if (party.linkedRsvp && party.linkedRsvp.attending === false) {
        return {
          label: "Declined",
          tone: "admin-rsvp-status--declined",
          rank: 1
        };
      }

      return {
        label: "Pending",
        tone: "admin-rsvp-status--pending",
        rank: 2
      };
    }

    function showToast(message) {
      window.clearTimeout(toastTimeoutId);
      toastEl.textContent = message;
      toastEl.classList.add("is-visible");

      toastTimeoutId = window.setTimeout(() => {
        toastEl.classList.remove("is-visible");
      }, 2800);
    }

    function friendlyLoadMessage() {
      return "Something went wrong loading your data. Please try refreshing.";
    }

    function friendlySaveMessage() {
      return "Something went wrong saving your changes. Please try again.";
    }

    function friendlyDeleteMessage() {
      return "Something went wrong deleting this item. Please try again.";
    }

    function buildAdminAssigneePill(name) {
      const memberColor = getConfiguredMemberColor(adminHouseholdSettings?.display_settings?.members, name);

      if (!memberColor) {
        return `<span class="admin-pill">${escapeHtml(name)}</span>`;
      }

      return `
        <span class="admin-pill admin-pill--member" style="background:${escapeHtml(hexToRgba(memberColor, 0.16))};color:${escapeHtml(memberColor)}">
          ${escapeHtml(name)}
        </span>
      `;
    }

    function buildAdminTodoSkeletonHTML() {
      const activeCard = () => `
        <article class="admin-todo-card admin-todo-card--active admin-skeleton-card" aria-hidden="true">
          <div class="todo-check-btn"><div class="todo-check"></div></div>
          <div class="admin-todo-body">
            <div class="sk" style="width:72%;height:18px;"></div>
            <div class="admin-todo-meta">
              <span class="sk" style="width:92px;height:28px;border-radius:12px;"></span>
              <span class="sk" style="width:74px;height:28px;border-radius:12px;"></span>
            </div>
          </div>
        </article>
      `;

      const archivedCard = () => `
        <article class="admin-todo-card admin-skeleton-card" aria-hidden="true">
          <div class="admin-todo-body">
            <div class="sk" style="width:68%;height:18px;"></div>
            <div class="admin-todo-meta">
              <span class="sk" style="width:90px;height:28px;border-radius:12px;"></span>
            </div>
          </div>
        </article>
      `;

      return {
        active: Array.from({ length: 4 }, activeCard).join(""),
        archived: Array.from({ length: 3 }, archivedCard).join("")
      };
    }

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

    function buildAdminCalendarSkeletonHTML() {
      return Array.from({ length: 4 }, () => `
        <article class="admin-cal-event-card admin-skeleton-card" aria-hidden="true">
          <div class="sk" style="width:62%;height:18px;"></div>
          <div class="admin-cal-event-meta">
            <span class="sk" style="width:84px;height:28px;border-radius:12px;"></span>
          </div>
        </article>
      `).join("");
    }

    function buildAdminCountdownSkeletonHTML() {
      return Array.from({ length: 3 }, () => `
        <article class="admin-saved-countdown-card admin-skeleton-card" aria-hidden="true">
          <div class="admin-countdown-card-main">
            <div class="sk" style="width:72px;height:96px;border-radius:8px;"></div>
            <div class="admin-countdown-card-body">
              <div class="sk" style="width:70%;height:18px;"></div>
              <div class="admin-countdown-card-meta">
                <span class="sk" style="width:96px;height:12px;"></span>
                <span class="sk" style="width:88px;height:12px;"></span>
              </div>
            </div>
          </div>
          <div class="admin-countdown-actions">
            <span class="sk" style="width:64px;height:32px;border-radius:8px;"></span>
            <span class="sk" style="width:104px;height:32px;border-radius:8px;"></span>
          </div>
        </article>
      `).join("");
    }

    function buildAdminRsvpReviewSkeletonHTML() {
      return Array.from({ length: 4 }, () => `
        <article class="admin-rsvp-review-row admin-skeleton-card" aria-hidden="true">
          <div class="admin-rsvp-review-main">
            <div class="sk" style="width:136px;height:18px;"></div>
            <div class="sk" style="width:110px;height:12px;"></div>
          </div>
          <div class="admin-rsvp-review-side">
            <span class="sk" style="width:92px;height:28px;border-radius:12px;"></span>
          </div>
        </article>
      `).join("");
    }

    function buildAdminRsvpGuestSkeletonHTML() {
      return Array.from({ length: 5 }, () => `
        <article class="admin-rsvp-guest-row admin-skeleton-card" aria-hidden="true">
          <div class="admin-rsvp-guest-main">
            <div class="sk" style="width:160px;height:18px;"></div>
            <div class="sk" style="width:96px;height:12px;"></div>
          </div>
          <span class="sk" style="width:128px;height:30px;border-radius:12px;"></span>
        </article>
      `).join("");
    }

    function renderAdminSettingsSkeleton() {
      const membersList = document.getElementById("settings-members-list");
      const orderList = document.getElementById("settings-screen-order");
      const timerList = document.getElementById("settings-timer-list");
      const assistantInput = document.getElementById("settings-assistant-name");
      const memberInput = document.getElementById("settings-member-input");
      const googleCalInput = document.getElementById("settings-google-cal-id");
      const upcomingDays = document.getElementById("settings-upcoming-days");

      if (membersList) {
        membersList.innerHTML = Array.from({ length: 3 }, () => `
          <div class="admin-settings-member-row admin-skeleton-card" aria-hidden="true">
            <span class="sk" style="width:13px;height:13px;border-radius:50%;"></span>
            <span class="sk" style="width:132px;height:16px;"></span>
          </div>
        `).join("");
      }

      if (orderList) {
        orderList.innerHTML = Array.from({ length: CONFIGURABLE_SCREENS.length }, () => `
          <li class="admin-settings-order-item admin-skeleton-card" aria-hidden="true">
            <span class="sk" style="width:150px;height:16px;"></span>
            <div class="admin-settings-order-arrows">
              <span class="sk" style="width:28px;height:28px;border-radius:8px;"></span>
              <span class="sk" style="width:28px;height:28px;border-radius:8px;"></span>
            </div>
          </li>
        `).join("");
      }

      if (timerList) {
        timerList.innerHTML = Array.from({ length: TIMER_SCREEN_KEYS.length }, () => `
          <div class="admin-settings-timer-row admin-skeleton-card" aria-hidden="true">
            <span class="sk" style="width:132px;height:16px;"></span>
            <span class="sk" style="width:68px;height:36px;border-radius:8px;"></span>
            <span class="sk" style="width:18px;height:12px;"></span>
          </div>
        `).join("");
      }

      [assistantInput, memberInput, googleCalInput, upcomingDays].forEach((element) => {
        if (!element) return;
        element.value = "";
        element.classList.add("admin-input--skeleton");
      });
    }

    function clearFieldError(input) {
      if (!input) return;
      input.removeAttribute("aria-invalid");
      input.style.borderColor = "";
      const field = input.closest(".admin-field");
      const errorEl = field && field.querySelector(".admin-field-error");
      if (errorEl) {
        errorEl.remove();
      }
    }

    function setFieldError(input, message) {
      if (!input) return;
      clearFieldError(input);
      input.setAttribute("aria-invalid", "true");
      input.style.borderColor = "var(--rose)";
      const field = input.closest(".admin-field");
      if (!field) return;
      const errorEl = document.createElement("div");
      errorEl.className = "admin-field-error";
      errorEl.textContent = message;
      field.appendChild(errorEl);
    }

    function validatePositiveIntegerField(form, fieldName, message) {
      const input = form.querySelector(`[name='${fieldName}']`);
      if (!input) return null;
      const rawValue = String(input.value || "").trim();
      const parsedValue = Number(rawValue);
      if (!rawValue || !Number.isInteger(parsedValue) || parsedValue <= 0) {
        setFieldError(input, message);
        input.focus();
        return null;
      }
      clearFieldError(input);
      return parsedValue;
    }

    function applyExpectedPartyRsvpState(query, expectedRsvpId) {
      return expectedRsvpId
        ? query.eq("rsvp_id", expectedRsvpId)
        : query.is("rsvp_id", null);
    }

    function setModalSaving(isBusy, defaultLabel) {
      const btn = document.querySelector("#admin-modal-body [type='submit']");
      if (btn) {
        btn.disabled = isBusy;
        if (isBusy) {
          if (!btn.dataset.savedLabel) btn.dataset.savedLabel = btn.textContent;
          btn.textContent = "Saving\u2026";
        } else {
          btn.textContent = defaultLabel || btn.dataset.savedLabel || "Save";
          delete btn.dataset.savedLabel;
        }
      }
    }

    function openAdminModal(title, bodyHTML) {
      const modal = document.getElementById("admin-modal");
      const modalTitle = document.getElementById("admin-modal-title");
      const modalBody = document.getElementById("admin-modal-body");
      if (!modal || !modalTitle || !modalBody) return;
      modalTitle.textContent = title;
      modalBody.innerHTML = bodyHTML;
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      const firstInput = modalBody.querySelector("input:not([type='hidden']), select, textarea");
      if (firstInput) {
        firstInput.focus();
        if (firstInput.value && (firstInput.type === "text" || firstInput.type === "number")) {
          firstInput.setSelectionRange(firstInput.value.length, firstInput.value.length);
        }
      }
      refreshIcons();
    }

    function closeAdminModal() {
      const modal = document.getElementById("admin-modal");
      if (!modal || modal.hidden) return;
      adminScorecardArchiveConfirmId = "";
      modal.hidden = true;
      const modalBody = document.getElementById("admin-modal-body");
      if (modalBody) modalBody.innerHTML = "";
      document.body.style.overflow = "";
      // Clean up any pending photos
      if (adminModalType === "edit-countdown" && adminModalContext && adminModalContext.id) {
        adminPendingPhotos.delete(adminModalContext.id);
      } else if (adminModalType === "add-countdown") {
        adminPendingPhotos.delete("modal-create");
      }
      adminModalType = null;
      adminModalContext = null;
    }

    function handleEscapeKey(event) {
      if (event.key === "Escape") closeAdminModal();
    }

    function handleAdminModalClick(event) {
      if (event.target.classList.contains("admin-modal-backdrop")) {
        closeAdminModal();
        return;
      }
      if (event.target.closest("[data-action='close-modal']")) {
        closeAdminModal();
        return;
      }
      const linkSuggestionBtn = event.target.closest("[data-action='link-rsvp-party']");
      if (linkSuggestionBtn) {
        const partyId = linkSuggestionBtn.getAttribute("data-party-id");
        const rsvpId = linkSuggestionBtn.getAttribute("data-rsvp-id");
        if (partyId && rsvpId) {
          linkInvitedPartyToRsvp(partyId, rsvpId);
        }
        return;
      }
      const selectLinkedRsvpBtn = event.target.closest("[data-action='select-linked-rsvp']");
      if (selectLinkedRsvpBtn) {
        const form = selectLinkedRsvpBtn.closest("form[data-modal-form='rsvp-party']");
        if (!form) return;
        const rsvpIdInput = form.querySelector("[name='linked_rsvp_id']");
        const label = form.querySelector("[data-role='linked-rsvp-name']");
        const selectedName = selectLinkedRsvpBtn.getAttribute("data-rsvp-name") || "Matched RSVP";
        const selectedId = selectLinkedRsvpBtn.getAttribute("data-rsvp-id") || "";
        if (rsvpIdInput) rsvpIdInput.value = selectedId;
        if (label) label.textContent = selectedName;
        form.querySelectorAll(".admin-rsvp-search-result").forEach((row) => row.classList.remove("is-selected"));
        selectLinkedRsvpBtn.classList.add("is-selected");
        return;
      }
      const unlinkBtn = event.target.closest("[data-action='unlink-rsvp-party']");
      if (unlinkBtn) {
        const form = unlinkBtn.closest("form[data-modal-form='rsvp-party']");
        if (!form) return;
        const rsvpIdInput = form.querySelector("[name='linked_rsvp_id']");
        const label = form.querySelector("[data-role='linked-rsvp-name']");
        if (rsvpIdInput) rsvpIdInput.value = "";
        if (label) label.textContent = "No linked RSVP";
        form.querySelectorAll(".admin-rsvp-search-result").forEach((row) => row.classList.remove("is-selected"));
        return;
      }
      const confirmLowConfidenceBtn = event.target.closest("[data-action='review-confirm-low-confidence']");
      if (confirmLowConfidenceBtn) {
        const rsvpId = confirmLowConfidenceBtn.getAttribute("data-rsvp-id");
        const partyId = confirmLowConfidenceBtn.getAttribute("data-party-id");
        if (rsvpId && partyId) {
          confirmLowConfidenceReview(rsvpId, partyId);
        }
        return;
      }
      const relinkBtn = event.target.closest("[data-action='review-relink']");
      if (relinkBtn) {
        const rsvpId = relinkBtn.getAttribute("data-rsvp-id");
        const partyId = relinkBtn.getAttribute("data-party-id");
        if (rsvpId && partyId) {
          unlinkPartyAndReopenReview(partyId, rsvpId);
        }
        return;
      }
      if (event.target.closest("[data-action='get-photo-modal']")) {
        handleGetPhotoModal();
        return;
      }
      const viewPhotoBtn = event.target.closest("[data-action='view-photo']");
      if (viewPhotoBtn) {
        openAdminLightbox(
          viewPhotoBtn.getAttribute("data-full-url"),
          viewPhotoBtn.getAttribute("data-credit")
        );
        return;
      }
      const removePhotoBtn = event.target.closest("[data-action='remove-photo-modal']");
      if (removePhotoBtn) {
        // Stage the removal — only persist to Supabase when the user clicks Save
        const preview = removePhotoBtn.closest(".admin-edit-photo-preview");
        if (preview) preview.hidden = true;
        const form = removePhotoBtn.closest("form");
        if (form && !form.querySelector("[name='remove_photo']")) {
          const hidden = document.createElement("input");
          hidden.type = "hidden";
          hidden.name = "remove_photo";
          hidden.value = "1";
          form.appendChild(hidden);
        }
        return;
      }
      const addPlayerBtn = event.target.closest("[data-action='add-scorecard-player']");
      if (addPlayerBtn) {
        const list = document.querySelector(".admin-scorecard-player-list");
        if (!list || list.children.length >= 6) return;
        list.insertAdjacentHTML("beforeend", buildScorecardPlayerRowHTML({
          name: "",
          color: SCORECARD_PLAYER_COLOR_PALETTE[list.children.length % SCORECARD_PLAYER_COLOR_PALETTE.length]
        }, list.children.length));
        refreshIcons();
        return;
      }
      const removePlayerBtn = event.target.closest("[data-action='remove-scorecard-player']");
      if (removePlayerBtn) {
        const list = removePlayerBtn.closest(".admin-scorecard-player-list");
        if (!list || list.children.length <= 2) {
          showToast("Scorecards need at least 2 players.");
          return;
        }
        removePlayerBtn.closest(".admin-scorecard-player-row")?.remove();
        return;
      }
      const addIncrementBtn = event.target.closest("[data-action='add-scorecard-increment']");
      if (addIncrementBtn) {
        const list = document.querySelector(".admin-scorecard-increment-list");
        if (!list) return;
        list.insertAdjacentHTML("beforeend", buildScorecardIncrementRowHTML("", list.children.length));
        refreshIcons();
        return;
      }
      const removeIncrementBtn = event.target.closest("[data-action='remove-scorecard-increment']");
      if (removeIncrementBtn) {
        const list = removeIncrementBtn.closest(".admin-scorecard-increment-list");
        if (!list || list.children.length <= 1) {
          showToast("Add at least one increment value.");
          return;
        }
        removeIncrementBtn.closest(".admin-scorecard-increment-row")?.remove();
        return;
      }
      const editScorecardBtn = event.target.closest("[data-action='edit-scorecard-config']");
      if (editScorecardBtn) {
        openScorecardEditModal(editScorecardBtn.getAttribute("data-scorecard-id"));
        return;
      }
      const deleteScorecardBtn = event.target.closest("[data-action='delete-scorecard']");
      if (deleteScorecardBtn) {
        deleteScorecard(deleteScorecardBtn.getAttribute("data-scorecard-id"));
        return;
      }
      if (adminModalType === "scorecard-winner" && adminScorecardArchiveConfirmId) {
        const archiveWinnerBtn = event.target.closest("[data-action='scorecard-archive']");
        if (!archiveWinnerBtn) {
          adminScorecardArchiveConfirmId = "";
          rerenderScorecardWinnerModal();
          return;
        }
      }
      const adjustScoreBtn = event.target.closest("[data-action='scorecard-adjust-score']");
      if (adjustScoreBtn) {
        adjustScorecardScore(
          adjustScoreBtn.getAttribute("data-scorecard-id"),
          adjustScoreBtn.getAttribute("data-player-name"),
          Number(adjustScoreBtn.getAttribute("data-increment"))
        );
        return;
      }
      const newGameBtn = event.target.closest("[data-action='scorecard-new-game']");
      if (newGameBtn) {
        startNextScorecardGame(newGameBtn.getAttribute("data-scorecard-id"));
        return;
      }
      const archiveScorecardBtn = event.target.closest("[data-action='scorecard-archive']");
      if (archiveScorecardBtn) {
        const scorecardId = archiveScorecardBtn.getAttribute("data-scorecard-id");
        if (adminScorecardArchiveConfirmId === scorecardId) {
          archiveScorecard(scorecardId);
          return;
        }
        adminScorecardArchiveConfirmId = scorecardId;
        rerenderScorecardWinnerModal();
        return;
      }
      const undoScoreBtn = event.target.closest("[data-action='scorecard-undo']");
      if (undoScoreBtn) {
        undoScorecardAction(undoScoreBtn.getAttribute("data-scorecard-id"));
        return;
      }
      const scoreLogBtn = event.target.closest("[data-action='scorecard-open-log']");
      if (scoreLogBtn) {
        openScorecardLogModal(
          scoreLogBtn.getAttribute("data-scorecard-id"),
          adminModalContext?.filter || "month"
        );
        return;
      }
      const closeScoreLogBtn = event.target.closest("[data-action='scorecard-close-log']");
      if (closeScoreLogBtn) {
        openScorecardManageModal(
          closeScoreLogBtn.getAttribute("data-scorecard-id"),
          closeScoreLogBtn.getAttribute("data-filter") || "month"
        );
        return;
      }
      const historyFilterBtn = event.target.closest("[data-action='scorecard-history-filter']");
      if (historyFilterBtn) {
        adminModalContext = {
          scorecardId: historyFilterBtn.getAttribute("data-scorecard-id"),
          filter: historyFilterBtn.getAttribute("data-filter")
        };
        rerenderScorecardManageModal();
        return;
      }
      const bonusRoundBtn = event.target.closest("[data-action='scorecard-bonus-round']");
      if (bonusRoundBtn) {
        beginScorecardBonusRound(bonusRoundBtn.getAttribute("data-scorecard-id"));
        return;
      }
      const bonusLockBtn = event.target.closest("[data-action='scorecard-bonus-lock']");
      if (bonusLockBtn) {
        const scorecardId = bonusLockBtn.getAttribute("data-scorecard-id");
        const playerName = bonusLockBtn.getAttribute("data-player-name");
        const input = Array.from(document.querySelectorAll("#admin-modal-body [data-scorecard-bonus-input]")).find((element) =>
          element.getAttribute("data-scorecard-bonus-input") === `${scorecardId}:${playerName}`
        );
        lockAdminScorecardBonusWager(scorecardId, playerName, input?.value);
        return;
      }
      const bonusPeekBtn = event.target.closest("[data-action='scorecard-bonus-peek']");
      if (bonusPeekBtn) {
        const target = String(bonusPeekBtn.getAttribute("data-scorecard-bonus-peek-target") || "");
        const [scorecardId, ...playerParts] = target.split(":");
        const playerName = playerParts.join(":");
        if (scorecardId && playerName) {
          triggerAdminBonusPeek(scorecardId, playerName);
        }
        return;
      }
      const revealWagersBtn = event.target.closest("[data-action='scorecard-bonus-reveal']");
      if (revealWagersBtn) {
        revealScorecardBonusWagers(revealWagersBtn.getAttribute("data-scorecard-id"));
        return;
      }
      const backRevealBtn = event.target.closest("[data-action='scorecard-bonus-back']");
      if (backRevealBtn) {
        backOutOfAdminBonusReveal(backRevealBtn.getAttribute("data-scorecard-id"));
        return;
      }
      const cancelBonusBtn = event.target.closest("[data-action='scorecard-bonus-cancel']");
      if (cancelBonusBtn) {
        cancelScorecardBonusRound(cancelBonusBtn.getAttribute("data-scorecard-id"));
        return;
      }
      const endGameBtn = event.target.closest("[data-action='scorecard-end-game']");
      if (endGameBtn) {
        endScorecardGame(endGameBtn.getAttribute("data-scorecard-id"));
        return;
      }
    }

    function handleAdminModalSubmit(event) {
      const form = event.target.closest("form[data-modal-form]");
      if (!form) return;
      event.preventDefault();
      const formType = form.getAttribute("data-modal-form");
      const formData = new FormData(form);

      if (formType === "todo") {
        const todoTitle = String(formData.get("title") || "").trim();
        if (!todoTitle) {
          const titleInput = form.querySelector("[name='title']");
          if (titleInput) {
            titleInput.style.borderColor = "var(--rose)";
            titleInput.focus();
            titleInput.addEventListener("input", () => { titleInput.style.borderColor = ""; }, { once: true });
          }
          return;
        }
        if (adminModalType === "edit-todo") {
          updateAdminTodo(adminModalContext.id, formData);
        } else {
          createAdminTodo(formData);
        }
      } else if (formType === "meal") {
        const dayOfWeek = Number(form.getAttribute("data-meal-day"));
        const mealName = String(formData.get("meal_name") || "").trim();
        const mealType = normalizeMealType(formData.get("meal_type"));
        if (!mealName) {
          const nameInput = form.querySelector("[name='meal_name']");
          if (nameInput) nameInput.focus();
          return;
        }
        saveAdminMeal(dayOfWeek, mealName, mealType);
      } else if (formType === "note") {
        saveAdminMealNote(formData);
      } else if (formType === "countdown") {
        if (adminModalType === "edit-countdown") {
          const id = form.getAttribute("data-countdown-id");
          const originalName = form.getAttribute("data-original-name");
          const name = String(formData.get("name") || "").trim();
          const eventDate = String(formData.get("event_date") || "").trim();
          const icon = String(formData.get("icon") || "").trim() || "calendar";
          const daysBeforeRaw = String(formData.get("days_before_visible") || "").trim();
          const daysBeforeVisible = daysBeforeRaw !== "" ? parseInt(daysBeforeRaw, 10) || null : null;
          const photoKeyword = String(formData.get("photo_keyword") || "").trim();
          const removePhoto = formData.get("remove_photo") === "1";
          if (!name || !eventDate || adminCountdownEditPending) return;
          updateAdminCountdown(id, name, eventDate, icon, daysBeforeVisible, photoKeyword, originalName, removePhoto);
        } else {
          saveAdminCountdown(formData);
        }
      } else if (formType === "rsvp-party") {
        if (adminRsvpWritePending) return;
        const invitedCount = validatePositiveIntegerField(form, "invited_count", "Invited count must be at least 1.");
        if (invitedCount === null) return;
        saveAdminInvitedParty(formData, invitedCount);
      } else if (formType === "review-guest-count") {
        if (adminRsvpWritePending) return;
        saveReviewGuestCount(formData);
      } else if (formType === "review-merge-duplicate") {
        if (adminRsvpWritePending) return;
        mergeDuplicateReview(formData);
      } else if (formType === "scorecard-save") {
        saveScorecardFromForm(form);
      } else if (formType === "scorecard-bonus-results") {
        const scorecardId = String(form.getAttribute("data-scorecard-id") || "").trim();
        const scorecard = getAdminScorecardById(scorecardId);
        const localBonusState = getAdminLocalBonusState(scorecardId);
        if (!scorecard || !localBonusState || !localBonusState.revealed) return;
        const wagerResults = {};
        scorecard.players.forEach((player) => {
          wagerResults[player.id] = String(formData.get(`result_${player.id}`) || localBonusState.results[player.id] || "incorrect");
        });
        applyScorecardBonusResults(scorecardId, wagerResults, localBonusState);
      }
    }

    async function handleGetPhotoModal() {
      const modalBody = document.getElementById("admin-modal-body");
      if (!modalBody) return;
      const keywordInput = modalBody.querySelector("[name='photo_keyword']");
      const nameInput = modalBody.querySelector("[name='name']");
      const previewContainer = modalBody.querySelector(".admin-modal-photo-pending");
      const btn = modalBody.querySelector("[data-action='get-photo-modal']");
      const query = (keywordInput && keywordInput.value.trim()) || (nameInput && nameInput.value.trim()) || "";
      if (!query) return;
      // Capture modal context before the async gap to avoid race conditions
      const capturedModalType = adminModalType;
      const capturedContextId = adminModalContext && adminModalContext.id;
      if (btn) { btn.disabled = true; btn.textContent = "Loading\u2026"; }
      const photo = await fetchUnsplashPhoto(query);
      if (btn) { btn.disabled = false; btn.textContent = "Get photo"; }
      if (!photo) {
        showToast("Couldn\u2019t find a photo. Try a different keyword.");
        return;
      }
      const photoKey = capturedModalType === "edit-countdown" ? capturedContextId : "modal-create";
      adminPendingPhotos.set(photoKey, photo);
      setFormPhotoPreview(previewContainer, photo);
    }


    function renderAdminTodoCard(todo, options) {
      const title = escapeHtml(todo.title || "Untitled task");
      const assignee = todo.assignee ? escapeHtml(todo.assignee) : "Unassigned";
      const overdueClass = options.showComplete && isTodoOverdue(todo.due_date)
        ? " admin-todo-card--overdue"
        : "";

      // Active cards use the urgency-coded pill from display view; archived use plain date.
      let dueMarkup = "";
      if (options.showComplete) {
        const duePill = getTodoDuePill(todo.due_date);
        if (duePill) {
          dueMarkup = `<span class="todo-due-pill ${escapeHtml(duePill.cssClass)}">${escapeHtml(duePill.label)}</span>`;
        }
      } else if (todo.due_date) {
        dueMarkup = `<span class="admin-pill admin-pill--due">${escapeHtml(formatAdminTodoDate(todo.due_date))}</span>`;
      }

      const meta = `
        <div class="admin-todo-meta">
          ${buildAdminAssigneePill(assignee)}
          ${dueMarkup}
        </div>
      `;

      if (options.showComplete) {
        return `
          <article class="admin-todo-card admin-todo-card--active${overdueClass}" data-todo-id="${escapeHtml(todo.id)}" role="button" tabindex="0" aria-label="Edit: ${title}">
            <button class="todo-check-btn" type="button" data-action="archive-todo" data-todo-id="${escapeHtml(todo.id)}" aria-label="Complete ${title}">
              <div class="todo-check">
                <svg class="todo-check-icon" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M1 5L4.5 8.5L11 1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </button>
            <div class="admin-todo-body">
              <div class="admin-todo-title">${title}</div>
              ${meta}
            </div>
          </article>
        `;
      }

      return `
        <article class="admin-todo-card" aria-label="${title}">
          <div class="admin-todo-body">
            <div class="admin-todo-title">${title}</div>
            ${meta}
          </div>
        </article>
      `;
    }

    function renderAdminTodoLists(todoGroups) {
      adminTodos = todoGroups.active;
      const activeCount = todoGroups.active.length;

      // Filter archived todos to the selected month
      const filteredArchived = todoGroups.archived.filter((todo) => {
        if (!todo.archived_at) return false;
        const d = new Date(todo.archived_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === adminArchivedMonth;
      });
      const archivedCount = filteredArchived.length;

      const monthLabel = getArchivedMonthDisplay();

      adminActiveSummary.textContent = activeCount
        ? `${activeCount} active household ${activeCount === 1 ? "task" : "tasks"}`
        : "No active household tasks right now.";
      adminArchivedSummary.textContent = archivedCount
        ? `${archivedCount} completed ${archivedCount === 1 ? "task" : "tasks"}`
        : `No completed tasks in ${monthLabel}.`;

      adminActiveList.innerHTML = activeCount
        ? todoGroups.active.map((todo) => renderAdminTodoCard(todo, { showComplete: true })).join("")
        : '<div class="admin-empty">No active tasks right now.</div>';

      adminArchivedList.innerHTML = archivedCount
        ? filteredArchived.map((todo) => renderAdminTodoCard(todo, { showComplete: false })).join("")
        : `<div class="admin-empty">Nothing completed in ${escapeHtml(monthLabel)}.</div>`;

      updateArchiveMonthLabel();
    }

    function getArchivedMonthDisplay() {
      const [year, month] = adminArchivedMonth.split("-").map(Number);
      return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
        new Date(year, month - 1, 1)
      );
    }

    function updateArchiveMonthLabel() {
      const labelEl = document.getElementById("admin-archive-month-label");
      if (labelEl) labelEl.textContent = getArchivedMonthDisplay();
    }

    function handleArchiveMonthPrev() {
      const [year, month] = adminArchivedMonth.split("-").map(Number);
      const d = new Date(year, month - 2, 1);
      adminArchivedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      loadAdminTodos();
    }

    function handleArchiveMonthNext() {
      const [year, month] = adminArchivedMonth.split("-").map(Number);
      const d = new Date(year, month, 1);
      adminArchivedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      loadAdminTodos();
    }

    async function loadAdminTodos() {
      const requestId = ++adminTodoLoadRequestId;
      adminActiveSummary.textContent = "Loading household tasks…";
      adminArchivedSummary.textContent = "Loading completed household tasks…";
      const skeleton = buildAdminTodoSkeletonHTML();
      adminActiveList.innerHTML = skeleton.active;
      adminArchivedList.innerHTML = skeleton.archived;

      try {
        const todoGroups = await fetchAdminTodos();

        if (requestId !== adminTodoLoadRequestId) {
          return;
        }

        if (!todoGroups) {
          adminActiveSummary.textContent = "Couldn't load household tasks.";
          adminArchivedSummary.textContent = "Couldn't load completed household tasks.";
          adminActiveList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
          adminArchivedList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
          return;
        }

        renderAdminTodoLists(todoGroups);

        ensureAdminHouseholdConfigLoaded()
          .then(() => {
            if (requestId === adminTodoLoadRequestId) {
              renderAdminTodoLists(todoGroups);
            }
          })
          .catch(() => {});
      } catch (error) {
        if (requestId !== adminTodoLoadRequestId) {
          return;
        }

        console.error("Failed to load admin todos.", error);
        adminActiveSummary.textContent = "Couldn't load household tasks.";
        adminArchivedSummary.textContent = "Couldn't load completed household tasks.";
        adminActiveList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
        adminArchivedList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
      }
    }

    async function createAdminTodo(formData) {
      const client = getSupabaseClient();

      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      const title = String(formData.get("title") || "").trim();
      const assignee = String(formData.get("assignee") || "").trim();
      const dueDate = String(formData.get("due_date") || "").trim();

      if (!title || adminTodoWritePending) {
        return;
      }

      adminTodoWritePending = true;
      setModalSaving(true);

      const { error } = await client
        .from("todos")
        .insert({
          household_id: TODO_HOUSEHOLD_ID,
          title,
          assignee: assignee || null,
          due_date: dueDate || null
        });

      adminTodoWritePending = false;

      if (error) {
        setModalSaving(false, "Add Todo");
        showToast(friendlySaveMessage());
        return;
      }

      closeAdminModal();
      await loadAdminTodos();
    }

    async function updateAdminTodo(id, formData) {
      const client = getSupabaseClient();
      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      const title = String(formData.get("title") || "").trim();
      const assignee = String(formData.get("assignee") || "").trim();
      const dueDate = String(formData.get("due_date") || "").trim();

      if (!title || adminTodoWritePending) return;

      adminTodoWritePending = true;
      setModalSaving(true);

      const { error } = await client
        .from("todos")
        .update({
          title,
          assignee: assignee || null,
          due_date: dueDate || null
        })
        .eq("id", id)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null);

      adminTodoWritePending = false;

      if (error) {
        setModalSaving(false, "Save Changes");
        showToast(friendlySaveMessage());
        return;
      }

      closeAdminModal();
      await loadAdminTodos();
    }

    function buildTodoFormHTML(todo) {
      const isEdit = !!todo;
      const currentAssignee = isEdit ? (todo.assignee || "") : "";
      // Read members from settings
      const memberNames = (adminHouseholdSettings.display_settings.members || []).map((m) => m.name);
      // Preserve any existing assignee that isn't in the current list (e.g. old data)
      const extraMember = currentAssignee && !memberNames.includes(currentAssignee)
        ? [currentAssignee]
        : [];
      const assigneeOptions = ["", ...memberNames, ...extraMember].map((name) =>
        `<option value="${escapeHtml(name)}"${name === currentAssignee ? " selected" : ""}>${escapeHtml(name || "Unassigned")}</option>`
      ).join("");
      return `
        <form data-modal-form="todo" novalidate>
          <div class="admin-field">
            <label for="modal-todo-title">Title</label>
            <input id="modal-todo-title" name="title" type="text" maxlength="140" required
              value="${isEdit ? escapeHtml(todo.title || "") : ""}"
              placeholder="${isEdit ? "" : "What needs doing?"}">
          </div>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="modal-todo-assignee">Assignee</label>
              <select id="modal-todo-assignee" name="assignee">
                ${assigneeOptions}
              </select>
            </div>
            <div class="admin-field">
              <label for="modal-todo-due">Due date</label>
              <input id="modal-todo-due" name="due_date" type="date"
                value="${isEdit ? escapeHtml(todo.due_date || "") : ""}">
            </div>
          </div>
          <div class="admin-actions">
            <button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="admin-button admin-button--primary" type="submit">${isEdit ? "Save Changes" : "Add Todo"}</button>
          </div>
        </form>
      `;
    }

    async function openAddTodoModal() {
      try {
        await ensureAdminHouseholdConfigLoaded();
      } catch {
        showToast(friendlyLoadMessage());
        return;
      }
      adminModalType = "add-todo";
      adminModalContext = null;
      openAdminModal("Add Todo", buildTodoFormHTML(null));
    }

    async function openEditTodoModal(todo) {
      try {
        await ensureAdminHouseholdConfigLoaded();
      } catch {
        showToast(friendlyLoadMessage());
        return;
      }
      adminModalType = "edit-todo";
      adminModalContext = { id: todo.id };
      openAdminModal("Edit Todo", buildTodoFormHTML(todo));
    }

    async function archiveAdminTodo(todoId) {
      const client = getSupabaseClient();

      if (!client || adminTodoWritePending) {
        if (!client) {
          showToast(friendlySaveMessage());
        }
        return;
      }

      adminTodoWritePending = true;

      const { error } = await client
        .from("todos")
        .update({
          archived_at: new Date().toISOString()
        })
        .eq("id", todoId)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null);

      if (error) {
        adminTodoWritePending = false;
        showToast(friendlySaveMessage());
        return;
      }

      await loadAdminTodos();
      adminTodoWritePending = false;
    }


    async function archiveAdminTodoWithAnimation(todoId, cardEl) {
      const client = getSupabaseClient();
      if (!client || adminTodoWritePending) {
        if (!client) showToast(friendlySaveMessage());
        return;
      }
      adminTodoWritePending = true;
      cardEl.classList.add("is-completing");

      const { error } = await client
        .from("todos")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", todoId)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null);

      if (error) {
        adminTodoWritePending = false;
        cardEl.classList.remove("is-completing");
        showToast(friendlySaveMessage());
        return;
      }

      cardEl.classList.add("is-done");
      cardEl.addEventListener("transitionend", async () => {
        adminTodoWritePending = false;
        await loadAdminTodos();
      }, { once: true });
    }

    function handleAdminActiveListClick(event) {
      // Checkbox click — animate and archive.
      const archiveBtn = event.target.closest("[data-action='archive-todo']");
      if (archiveBtn) {
        const card = archiveBtn.closest(".admin-todo-card");
        if (card && !card.classList.contains("is-completing")) {
          archiveAdminTodoWithAnimation(archiveBtn.getAttribute("data-todo-id"), card);
        }
        return;
      }

      // Tapping anywhere else on an active card opens the edit modal.
      const card = event.target.closest(".admin-todo-card--active");
      if (card && !card.classList.contains("is-completing")) {
        const id = card.getAttribute("data-todo-id");
        const todo = adminTodos.find((t) => t.id === id);
        if (todo) openEditTodoModal(todo);
      }
    }

    function handleAdminActiveListKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.key === " ") event.preventDefault();

      const archiveBtn = event.target.closest("[data-action='archive-todo']");
      if (archiveBtn) {
        const card = archiveBtn.closest(".admin-todo-card");
        if (card && !card.classList.contains("is-completing")) {
          archiveAdminTodoWithAnimation(archiveBtn.getAttribute("data-todo-id"), card);
        }
        return;
      }

      const card = event.target.closest(".admin-todo-card--active");
      if (card && !card.classList.contains("is-completing")) {
        const id = card.getAttribute("data-todo-id");
        const todo = adminTodos.find((t) => t.id === id);
        if (todo) openEditTodoModal(todo);
      }
    }

    async function fetchAdminMealPlan(monday) {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("meal_plan")
        .select("id, day_of_week, meal_name, meal_type, week_start")
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
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

    function getAdminMealByDay(dayOfWeek) {
      return adminMealPlanRows.find((meal) => meal.dayOfWeek === dayOfWeek) || null;
    }

    function getAdminWeekMonday() {
      const monday = getMonday(new Date());
      monday.setDate(monday.getDate() + adminWeekOffset * 7);
      return monday;
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

    function openMealModal(dayIndex, date, meal) {
      adminModalType = "edit-meal";
      adminModalContext = { dayIndex };
      openAdminModal(formatAdminDayLabel(date), buildMealFormHTML(dayIndex, date, meal));
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

    async function fetchAdminMealNote(monday) {
      const client = getSupabaseClient();
      if (!client) return null;
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

    function openMealNoteModal() {
      adminModalType = "note";
      adminModalContext = null;
      openAdminModal("Weekly Note", buildMealNoteFormHTML());
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
          { household_id: DISPLAY_HOUSEHOLD_ID, week_start: savedWeekStart, note: noteText },
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

    function handleAdminMealNoteClick(event) {
      if (event.target.closest("[data-action='edit-meal-note']")) {
        openMealNoteModal();
      }
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
          .eq("household_id", DISPLAY_HOUSEHOLD_ID)
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
            household_id: DISPLAY_HOUSEHOLD_ID,
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

    function setAdminScreen(nextScreen) {
      adminScreen = nextScreen;

      adminScreens.forEach((screen) => {
        const isActive = screen.getAttribute("data-admin-screen") === nextScreen;
        screen.hidden = !isActive;
        screen.classList.toggle("is-active", isActive);
      });

      adminNavButtons.forEach((button) => {
        const isActive = button.getAttribute("data-admin-nav") === nextScreen;
        button.classList.toggle("is-active", isActive);
        if (isActive) {
          button.setAttribute("aria-current", "page");
        } else {
          button.removeAttribute("aria-current");
        }
      });

      if (adminSettingsButton) {
        const isSettings = nextScreen === "settings";
        adminSettingsButton.classList.toggle("is-active", isSettings);
        if (isSettings) {
          adminSettingsButton.setAttribute("aria-current", "page");
        } else {
          adminSettingsButton.removeAttribute("aria-current");
        }
      }
    }

    function openAdminSettings() {
      setAdminScreen("settings");
      renderAdminSettingsSkeleton();
      loadAdminScorecards();
      ensureAdminHouseholdConfigLoaded()
        .then(() => loadAdminSettings())
        .catch(() => showToast(friendlyLoadMessage()));
    }

    function handleAdminNavClick(event) {
      const button = event.target.closest("[data-admin-nav]");

      if (!button) {
        return;
      }

      const target = button.getAttribute("data-admin-nav");
      setAdminScreen(target);

      if (target === "countdowns") {
        loadAdminCountdowns();
      }

      if (target === "rsvp") {
        loadAdminRsvpScreen();
      }

      if (target === "scorecards") {
        loadAdminScorecards();
      }
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

    async function fetchAdminCalendarEvents() {
      const config = await fetchHouseholdConfig();

      if (!config || !config.google_cal_id) {
        return null;
      }

      const apiKey = config.google_cal_key || GOOGLE_CAL_KEY;

      if (!apiKey || apiKey.startsWith("%%")) {
        return null;
      }

      const start = new Date(adminCalMonthDate.getFullYear(), adminCalMonthDate.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(adminCalMonthDate.getFullYear(), adminCalMonthDate.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);

      return fetchGoogleCalendarEvents(config.google_cal_id, apiKey, start, end);
    }

    function updateAdminCalMonthLabel() {
      const label = document.getElementById("admin-cal-month-label");
      if (label) {
        label.textContent = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(adminCalMonthDate);
      }
    }

    async function loadAdminCalendarMonth() {
      adminCalEventsNote.textContent = "Loading\u2026";
      adminCalEventList.innerHTML = buildAdminCalendarSkeletonHTML();
      updateAdminCalMonthLabel();
      const calItems = await fetchAdminCalendarEvents();
      adminCalEvents = calItems || [];
      if (!calItems) {
        adminCalEventsNote.textContent = "Add a calendar in Settings to see events here.";
        adminCalEventList.innerHTML = '<div class="admin-empty">Add a calendar in Settings to see events here.</div>';
      } else {
        adminCalEventsNote.textContent = getVisibleAdminCalendarEvents().length ? "Tap an event to flag it as a countdown." : "No upcoming calendar events this month.";
        renderAdminCalEventList();
      }
      refreshIcons();
    }

    function handleAdminCalPrev() {
      adminCalMonthDate = new Date(adminCalMonthDate.getFullYear(), adminCalMonthDate.getMonth() - 1, 1);
      loadAdminCalendarMonth();
    }

    function handleAdminCalNext() {
      adminCalMonthDate = new Date(adminCalMonthDate.getFullYear(), adminCalMonthDate.getMonth() + 1, 1);
      loadAdminCalendarMonth();
    }

    async function fetchAdminSavedCountdowns() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await client
        .from("countdowns")
        .select("id, name, icon, event_date, unsplash_image_url, days_before_visible, photo_keyword")
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .gte("event_date", formatDateKey(today))
        .order("event_date", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data;
    }

    function isCountdownAlreadySaved(name, date) {
      const normalizedName = String(name).toLowerCase().trim();
      return adminSavedCountdowns.some(
        (c) => c.name.toLowerCase().trim() === normalizedName && c.event_date === date
      );
    }

    function getVisibleAdminCalendarEvents() {
      const todayKey = formatDateKey(new Date());
      return adminCalEvents.filter((item) => {
        const startRaw = item.start && (item.start.dateTime || item.start.date);
        const eventDate = item.start && item.start.date
          ? item.start.date
          : (startRaw ? startRaw.slice(0, 10) : "");
        return eventDate && eventDate >= todayKey;
      });
    }

    function renderAdminCalEventList() {
      const visibleCalendarEvents = getVisibleAdminCalendarEvents();

      if (!visibleCalendarEvents.length) {
        adminCalEventList.innerHTML = '<div class="admin-empty">No upcoming calendar events found.</div>';
        return;
      }

      adminCalEventList.innerHTML = visibleCalendarEvents.map((item) => {
        const startRaw = item.start && (item.start.dateTime || item.start.date);
        const eventDate = item.start && item.start.date
          ? item.start.date
          : (startRaw ? startRaw.slice(0, 10) : "");
        const name = item.summary || "Untitled event";
        const saved = isCountdownAlreadySaved(name, eventDate);
        const dateLabel = eventDate
          ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
              new Date(eventDate + "T00:00:00")
            )
          : "";

        return `
          <button
            class="admin-cal-event-card${saved ? " is-saved" : ""}"
            type="button"
            data-cal-name="${escapeHtml(name)}"
            data-cal-date="${escapeHtml(eventDate)}"
            aria-pressed="${saved ? "true" : "false"}"
          >
            <div class="admin-cal-event-name">${escapeHtml(name)}</div>
            <div class="admin-cal-event-meta">
              ${saved ? '<span class="admin-pill admin-pill--due">Saved</span>' : ""}
              <span class="admin-pill">${escapeHtml(dateLabel)}</span>
            </div>
          </button>
        `;
      }).join("");
    }

    function renderAdminSavedCountdowns() {
      const count = adminSavedCountdowns.length;
      adminSavedCountdownsNote.textContent = count
        ? `${count} saved ${count === 1 ? "countdown" : "countdowns"}`
        : "No countdowns saved yet.";

      if (!count) {
        adminSavedCountdownList.innerHTML = '<div class="admin-empty">Nothing here yet.</div>';
        return;
      }

      adminSavedCountdownList.innerHTML = adminSavedCountdowns.map((c) => {
        const dateLabel = c.event_date
          ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
              new Date(c.event_date + "T00:00:00")
            )
          : "No date";

        let imageUrl = null;
        let imageCredit = null;
        if (c.unsplash_image_url) {
          try {
            const parsed = JSON.parse(c.unsplash_image_url);
            imageUrl = parsed.url || null;
            imageCredit = parsed.credit || null;
          } catch {
            imageUrl = c.unsplash_image_url;
          }
        }

        const thumbnailUrl = imageUrl ? unsplashThumbnailUrl(imageUrl) : null;
        const daysBeforeLabel = c.days_before_visible != null
          ? `Shows ${c.days_before_visible}d before`
          : null;

        return `
          <article class="admin-saved-countdown-card" data-countdown-id="${escapeHtml(c.id)}">
            <div class="admin-countdown-card-main">
              ${thumbnailUrl ? `
              <button class="admin-countdown-preview-btn" type="button" data-action="view-photo" data-full-url="${escapeHtml(imageUrl)}" data-credit="${escapeHtml(imageCredit || "")}" aria-label="View photo for ${escapeHtml(c.name)}">
                <img class="admin-countdown-preview" src="${escapeHtml(thumbnailUrl)}" alt="" aria-hidden="true" onerror="this.closest('.admin-countdown-preview-btn').remove();">
              </button>` : ""}
              <div class="admin-countdown-card-body">
                <div class="admin-saved-countdown-name">${escapeHtml(c.name)}</div>
                <div class="admin-countdown-card-meta">
                  <span class="admin-countdown-meta-item">${escapeHtml(dateLabel)}</span>
                  <span class="admin-countdown-meta-item"><i data-lucide="${escapeHtml(c.icon || "calendar")}" style="width:13px;height:13px;vertical-align:middle;margin-right:3px;"></i>${escapeHtml(c.icon || "calendar")}</span>
                  ${daysBeforeLabel ? `<span class="admin-countdown-meta-item">${escapeHtml(daysBeforeLabel)}</span>` : ""}
                </div>
              </div>
            </div>
            <div class="admin-countdown-actions">
              <button class="admin-button admin-button--secondary admin-countdown-action-btn" type="button" data-action="edit-countdown" data-countdown-id="${escapeHtml(c.id)}" aria-label="Edit ${escapeHtml(c.name)}">Edit</button>
              <button class="admin-button admin-button--secondary admin-countdown-action-btn" type="button" data-action="refresh-photo" data-countdown-id="${escapeHtml(c.id)}" data-countdown-name="${escapeHtml(c.name)}" data-photo-keyword="${escapeHtml(c.photo_keyword || "")}" aria-label="Refresh photo for ${escapeHtml(c.name)}">Refresh photo</button>
              <button class="admin-button admin-button--ghost-danger" type="button" data-action="delete-countdown" data-countdown-id="${escapeHtml(c.id)}" aria-label="Delete ${escapeHtml(c.name)}">Delete</button>
            </div>
          </article>
        `;
      }).join("");
    }

    async function loadAdminCountdowns({ preserveScroll = false } = {}) {
      const savedScrollY = preserveScroll ? window.scrollY : 0;
      updateAdminCalMonthLabel();
      adminCalEventsNote.textContent = "Loading calendar events\u2026";
      adminCalEventList.innerHTML = buildAdminCalendarSkeletonHTML();
      adminSavedCountdownsNote.textContent = "Loading\u2026";
      adminSavedCountdownList.innerHTML = buildAdminCountdownSkeletonHTML();

      const [calItems, savedRows] = await Promise.all([
        fetchAdminCalendarEvents(),
        fetchAdminSavedCountdowns()
      ]);

      adminCalEvents = calItems || [];
      adminSavedCountdowns = savedRows || [];

      if (!calItems) {
        adminCalEventsNote.textContent = "Add a calendar in Settings to see events here.";
        adminCalEventList.innerHTML = '<div class="admin-empty">Add a calendar in Settings to see events here.</div>';
      } else {
        adminCalEventsNote.textContent = getVisibleAdminCalendarEvents().length ? "Tap an event to flag it as a countdown." : "No upcoming calendar events this month.";
        renderAdminCalEventList();
      }

      if (!savedRows) {
        adminSavedCountdownsNote.textContent = "Couldn\u2019t load saved countdowns.";
        adminSavedCountdownList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
      } else {
        renderAdminSavedCountdowns();
      }

      refreshIcons();

      if (preserveScroll) {
        requestAnimationFrame(() => window.scrollTo({ top: savedScrollY, behavior: "instant" }));
      }
    }

    function openAdminLightbox(fullUrl, credit) {
      const lightbox = document.getElementById("admin-lightbox");
      const img = document.getElementById("admin-lightbox-img");
      const creditEl = document.getElementById("admin-lightbox-credit");
      if (!lightbox || !img) return;
      img.src = fullUrl;
      if (creditEl) creditEl.textContent = credit || "";
      lightbox.hidden = false;
      document.body.style.overflow = "hidden";
    }

    function closeAdminLightbox() {
      const lightbox = document.getElementById("admin-lightbox");
      if (!lightbox || lightbox.hidden) return;
      lightbox.hidden = true;
      const img = document.getElementById("admin-lightbox-img");
      if (img) img.src = "";
      document.body.style.overflow = "";
    }

    function unsplashThumbnailUrl(url) {
      try {
        const u = new URL(url);
        u.searchParams.set("w", "200");
        return u.toString();
      } catch {
        return url;
      }
    }

    async function fetchUnsplashPhoto(query) {
      if (!UNSPLASH_ACCESS_KEY || UNSPLASH_ACCESS_KEY.startsWith("%%")) return null;
      try {
        const cleanQuery = query.replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        const response = await fetch(
          `https://api.unsplash.com/photos/random?query=${encodeURIComponent(cleanQuery)}&orientation=portrait&order_by=editorial&content_filter=high`,
          { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }
        );
        if (!response.ok) return null;
        const data = await response.json();
        const url = data.urls && data.urls.regular;
        const photographerName = data.user && data.user.name;
        const photographerProfile = data.user && data.user.links && data.user.links.html;
        if (!url) return null;
        return {
          url,
          credit: photographerName ? `Photo: ${photographerName} \u00b7 Unsplash` : "Photo: Unsplash",
          photographerProfile: photographerProfile || null
        };
      } catch {
        return null;
      }
    }

    async function updateCountdownPhoto(id, photo) {
      const client = getSupabaseClient();
      if (!client) return false;
      const { error } = await client
        .from("countdowns")
        .update({ unsplash_image_url: JSON.stringify({ url: photo.url, credit: photo.credit, photographerProfile: photo.photographerProfile || null }) })
        .eq("id", id)
        .eq("household_id", DISPLAY_HOUSEHOLD_ID);
      return !error;
    }

    async function refreshCountdownPhoto(id, name, photoKeyword) {
      if (refreshingCountdowns.has(id)) return;
      refreshingCountdowns.add(id);

      const card = adminSavedCountdownList.querySelector(`[data-countdown-id="${id}"]`)?.closest(".admin-saved-countdown-card");
      if (card) card.classList.add("admin-countdown-card--refreshing");

      showToast("Fetching new photo\u2026");
      try {
        const photo = await fetchUnsplashPhoto(photoKeyword || name);
        if (!photo) {
          showToast("Couldn\u2019t find a photo. Try again.");
          return;
        }
        const ok = await updateCountdownPhoto(id, photo);
        if (!ok) {
          showToast("Couldn\u2019t save photo. Please try again.");
          return;
        }
        await loadAdminCountdowns({ preserveScroll: true });
        showToast("Photo updated.");
      } finally {
        refreshingCountdowns.delete(id);
        if (card) card.classList.remove("admin-countdown-card--refreshing");
      }
    }

    async function removeCountdownPhoto(id) {
      const client = getSupabaseClient();
      if (!client) return;
      const { error } = await client
        .from("countdowns")
        .update({ unsplash_image_url: null })
        .eq("id", id)
        .eq("household_id", DISPLAY_HOUSEHOLD_ID);
      if (error) {
        showToast("Couldn\u2019t remove photo. Please try again.");
        return;
      }
      await loadAdminCountdowns({ preserveScroll: true });
    }

    async function saveAdminCountdown(formData) {
      const client = getSupabaseClient();

      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      const name = String(formData.get("name") || "").trim();
      const eventDate = String(formData.get("event_date") || "").trim();
      const icon = String(formData.get("icon") || "").trim() || "calendar";
      const daysBeforeRaw = String(formData.get("days_before_visible") || "").trim();
      const daysBeforeVisible = daysBeforeRaw !== "" ? parseInt(daysBeforeRaw, 10) || null : null;
      const photoKeyword = String(formData.get("photo_keyword") || "").trim();

      if (!name || !eventDate || adminCountdownWritePending) {
        return;
      }

      if (isCountdownAlreadySaved(name, eventDate)) {
        showToast("Already saved.");
        return;
      }

      adminCountdownWritePending = true;
      const submitBtn = document.querySelector("#admin-modal-body [type='submit']");
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving\u2026"; }

      const { data: insertedRow, error } = await client
        .from("countdowns")
        .insert({
          household_id: DISPLAY_HOUSEHOLD_ID,
          name,
          icon,
          event_date: eventDate,
          days_before_visible: daysBeforeVisible,
          photo_keyword: photoKeyword || null
        })
        .select("id")
        .single();

      if (error || !insertedRow) {
        adminCountdownWritePending = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Save Countdown"; }
        showToast(friendlySaveMessage());
        return;
      }

      adminCountdownWritePending = false;

      const pendingPhoto = adminPendingPhotos.get("modal-create");
      adminPendingPhotos.delete("modal-create");

      closeAdminModal();
      await loadAdminCountdowns();

      if (pendingPhoto) {
        updateCountdownPhoto(insertedRow.id, pendingPhoto).then(async (ok) => {
          if (ok) await loadAdminCountdowns();
        }).catch((e) => console.warn("Background photo save failed:", e));
      } else {
        fetchUnsplashPhoto(photoKeyword || name).then(async (photo) => {
          if (!photo) return;
          const ok = await updateCountdownPhoto(insertedRow.id, photo);
          if (ok) await loadAdminCountdowns();
        }).catch((e) => console.warn("Background photo fetch failed:", e));
      }
    }

    async function updateAdminCountdown(id, name, eventDate, icon, daysBeforeVisible, photoKeyword, originalName, removePhoto) {
      const client = getSupabaseClient();
      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      adminCountdownEditPending = true;
      const submitBtn = document.querySelector("#admin-modal-body [type='submit']");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving\u2026";
      }

      const updatePayload = { name, event_date: eventDate, icon, days_before_visible: daysBeforeVisible, photo_keyword: photoKeyword || null };
      if (removePhoto) updatePayload.unsplash_image_url = null;

      const { error } = await client
        .from("countdowns")
        .update(updatePayload)
        .eq("id", id)
        .eq("household_id", DISPLAY_HOUSEHOLD_ID);

      adminCountdownEditPending = false;

      if (error) {
        showToast(friendlySaveMessage());
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Save Changes";
        }
        return;
      }

      const pendingPhoto = adminPendingPhotos.get(id);
      adminPendingPhotos.delete(id);

      closeAdminModal();
      await loadAdminCountdowns({ preserveScroll: true });

      if (!removePhoto) {
        if (pendingPhoto) {
          updateCountdownPhoto(id, pendingPhoto).then(async (ok) => {
            if (ok) await loadAdminCountdowns({ preserveScroll: true });
          }).catch((e) => console.warn("Background photo save failed:", e));
        } else if (photoKeyword || name !== originalName) {
          fetchUnsplashPhoto(photoKeyword || name).then(async (photo) => {
            if (!photo) return;
            const ok = await updateCountdownPhoto(id, photo);
            if (ok) await loadAdminCountdowns({ preserveScroll: true });
          }).catch((e) => console.warn("Background photo fetch failed:", e));
        }
      }
    }


    async function deleteAdminCountdown(id) {
      const client = getSupabaseClient();

      if (!client) {
        showToast(friendlyDeleteMessage());
        return;
      }

      const { error } = await client
        .from("countdowns")
        .delete()
        .eq("id", id)
        .eq("household_id", DISPLAY_HOUSEHOLD_ID);

      if (error) {
        showToast(friendlyDeleteMessage());
        return;
      }

      await loadAdminCountdowns();
    }

    // ── Scorecards ───────────────────────────────────────────────────────────

    function buildScorecardPlayerRowHTML(player = {}, index = 0) {
      const color = player.color || SCORECARD_PLAYER_COLOR_PALETTE[index % SCORECARD_PLAYER_COLOR_PALETTE.length];
      return `
        <div class="admin-scorecard-player-row" data-scorecard-player-row="${index}">
          <input type="hidden" name="scorecard_player_id" value="${escapeHtml(player.id || "")}">
          <input class="admin-scorecard-color-input" type="color" name="scorecard_player_color" value="${escapeHtml(color)}" aria-label="Player color">
          <input class="admin-input" type="text" name="scorecard_player_name" maxlength="40" placeholder="Player name" value="${escapeHtml(player.name || "")}">
          <button class="admin-scorecard-remove-btn" type="button" data-action="remove-scorecard-player" aria-label="Remove player">
            <i data-lucide="x"></i>
          </button>
        </div>
      `;
    }

    function buildScorecardIncrementRowHTML(value = "", index = 0) {
      return `
        <div class="admin-scorecard-increment-row" data-scorecard-increment-row="${index}">
          <input class="admin-input" type="text" name="scorecard_increment" placeholder="200 or -200" value="${escapeHtml(value)}" inputmode="decimal" pattern="-?[0-9]*">
          <button class="admin-scorecard-remove-btn" type="button" data-action="remove-scorecard-increment" aria-label="Remove increment">
            <i data-lucide="x"></i>
          </button>
        </div>
      `;
    }

    function getPersistedScorecardScreenOrderEntries(scorecards) {
      return (Array.isArray(scorecards) ? scorecards : []).map((scorecard) => buildScorecardScreenKey(scorecard.id)).filter(Boolean);
    }

    function normalizeAdminScreenOrder(order) {
      const configured = Array.isArray(order) ? order : [...CONFIGURABLE_SCREENS];
      const normalized = [];

      configured.forEach((key) => {
        const normalizedKey = isScorecardScreenKey(key) ? "scorecards" : key;
        if (CONFIGURABLE_SCREENS.includes(normalizedKey) && !normalized.includes(normalizedKey)) {
          normalized.push(normalizedKey);
        }
      });

      CONFIGURABLE_SCREENS.forEach((key) => {
        if (!normalized.includes(key)) {
          normalized.push(key);
        }
      });

      return normalized;
    }

    function buildPersistedScreenOrder(order) {
      const normalized = normalizeAdminScreenOrder(order);
      const persisted = [];
      normalized.forEach((key) => {
        if (key === "scorecards") {
          getPersistedScorecardScreenOrderEntries(adminScorecards).forEach((scorecardKey) => {
            if (!persisted.includes(scorecardKey)) {
              persisted.push(scorecardKey);
            }
          });
          return;
        }

        if (!persisted.includes(key)) {
          persisted.push(key);
        }
      });
      return persisted;
    }

    function getAdminScorecardById(scorecardId) {
      return adminScorecards.find((scorecard) => scorecard.id === scorecardId) || null;
    }

    function getAdminScorecardSessions(scorecardId) {
      return (adminScorecardSessionsById.get(scorecardId) || []).slice().sort((a, b) =>
        new Date(b.startedAt || b.createdAt || 0) - new Date(a.startedAt || a.createdAt || 0)
      );
    }

    function getAdminActiveScorecardSession(scorecardId) {
      return getAdminScorecardSessions(scorecardId).find((session) => !session.endedAt) || null;
    }

    function getAdminLocalBonusState(scorecardId) {
      const activeSession = getAdminActiveScorecardSession(scorecardId);
      const scorecard = getAdminScorecardById(scorecardId);
      const state = adminScorecardBonusStateById.get(scorecardId);
      if (!state) {
        if (!activeSession || !scorecard || !activeSession.isFinalJeopardy || !isScorecardBonusRoundActive(activeSession)) {
          return null;
        }

        const persistedState = createLocalBonusState(activeSession.id, scorecard.players, activeSession);
        adminScorecardBonusStateById.set(scorecardId, persistedState);
        return persistedState;
      }

      if (!activeSession || activeSession.id !== state.sessionId) {
        adminScorecardBonusStateById.delete(scorecardId);
        return null;
      }

      return state;
    }

    function setAdminLocalBonusState(scorecardId, nextState) {
      if (!scorecardId) {
        return;
      }

      const existingAdvanceTimer = adminScorecardBonusAdvanceTimerById.get(scorecardId);
      if (existingAdvanceTimer && (!nextState || nextState.phase !== "entry")) {
        window.clearTimeout(existingAdvanceTimer);
        adminScorecardBonusAdvanceTimerById.delete(scorecardId);
      }

      if (!nextState) {
        adminScorecardBonusStateById.delete(scorecardId);
        return;
      }

      adminScorecardBonusStateById.set(scorecardId, nextState);
    }

    function createLocalBonusState(sessionId, players, session = null) {
      const playerList = normalizeScorecardPlayers(players);
      const phase = getScorecardBonusPhase(session) || SCORECARD_BONUS_PHASES.entry;
      const wagers = getScorecardBonusWagers(session, playerList);
      const results = getScorecardBonusResults(session, playerList);
      return {
        sessionId,
        phase,
        draftWagers: { ...wagers },
        wagers: { ...wagers },
        wagerErrors: {},
        results,
        playerIds: playerList.map((player) => player.id),
        revealed: phase === SCORECARD_BONUS_PHASES.reveal
      };
    }

    function allLocalBonusWagersLocked(state) {
      return !!state && Array.isArray(state.playerIds) && state.playerIds.length > 0
        && state.playerIds.every((playerId) => Number.isFinite(Number(state.wagers[playerId])));
    }

    function allLocalBonusResultsSelected(state) {
      return !!state && Array.isArray(state.playerIds) && state.playerIds.length > 0
        && state.playerIds.every((playerId) => {
          const result = String(state.results[playerId] || "").trim().toLowerCase();
          return result === "correct" || result === "incorrect";
        });
    }

    function sanitizeBonusWagerInputValue(rawValue) {
      return String(rawValue || "").replace(/\D+/g, "");
    }

    function getAdminBonusPeekKey(scorecardId, playerName) {
      return `${scorecardId}:${playerName}`;
    }

    function setAdminBonusPeekState(scorecardId, playerName, isVisible) {
      const key = getAdminBonusPeekKey(scorecardId, playerName);
      const input = Array.from(document.querySelectorAll("#admin-modal-body [data-scorecard-bonus-input]")).find((element) =>
        element.getAttribute("data-scorecard-bonus-input") === key
      );
      const button = Array.from(document.querySelectorAll("#admin-modal-body [data-action='scorecard-bonus-peek']")).find((element) =>
        element.getAttribute("data-scorecard-bonus-peek-target") === key
      );
      if (input) {
        input.type = isVisible ? "text" : "password";
      }
      if (button) {
        button.innerHTML = `<i data-lucide="${isVisible ? "eye-off" : "eye"}"></i>`;
      }
      refreshIcons();
    }

    function triggerAdminBonusPeek(scorecardId, playerName) {
      const key = getAdminBonusPeekKey(scorecardId, playerName);
      const input = Array.from(document.querySelectorAll("#admin-modal-body [data-scorecard-bonus-input]")).find((element) =>
        element.getAttribute("data-scorecard-bonus-input") === key
      );
      const existingTimer = adminScorecardBonusPeekTimerByKey.get(key);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        adminScorecardBonusPeekTimerByKey.delete(key);
      }

      if (input?.type === "text") {
        setAdminBonusPeekState(scorecardId, playerName, false);
        return;
      }

      setAdminBonusPeekState(scorecardId, playerName, true);
      const timerId = window.setTimeout(() => {
        adminScorecardBonusPeekTimerByKey.delete(key);
        setAdminBonusPeekState(scorecardId, playerName, false);
      }, 2000);
      adminScorecardBonusPeekTimerByKey.set(key, timerId);
    }

    function getAdminPendingWinnerSession(scorecardId) {
      const pendingSessionId = getScorecardPendingWinnerSessionId(scorecardId);
      if (!pendingSessionId || getAdminActiveScorecardSession(scorecardId)) {
        return null;
      }

      return getAdminScorecardSessions(scorecardId).find((session) => session.id === pendingSessionId && session.endedAt) || null;
    }

    async function fetchAdminScorecards() {
      const client = getSupabaseClient();
      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("scorecards")
        .select("id, household_id, name, increments, players, show_history, allow_negative, created_at, archived_at")
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .is("archived_at", null)
        .order("created_at", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data.map(mapScorecardRow);
    }

    async function fetchAdminScorecardSessions(scorecards) {
      const client = getSupabaseClient();
      const ids = (Array.isArray(scorecards) ? scorecards : []).map((scorecard) => scorecard.id).filter(Boolean);
      const sessionsById = new Map(ids.map((id) => [id, []]));

      if (!client) {
        return null;
      }

      if (!ids.length) {
        return sessionsById;
      }

      const { data, error } = await client
        .from("scorecard_sessions")
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .in("scorecard_id", ids)
        .order("started_at", { ascending: false });

      if (error || !Array.isArray(data)) {
        return null;
      }

      data.forEach((row) => {
        const scorecard = scorecards.find((item) => item.id === row.scorecard_id);
        if (!scorecard) {
          return;
        }

        const list = sessionsById.get(scorecard.id) || [];
        list.push(mapScorecardSessionRow(row, scorecard));
        sessionsById.set(scorecard.id, list);
      });

      return sessionsById;
    }

    async function createFreshScorecardSession(scorecard) {
      const client = getSupabaseClient();
      if (!client || !scorecard) {
        return null;
      }

      const payload = {
        scorecard_id: scorecard.id,
        household_id: DISPLAY_HOUSEHOLD_ID,
        started_at: new Date().toISOString(),
        scores: createScorecardZeroScores(scorecard.players),
        score_events: [],
        is_final_jeopardy: false
      };

      const { data, error } = await client
        .from("scorecard_sessions")
        .upsert(payload, {
          onConflict: "scorecard_id",
          ignoreDuplicates: true
        })
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at");

      if (error) {
        return null;
      }

      const insertedRow = Array.isArray(data) ? data[0] : data;
      if (insertedRow) {
        return mapScorecardSessionRow(insertedRow, scorecard);
      }

      const { data: existingRow, error: existingError } = await client
        .from("scorecard_sessions")
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .eq("scorecard_id", scorecard.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingError || !existingRow) {
        return null;
      }

      return mapScorecardSessionRow(existingRow, scorecard);
    }

    async function ensureAdminScorecardSessions(scorecards, sessionsById) {
      const nextMap = sessionsById instanceof Map ? new Map(sessionsById) : new Map();

      for (const scorecard of (Array.isArray(scorecards) ? scorecards : [])) {
        const sessions = (nextMap.get(scorecard.id) || []).slice();
        const hasActiveSession = sessions.some((session) => !session.endedAt);
        if (hasActiveSession || sessions.length > 0) {
          nextMap.set(scorecard.id, sessions);
          continue;
        }

        const freshSession = await createFreshScorecardSession(scorecard);
        if (freshSession) {
          sessions.unshift(freshSession);
        }
        nextMap.set(scorecard.id, sessions);
      }

      return nextMap;
    }

    function buildAdminScoreSummary(scorecard, session) {
      if (!session) {
        return '<span class="admin-scorecard-summary-empty">No game yet</span>';
      }

      return scorecard.players.map((player) => `
        <span class="admin-scorecard-score-pill" style="background:${escapeHtml(hexToRgba(player.color, 0.14))};color:${escapeHtml(player.color)}">
          ${escapeHtml(player.name)} ${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session.scores, player, scorecard.players)))}
        </span>
      `).join("");
    }

    function buildAdminScorecardCardRowsHTML(scorecard, session) {
      if (!session) {
        return '<div class="admin-scorecard-summary-empty">No game yet</div>';
      }

      return scorecard.players.map((player) => `
        <div class="admin-scorecard-session-row">
          <div class="admin-scorecard-session-player">
            <span class="admin-scorecard-player-dot" style="background:${escapeHtml(player.color)}"></span>
            <span>${escapeHtml(player.name)}</span>
          </div>
          <strong class="admin-scorecard-session-score">${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session.scores, player, scorecard.players)))}</strong>
        </div>
      `).join("");
    }

    function renderAdminScorecardList() {
      if (!adminScorecardList || !adminScorecardsNote) {
        return;
      }

      adminScorecardsNote.textContent = adminScorecards.length
        ? `${adminScorecards.length} active ${adminScorecards.length === 1 ? "scorecard" : "scorecards"}`
        : "No scorecards yet. Add one to start keeping score.";

      if (!adminScorecards.length) {
        adminScorecardList.innerHTML = '<div class="admin-empty">No scorecards yet.</div>';
        return;
      }

      adminScorecardList.innerHTML = adminScorecards.map((scorecard) => {
        const activeSession = getAdminActiveScorecardSession(scorecard.id);
        const latestSession = activeSession || getAdminScorecardSessions(scorecard.id)[0] || null;
        const metaLabel = activeSession
          ? `${scorecard.players.length} players`
          : latestSession?.endedAt
            ? "Waiting for new game"
            : `${scorecard.players.length} players`;
        return `
          <button class="admin-scorecard-card" type="button" data-scorecard-id="${escapeHtml(scorecard.id)}">
            <div class="admin-scorecard-card-head">
              <div>
                <div class="admin-scorecard-card-title">${escapeHtml(scorecard.name)}</div>
                <div class="admin-scorecard-card-meta">${escapeHtml(metaLabel)}</div>
              </div>
              <i data-lucide="chevron-right"></i>
            </div>
            <div class="admin-scorecard-session-list">${buildAdminScorecardCardRowsHTML(scorecard, latestSession)}</div>
          </button>
        `;
      }).join("");

      refreshIcons();
    }

    function getScorecardHistoryFilterStart(filter) {
      const now = new Date();
      if (filter === "week") {
        return getMonday(now);
      }
      if (filter === "month") {
        return new Date(now.getFullYear(), now.getMonth(), 1);
      }
      return null;
    }

    function getFilteredScorecardHistory(scorecardId, filter) {
      const start = getScorecardHistoryFilterStart(filter);
      return getAdminScorecardSessions(scorecardId)
        .filter((session) => session.endedAt)
        .filter((session) => {
          if (!start) {
            return true;
          }
          const startedAt = new Date(session.startedAt || session.createdAt || 0);
          return startedAt >= start;
        });
    }

    function getDefaultScorecardPlayers() {
      const members = Array.isArray(adminHouseholdSettings?.display_settings?.members)
        ? adminHouseholdSettings.display_settings.members.filter((member) => member && member.name)
        : [];
      if (members.length) {
        return Array.from({ length: 2 }, (_, index) => {
          const member = members[index];
          return {
            name: member?.name || "",
            color: member?.color || SCORECARD_PLAYER_COLOR_PALETTE[index % SCORECARD_PLAYER_COLOR_PALETTE.length]
          };
        });
      }

      return SCORECARD_PLAYER_COLOR_PALETTE.slice(0, 2).map((color) => ({
        name: "",
        color
      }));
    }

    function buildScorecardConfigFormHTML(scorecard) {
      const players = scorecard?.players?.length ? scorecard.players : getDefaultScorecardPlayers();
      const increments = scorecard?.increments?.length ? scorecard.increments : [100, 200, 400];

      return `
        <form data-modal-form="scorecard-save" novalidate>
          ${scorecard ? `<input type="hidden" name="scorecard_id" value="${escapeHtml(scorecard.id)}">` : ""}
          <div class="admin-field">
            <label for="scorecard-name">Name</label>
            <input id="scorecard-name" name="scorecard_name" type="text" maxlength="60" value="${escapeHtml(scorecard?.name || "")}" placeholder="Jeopardy">
          </div>
          <div class="admin-scorecard-form-section">
            <div class="admin-scorecard-form-header">
              <div class="admin-settings-subsection-label">Players</div>
              <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="add-scorecard-player">Add player</button>
            </div>
            <div class="admin-scorecard-player-list">
              ${players.map((player, index) => buildScorecardPlayerRowHTML(player, index)).join("")}
            </div>
          </div>
          <div class="admin-scorecard-form-section">
            <div class="admin-scorecard-form-header">
              <div class="admin-settings-subsection-label">Increment buttons</div>
              <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="add-scorecard-increment">Add value</button>
            </div>
            <div class="admin-scorecard-increment-list">
              ${increments.map((value, index) => buildScorecardIncrementRowHTML(value, index)).join("")}
            </div>
          </div>
          <label class="admin-settings-toggle admin-settings-toggle--block">
            <input type="checkbox" name="scorecard_allow_negative"${scorecard?.allowNegative ? " checked" : ""}>
            <span>Allow negative scores</span>
          </label>
          <label class="admin-settings-toggle admin-settings-toggle--block">
            <input type="checkbox" name="scorecard_show_history"${scorecard?.showHistory !== false ? " checked" : ""}>
            <span>Show history on display</span>
          </label>
          <div class="admin-actions">
            ${scorecard ? `<button class="admin-button admin-button--danger" type="button" data-action="delete-scorecard" data-scorecard-id="${escapeHtml(scorecard.id)}">Delete</button>` : `<button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>`}
            <button class="admin-button admin-button--primary" type="submit">${scorecard ? "Save" : "Create"}</button>
          </div>
        </form>
      `;
    }

    function buildScorecardSessionRowsHTML(scorecard, session) {
      return scorecard.players.map((player) => `
        <div class="admin-scorecard-session-row">
          <div class="admin-scorecard-session-player">
            <span class="admin-scorecard-player-dot" style="background:${escapeHtml(player.color)}"></span>
            <span>${escapeHtml(player.name)}</span>
          </div>
          <strong class="admin-scorecard-session-score">${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session?.scores, player, scorecard.players)))}</strong>
        </div>
      `).join("");
    }

    function buildScorecardAdjustButtonsHTML(scorecard, playerName) {
      const buildButton = (increment) => `
        <button class="admin-button admin-button--secondary admin-button--small admin-scorecard-increment-btn" type="button"
          data-action="scorecard-adjust-score"
          data-scorecard-id="${escapeHtml(scorecard.id)}"
          data-player-name="${escapeHtml(playerName)}"
          data-increment="${escapeHtml(increment)}">
          ${increment > 0 ? "+" : ""}${escapeHtml(formatScorecardScore(increment))}
        </button>
      `;

      if (scorecard.increments.length > 10) {
        return `
          <div class="admin-scorecard-adjust-scroll" tabindex="0" aria-label="Score adjustments">
            ${scorecard.increments.map(buildButton).join("")}
          </div>
        `;
      }

      return `
        <div class="admin-scorecard-adjust-grid-buttons">
          ${scorecard.increments.map(buildButton).join("")}
        </div>
      `;
    }

    function buildScorecardUndoButtonHTML(scorecardId, session) {
      const hasUndo = session && getScorecardActionHistory(session.id).length > 0;
      return `
        <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="scorecard-undo" data-scorecard-id="${escapeHtml(scorecardId)}"${hasUndo ? "" : " disabled"}>Undo</button>
      `;
    }

    function buildScorecardLogButtonHTML(scorecardId, session) {
      return `
        <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="scorecard-open-log" data-scorecard-id="${escapeHtml(scorecardId)}"${session ? "" : " disabled"}>Score log</button>
      `;
    }

    function buildScorecardLogModalHtml(scorecard, session, filter = "month") {
      const events = (session?.scoreEvents || []).slice().reverse();
      const playerColorByName = new Map((scorecard?.players || []).map((player) => [player.name, player.color]));

      return `
        <div class="admin-scorecard-modal-stack">
          <section class="admin-scorecard-modal-section">
            <div class="admin-scorecard-section-head">
              <h3>Current session</h3>
              <span class="admin-panel-note">${escapeHtml(formatScorecardSessionDate(session?.startedAt || session?.createdAt))}</span>
            </div>
            <div class="admin-scorecard-history-list">
              ${events.length ? events.map((event) => `
                <article class="admin-scorecard-log-card">
                  <div class="admin-scorecard-log-head">
                    <strong class="admin-scorecard-log-player" style="color:${escapeHtml(playerColorByName.get(event.player) || "var(--ink)")}">
                      ${escapeHtml(event.player)}
                    </strong>
                    <span class="admin-panel-note">${escapeHtml(formatScoreEventTime(event.timestamp))}</span>
                  </div>
                  <div class="admin-scorecard-log-meta">
                    <span class="admin-scorecard-log-amount ${event.amount >= 0 ? "is-positive" : "is-negative"}">${event.amount >= 0 ? "+" : "−"}${escapeHtml(formatScorecardScore(Math.abs(event.amount)))}</span>
                    <span>${escapeHtml(formatScoreEventTypeLabel(event.type))}</span>
                  </div>
                </article>
              `).join("") : '<div class="admin-empty">No score events yet.</div>'}
            </div>
          </section>
          <div class="admin-actions admin-actions--end">
            <button class="admin-button admin-button--secondary" type="button" data-action="scorecard-close-log" data-scorecard-id="${escapeHtml(scorecard.id)}" data-filter="${escapeHtml(filter)}">Close</button>
          </div>
        </div>
      `;
    }

    function buildScorecardHistoryEntryHTML(scorecard, session) {
      const winnerLabel = session.winner || "Tie";
      return `
        <article class="admin-scorecard-history-card">
          <div class="admin-scorecard-history-head">
            <div class="admin-scorecard-history-meta">
              <strong>${escapeHtml(formatScorecardSessionDate(session.endedAt || session.startedAt))}</strong>
              <span>${escapeHtml(formatScorecardSessionDuration(session.startedAt, session.endedAt))}</span>
            </div>
            <span class="admin-scorecard-history-winner-badge">
              <i data-lucide="trophy"></i>
              ${escapeHtml(winnerLabel)}
            </span>
          </div>
          <div class="admin-scorecard-history-scores">
            ${scorecard.players.map((player) => `
              <span class="admin-scorecard-history-pill${winnerLabel === player.name ? " is-winner" : ""}">
                ${winnerLabel === player.name ? '<i data-lucide="trophy"></i>' : ""}
                <span>${escapeHtml(player.name)}</span>
                <strong>${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session.scores, player, scorecard.players)))}</strong>
              </span>
            `).join("")}
          </div>
        </article>
      `;
    }

    function buildScorecardBonusEntryHtml(scorecard, bonusState, session) {
      const lockedCount = Object.keys(bonusState?.wagers || {}).length;

      return `
        <div class="admin-scorecard-bonus-panel">
          <div class="admin-scorecard-bonus-status">
            <strong>${escapeHtml(lockedCount)} of ${escapeHtml(scorecard.players.length)} locked</strong>
            <span>Each player enters and locks a masked wager locally on this device.</span>
          </div>
          <div class="admin-scorecard-modal-stack">
            ${scorecard.players.map((player) => {
              const rawWager = bonusState?.wagers?.[player.id];
              const draftWager = bonusState?.draftWagers?.[player.id];
              const wagerError = String(bonusState?.wagerErrors?.[player.id] || "").trim();
              const hasLockedWager = Number.isFinite(Number(rawWager));
              const currentScore = Math.max(0, getScorecardPlayerScore(session?.scores, player, scorecard.players));
              const inputKey = `${scorecard.id}:${player.name}`;
              return `
                <div class="admin-scorecard-bonus-entry-block">
                  <div class="admin-scorecard-bonus-entry-row">
                    <div class="admin-scorecard-bonus-player-meta">
                      <strong>${escapeHtml(player.name)}</strong>
                      <span class="admin-panel-note admin-scorecard-bonus-current">Current: ${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session?.scores, player, scorecard.players)))}</span>
                    </div>
                    <div class="admin-scorecard-bonus-entry-side">
                      <div class="admin-scorecard-bonus-entry-controls">
                        <div class="admin-scorecard-bonus-input-wrap${hasLockedWager ? " is-locked" : ""}">
                          <input
                            class="admin-input admin-scorecard-bonus-input${hasLockedWager ? " is-locked" : ""}"
                            type="password"
                            inputmode="numeric"
                            autocomplete="off"
                            pattern="[0-9]*"
                            placeholder="Wager"
                            value="${escapeHtml(hasLockedWager ? String(rawWager) : String(draftWager || ""))}"
                            data-scorecard-bonus-input="${escapeHtml(inputKey)}"
                            data-scorecard-bonus-max="${escapeHtml(currentScore)}"
                            max="${escapeHtml(currentScore)}"
                            ${hasLockedWager ? "disabled" : ""}
                          >
                          ${hasLockedWager ? "" : `
                            <button class="admin-scorecard-bonus-peek-btn" type="button" data-action="scorecard-bonus-peek" data-scorecard-bonus-peek-target="${escapeHtml(inputKey)}"${draftWager ? "" : " disabled"} aria-label="Toggle wager visibility">
                              <i data-lucide="eye"></i>
                            </button>
                          `}
                        </div>
                        <button class="admin-button admin-scorecard-lock-icon-btn${hasLockedWager ? " is-locked" : ""}" type="button" data-action="scorecard-bonus-lock" data-scorecard-id="${escapeHtml(scorecard.id)}" data-player-name="${escapeHtml(player.name)}"${hasLockedWager ? " disabled" : ""} aria-label="${hasLockedWager ? "Wager locked" : "Lock wager"}"><i data-lucide="lock"></i></button>
                      </div>
                      <div class="admin-scorecard-bonus-error"${wagerError ? "" : ' hidden'} data-scorecard-bonus-error="${escapeHtml(inputKey)}">${escapeHtml(wagerError)}</div>
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
          <div class="admin-actions admin-actions--end">
            <button class="admin-button admin-button--secondary admin-scorecard-bonus-cancel-btn" type="button" data-action="scorecard-bonus-cancel" data-scorecard-id="${escapeHtml(scorecard.id)}">Cancel bonus round</button>
          </div>
        </div>
      `;
    }

    function buildScorecardBonusRevealCardsHtml(scorecard, bonusState, session) {
      return `
        <div class="admin-scorecard-history-scores admin-scorecard-bonus-reveal-grid">
          ${scorecard.players.map((player) => {
            const beforeScore = getScorecardPlayerScore(session?.scores, player, scorecard.players);
            const wager = Math.max(0, Number(bonusState?.wagers?.[player.id]) || 0);
            const result = String(bonusState?.results?.[player.id] || "").trim().toLowerCase();
            const isCorrect = result === "correct";
            const impact = isCorrect ? wager : -wager;
            const impactLabel = `${impact >= 0 ? "+" : "-"}${formatScorecardScore(Math.abs(impact))}`;
            return `
              <article class="admin-scorecard-bonus-reveal-card ${isCorrect ? "is-correct" : "is-incorrect"}">
                <div class="admin-scorecard-bonus-impact">${escapeHtml(impactLabel)}</div>
                <div class="admin-panel-note">Before: ${escapeHtml(formatScorecardScore(beforeScore))}</div>
                <div class="admin-scorecard-bonus-summary">${escapeHtml(player.name)} wagered ${escapeHtml(formatScorecardScore(wager))} · ${escapeHtml(isCorrect ? "Correct" : "Incorrect")}</div>
              </article>
            `;
          }).join("")}
        </div>
      `;
    }

    function buildScorecardBonusResultsHtml(scorecard, bonusState, session, showRevealStage = false) {
      const allResultsSelected = allLocalBonusResultsSelected(bonusState);

      return `
        <form data-modal-form="scorecard-bonus-results" data-scorecard-id="${escapeHtml(scorecard.id)}" novalidate>
          <div class="admin-scorecard-modal-stack">
            ${showRevealStage
              ? buildScorecardBonusRevealCardsHtml(scorecard, bonusState, session)
              : scorecard.players.map((player) => {
                  const result = String(bonusState?.results?.[player.id] || "").trim().toLowerCase();
                  return `
                    <div class="admin-scorecard-final-row">
                      <div>
                        <strong>${escapeHtml(player.name)}</strong>
                        <div class="admin-panel-note">Selection required before reveal</div>
                      </div>
                      <div class="admin-scorecard-toggle-row">
                        <label class="admin-scorecard-toggle-pill is-correct">
                          <input type="radio" name="result_${escapeHtml(player.id)}" value="correct"${result === "correct" ? " checked" : ""}>
                          <span>Correct</span>
                        </label>
                        <label class="admin-scorecard-toggle-pill is-incorrect">
                          <input type="radio" name="result_${escapeHtml(player.id)}" value="incorrect"${result === "incorrect" ? " checked" : ""}>
                          <span>Incorrect</span>
                        </label>
                      </div>
                    </div>
                  `;
                }).join("")}
            ${showRevealStage
              ? `
                <div class="admin-actions admin-actions--split">
                  <button class="admin-button admin-button--secondary" type="button" data-action="scorecard-bonus-back" data-scorecard-id="${escapeHtml(scorecard.id)}">Back</button>
                  <button class="admin-button admin-button--primary" type="submit">Apply results</button>
                </div>
              `
              : `
                <div class="admin-scorecard-bonus-result-actions">
                  <button class="admin-button admin-button--secondary admin-scorecard-bonus-cancel-btn" type="button" data-action="scorecard-bonus-cancel" data-scorecard-id="${escapeHtml(scorecard.id)}">Cancel bonus round</button>
                  <button class="admin-button admin-button--primary" type="button" data-action="scorecard-bonus-reveal" data-scorecard-id="${escapeHtml(scorecard.id)}"${allResultsSelected ? "" : " disabled"}>Reveal wagers</button>
                </div>
              `}
          </div>
        </form>
      `;
    }

    function buildScorecardWinnerModalHtml(scorecard, session) {
      const leaders = getScorecardLeaders(session?.scores, scorecard?.players || []);
      const isTie = leaders.length > 1;
      const highlightedLeaders = new Set(leaders);
      return `
        <div class="admin-scorecard-modal-stack">
          <section class="admin-scorecard-modal-section admin-scorecard-winner-panel">
            <div class="admin-scorecard-winner-title">${escapeHtml(isTie ? "🤝 It's a tie!" : `🏆 ${leaders[0] || session.winner || "Winner"} wins!`)}</div>
            <div class="admin-scorecard-winner-board">
              ${scorecard.players.map((player) => `
                <div class="admin-scorecard-winner-row${highlightedLeaders.has(player.name) ? " is-winner" : ""}">
                  <span class="admin-scorecard-winner-name" style="color:${escapeHtml(player.color)}">${escapeHtml(player.name)}</span>
                  <strong>${escapeHtml(formatScorecardScore(getScorecardPlayerScore(session.scores, player, scorecard.players)))}</strong>
                </div>
              `).join("")}
            </div>
          </section>
          <div class="admin-actions admin-actions--split">
            <button class="admin-button admin-button--primary" type="button" data-action="scorecard-new-game" data-scorecard-id="${escapeHtml(scorecard.id)}">New game</button>
            <button class="admin-button admin-button--secondary" type="button" data-action="scorecard-archive" data-scorecard-id="${escapeHtml(scorecard.id)}">${adminScorecardArchiveConfirmId === scorecard.id ? "Confirm archive" : "Archive scorecard"}</button>
          </div>
        </div>
      `;
    }

    function buildScorecardManageHTML(scorecard, filter = "month") {
      const activeSession = getAdminActiveScorecardSession(scorecard.id);
      const localBonusState = getAdminLocalBonusState(scorecard.id);
      const isBonusActive = !!localBonusState;
      const history = getFilteredScorecardHistory(scorecard.id, filter);
      return `
        <div class="admin-scorecard-modal-stack">
          <section class="admin-scorecard-modal-section">
            <div class="admin-scorecard-section-head">
              <h3>Scorecard</h3>
              <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="edit-scorecard-config" data-scorecard-id="${escapeHtml(scorecard.id)}">Edit</button>
            </div>
            <p class="admin-panel-note">${escapeHtml(scorecard.players.length)} players</p>
          </section>
          <section class="admin-scorecard-modal-section">
            <div class="admin-scorecard-section-head">
              <h3>${isBonusActive ? "Bonus round" : "Current game"}</h3>
              ${isBonusActive ? "" : `
                <div class="admin-scorecard-inline-actions">
                  ${buildScorecardUndoButtonHTML(scorecard.id, activeSession)}
                  ${buildScorecardLogButtonHTML(scorecard.id, activeSession)}
                  <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="scorecard-end-game" data-scorecard-id="${escapeHtml(scorecard.id)}"${activeSession ? "" : " disabled"}>End game</button>
                  <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="scorecard-bonus-round" data-scorecard-id="${escapeHtml(scorecard.id)}"${activeSession ? "" : " disabled"}>Bonus round</button>
                </div>
              `}
            </div>
            ${!activeSession ? '<div class="admin-empty">No active game.</div>' : localBonusState?.phase === "entry" ? buildScorecardBonusEntryHtml(scorecard, localBonusState, activeSession) : isBonusActive ? buildScorecardBonusResultsHtml(scorecard, localBonusState, activeSession, localBonusState.phase === "reveal") : `
              <div class="admin-scorecard-session-list">
                ${buildScorecardSessionRowsHTML(scorecard, activeSession)}
              </div>
              <div class="admin-scorecard-adjust-grid">
                ${scorecard.players.map((player) => `
                  <div class="admin-scorecard-adjust-card">
                    <div class="admin-scorecard-adjust-player">
                      <span class="admin-scorecard-player-dot" style="background:${escapeHtml(player.color)}"></span>
                      <span>${escapeHtml(player.name)}</span>
                    </div>
                    ${buildScorecardAdjustButtonsHTML(scorecard, player.name)}
                  </div>
                `).join("")}
              </div>
            `}
          </section>
          <section class="admin-scorecard-modal-section">
            <div class="admin-scorecard-section-head">
              <h3>Past games</h3>
              <div class="admin-scorecard-filter-row">
                ${[
                  ["week", "This week"],
                  ["month", "This month"],
                  ["all", "All time"]
                ].map(([key, label]) => `
                  <button class="admin-button admin-button--small ${filter === key ? "admin-button--primary" : "admin-button--secondary"}" type="button" data-action="scorecard-history-filter" data-scorecard-id="${escapeHtml(scorecard.id)}" data-filter="${escapeHtml(key)}">${escapeHtml(label)}</button>
                `).join("")}
              </div>
            </div>
            <div class="admin-scorecard-history-list">
              ${history.length ? history.map((session) => buildScorecardHistoryEntryHTML(scorecard, session)).join("") : '<div class="admin-empty">No past games in this range.</div>'}
            </div>
          </section>
        </div>
      `;
    }

    function openScorecardCreateModal() {
      adminModalType = "scorecard-create";
      adminModalContext = null;
      openAdminModal("Add Scorecard", buildScorecardConfigFormHTML(null));
    }

    function openScorecardWinnerModal(scorecardId) {
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminPendingWinnerSession(scorecardId);
      if (!scorecard || !session) {
        return;
      }

      adminModalType = "scorecard-winner";
      adminModalContext = { scorecardId };
      adminScorecardArchiveConfirmId = "";
      openAdminModal(scorecard.name, buildScorecardWinnerModalHtml(scorecard, session));
    }

    function openScorecardManageModal(scorecardId, filter = "month") {
      const scorecard = getAdminScorecardById(scorecardId);
      if (!scorecard) {
        return;
      }

      if (getAdminPendingWinnerSession(scorecardId)) {
        openScorecardWinnerModal(scorecardId);
        return;
      }

      adminModalType = "scorecard-manage";
      adminModalContext = { scorecardId, filter };
      openAdminModal(scorecard.name, buildScorecardManageHTML(scorecard, filter));
    }

    function openScorecardLogModal(scorecardId, filter = "month") {
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      if (!scorecard || !session) {
        return;
      }

      adminModalType = "scorecard-log";
      adminModalContext = { scorecardId, filter };
      openAdminModal(`${scorecard.name} score log`, buildScorecardLogModalHtml(scorecard, session, filter));
    }

    function openScorecardEditModal(scorecardId) {
      const scorecard = getAdminScorecardById(scorecardId);
      if (!scorecard) {
        return;
      }

      adminModalType = "scorecard-edit";
      adminModalContext = { scorecardId };
      openAdminModal(`Edit ${scorecard.name}`, buildScorecardConfigFormHTML(scorecard));
    }

    function rerenderScorecardWinnerModal() {
      if (adminModalType !== "scorecard-winner" || !adminModalContext?.scorecardId) {
        return;
      }

      const scorecard = getAdminScorecardById(adminModalContext.scorecardId);
      const session = getAdminPendingWinnerSession(adminModalContext.scorecardId);
      const modalTitle = document.getElementById("admin-modal-title");
      const modalBody = document.getElementById("admin-modal-body");
      if (!scorecard || !session || !modalTitle || !modalBody) {
        return;
      }

      modalTitle.textContent = scorecard.name;
      modalBody.innerHTML = buildScorecardWinnerModalHtml(scorecard, session);
      refreshIcons();
    }

    function rerenderScorecardManageModal() {
      if (adminModalType !== "scorecard-manage" || !adminModalContext?.scorecardId) {
        return;
      }

      const scorecard = getAdminScorecardById(adminModalContext.scorecardId);
      const modalTitle = document.getElementById("admin-modal-title");
      const modalBody = document.getElementById("admin-modal-body");
      if (!scorecard || !modalTitle || !modalBody) {
        return;
      }

      modalTitle.textContent = scorecard.name;
      modalBody.innerHTML = buildScorecardManageHTML(scorecard, adminModalContext.filter || "month");
      refreshIcons();
    }

    function rerenderScorecardLogModal() {
      if (adminModalType !== "scorecard-log" || !adminModalContext?.scorecardId) {
        return;
      }

      const scorecard = getAdminScorecardById(adminModalContext.scorecardId);
      const session = getAdminActiveScorecardSession(adminModalContext.scorecardId);
      const modalTitle = document.getElementById("admin-modal-title");
      const modalBody = document.getElementById("admin-modal-body");
      if (!scorecard || !session || !modalTitle || !modalBody) {
        return;
      }

      modalTitle.textContent = `${scorecard.name} score log`;
      modalBody.innerHTML = buildScorecardLogModalHtml(scorecard, session, adminModalContext.filter || "month");
      refreshIcons();
    }

    function collectScorecardFormValues(form) {
      const name = String(form.querySelector("[name='scorecard_name']")?.value || "").trim();
      const players = Array.from(form.querySelectorAll(".admin-scorecard-player-row")).map((row) => ({
        id: String(row.querySelector("[name='scorecard_player_id']")?.value || "").trim(),
        name: String(row.querySelector("[name='scorecard_player_name']")?.value || "").trim(),
        color: String(row.querySelector("[name='scorecard_player_color']")?.value || "").trim()
      })).filter((player) => player.name);
      const increments = Array.from(form.querySelectorAll("[name='scorecard_increment']")).map((input) =>
        Number(String(input.value || "").trim())
      ).filter((value) => Number.isFinite(value) && value !== 0);

      return {
        name,
        players,
        increments,
        allowNegative: form.querySelector("[name='scorecard_allow_negative']")?.checked === true,
        showHistory: form.querySelector("[name='scorecard_show_history']")?.checked !== false
      };
    }

    function validateScorecardForm(form, values) {
      const nameInput = form.querySelector("[name='scorecard_name']");
      if (!values.name) {
        setFieldError(nameInput, "Add a scorecard name.");
        nameInput?.focus();
        return false;
      }
      clearFieldError(nameInput);

      if (values.players.length < 2 || values.players.length > 6) {
        showToast("Scorecards need 2 to 6 players.");
        return false;
      }

      const normalizedNames = values.players.map((player) => player.name.trim().toLowerCase()).filter(Boolean);
      if (new Set(normalizedNames).size !== normalizedNames.length) {
        showToast("Player names must be unique.");
        return false;
      }

      if (values.increments.length === 0) {
        showToast("Add at least one increment value.");
        return false;
      }

      return true;
    }

    async function loadAdminScorecards() {
      if (!adminScorecardList || !adminScorecardsNote) {
        return;
      }

      const startingScreen = adminScreen;
      adminScorecardsNote.textContent = "Loading scorecards…";
      adminScorecardList.innerHTML = buildAdminCountdownSkeletonHTML();

      const scorecards = await fetchAdminScorecards();
      if (scorecards === null) {
        adminScorecardsNote.textContent = "Couldn't load scorecards.";
        adminScorecardList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
        return;
      }

      let sessionsById = await fetchAdminScorecardSessions(scorecards);
      if (sessionsById === null) {
        adminScorecardsNote.textContent = "Couldn't load scorecards.";
        adminScorecardList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
        return;
      }

      sessionsById = await ensureAdminScorecardSessions(scorecards, sessionsById);
      adminScorecards = scorecards;
      adminScorecardSessionsById = sessionsById;
      Array.from(adminScorecardBonusStateById.keys()).forEach((scorecardId) => {
        getAdminLocalBonusState(scorecardId);
      });
      adminHouseholdSettings.display_settings.screen_order = normalizeAdminScreenOrder(adminHouseholdSettings.display_settings.screen_order);
      renderAdminScorecardList();

      if (startingScreen === adminScreen && adminScreen === "settings") {
        loadAdminSettings();
      }

      if (adminModalType === "scorecard-manage") {
        rerenderScorecardManageModal();
      }

      if (adminModalType === "scorecard-log") {
        rerenderScorecardLogModal();
      }

      if (adminModalType === "scorecard-winner") {
        rerenderScorecardWinnerModal();
      }
    }

    async function saveScorecardFromForm(form) {
      const client = getSupabaseClient();
      if (adminScorecardWritePending) {
        return;
      }

      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      const scorecardId = String(form.querySelector("[name='scorecard_id']")?.value || "").trim();
      const values = collectScorecardFormValues(form);
      if (!validateScorecardForm(form, values)) {
        return;
      }

      adminScorecardWritePending = true;
      setModalSaving(true, scorecardId ? "Save" : "Create");

      const payload = {
        household_id: DISPLAY_HOUSEHOLD_ID,
        name: values.name,
        players: normalizeScorecardPlayers(values.players),
        increments: values.increments,
        allow_negative: values.allowNegative,
        show_history: values.showHistory
      };

      let savedRow = null;
      let error = null;

      if (scorecardId) {
        const response = await client
          .from("scorecards")
          .update(payload)
          .eq("id", scorecardId)
          .eq("household_id", DISPLAY_HOUSEHOLD_ID)
          .select("id, household_id, name, increments, players, show_history, allow_negative, created_at, archived_at")
          .single();
        savedRow = response.data;
        error = response.error;
      } else {
        const response = await client
          .from("scorecards")
          .insert(payload)
          .select("id, household_id, name, increments, players, show_history, allow_negative, created_at, archived_at")
          .single();
        savedRow = response.data;
        error = response.error;
      }

      adminScorecardWritePending = false;
      setModalSaving(false, scorecardId ? "Save" : "Create");

      if (error || !savedRow) {
        showToast(friendlySaveMessage());
        return;
      }

      if (!scorecardId) {
        const scorecard = mapScorecardRow(savedRow);
        const session = await createFreshScorecardSession(scorecard);
        if (session) {
          adminScorecardSessionsById.set(scorecard.id, [session]);
        }
      }

      closeAdminModal();
      await loadAdminScorecards();
      showToast(scorecardId ? "Scorecard saved." : "Scorecard created.");
    }

    async function deleteScorecard(scorecardId) {
      await archiveScorecard(scorecardId);
    }

    async function archiveScorecard(scorecardId) {
      const client = getSupabaseClient();
      if (adminScorecardWritePending) {
        return;
      }

      if (!client) {
        showToast(friendlyDeleteMessage());
        return;
      }

      adminScorecardWritePending = true;
      const { error } = await client
        .from("scorecards")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", scorecardId)
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .is("archived_at", null);
      adminScorecardWritePending = false;

      if (error) {
        showToast(friendlyDeleteMessage());
        return;
      }

      adminScorecardArchiveConfirmId = "";
      clearScorecardPendingWinner(scorecardId);
      setAdminLocalBonusState(scorecardId, null);
      closeAdminModal();
      await loadAdminScorecards();
      showToast("Scorecard archived.");
    }

    async function adjustScorecardScore(scorecardId, playerName, increment) {
      const client = getSupabaseClient();
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      const playerId = getScorecardPlayerId(scorecard?.players, playerName);
      if (adminScorecardWritePending) {
        return;
      }

      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      if (!scorecard || !session || !playerId) {
        return;
      }

      const nextScores = {
        ...session.scores,
        [playerId]: applyScorecardIncrement(getScorecardPlayerScore(session.scores, playerName, scorecard.players), Number(increment), scorecard.allowNegative)
      };
      const previousScore = getScorecardPlayerScore(session.scores, playerName, scorecard.players);
      const nextScore = Number(nextScores[playerId]) || 0;
      if (previousScore === nextScore) {
        return;
      }

      adminScorecardWritePending = true;
      const scoreEvents = appendScoreEvents(session.scoreEvents, [
        buildScoreEvent(playerName, Number(increment), SCORE_EVENT_TYPES.increment)
      ], scorecard.players);
      const { data, error } = await client
        .from("scorecard_sessions")
        .update({
          scores: nextScores,
          score_events: scoreEvents
        })
        .eq("id", session.id)
        .eq("scorecard_id", scorecardId)
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .single();
      adminScorecardWritePending = false;

      if (error || !data) {
        showToast(friendlySaveMessage());
        return;
      }

      pushScorecardActionHistory(session.id, {
        type: "increment",
        changes: [{
          playerName,
          previousScore,
          nextScore,
          increment: Number(increment)
        }]
      });

      const sessions = getAdminScorecardSessions(scorecardId).map((item) =>
        item.id === session.id ? mapScorecardSessionRow(data, scorecard) : item
      );
      adminScorecardSessionsById.set(scorecardId, sessions);
      renderAdminScorecardList();
      rerenderScorecardManageModal();
    }

    async function updateAdminActiveScorecardSession(scorecardId, payload) {
      const client = getSupabaseClient();
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      if (adminScorecardWritePending) {
        return null;
      }

      if (!client) {
        showToast(friendlySaveMessage());
        return null;
      }

      if (!scorecard || !session) {
        return null;
      }

      adminScorecardWritePending = true;
      const { data, error } = await client
        .from("scorecard_sessions")
        .update(payload)
        .eq("id", session.id)
        .eq("scorecard_id", scorecardId)
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .single();
      adminScorecardWritePending = false;

      if (error || !data) {
        return null;
      }

      const nextSession = mapScorecardSessionRow(data, scorecard);
      adminScorecardSessionsById.set(scorecardId, getAdminScorecardSessions(scorecardId).map((item) =>
        item.id === session.id ? nextSession : item
      ));
      renderAdminScorecardList();
      rerenderScorecardManageModal();
      rerenderScorecardWinnerModal();
      return nextSession;
    }

    async function beginScorecardBonusRound(scorecardId) {
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      if (!scorecard || !session || adminScorecardWritePending) {
        return;
      }

      const nextState = createLocalBonusState(session.id, scorecard.players, {
        ...session,
        wagers: buildScorecardBonusWagers(scorecard.players, {}, SCORECARD_BONUS_PHASES.entry),
        wagerResults: null,
        isFinalJeopardy: true
      });
      const nextSession = await updateAdminActiveScorecardSession(scorecardId, {
        wagers: buildScorecardBonusWagers(scorecard.players, {}, SCORECARD_BONUS_PHASES.entry),
        wager_results: null,
        is_final_jeopardy: true
      });
      if (!nextSession) {
        return;
      }

      setAdminLocalBonusState(scorecardId, nextState);
      rerenderScorecardManageModal();
      showToast("Bonus Round started.");
    }

    async function cancelScorecardBonusRound(scorecardId) {
      const nextSession = await updateAdminActiveScorecardSession(scorecardId, {
        wagers: null,
        wager_results: null,
        is_final_jeopardy: false
      });
      if (!nextSession) {
        return;
      }

      setAdminLocalBonusState(scorecardId, null);
      rerenderScorecardManageModal();
      showToast("Bonus Round canceled.");
    }

    async function lockAdminScorecardBonusWager(scorecardId, playerName, rawValue) {
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      const localBonusState = getAdminLocalBonusState(scorecardId);
      const playerId = getScorecardPlayerId(scorecard?.players, playerName);
      if (!scorecard || !session || !localBonusState || localBonusState.phase !== "entry" || !playerId) {
        return;
      }

      const currentScore = Math.max(0, getScorecardPlayerScore(session.scores, playerName, scorecard.players));
      const sanitized = sanitizeBonusWagerInputValue(rawValue);
      if (sanitized === "") {
        showToast("Enter a wager before locking it in.");
        return;
      }

      const parsedValue = Math.max(0, Number(sanitized));
      if (parsedValue > currentScore) {
        setAdminLocalBonusState(scorecardId, {
          ...localBonusState,
          wagerErrors: {
            ...localBonusState.wagerErrors,
            [playerId]: `Max wager: ${formatScorecardScore(currentScore)}`
          }
        });
        rerenderScorecardManageModal();
        return;
      }

      const nextState = {
        ...localBonusState,
        draftWagers: {
          ...localBonusState.draftWagers,
          [playerId]: ""
        },
        wagerErrors: {
          ...localBonusState.wagerErrors,
          [playerId]: ""
        },
        wagers: {
          ...localBonusState.wagers,
          [playerId]: parsedValue
        }
      };
      setAdminLocalBonusState(scorecardId, nextState);
      const nextSession = await updateAdminActiveScorecardSession(scorecardId, {
        wagers: buildScorecardBonusWagers(scorecard.players, nextState.wagers, SCORECARD_BONUS_PHASES.entry),
        wager_results: null,
        is_final_jeopardy: true
      });
      if (!nextSession) {
        return;
      }
      rerenderScorecardManageModal();
      if (allLocalBonusWagersLocked(nextState)) {
        const existingAdvanceTimer = adminScorecardBonusAdvanceTimerById.get(scorecardId);
        if (existingAdvanceTimer) {
          window.clearTimeout(existingAdvanceTimer);
        }

        const timerId = window.setTimeout(async () => {
          adminScorecardBonusAdvanceTimerById.delete(scorecardId);
          const currentBonusState = getAdminLocalBonusState(scorecardId);
          if (!currentBonusState || currentBonusState.phase !== "entry" || !allLocalBonusWagersLocked(currentBonusState)) {
            return;
          }

          const advancedState = {
            ...currentBonusState,
            phase: "results"
          };
          setAdminLocalBonusState(scorecardId, advancedState);
          const updatedSession = await updateAdminActiveScorecardSession(scorecardId, {
            wagers: buildScorecardBonusWagers(scorecard.players, advancedState.wagers, SCORECARD_BONUS_PHASES.results),
            wager_results: buildScorecardBonusResults(scorecard.players, advancedState.results, SCORECARD_BONUS_PHASES.results),
            is_final_jeopardy: true
          });
          if (!updatedSession) {
            return;
          }
          rerenderScorecardManageModal();
        }, 350);
        adminScorecardBonusAdvanceTimerById.set(scorecardId, timerId);
      }
    }

    async function revealScorecardBonusWagers(scorecardId) {
      const scorecard = getAdminScorecardById(scorecardId);
      const localBonusState = getAdminLocalBonusState(scorecardId);
      if (!scorecard || !localBonusState) {
        return;
      }

      if (!allLocalBonusWagersLocked(localBonusState) || !allLocalBonusResultsSelected(localBonusState)) {
        showToast("Set every result before revealing wagers.");
        return;
      }

      const nextState = {
        ...localBonusState,
        phase: "reveal",
        revealed: true
      };
      setAdminLocalBonusState(scorecardId, nextState);
      const nextSession = await updateAdminActiveScorecardSession(scorecardId, {
        wagers: buildScorecardBonusWagers(scorecard.players, nextState.wagers, SCORECARD_BONUS_PHASES.reveal),
        wager_results: buildScorecardBonusResults(scorecard.players, nextState.results, SCORECARD_BONUS_PHASES.reveal),
        is_final_jeopardy: true
      });
      if (!nextSession) {
        return;
      }
      rerenderScorecardManageModal();
    }

    async function backOutOfAdminBonusReveal(scorecardId) {
      const scorecard = getAdminScorecardById(scorecardId);
      const localBonusState = getAdminLocalBonusState(scorecardId);
      if (!scorecard || !localBonusState) {
        return;
      }

      const nextState = {
        ...localBonusState,
        phase: "results",
        revealed: false
      };
      setAdminLocalBonusState(scorecardId, nextState);
      const nextSession = await updateAdminActiveScorecardSession(scorecardId, {
        wagers: buildScorecardBonusWagers(scorecard.players, nextState.wagers, SCORECARD_BONUS_PHASES.results),
        wager_results: buildScorecardBonusResults(scorecard.players, nextState.results, SCORECARD_BONUS_PHASES.results),
        is_final_jeopardy: true
      });
      if (!nextSession) {
        return;
      }
      rerenderScorecardManageModal();
    }

    async function applyScorecardBonusResults(scorecardId, wagerResults, localBonusStateOverride = null) {
      const client = getSupabaseClient();
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      const localBonusState = localBonusStateOverride || getAdminLocalBonusState(scorecardId);
      if (adminScorecardWritePending) {
        return;
      }

      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      if (!scorecard || !session || !localBonusState) {
        return;
      }

      const nextScores = { ...session.scores };
      const historyChanges = [];
      scorecard.players.forEach((player) => {
        const previousScore = getScorecardPlayerScore(session.scores, player, scorecard.players);
        const wager = Math.max(0, Number(localBonusState.wagers[player.id]) || 0);
        const wasCorrect = wagerResults[player.id] === "correct";
        const nextScore = applyScorecardIncrement(previousScore, wasCorrect ? wager : -wager, scorecard.allowNegative);
        nextScores[player.id] = nextScore;
        historyChanges.push({
          playerName: player.name,
          previousScore,
          nextScore,
          increment: nextScore - previousScore
        });
      });

      adminScorecardWritePending = true;
      const scoreEvents = appendScoreEvents(
        session.scoreEvents,
        historyChanges.map((change) => buildScoreEvent(
          change.playerName,
          change.increment,
          SCORE_EVENT_TYPES.bonusRound
        )),
        scorecard.players
      );
      const { data, error } = await client
        .from("scorecard_sessions")
        .update({
          scores: nextScores,
          wagers: buildScorecardBonusWagers(scorecard.players, localBonusState.wagers, SCORECARD_BONUS_PHASES.complete),
          wager_results: buildScorecardBonusResults(scorecard.players, wagerResults, SCORECARD_BONUS_PHASES.complete),
          score_events: scoreEvents,
          is_final_jeopardy: false
        })
        .eq("id", session.id)
        .eq("scorecard_id", scorecardId)
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .single();
      adminScorecardWritePending = false;

      if (error || !data) {
        showToast(friendlySaveMessage());
        return;
      }

      pushScorecardActionHistory(session.id, {
        type: "bonus-round",
        changes: historyChanges
      });

      adminScorecardSessionsById.set(scorecardId, getAdminScorecardSessions(scorecardId).map((item) =>
        item.id === session.id ? mapScorecardSessionRow(data, scorecard) : item
      ));
      setAdminLocalBonusState(scorecardId, null);
      renderAdminScorecardList();
      rerenderScorecardManageModal();
      showToast("Bonus Round applied.");
    }

    async function undoScorecardAction(scorecardId) {
      const session = getAdminActiveScorecardSession(scorecardId);
      const scorecard = getAdminScorecardById(scorecardId);
      if (!session || !scorecard || adminScorecardWritePending) {
        return;
      }

      const action = popScorecardActionHistory(session.id);
      if (!action) {
        return;
      }

      const nextScores = { ...session.scores };
      action.changes.forEach((change) => {
        const playerId = getScorecardPlayerId(scorecard?.players, change.playerName);
        if (playerId) {
          nextScores[playerId] = change.previousScore;
        }
      });

      const nextSession = await updateAdminActiveScorecardSession(scorecardId, {
        scores: nextScores,
        score_events: appendScoreEvents(
          session.scoreEvents,
          action.changes.map((change) => buildScoreEvent(
            change.playerName,
            change.previousScore - change.nextScore,
            SCORE_EVENT_TYPES.undo
          )),
          scorecard.players
        )
      });
      if (!nextSession) {
        pushScorecardActionHistory(session.id, action);
        showToast(friendlySaveMessage());
        return;
      }

      showToast("Last score action undone.");
    }

    async function endScorecardGame(scorecardId) {
      const client = getSupabaseClient();
      const scorecard = getAdminScorecardById(scorecardId);
      const session = getAdminActiveScorecardSession(scorecardId);
      if (adminScorecardWritePending) {
        return;
      }

      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      if (!scorecard || !session) {
        return;
      }

      setAdminLocalBonusState(scorecardId, null);
      adminScorecardWritePending = true;
      const { data, error } = await client
        .from("scorecard_sessions")
        .update({
          ended_at: new Date().toISOString(),
          winner: getScorecardWinner(session.scores, scorecard.players)
        })
        .eq("id", session.id)
        .eq("scorecard_id", scorecardId)
        .select("id, scorecard_id, household_id, started_at, ended_at, scores, wagers, wager_results, score_events, winner, is_final_jeopardy, created_at")
        .single();
      adminScorecardWritePending = false;

      if (error || !data) {
        showToast(friendlySaveMessage());
        return;
      }

      adminScorecardSessionsById.set(scorecardId, getAdminScorecardSessions(scorecardId).map((item) =>
        item.id === session.id ? mapScorecardSessionRow(data, scorecard) : item
      ));
      renderAdminScorecardList();
      clearScorecardActionHistory(session.id);
      markScorecardPendingWinner(scorecardId, data.id);
      openScorecardWinnerModal(scorecardId);
    }

    async function startNextScorecardGame(scorecardId) {
      const scorecard = getAdminScorecardById(scorecardId);
      const activeSession = getAdminActiveScorecardSession(scorecardId);
      if (!scorecard || activeSession || adminScorecardWritePending) {
        return;
      }

      const freshSession = await createFreshScorecardSession(scorecard);
      if (!freshSession) {
        showToast(friendlySaveMessage());
        return;
      }

      clearScorecardActionHistory(freshSession.id);
      clearScorecardPendingWinner(scorecardId);
      adminScorecardArchiveConfirmId = "";
      setAdminLocalBonusState(scorecardId, null);
      adminScorecardSessionsById.set(scorecardId, [freshSession, ...getAdminScorecardSessions(scorecardId)]);
      renderAdminScorecardList();
      const nextFilter = adminModalContext?.filter || "month";
      closeAdminModal();
      openScorecardManageModal(scorecardId, nextFilter);
      showToast("New game started.");
    }

    function handleAdminScorecardListClick(event) {
      const card = event.target.closest("[data-scorecard-id]");
      if (!card) {
        return;
      }

      openScorecardManageModal(card.getAttribute("data-scorecard-id"));
    }

    // ── RSVP ─────────────────────────────────────────────────────────────────

    function getManualSearchMatches(query, invitedParties) {
      const normalizedQuery = normalizeMatchName(query);
      if (!normalizedQuery) return [];
      const queryTokens = getMatchTokens(normalizedQuery);

      return invitedParties
        .filter((party) => {
          const normalizedName = normalizeMatchName(party.name);
          if (!normalizedName) return false;
          if (normalizedName.includes(normalizedQuery)) return true;
          return queryTokens.every((token) => normalizedName.includes(token));
        })
        .slice(0, 8);
    }

    function getReviewItemByRsvpId(rsvpId) {
      return adminWeddingSnapshot?.reviewItems?.find((item) => item.rsvp.id === rsvpId) || null;
    }

    function getReviewResponseLabel(rsvp) {
      return rsvp.attending
        ? `Attending • ${formatAdminGuestCount(rsvp.guestCount)}`
        : "Declining";
    }

    function buildReviewIssueBadge(issueLabel) {
      return `<span class="admin-rsvp-issue-badge">${escapeHtml(issueLabel)}</span>`;
    }

    function buildManualPartySearchResultsHTML(matches, rsvpId) {
      if (!matches.length) {
        return '<div class="admin-rsvp-no-match">No open invited parties match that search.</div>';
      }

      return matches.map((party) => `
        <div class="admin-rsvp-suggestion">
          <div>
            <div class="admin-rsvp-suggestion-title">${escapeHtml(party.name)}</div>
            <div class="admin-rsvp-suggestion-meta">${escapeHtml(formatAdminGuestCount(party.invitedCount))} invited</div>
          </div>
          <button class="admin-button admin-button--secondary admin-button--small" type="button"
            data-action="link-rsvp-party"
            data-party-id="${escapeHtml(party.id)}"
            data-rsvp-id="${escapeHtml(rsvpId)}">Link</button>
        </div>
      `).join("");
    }

    function buildReviewPartySearchSection(rsvp, initialQuery = rsvp.name) {
      const unmatchedParties = adminWeddingSnapshot?.invitedParties?.filter((party) => !party.rsvpId) || [];
      const suggestions = getInvitedPartySuggestions(rsvp.name, unmatchedParties, 3);
      const manualMatches = getManualSearchMatches(initialQuery, unmatchedParties);

      return `
        ${suggestions.length ? `
          <div class="admin-rsvp-suggestion-list">
            ${suggestions.map((party) => `
              <div class="admin-rsvp-suggestion">
                <div>
                  <div class="admin-rsvp-suggestion-title">${escapeHtml(party.name)}</div>
                  <div class="admin-rsvp-suggestion-meta">${escapeHtml(formatAdminGuestCount(party.invitedCount))} invited • score ${party.matchScore.toFixed(1)}</div>
                </div>
                <button class="admin-button admin-button--primary admin-button--small" type="button"
                  data-action="link-rsvp-party"
                  data-party-id="${escapeHtml(party.id)}"
                  data-rsvp-id="${escapeHtml(rsvp.id)}">Link</button>
              </div>
            `).join("")}
          </div>
        ` : '<div class="admin-rsvp-no-match">No strong fuzzy matches yet.</div>'}
        <div class="admin-rsvp-search-block">
          <div class="admin-rsvp-search-label">Manual search</div>
          <input class="admin-input admin-rsvp-search-input" type="text"
            data-rsvp-search-input="review"
            data-rsvp-id="${escapeHtml(rsvp.id)}"
            placeholder="Search invited parties by name"
            value="${escapeHtml(initialQuery)}"
            autocomplete="off">
          <div class="admin-rsvp-search-results" data-rsvp-search-results="${escapeHtml(rsvp.id)}">
            ${buildManualPartySearchResultsHTML(manualMatches, rsvp.id)}
          </div>
        </div>
      `;
    }

    function buildReviewModalHTML(reviewItem) {
      if (!reviewItem) {
        return `<div class="admin-empty">That RSVP no longer needs review.</div>`;
      }

      if (reviewItem.issueType === "unmatched") {
        return `
          <div class="admin-rsvp-review-modal">
            <div class="admin-rsvp-review-header">
              ${buildReviewIssueBadge(reviewItem.issueLabel)}
              <div class="admin-rsvp-card-title">${escapeHtml(reviewItem.rsvp.name)}</div>
              <div class="admin-rsvp-card-meta">${escapeHtml(getReviewResponseLabel(reviewItem.rsvp))}</div>
            </div>
            ${buildReviewPartySearchSection(reviewItem.rsvp)}
          </div>
        `;
      }

      if (reviewItem.issueType === "duplicate") {
        const conflictParty = reviewItem.competingParty || null;
        const linkedRsvp = reviewItem.competingRsvp || null;
        const competingRsvps = Array.isArray(reviewItem.competingRsvps) ? reviewItem.competingRsvps : [];
        const conflictRsvps = [
          ...(linkedRsvp ? [{ rsvp: linkedRsvp, label: "Linked RSVP" }] : []),
          ...competingRsvps.map((rsvp) => ({ rsvp, label: "Competing RSVP" })),
          ...(!competingRsvps.find((candidate) => candidate.id === reviewItem.rsvp.id) ? [{ rsvp: reviewItem.rsvp, label: "Competing RSVP" }] : [])
        ].filter((entry, index, list) =>
          entry.rsvp && list.findIndex((candidate) => candidate.rsvp.id === entry.rsvp.id) === index
        );
        const defaultPrimary = linkedRsvp?.id || conflictRsvps[0]?.rsvp.id || "";
        const defaultGuestCount = conflictRsvps.find((entry) => entry.rsvp.id === defaultPrimary)?.rsvp.guestCount ?? reviewItem.rsvp.guestCount;
        return `
          <form data-modal-form="review-merge-duplicate" novalidate>
            <input type="hidden" name="party_id" value="${escapeHtml(conflictParty?.id || "")}">
            <input type="hidden" name="conflict_rsvp_ids" value="${escapeHtml(conflictRsvps.map((entry) => entry.rsvp.id).join(","))}">
          <div class="admin-rsvp-review-modal">
            <div class="admin-rsvp-review-header">
              ${buildReviewIssueBadge(reviewItem.issueLabel)}
              <div class="admin-rsvp-card-title">${escapeHtml(conflictParty?.name || reviewItem.rsvp.name)}</div>
              <div class="admin-rsvp-card-meta">These RSVPs may refer to the same party. Choose which should be the primary.</div>
            </div>
            <div class="admin-rsvp-compare">
              ${conflictRsvps.map((entry) => `
                <label class="admin-rsvp-compare-card">
                  <strong>
                    <input type="radio" name="primary_rsvp_id" value="${escapeHtml(entry.rsvp.id)}"
                      data-guest-count="${escapeHtml(entry.rsvp.guestCount)}"
                      ${entry.rsvp.id === defaultPrimary ? "checked" : ""}>
                    ${escapeHtml(entry.label)}
                  </strong>
                  <span>${escapeHtml(entry.rsvp.name)}</span>
                  <span>${escapeHtml(getReviewResponseLabel(entry.rsvp))}</span>
                </label>
              `).join("")}
            </div>
            <div class="admin-field">
              <label for="review-merge-guest-count">Guest count</label>
              <input id="review-merge-guest-count" name="guest_count" type="number" min="0" max="20" value="${escapeHtml(defaultGuestCount)}" required>
            </div>
            <div class="admin-actions admin-actions--end">
              <button class="admin-button admin-button--primary" type="submit">Confirm</button>
            </div>
          </div>
          </form>
        `;
      }

      if (reviewItem.issueType === "count_mismatch") {
        return `
          <form data-modal-form="review-guest-count" novalidate>
            <input type="hidden" name="rsvp_id" value="${escapeHtml(reviewItem.rsvp.id)}">
            <div class="admin-rsvp-review-modal">
              <div class="admin-rsvp-review-header">
                ${buildReviewIssueBadge(reviewItem.issueLabel)}
                <div class="admin-rsvp-card-title">${escapeHtml(reviewItem.rsvp.name)}</div>
                <div class="admin-rsvp-card-meta">${escapeHtml(reviewItem.matchedParty.name)} invited ${escapeHtml(formatAdminGuestCount(reviewItem.matchedParty.invitedCount))}, but the RSVP says ${escapeHtml(formatAdminGuestCount(reviewItem.rsvp.guestCount))}.</div>
              </div>
              <div class="admin-field">
                <label for="review-guest-count">Correct guest count</label>
                <input id="review-guest-count" name="guest_count" type="number" min="0" max="20" value="${escapeHtml(reviewItem.rsvp.guestCount)}" required>
              </div>
              <div class="admin-actions admin-actions--end">
                <button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>
                <button class="admin-button admin-button--primary" type="submit">Save</button>
              </div>
            </div>
          </form>
        `;
      }

      return `
        <div class="admin-rsvp-review-modal">
          <div class="admin-rsvp-review-header">
            ${buildReviewIssueBadge(reviewItem.issueLabel)}
            <div class="admin-rsvp-card-title">${escapeHtml(reviewItem.rsvp.name)}</div>
            <div class="admin-rsvp-card-meta">${escapeHtml(getReviewResponseLabel(reviewItem.rsvp))}</div>
          </div>
          <div class="admin-rsvp-compare-card">
            <strong>Matched party</strong>
            <span>${escapeHtml(reviewItem.matchedParty?.name || "Unknown party")}</span>
            <span>Score ${Number(reviewItem.bestScore || 0).toFixed(1)}</span>
          </div>
          <div class="admin-rsvp-action-row">
            <button class="admin-button admin-button--primary" type="button"
              data-action="review-confirm-low-confidence"
              data-rsvp-id="${escapeHtml(reviewItem.rsvp.id)}"
              data-party-id="${escapeHtml(reviewItem.matchedParty?.id || "")}">Confirm match</button>
            <button class="admin-button admin-button--secondary" type="button"
              data-action="review-relink"
              data-rsvp-id="${escapeHtml(reviewItem.rsvp.id)}"
              data-party-id="${escapeHtml(reviewItem.matchedParty?.id || "")}">Re-link</button>
          </div>
        </div>
      `;
    }

    function openReviewModal(rsvpId) {
      const reviewItem = getReviewItemByRsvpId(rsvpId);
      adminModalType = "review-rsvp";
      adminModalContext = { rsvpId };
      openAdminModal("Review RSVP", buildReviewModalHTML(reviewItem));
    }

    function renderAdminRsvpUnmatchedList() {
      const reviewItems = adminWeddingSnapshot?.reviewItems || [];

      adminRsvpUnmatchedNote.textContent = "RSVPs that need your attention — unmatched, possible duplicates, unexpected guest counts, or uncertain matches.";

      if (!reviewItems.length) {
        adminRsvpUnmatchedList.innerHTML = '<div class="admin-empty">Nothing to review right now.</div>';
        return;
      }

      adminRsvpUnmatchedList.innerHTML = reviewItems.map((item) => `
        <button class="admin-rsvp-review-row" type="button" data-review-rsvp-id="${escapeHtml(item.rsvp.id)}">
          <div class="admin-rsvp-review-main">
            <div class="admin-rsvp-guest-title">${escapeHtml(item.rsvp.name)}</div>
            <div class="admin-rsvp-card-meta">${escapeHtml(getReviewResponseLabel(item.rsvp))}</div>
          </div>
          <div class="admin-rsvp-review-side">
            ${buildReviewIssueBadge(item.issueLabel)}
          </div>
        </button>
      `).join("");
    }

    function getAvailableRsvpLinkOptions(currentParty) {
      const linkedRsvpId = currentParty.rsvpId || "";
      const availableRsvps = (adminWeddingSnapshot?.unmatchedRsvps || []).slice();
      if (currentParty.linkedRsvp) {
        availableRsvps.unshift(currentParty.linkedRsvp);
      }
      return {
        linkedRsvpId,
        linkedRsvpName: currentParty.linkedRsvp ? currentParty.linkedRsvp.name : "No linked RSVP",
        options: availableRsvps.filter((rsvp, index, list) =>
        list.findIndex((candidate) => candidate.id === rsvp.id) === index
        )
      };
    }

    function buildLinkedRsvpOptionListHTML(options, linkedRsvpId) {
      if (!options.length) {
        return '<div class="admin-rsvp-no-match">No unmatched RSVPs available to link.</div>';
      }

      return options.map((rsvp) => `
        <button class="admin-rsvp-search-result${rsvp.id === linkedRsvpId ? " is-selected" : ""}" type="button"
          data-action="select-linked-rsvp"
          data-rsvp-id="${escapeHtml(rsvp.id)}"
          data-rsvp-name="${escapeHtml(rsvp.name)}">
          <span>${escapeHtml(rsvp.name)}</span>
          <span>${escapeHtml(rsvp.attending ? formatAdminGuestCount(rsvp.guestCount) : "Declining")}</span>
        </button>
      `).join("");
    }

    function buildLinkedRsvpResultsHTML(currentParty) {
      const { linkedRsvpId, linkedRsvpName, options } = getAvailableRsvpLinkOptions(currentParty);

      return `
        <div class="admin-field">
          <label>Linked RSVP</label>
          <div class="admin-rsvp-linked-row">
            <div class="admin-rsvp-linked-label" data-role="linked-rsvp-name">${escapeHtml(linkedRsvpName)}</div>
            ${currentParty.linkedRsvp ? `
              <button class="admin-button admin-button--secondary admin-button--small" type="button" data-action="unlink-rsvp-party">Unlink</button>
            ` : ""}
          </div>
          ${currentParty.linkedRsvp ? `
            <div class="admin-rsvp-linked-audit">
              <div class="admin-rsvp-linked-item">
                <div>
                  <strong>${escapeHtml(currentParty.linkedRsvp.name)}</strong>
                  <div class="admin-rsvp-card-meta">${escapeHtml(formatAdminGuestCount(currentParty.linkedRsvp.guestCount))}</div>
                </div>
                <span class="admin-rsvp-audit-pill admin-rsvp-audit-pill--primary">Primary</span>
              </div>
              ${(currentParty.supersededRsvps || []).map((rsvp) => `
                <div class="admin-rsvp-linked-item admin-rsvp-linked-item--muted">
                  <div>
                    <strong>${escapeHtml(rsvp.name)}</strong>
                    <div class="admin-rsvp-card-meta">${escapeHtml(formatAdminGuestCount(rsvp.guestCount))}</div>
                  </div>
                  <span class="admin-rsvp-audit-pill admin-rsvp-audit-pill--secondary">Secondary</span>
                </div>
              `).join("")}
            </div>
          ` : ""}
          <input type="hidden" name="linked_rsvp_id" value="${escapeHtml(linkedRsvpId)}">
          <input class="admin-input admin-rsvp-search-input" type="text"
            data-rsvp-search-input="modal"
            placeholder="Search RSVPs by name"
            autocomplete="off">
          <div class="admin-rsvp-search-results admin-rsvp-search-results--modal">
            ${buildLinkedRsvpOptionListHTML(options, linkedRsvpId)}
          </div>
        </div>
      `;
    }

    function buildInvitedPartyFormHTML(party) {
      return `
        <form data-modal-form="rsvp-party" novalidate>
          <input type="hidden" name="party_id" value="${escapeHtml(party.id)}">
          <div class="admin-field">
            <label for="modal-rsvp-party-name">Party name</label>
            <input id="modal-rsvp-party-name" name="party_name" type="text" maxlength="140" required value="${escapeHtml(party.name)}">
          </div>
          <div class="admin-field">
            <label for="modal-rsvp-party-count">Invited count</label>
            <input id="modal-rsvp-party-count" name="invited_count" type="number" min="1" max="20" required value="${escapeHtml(party.invitedCount)}">
          </div>
          ${buildLinkedRsvpResultsHTML(party)}
          <div class="admin-actions admin-actions--end">
            <button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="admin-button admin-button--primary" type="submit">Save</button>
          </div>
        </form>
      `;
    }

    function openInvitedPartyModal(partyId) {
      const party = adminWeddingSnapshot?.invitedParties?.find((item) => item.id === partyId);
      if (!party) return;
      openAdminModal("Edit Party", buildInvitedPartyFormHTML(party));
    }

    function renderAdminRsvpGuestList() {
      const snapshot = adminWeddingSnapshot;
      const parties = [...(snapshot?.invitedParties || [])]
        .sort((a, b) => {
          const statusDiff = getAdminRsvpStatusMeta(a).rank - getAdminRsvpStatusMeta(b).rank;
          if (statusDiff !== 0) return statusDiff;
          return String(a.name || "").localeCompare(String(b.name || ""));
        });

      adminRsvpGuestListNote.textContent = parties.length
        ? `${parties.length} invited part${parties.length === 1 ? "y" : "ies"} total.`
        : "No invited parties found.";

      if (!parties.length) {
        adminRsvpGuestList.innerHTML = '<div class="admin-empty">No invited parties found.</div>';
        return;
      }

      adminRsvpGuestList.innerHTML = parties.map((party) => {
        const status = getAdminRsvpStatusMeta(party);
        return `
          <button class="admin-rsvp-guest-row" type="button" data-party-id="${escapeHtml(party.id)}">
            <div class="admin-rsvp-guest-main">
              <div class="admin-rsvp-guest-title">${escapeHtml(party.name)}</div>
              <div class="admin-rsvp-guest-meta">${escapeHtml(formatAdminGuestCount(party.invitedCount))}</div>
            </div>
            <span class="admin-rsvp-status ${escapeHtml(status.tone)}">${escapeHtml(status.label)}</span>
          </button>
        `;
      }).join("");
    }

    async function loadAdminRsvpScreen() {
      adminRsvpUnmatchedNote.textContent = "Loading RSVP matches…";
      adminRsvpGuestListNote.textContent = "Loading invited parties…";
      adminRsvpUnmatchedList.innerHTML = buildAdminRsvpReviewSkeletonHTML();
      adminRsvpGuestList.innerHTML = buildAdminRsvpGuestSkeletonHTML();

      const snapshot = await fetchWeddingRsvpSnapshot();
      if (!snapshot) {
        adminRsvpUnmatchedNote.textContent = "Couldn’t load RSVP matches.";
        adminRsvpGuestListNote.textContent = "Couldn’t load invited parties.";
        adminRsvpUnmatchedList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
        adminRsvpGuestList.innerHTML = `<div class="admin-empty">${friendlyLoadMessage()}</div>`;
        return;
      }

      adminWeddingSnapshot = await autoLinkHighConfidenceRsvps(snapshot, {
        logPrefix: "[admin-rsvp-auto-match]"
      });
      renderAdminRsvpUnmatchedList();
      renderAdminRsvpGuestList();
    }

    async function linkInvitedPartyToRsvp(partyId, rsvpId) {
      const client = getSupabaseClient();
      if (!client || adminRsvpWritePending) {
        return;
      }

      adminRsvpWritePending = true;
      const { data, error } = await client
        .from("invited_parties")
        .update({ rsvp_id: rsvpId })
        .eq("id", partyId)
        .is("rsvp_id", null)
        .select("id");
      adminRsvpWritePending = false;

      if (error || !Array.isArray(data) || !data.length) {
        showToast("That party changed since this screen loaded. Refresh and try again.");
        return;
      }

      setLowConfidenceMatchConfirmed(rsvpId, partyId, false);
      closeAdminModal();
      await loadAdminRsvpScreen();
      showToast("RSVP linked.");
    }

    async function saveAdminInvitedParty(formData, validatedInvitedCount = null) {
      const client = getSupabaseClient();
      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      const partyId = String(formData.get("party_id") || "").trim();
      const partyName = String(formData.get("party_name") || "").trim();
      const invitedCount = validatedInvitedCount ?? Math.max(0, parseInt(String(formData.get("invited_count") || "0"), 10) || 0);
      const linkedRsvpId = String(formData.get("linked_rsvp_id") || "").trim() || null;
      const currentParty = adminWeddingSnapshot?.invitedParties?.find((item) => item.id === partyId);
      const expectedLinkedRsvpId = currentParty?.rsvpId || null;
      if (!partyId || !partyName) return;

      adminRsvpWritePending = true;
      setModalSaving(true, "Save");

      const { data, error } = await applyExpectedPartyRsvpState(
        client
          .from("invited_parties")
          .update({
            name: partyName,
            invited_count: invitedCount,
            rsvp_id: linkedRsvpId
          })
          .eq("id", partyId),
        expectedLinkedRsvpId
      )
        .select("id");

      adminRsvpWritePending = false;
      setModalSaving(false, "Save");

      if (error || !Array.isArray(data) || !data.length) {
        showToast("That party changed since this screen loaded. Refresh and try again.");
        return;
      }

      closeAdminModal();
      await loadAdminRsvpScreen();
      showToast("Party updated.");
    }

    function handleAdminRsvpUnmatchedInput(event) {
      const input = event.target.closest("[data-rsvp-search-input='review']");
      if (!input) return;

      const rsvpId = input.getAttribute("data-rsvp-id");
      const results = adminRsvpUnmatchedList.querySelector(`[data-rsvp-search-results="${rsvpId}"]`);
      if (!results || !rsvpId) return;

      const matches = getManualSearchMatches(
        input.value,
        adminWeddingSnapshot?.invitedParties?.filter((party) => !party.rsvpId) || []
      );
      results.innerHTML = buildManualPartySearchResultsHTML(matches, rsvpId);
    }

    function handleAdminModalInput(event) {
      if (event.target.matches("[name='invited_count']")) {
        clearFieldError(event.target);
      }

      const bonusInput = event.target.closest("[data-scorecard-bonus-input]");
      if (bonusInput) {
        const sanitized = sanitizeBonusWagerInputValue(bonusInput.value);
        if (bonusInput.value !== sanitized) {
          bonusInput.value = sanitized;
        }
        const target = String(bonusInput.getAttribute("data-scorecard-bonus-input") || "");
        const [scorecardId, ...playerParts] = target.split(":");
        const playerName = playerParts.join(":");
        const localBonusState = getAdminLocalBonusState(scorecardId);
        const scorecard = getAdminScorecardById(scorecardId);
        const playerId = getScorecardPlayerId(scorecard?.players, playerName);
        if (localBonusState && playerId && !Number.isFinite(Number(localBonusState.wagers[playerId]))) {
          const maxValue = Number(bonusInput.getAttribute("data-scorecard-bonus-max")) || 0;
          const nextError = sanitized !== "" && Number(sanitized) > maxValue
            ? `Max wager: ${formatScorecardScore(maxValue)}`
            : "";
          setAdminLocalBonusState(scorecardId, {
            ...localBonusState,
            draftWagers: {
              ...localBonusState.draftWagers,
              [playerId]: sanitized
            },
            wagerErrors: {
              ...localBonusState.wagerErrors,
              [playerId]: nextError
            }
          });
          const peekButton = Array.from(document.querySelectorAll("#admin-modal-body [data-action='scorecard-bonus-peek']")).find((element) =>
            element.getAttribute("data-scorecard-bonus-peek-target") === target
          );
          if (peekButton) {
            peekButton.disabled = sanitized === "";
          }
          const errorEl = Array.from(document.querySelectorAll("#admin-modal-body [data-scorecard-bonus-error]")).find((element) =>
            element.getAttribute("data-scorecard-bonus-error") === target
          );
          if (errorEl) {
            errorEl.textContent = nextError;
            errorEl.hidden = nextError === "";
          }
        }
        return;
      }

      const bonusResultInput = event.target.closest("input[name^='result_']");
      if (bonusResultInput) {
        const form = bonusResultInput.closest("form[data-modal-form='scorecard-bonus-results']");
        const scorecardId = String(form?.getAttribute("data-scorecard-id") || "").trim();
        const localBonusState = getAdminLocalBonusState(scorecardId);
        if (!localBonusState) {
          return;
        }

        const playerId = String(bonusResultInput.name || "").replace(/^result_/, "");
        if (!playerId) {
          return;
        }

        setAdminLocalBonusState(scorecardId, {
          ...localBonusState,
          phase: "results",
          results: {
            ...localBonusState.results,
            [playerId]: bonusResultInput.value
          }
        });
        rerenderScorecardManageModal();
        return;
      }

      const primaryRsvpRadio = event.target.closest("input[name='primary_rsvp_id']");
      if (primaryRsvpRadio) {
        const form = primaryRsvpRadio.closest("form[data-modal-form='review-merge-duplicate']");
        const guestCountInput = form && form.querySelector("[name='guest_count']");
        const selectedGuestCount = primaryRsvpRadio.getAttribute("data-guest-count");
        if (guestCountInput && selectedGuestCount !== null) {
          guestCountInput.value = selectedGuestCount || "0";
        }
        return;
      }

      const reviewInput = event.target.closest("[data-rsvp-search-input='review']");
      if (reviewInput) {
        const rsvpId = reviewInput.getAttribute("data-rsvp-id");
        const modal = reviewInput.closest("#admin-modal-body");
        const results = modal && modal.querySelector(`[data-rsvp-search-results="${rsvpId}"]`);
        if (results && rsvpId) {
          const matches = getManualSearchMatches(
            reviewInput.value,
            adminWeddingSnapshot?.invitedParties?.filter((party) => !party.rsvpId) || []
          );
          results.innerHTML = buildManualPartySearchResultsHTML(matches, rsvpId);
        }
        return;
      }

      const input = event.target.closest("[data-rsvp-search-input='modal']");
      if (!input) return;

      const form = input.closest("form[data-modal-form='rsvp-party']");
      if (!form) return;

      const partyId = String(form.querySelector("[name='party_id']")?.value || "");
      const party = adminWeddingSnapshot?.invitedParties?.find((item) => item.id === partyId);
      if (!party) return;

      const selectedLinkedRsvpId = String(form.querySelector("[name='linked_rsvp_id']")?.value || "");
      const { options } = getAvailableRsvpLinkOptions(party);
      const filtered = options.filter((rsvp) =>
        normalizeMatchName(rsvp.name).includes(normalizeMatchName(input.value))
      );
      const results = form.querySelector(".admin-rsvp-search-results--modal");
      if (results) {
        results.innerHTML = buildLinkedRsvpOptionListHTML(filtered, selectedLinkedRsvpId);
      }
    }

    async function saveReviewGuestCount(formData) {
      const client = getSupabaseClient();
      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      const rsvpId = String(formData.get("rsvp_id") || "").trim();
      const guestCount = Math.max(0, parseInt(String(formData.get("guest_count") || "0"), 10) || 0);
      if (!rsvpId) return;

      adminRsvpWritePending = true;
      setModalSaving(true, "Save");
      const { error } = await client
        .from("rsvps")
        .update({ guest_count: guestCount })
        .eq("id", rsvpId)
        .eq("status", "active");
      adminRsvpWritePending = false;
      setModalSaving(false, "Save");

      if (error) {
        showToast(friendlySaveMessage());
        return;
      }

      closeAdminModal();
      await loadAdminRsvpScreen();
      showToast("Guest count updated.");
    }

    async function mergeDuplicateReview(formData) {
      const client = getSupabaseClient();
      if (!client) {
        showToast(friendlySaveMessage());
        return;
      }

      const partyId = String(formData.get("party_id") || "").trim();
      const conflictRsvpIds = String(formData.get("conflict_rsvp_ids") || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const primaryRsvpId = String(formData.get("primary_rsvp_id") || "").trim();
      const guestCount = Math.max(0, parseInt(String(formData.get("guest_count") || "0"), 10) || 0);
      if (!partyId || !primaryRsvpId || !conflictRsvpIds.length) return;
      const secondaryRsvpIds = conflictRsvpIds.filter((rsvpId) => rsvpId !== primaryRsvpId);

      adminRsvpWritePending = true;
      setModalSaving(true, "Confirm");
      const partyUpdate = await client.from("invited_parties").update({ rsvp_id: primaryRsvpId }).eq("id", partyId);
      const primaryUpdate = await client
        .from("rsvps")
        .update({ guest_count: guestCount, merged_into_party_id: null })
        .eq("id", primaryRsvpId);
      let secondaryError = null;
      if (secondaryRsvpIds.length) {
        const { error } = await client
          .from("rsvps")
          .update({ status: "superseded", merged_into_party_id: partyId })
          .in("id", secondaryRsvpIds);
        secondaryError = error;
      }
      adminRsvpWritePending = false;
      setModalSaving(false, "Confirm");

      if (partyUpdate.error || primaryUpdate.error || secondaryError) {
        showToast(friendlySaveMessage());
        return;
      }

      closeAdminModal();
      await loadAdminRsvpScreen();
      showToast("Duplicate confirmed.");
    }

    async function confirmLowConfidenceReview(rsvpId, partyId) {
      setLowConfidenceMatchConfirmed(rsvpId, partyId, true);
      closeAdminModal();
      await loadAdminRsvpScreen();
      showToast("Match confirmed.");
    }

    async function unlinkPartyAndReopenReview(partyId, rsvpId) {
      const client = getSupabaseClient();
      if (!client) return;

      adminRsvpWritePending = true;
      const { data, error } = await client
        .from("invited_parties")
        .update({ rsvp_id: null })
        .eq("id", partyId)
        .eq("rsvp_id", rsvpId)
        .select("id");
      adminRsvpWritePending = false;

      if (error || !Array.isArray(data) || !data.length) {
        showToast("That party changed since this screen loaded. Refresh and try again.");
        return;
      }

      setLowConfidenceMatchConfirmed(rsvpId, partyId, false);
      await loadAdminRsvpScreen();
      openReviewModal(rsvpId);
    }

    function handleAdminRsvpListClick(event) {
      const reviewRow = event.target.closest(".admin-rsvp-review-row[data-review-rsvp-id]");
      if (reviewRow) {
        openReviewModal(reviewRow.getAttribute("data-review-rsvp-id"));
        return;
      }
      const guestRow = event.target.closest(".admin-rsvp-guest-row[data-party-id]");
      if (guestRow) {
        openInvitedPartyModal(guestRow.getAttribute("data-party-id"));
      }
    }

    function handleAdminCountdownCalListClick(event) {
      const card = event.target.closest("[data-cal-name]");
      if (!card) return;
      openAddCountdownModal({
        name: card.getAttribute("data-cal-name"),
        date: card.getAttribute("data-cal-date")
      });
    }

    function setFormPhotoPreview(container, photo) {
      if (!container) return;
      const thumbUrl = unsplashThumbnailUrl(photo.url);
      container.innerHTML = `
        <img src="${escapeHtml(thumbUrl)}" alt="" aria-hidden="true">
        <div class="admin-form-photo-preview-meta">
          <span>${escapeHtml(photo.credit || "")}</span>
        </div>
      `;
      container.hidden = false;
      // If there's an existing saved photo preview in the same form, hide it so only one shows
      const form = container.closest("form");
      if (form) {
        const existing = form.querySelector(".admin-edit-photo-preview");
        if (existing) existing.hidden = true;
      }
    }

    function buildCountdownFormHTML(countdown, prefill) {
      // countdown: object for edit, null for add
      // prefill: { name, date } for pre-filling from calendar event (add only)
      const p = prefill || {};
      const isEdit = !!countdown;
      const id = isEdit ? escapeHtml(countdown.id) : "";
      const name = isEdit ? escapeHtml(countdown.name) : escapeHtml(p.name || "");
      const eventDate = isEdit ? escapeHtml(countdown.event_date || "") : escapeHtml(p.date || "");
      const daysBeforeValue = isEdit && countdown.days_before_visible != null ? String(countdown.days_before_visible) : "";
      const photoKeyword = isEdit ? escapeHtml(countdown.photo_keyword || "") : "";
      const icon = isEdit ? escapeHtml(countdown.icon || "") : "";

      let existingPhotoHTML = "";
      if (isEdit && countdown.unsplash_image_url) {
        let imageUrl = null;
        let imageCredit = null;
        try {
          const parsed = JSON.parse(countdown.unsplash_image_url);
          imageUrl = parsed.url || null;
          imageCredit = parsed.credit || null;
        } catch {
          imageUrl = countdown.unsplash_image_url;
        }
        if (imageUrl) {
          const thumbnailUrl = unsplashThumbnailUrl(imageUrl);
          existingPhotoHTML = `
            <div class="admin-edit-photo-preview">
              <button class="admin-countdown-preview-btn" type="button" data-action="view-photo"
                data-full-url="${escapeHtml(imageUrl)}" data-credit="${escapeHtml(imageCredit || "")}"
                aria-label="View full photo">
                <img class="admin-edit-photo-thumb" src="${escapeHtml(thumbnailUrl)}" alt="" aria-hidden="true"
                  onerror="this.closest('.admin-edit-photo-preview').remove();">
              </button>
              <div class="admin-edit-photo-meta">
                ${imageCredit ? `<span class="admin-edit-photo-credit">${escapeHtml(imageCredit)}</span>` : ""}
                <button class="admin-button admin-button--ghost-danger" type="button"
                  data-action="remove-photo-modal" data-countdown-id="${id}"
                  aria-label="Remove photo" style="margin-left:0">Remove photo</button>
              </div>
            </div>
          `;
        }
      }

      const formAttrs = isEdit
        ? `data-countdown-id="${id}" data-original-name="${name}"`
        : "";
      const submitLabel = isEdit ? "Save Changes" : "Save Countdown";

      return `
        <form data-modal-form="countdown" ${formAttrs} novalidate>
          <div class="admin-field">
            <label for="modal-cd-name">Name</label>
            <input id="modal-cd-name" name="name" type="text" maxlength="140" required
              value="${name}" placeholder="e.g. Portugal trip" autocomplete="off">
          </div>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="modal-cd-date">Date</label>
              <input id="modal-cd-date" name="event_date" type="date" required value="${eventDate}">
            </div>
            <div class="admin-field">
              <label for="modal-cd-days">Show starting</label>
              <input id="modal-cd-days" name="days_before_visible" type="number" min="1" max="365"
                value="${daysBeforeValue}" placeholder="e.g. 30">
              <p class="admin-field-hint">Days before event. Optional.</p>
            </div>
          </div>
          <div class="admin-form-row">
            <div class="admin-field">
              <label for="modal-cd-keyword">Photo keyword</label>
              <div class="admin-icon-row">
                <input id="modal-cd-keyword" name="photo_keyword" type="text" maxlength="100"
                  value="${photoKeyword}" placeholder="e.g. beach, mountains" autocomplete="off">
                <button class="admin-button admin-button--secondary" type="button"
                  data-action="get-photo-modal">Get photo</button>
              </div>
              <p class="admin-field-hint">Optional. Previews before you save.</p>
            </div>
            <div class="admin-field">
              <label for="modal-cd-icon">Icon &mdash; <a href="https://lucide.dev/icons" target="_blank" rel="noopener noreferrer" class="admin-icon-link">Browse ↗</a></label>
              <input id="modal-cd-icon" name="icon" type="text" maxlength="60"
                value="${icon}" placeholder="e.g. plane, heart, gem" autocomplete="off">
              <p class="admin-field-hint">Lucide icon name. Optional.</p>
            </div>
          </div>
          ${existingPhotoHTML}
          <div class="admin-modal-photo-pending" hidden></div>
          <div class="admin-actions">
            <button class="admin-button admin-button--secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="admin-button admin-button--primary" type="submit">${submitLabel}</button>
          </div>
        </form>
      `;
    }

    function openAddCountdownModal(prefill) {
      adminModalType = "add-countdown";
      adminModalContext = null;
      openAdminModal("Add Countdown", buildCountdownFormHTML(null, prefill));
    }

    function openEditCountdownModal(countdown) {
      adminModalType = "edit-countdown";
      adminModalContext = { id: countdown.id };
      openAdminModal("Edit Countdown", buildCountdownFormHTML(countdown));
    }

    function handleAdminSavedCountdownListClick(event) {
      const viewPhotoBtn = event.target.closest("[data-action='view-photo']");
      if (viewPhotoBtn) {
        openAdminLightbox(
          viewPhotoBtn.getAttribute("data-full-url"),
          viewPhotoBtn.getAttribute("data-credit")
        );
        return;
      }

      const editBtn = event.target.closest("[data-action='edit-countdown']");
      if (editBtn) {
        const id = editBtn.getAttribute("data-countdown-id");
        const countdown = adminSavedCountdowns.find((c) => c.id === id);
        if (countdown) openEditCountdownModal(countdown);
        return;
      }

      const refreshBtn = event.target.closest("[data-action='refresh-photo']");
      if (refreshBtn) {
        refreshCountdownPhoto(
          refreshBtn.getAttribute("data-countdown-id"),
          refreshBtn.getAttribute("data-countdown-name"),
          refreshBtn.getAttribute("data-photo-keyword")
        );
        return;
      }

      const deleteBtn = event.target.closest("[data-action='delete-countdown']");
      if (deleteBtn) {
        deleteAdminCountdown(deleteBtn.getAttribute("data-countdown-id"));
      }
    }

    async function fetchAdminTodos() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("todos")
        .select("id, title, assignee, due_date, archived_at, created_at")
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      const active = [];
      const archived = [];

      data.forEach((todo) => {
        if (todo.archived_at) {
          archived.push(todo);
        } else {
          active.push(todo);
        }
      });

      archived.sort((left, right) => {
        return new Date(right.archived_at).getTime() - new Date(left.archived_at).getTime();
      });

      return { active, archived };
    }

    // ── Settings ─────────────────────────────────────────────────────────────

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
      const activeScreens = Array.isArray(ds.active_screens) ? ds.active_screens : CONFIGURABLE_SCREENS;
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

      list.innerHTML = TIMER_SCREEN_KEYS.map((key) => {
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
      const activeScreens = Array.isArray(ds.active_screens) ? ds.active_screens : CONFIGURABLE_SCREENS;
      const screenOrder = normalizeAdminScreenOrder(Array.isArray(ds.screen_order) ? ds.screen_order : CONFIGURABLE_SCREENS);
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

      // Household
      if (assistantInput) assistantInput.value = adminHouseholdSettings.assistant_name || "";

      renderSettingsMembersList(members);

      // Active screen checkboxes
      CONFIGURABLE_SCREENS.forEach((name) => {
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
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

      try {
        const nameInput = document.getElementById("settings-assistant-name");
        const newName = nameInput ? nameInput.value.trim() : "";

        adminHouseholdSettings.assistant_name = newName;

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
        addButton.textContent = "Saving…";
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
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

      try {
        // Active screens
        const activeScreens = CONFIGURABLE_SCREENS.filter((name) => {
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
        TIMER_SCREEN_KEYS.forEach((key) => {
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
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

      try {
        const calIdInput = document.getElementById("settings-google-cal-id");
        const newCalId = calIdInput ? calIdInput.value.trim() : "";

        adminHouseholdSettings.google_cal_id = newCalId;

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
      const order = normalizeAdminScreenOrder(Array.isArray(ds.screen_order) ? [...ds.screen_order] : [...CONFIGURABLE_SCREENS]);

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
      ds.active_screens = CONFIGURABLE_SCREENS.filter((name) => {
        const cb = document.querySelector(`[name="screen_${name}"]`);
        return cb && cb.checked;
      });
      const order = normalizeAdminScreenOrder(Array.isArray(ds.screen_order) ? ds.screen_order : [...CONFIGURABLE_SCREENS]);
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

    // ─────────────────────────────────────────────────────────────────────────

    function initAdminMode() {
      document.body.classList.add("admin-mode");
      displayApp.hidden = true;
      adminApp.hidden = false;
      setAdminScreen("todos");
      adminNavButtons.forEach((button) => button.addEventListener("click", handleAdminNavClick));
      adminActiveList.addEventListener("click", handleAdminActiveListClick);
      adminActiveList.addEventListener("keydown", handleAdminActiveListKeydown);
      adminMealList.addEventListener("click", handleAdminMealListClick);
      if (adminRsvpUnmatchedList) {
        adminRsvpUnmatchedList.addEventListener("click", handleAdminRsvpListClick);
        adminRsvpUnmatchedList.addEventListener("input", handleAdminRsvpUnmatchedInput);
      }
      if (adminRsvpGuestList) adminRsvpGuestList.addEventListener("click", handleAdminRsvpListClick);
      if (adminScorecardList) adminScorecardList.addEventListener("click", handleAdminScorecardListClick);
      if (adminSettingsButton) adminSettingsButton.addEventListener("click", openAdminSettings);
      if (adminMealNoteWrap) adminMealNoteWrap.addEventListener("click", handleAdminMealNoteClick);
      adminWeekPrevBtn.addEventListener("click", handleAdminWeekPrev);
      adminWeekNextBtn.addEventListener("click", handleAdminWeekNext);
      if (adminWeekTodayBtn) adminWeekTodayBtn.addEventListener("click", handleAdminWeekToday);
      adminCalEventList.addEventListener("click", handleAdminCountdownCalListClick);
      adminSavedCountdownList.addEventListener("click", handleAdminSavedCountdownListClick);
      if (adminTodoAddButton) adminTodoAddButton.addEventListener("click", openAddTodoModal);
      const archiveMonthPrev = document.getElementById("admin-archive-month-prev");
      const archiveMonthNext = document.getElementById("admin-archive-month-next");
      if (archiveMonthPrev) archiveMonthPrev.addEventListener("click", handleArchiveMonthPrev);
      if (archiveMonthNext) archiveMonthNext.addEventListener("click", handleArchiveMonthNext);
      if (adminCountdownAddButton) adminCountdownAddButton.addEventListener("click", () => openAddCountdownModal());
      if (adminScorecardAddButton) adminScorecardAddButton.addEventListener("click", openScorecardCreateModal);
      const adminModal = document.getElementById("admin-modal");
      if (adminModal) {
        adminModal.addEventListener("click", handleAdminModalClick);
        adminModal.addEventListener("input", handleAdminModalInput);
        adminModal.addEventListener("submit", handleAdminModalSubmit);
      }
      document.addEventListener("keydown", handleEscapeKey);
      const lightbox = document.getElementById("admin-lightbox");
      if (lightbox) lightbox.addEventListener("click", closeAdminLightbox);
      const adminCalPrevBtn = document.getElementById("admin-cal-prev");
      const adminCalNextBtn = document.getElementById("admin-cal-next");
      if (adminCalPrevBtn) adminCalPrevBtn.addEventListener("click", handleAdminCalPrev);
      if (adminCalNextBtn) adminCalNextBtn.addEventListener("click", handleAdminCalNext);
      const adminVersionEl = document.getElementById("admin-version-label");
      if (adminVersionEl) adminVersionEl.textContent = `v${VERSION}`;
      setAdminConfigDependentUiDisabled(true);
      updateAdminLastSyncedLabel();
      window.setInterval(updateAdminLastSyncedLabel, 30000);
      loadAdminTodos();
      loadAdminMealPlan();
      initSettingsListeners();
      ensureAdminHouseholdConfigLoaded()
        .then(() => {
          loadAdminTodos();
          if (adminScreen === "settings") {
            loadAdminSettings();
          }
        })
        .catch(() => showToast(friendlyLoadMessage()));
      refreshIcons();
    }
