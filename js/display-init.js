    function initDisplayMode() {
      displayApp.hidden = false;
      adminApp.hidden = true;
      const versionEl = document.getElementById("version-label");
      if (versionEl) versionEl.textContent = `v${VERSION}`;
      updateLastSyncedLabel();
      window.setInterval(updateLastSyncedLabel, 30000);
      const syncBtn = document.getElementById("display-sync-btn");
      if (syncBtn) syncBtn.addEventListener("click", runFullSync);
      renderCalendarAndCountdowns();
      renderTodos();
      renderMealsWithData();
      renderScorecardsWithData();
      renderRsvpBoardWithData();
      renderProgress();

      viewport.addEventListener("pointerdown", handlePointerDown, { passive: true });
      viewport.addEventListener("pointermove", handlePointerMove, { passive: true });
      viewport.addEventListener("pointerup", handlePointerUp, { passive: true });
      viewport.addEventListener("pointercancel", handlePointerUp, { passive: true });
      track.addEventListener("transitionend", (event) => {
        if (event.target === track && event.propertyName === "transform") {
          finishScreenTransition();
        }
      });

      navLeft.addEventListener("pointerup", () => manualNavigate("previous"));
      navRight.addEventListener("pointerup", () => manualNavigate("next"));
      displayNav.addEventListener("click", (event) => {
        const button = event.target.closest("[data-display-nav-target]");
        if (!button) return;
        const targetIndex = Number(button.getAttribute("data-display-nav-target"));
        if (Number.isNaN(targetIndex)) return;
        navigateToScreenIndex(targetIndex);
      });
      track.addEventListener("click", (event) => {
        const selectBtn = event.target.closest("[data-action='scorecard-select-player']");
        if (selectBtn) {
          scorecardSelectionById.set(selectBtn.getAttribute("data-scorecard-id"), selectBtn.getAttribute("data-player-name"));
          renderScorecards(cachedScorecards);
          resetAutoRotate("scorecard-select");
          return;
        }

        const adjustBtn = event.target.closest("[data-action='scorecard-display-adjust']");
        if (adjustBtn) {
          adjustDisplayScorecardScore(
            adjustBtn.getAttribute("data-scorecard-id"),
            adjustBtn.getAttribute("data-player-name"),
            Number(adjustBtn.getAttribute("data-increment"))
          );
          return;
        }

        const sharedAdjustBtn = event.target.closest("[data-action='scorecard-display-adjust-selected']");
        if (sharedAdjustBtn) {
          const scorecardId = sharedAdjustBtn.getAttribute("data-scorecard-id");
          const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
          const selectedPlayer = scorecard ? getScorecardSelection(scorecard) : "";
          if (!selectedPlayer) {
            return;
          }
          adjustDisplayScorecardScore(scorecardId, selectedPlayer, Number(sharedAdjustBtn.getAttribute("data-increment")));
          return;
        }

        const endGameBtn = event.target.closest("[data-action='scorecard-display-end-game']");
        if (endGameBtn) {
          endDisplayScorecardGame(endGameBtn.getAttribute("data-scorecard-id"));
          return;
        }

        const undoBtn = event.target.closest("[data-action='scorecard-display-undo']");
        if (undoBtn) {
          undoDisplayScorecardAction(undoBtn.getAttribute("data-scorecard-id"));
          return;
        }

        const bonusRoundBtn = event.target.closest("[data-action='scorecard-display-bonus-round']");
        if (bonusRoundBtn) {
          beginDisplayBonusRound(bonusRoundBtn.getAttribute("data-scorecard-id"));
          return;
        }

      const bonusLockBtn = event.target.closest("[data-action='scorecard-bonus-lock']");
      if (bonusLockBtn) {
        const scorecardId = bonusLockBtn.getAttribute("data-scorecard-id");
        const playerName = bonusLockBtn.getAttribute("data-player-name");
          const input = Array.from(track.querySelectorAll("[data-scorecard-bonus-input]")).find((element) =>
            element.getAttribute("data-scorecard-bonus-input") === `${scorecardId}:${playerName}`
          );
        lockDisplayScorecardBonusWager(scorecardId, playerName, input?.value);
        return;
      }

      const bonusPeekBtn = event.target.closest("[data-action='scorecard-bonus-peek']");
      if (bonusPeekBtn) {
        const target = String(bonusPeekBtn.getAttribute("data-scorecard-bonus-peek-target") || "");
        const [scorecardId, ...playerParts] = target.split(":");
        const playerName = playerParts.join(":");
        if (scorecardId && playerName) {
          triggerDisplayBonusPeek(scorecardId, playerName);
        }
        return;
      }

      const cancelBonusBtn = event.target.closest("[data-action='scorecard-bonus-cancel']");
      if (cancelBonusBtn) {
        cancelDisplayScorecardBonusRound(cancelBonusBtn.getAttribute("data-scorecard-id"));
        return;
      }

      const backRevealBtn = event.target.closest("[data-action='scorecard-bonus-back']");
      if (backRevealBtn) {
        backOutOfDisplayBonusReveal(backRevealBtn.getAttribute("data-scorecard-id"));
        return;
      }

        const revealBtn = event.target.closest("[data-action='scorecard-bonus-reveal']");
        if (revealBtn) {
          revealDisplayScorecardBonusWagers(revealBtn.getAttribute("data-scorecard-id"));
          return;
        }
      });
      track.addEventListener("input", (event) => {
        const bonusInput = event.target.closest("[data-scorecard-bonus-input]");
        if (bonusInput) {
          resetAutoRotate("scorecard-bonus-input");
          const sanitized = sanitizeDisplayBonusWagerInputValue(bonusInput.value);
          if (bonusInput.value !== sanitized) {
            bonusInput.value = sanitized;
          }
          const target = String(bonusInput.getAttribute("data-scorecard-bonus-input") || "");
          const [scorecardId, ...playerParts] = target.split(":");
          const playerName = playerParts.join(":");
          const localBonusState = getDisplayLocalBonusState(scorecardId);
          const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
          const playerId = getScorecardPlayerId(scorecard?.players, playerName);
          if (localBonusState && playerId && !Number.isFinite(Number(localBonusState.wagers[playerId]))) {
            const maxValue = Number(bonusInput.getAttribute("data-scorecard-bonus-max")) || 0;
            const nextError = sanitized !== "" && Number(sanitized) > maxValue
              ? `Max wager: ${formatScorecardScore(maxValue)}`
              : "";
            setDisplayLocalBonusState(scorecardId, {
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
            const peekButton = Array.from(track.querySelectorAll("[data-action='scorecard-bonus-peek']")).find((element) =>
              element.getAttribute("data-scorecard-bonus-peek-target") === target
            );
            if (peekButton) {
              peekButton.disabled = sanitized === "";
            }
            const errorEl = Array.from(track.querySelectorAll("[data-scorecard-bonus-error]")).find((element) =>
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
        if (!bonusResultInput) {
          return;
        }

        resetAutoRotate("scorecard-bonus-result");

        const form = bonusResultInput.closest("form[data-scorecard-bonus-results]");
        if (!form?.hasAttribute("data-scorecard-bonus-editable")) {
          return;
        }
        const scorecardId = String(form?.getAttribute("data-scorecard-bonus-results") || "").trim();
        const localBonusState = getDisplayLocalBonusState(scorecardId);
        if (!localBonusState) {
          return;
        }

        const playerId = String(bonusResultInput.name || "").replace(/^result_/, "");
        if (!playerId) {
          return;
        }

        setDisplayLocalBonusState(scorecardId, {
          ...localBonusState,
          phase: "results",
          results: {
            ...localBonusState.results,
            [playerId]: bonusResultInput.value
          }
        });
        renderScorecards(cachedScorecards);
      });
      track.addEventListener("focusin", (event) => {
        if (
          event.target.closest("[data-scorecard-bonus-input]")
          || event.target.closest("input[name^='result_']")
        ) {
          resetAutoRotate("scorecard-bonus-focus");
        }
      });
      track.addEventListener("submit", (event) => {
        const form = event.target.closest("form[data-scorecard-bonus-results]");
        if (!form) {
          return;
        }

        event.preventDefault();
        const scorecardId = String(form.getAttribute("data-scorecard-bonus-results") || "").trim();
        const scorecard = cachedScorecards.find((item) => item.id === scorecardId);
        const localBonusState = getDisplayLocalBonusState(scorecardId);
        if (!scorecard || !localBonusState || !localBonusState.revealed) {
          return;
        }

        const formData = new FormData(form);
        const wagerResults = {};
        scorecard.players.forEach((player) => {
          wagerResults[player.id] = String(formData.get(`result_${player.id}`) || localBonusState.results[player.id] || "incorrect");
        });
        applyDisplayScorecardBonusResults(scorecardId, wagerResults);
      });
      window.addEventListener("keydown", handleKeydown);

      // Every 5 min: narrow refresh; automatically escalate to wide if 24h have passed
      window.setInterval(() => {
        const needsWide = (Date.now() - lastWideFetch) >= 24 * 60 * 60 * 1000;
        refreshCalendarData(needsWide);
        renderScorecardsWithData();
        if (!shouldHideRsvpScreen() && track.querySelector(".rsvp-screen")) {
          renderRsvpBoardWithData();
        }
      }, 5 * 60 * 1000);

      // Week navigation — each click resets the rotation timer
      document.getElementById("week-prev").addEventListener("click", () => { weekOffset--; renderCalendar(); resetAutoRotate(); });
      document.getElementById("week-next").addEventListener("click", () => { weekOffset++; renderCalendar(); resetAutoRotate(); });
      document.getElementById("week-today").addEventListener("click", () => { weekOffset = 0; renderCalendar(); resetAutoRotate(); });

      // Month navigation — each click resets the rotation timer
      document.getElementById("month-prev").addEventListener("click", () => { monthOffset--; renderMonthCalendar(); resetAutoRotate(); });
      document.getElementById("month-next").addEventListener("click", () => { monthOffset++; renderMonthCalendar(); resetAutoRotate(); });
      document.getElementById("month-today").addEventListener("click", () => { monthOffset = 0; renderMonthCalendar(); resetAutoRotate(); });

      // Week view: tap/keyboard event card → event detail modal
      function activateCalendarGridItem(e) {
        const card = e.target.closest(".event-card[data-event-title]");
        if (card) {
          openEventDetailModal({
            title: card.dataset.eventTitle,
            time: card.dataset.eventTime,
            location: card.dataset.eventLocation || null,
            description: card.dataset.eventDescription || null,
            isAllDay: card.dataset.eventIsallday === "true"
          }, card.dataset.eventDate);
        }
      }
      document.getElementById("calendar-grid").addEventListener("click", activateCalendarGridItem);
      document.getElementById("calendar-grid").addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (e.key === " ") e.preventDefault();
        activateCalendarGridItem(e);
      });

      // Month view: tap/keyboard event chip → event detail; tap "+N more" → day detail
      function activateMonthGridItem(e) {
        const eventEl = e.target.closest(".month-event[data-event-title]");
        const morePill = e.target.closest(".month-more-pill");
        if (eventEl) {
          openEventDetailModal({
            title: eventEl.dataset.eventTitle,
            time: eventEl.dataset.eventTime,
            location: eventEl.dataset.eventLocation || null,
            description: eventEl.dataset.eventDescription || null,
            isAllDay: eventEl.dataset.eventIsallday === "true"
          }, eventEl.dataset.eventDate);
          return;
        }
        if (morePill) {
          openDayDetailModal(morePill.dataset.dateKey);
        }
      }
      document.getElementById("month-grid").addEventListener("click", activateMonthGridItem);
      document.getElementById("month-grid").addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (e.key === " ") e.preventDefault();
        activateMonthGridItem(e);
      });

      // Day detail: tap/keyboard event row → event detail modal (on top)
      function activateDayDetailItem(e) {
        const item = e.target.closest(".day-event-item");
        if (item) {
          openEventDetailModal({
            title: item.dataset.eventTitle,
            time: item.dataset.eventTime,
            location: item.dataset.eventLocation || null,
            description: item.dataset.eventDescription || null,
            isAllDay: item.dataset.eventIsallday === "true"
          }, item.dataset.eventDate);
        }
      }
      document.getElementById("day-detail-body").addEventListener("click", activateDayDetailItem);
      document.getElementById("day-detail-body").addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (e.key === " ") e.preventDefault();
        activateDayDetailItem(e);
      });

      // Modal close handlers
      document.getElementById("event-detail-close").addEventListener("click", closeEventDetailModal);
      document.getElementById("event-detail-backdrop").addEventListener("click", closeEventDetailModal);
      document.getElementById("todo-detail-close").addEventListener("click", closeTodoDetailModal);
      document.getElementById("todo-detail-backdrop").addEventListener("click", closeTodoDetailModal);
      document.getElementById("day-detail-close").addEventListener("click", closeDayDetailModal);
      document.getElementById("day-detail-backdrop").addEventListener("click", closeDayDetailModal);
      document.getElementById("rsvp-detail-close").addEventListener("click", closeRsvpDetailModal);
      document.getElementById("rsvp-detail-backdrop").addEventListener("click", closeRsvpDetailModal);
      document.getElementById("rsvp-review-close").addEventListener("click", closeRsvpReviewModal);
      document.getElementById("rsvp-review-backdrop").addEventListener("click", closeRsvpReviewModal);
      document.getElementById("scorecard-celebration-overlay").addEventListener("click", (event) => {
        const overlay = document.getElementById("scorecard-celebration-overlay");
        const scorecardId = overlay?.dataset.scorecardId || "";
        if (!scorecardId) {
          return;
        }

        const archiveBtn = event.target.closest("[data-action='scorecard-celebration-archive']");
        const newGameBtn = event.target.closest("#scorecard-celebration-new-game");
        if (displayScorecardArchiveConfirmId === scorecardId && !archiveBtn) {
          clearDisplayScorecardArchiveConfirm();
          syncScorecardCelebrationOverlay();
          return;
        }

        if (newGameBtn) {
          startNextDisplayScorecardGame(scorecardId);
          return;
        }

        if (!archiveBtn) {
          return;
        }

        if (displayScorecardArchiveConfirmId === scorecardId) {
          archiveDisplayScorecard(scorecardId);
          return;
        }

        displayScorecardArchiveConfirmId = scorecardId;
        syncScorecardCelebrationOverlay();
      });

      const declinedTrigger = document.getElementById("rsvp-declined-trigger");
      const pendingTrigger = document.getElementById("rsvp-pending-trigger");
      const reviewTrigger = document.getElementById("rsvp-review-trigger");
      if (declinedTrigger) {
        declinedTrigger.addEventListener("click", () => {
          const declinedNames = (cachedWeddingSnapshot?.invitedParties || [])
            .filter((party) => party.linkedRsvp && party.linkedRsvp.attending === false)
            .map((party) => party.name);
          openRsvpDetailModal("Declined Parties", declinedNames);
        });
      }
      if (pendingTrigger) {
        pendingTrigger.addEventListener("click", () => {
          const pendingNames = (cachedWeddingSnapshot?.invitedParties || [])
            .filter((party) => !party.rsvpId)
            .map((party) => party.name);
          openRsvpDetailModal("Pending Parties", pendingNames);
        });
      }
      if (reviewTrigger) {
        reviewTrigger.addEventListener("click", openRsvpReviewModal);
      }

      refreshIcons();
    }
