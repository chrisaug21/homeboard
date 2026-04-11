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
    const adminCropperOverlay = document.getElementById("admin-cropper");
    const adminCropperImage = document.getElementById("admin-cropper-image");
    const adminCropperConfirmButton = document.getElementById("admin-cropper-confirm");

    // Person color palette — distinct from status colors (amber, sage, rose)
    const PERSON_COLOR_PALETTE = [
      "#2563eb", "#9333ea", "#0891b2", "#be123c",
      "#c2410c", "#0f766e", "#6d28d9", "#16a34a"
    ];
    const SCORECARD_PLAYER_COLOR_PALETTE = [
      "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"
    ];

    // Screen definitions for settings UI
    const SCREEN_LABELS = {
      upcoming_calendar: "Upcoming Calendar",
      monthly_calendar: "Monthly Calendar",
      todos: "To-Do List",
      meals: "Meal Plan",
      countdowns: "Countdowns",
      scorecards: "Scorecards",
      rsvp: "Wedding RSVP"
    };
    const TIMER_LABELS = {
      upcoming_calendar: "Upcoming Calendar",
      monthly_calendar: "Monthly Calendar",
      todos: "To-Do List",
      meals: "Meal Plan",
      countdowns: "Countdowns",
      scorecards: "Scorecards",
      rsvp: "Wedding RSVP"
    };
    const TIMER_DEFAULTS = { upcoming_calendar: 30, monthly_calendar: 60, todos: 45, meals: 30, countdowns: 15, scorecards: 30, rsvp: 30 };

    function getAdminConfigurableScreens() {
      return getConfigurableDisplayScreenKeys();
    }

    function getAdminTimerScreenKeys() {
      return getConfigurableDisplayScreenKeys();
    }

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
    const COUNTDOWN_CUSTOM_PHOTO_BUCKET = "countdown-photos";
    const COUNTDOWN_CUSTOM_PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
    const COUNTDOWN_PHOTO_ASPECT_RATIO = 3 / 4;
    const COUNTDOWN_UPLOAD_MAX_SIDE = 1200;
    const COUNTDOWN_UPLOAD_QUALITY = 0.85;
    let adminCountdownCropper = null;
    let adminCountdownCropState = null;
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
      const configurableScreens = getAdminConfigurableScreens();
      const timerScreenKeys = getAdminTimerScreenKeys();
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
        orderList.innerHTML = Array.from({ length: configurableScreens.length }, () => `
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
        timerList.innerHTML = Array.from({ length: timerScreenKeys.length }, () => `
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
      closeCountdownPhotoCropper({ preserveFileInput: false });
      const modal = document.getElementById("admin-modal");
      if (!modal || modal.hidden) return;
      adminScorecardArchiveConfirmId = "";
      modal.hidden = true;
      const modalBody = document.getElementById("admin-modal-body");
      if (modalBody) modalBody.innerHTML = "";
      document.body.style.overflow = "";
      // Clean up any pending photos
      if (adminModalType === "edit-countdown" && adminModalContext && adminModalContext.id) {
        clearPendingCountdownPhoto(adminModalContext.id);
      } else if (adminModalType === "add-countdown") {
        clearPendingCountdownPhoto("modal-create");
      }
      adminModalType = null;
      adminModalContext = null;
    }

    function handleEscapeKey(event) {
      if (event.key !== "Escape") return;
      if (adminCropperOverlay && !adminCropperOverlay.hidden) {
        closeCountdownPhotoCropper({ preserveFileInput: false });
        return;
      }
      closeAdminModal();
    }

    function handleAdminModalClick(event) {
      if (event.target.closest("[data-action='close-photo-cropper']")) {
        closeCountdownPhotoCropper({ preserveFileInput: false });
        return;
      }
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
        const removeType = removePhotoBtn.getAttribute("data-remove-type") || "unsplash";
        const hiddenName = removeType === "custom" ? "remove_custom_photo" : "remove_unsplash_photo";
        if (form && !form.querySelector(`[name='${hiddenName}']`)) {
          const hidden = document.createElement("input");
          hidden.type = "hidden";
          hidden.name = hiddenName;
          hidden.value = "1";
          form.appendChild(hidden);
        }
        syncCountdownPhotoUi(form);
        return;
      }
      const clearPendingPhotoBtn = event.target.closest("[data-action='clear-pending-photo-modal']");
      if (clearPendingPhotoBtn) {
        const form = clearPendingPhotoBtn.closest("form[data-modal-form='countdown']");
        clearCountdownPendingPhotoFromForm(form, clearPendingPhotoBtn.getAttribute("data-clear-kind") || "");
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
          const removeUnsplashPhoto = formData.get("remove_unsplash_photo") === "1";
          const removeCustomPhoto = formData.get("remove_custom_photo") === "1";
          const hadUnsplashPhoto = form.getAttribute("data-had-unsplash-photo") === "1";
          if (!name || !eventDate || adminCountdownEditPending) return;
          updateAdminCountdown(id, name, eventDate, icon, daysBeforeVisible, photoKeyword, originalName, {
            removeUnsplashPhoto,
            removeCustomPhoto,
            hadUnsplashPhoto
          });
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

    function handleAdminModalInput(event) {
      const countdownFileInput = event.target.closest("input[name='custom_photo_file']");
      if (countdownFileInput) {
        handleCountdownCustomPhotoSelection(countdownFileInput);
        return;
      }

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
      if (adminCropperOverlay) {
        adminCropperOverlay.addEventListener("click", (event) => {
          if (event.target.closest("[data-action='close-photo-cropper']")) {
            closeCountdownPhotoCropper({ preserveFileInput: false });
          }
        });
      }
      if (adminCropperConfirmButton) {
        adminCropperConfirmButton.addEventListener("click", confirmCountdownPhotoCrop);
      }
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
