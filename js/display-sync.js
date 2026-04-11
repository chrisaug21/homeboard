    function updateLastSyncedLabel() {
      const el = document.getElementById("display-last-synced");
      if (!el) return;
      el.textContent = formatRelativeTimestamp(localStorage.getItem(LAST_SYNCED_KEY), "");
    }

    let isSyncing = false;

    async function runFullSync() {
      if (isSyncing) return;
      isSyncing = true;
      const syncBtn = document.getElementById("display-sync-btn");
      if (syncBtn) syncBtn.classList.add("is-syncing");

      try {
        // Re-fetch all data in parallel
        const [remoteTodos, remoteMeals, weeklyNote] = await Promise.all([
          fetchTodos(),
          fetchMeals(),
          fetchWeeklyNote()
        ]);

        if (remoteTodos !== null) renderTodoItems(remoteTodos);
        if (remoteMeals !== null) renderMeals(remoteMeals, weeklyNote || "");

        // Re-fetch calendar (wide fetch refreshes countdowns too)
        const [newConfig, newSupabaseCountdowns, newScorecards] = await Promise.all([
          fetchHouseholdConfig(),
          fetchCountdowns(),
          fetchDisplayScorecards()
        ]);

        if (newConfig) {
          cachedHouseholdConfig = newConfig;
          updateHouseholdName(newConfig);
          applyDisplaySettings(newConfig);
          if (cachedDisplayTodos !== null) {
            renderTodoItems(cachedDisplayTodos);
          }
        }

        if (newSupabaseCountdowns !== null) {
          cachedSupabaseCountdowns = newSupabaseCountdowns;
        }

        if (newScorecards !== null) {
          let scorecardSessions = await fetchDisplayScorecardSessions(newScorecards);
          if (scorecardSessions !== null) {
            scorecardSessions = await ensureDisplayScorecardSessions(newScorecards, scorecardSessions);
            cachedScorecards = newScorecards;
            cachedScorecardSessionsById = scorecardSessions;
            renderScorecards(newScorecards);
          }
        }

        await refreshCalendarData(true);

        // Re-fetch RSVP if visible
        if (!shouldHideRsvpScreen() && track.querySelector(".rsvp-screen")) {
          const snapshot = await fetchWeddingSnapshotWithAutoMatch();
          if (snapshot !== null) {
            renderRsvpBoard(snapshot);
          } else {
            cachedWeddingSnapshot = null;
          }
        }

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

        localStorage.setItem(LAST_SYNCED_KEY, new Date().toISOString());
        updateLastSyncedLabel();
      } finally {
        isSyncing = false;
        const btn = document.getElementById("display-sync-btn");
        if (btn) btn.classList.remove("is-syncing");
      }
    }
