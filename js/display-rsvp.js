    async function fetchWeddingSnapshotWithAutoMatch() {
      const snapshot = await fetchWeddingRsvpSnapshot();
      if (!snapshot) {
        return null;
      }
      const nextSnapshot = await autoLinkHighConfidenceRsvps(snapshot, {
        logPrefix: "[display-rsvp-auto-match]"
      });
      cachedWeddingSnapshot = nextSnapshot;
      return nextSnapshot;
    }

    function stopRsvpAutoScroll() {
      if (rsvpScrollAnimation) {
        rsvpScrollAnimation.cancel();
        rsvpScrollAnimation = null;
      }

      const list = document.getElementById("rsvp-names");
      if (list) {
        list.style.transform = "";
      }
    }

    // Driven by the Web Animations API (transform, not scrollTop) so the motion runs on
    // the compositor thread instead of a JS rAF loop. Android WebView/kiosk browsers throttle
    // background JS timers and rAF callbacks (see the sync-interval note in display-init.js),
    // which silently stalled the old scrollTop-based loop on the wall tablet even though it
    // worked fine in a desktop browser tab.
    function startRsvpAutoScroll() {
      stopRsvpAutoScroll();

      const container = document.querySelector(".names-list");
      const list = document.getElementById("rsvp-names");

      if (!container || !list || typeof list.animate !== "function") {
        return;
      }

      const maxScroll = Math.max(list.scrollHeight - container.clientHeight, 0);

      if (!maxScroll) {
        return;
      }

      const speed = 18; // px/sec, matches prior loop's pace
      const pauseMs = 3600; // pause at each end; extra dwell so top/bottom cards stay readable
      const travelMs = (maxScroll / speed) * 1000;
      const totalMs = pauseMs * 2 + travelMs * 2;

      rsvpScrollAnimation = list.animate(
        [
          { transform: "translateY(0px)", offset: 0 },
          { transform: "translateY(0px)", offset: pauseMs / totalMs },
          { transform: `translateY(-${maxScroll}px)`, offset: (pauseMs + travelMs) / totalMs },
          { transform: `translateY(-${maxScroll}px)`, offset: (pauseMs * 2 + travelMs) / totalMs },
          { transform: "translateY(0px)", offset: 1 }
        ],
        {
          duration: totalMs,
          iterations: Infinity,
          easing: "linear"
        }
      );
    }

    function formatGuestCountLabel(count) {
      const safeCount = Math.max(0, Number(count) || 0);
      return `${safeCount} ${safeCount === 1 ? "guest" : "guests"}`;
    }

    function shouldHideRsvpScreen() {
      return !isRsvpDisplayScreenAvailable();
    }

    function removeRsvpScreen() {
      const rsvpScreen = document.querySelector(".rsvp-screen");

      stopRsvpAutoScroll();

      if (rsvpScreen) {
        rsvpScreen.remove();
        reconcileRotationState();
      }
    }

    function renderRsvpBoard(snapshot) {
      const list = document.getElementById("rsvp-names");
      const totalEl = document.getElementById("rsvp-total");
      const stats = snapshot.stats || {};
      const reviewCount = stats.reviewCount || 0;
      const attendingGuestCount = stats.attendingGuests || 0;
      const attendingRows = (snapshot.invitedParties || [])
        .filter((party) => party.linkedRsvp && party.linkedRsvp.attending === true)
        .map((party) => ({
          name: party.linkedRsvp.name,
          guestCount: Math.min(party.linkedRsvp.guestCount, party.invitedCount),
          isUnderCount: party.linkedRsvp.guestCount < party.invitedCount,
          createdAt: party.linkedRsvp.createdAt || null
        }))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      totalEl.textContent = String(attendingGuestCount);
      totalEl.classList.toggle("hero-number--empty", attendingGuestCount === 0);
      totalEl.classList.toggle("hero-number--active", attendingGuestCount > 0);
      document.getElementById("rsvp-total-label").textContent = "guests attending so far";
      document.getElementById("rsvp-parties-responded").textContent = `${stats.respondedParties || 0} / ${stats.totalParties || 0} parties responded`;
      document.getElementById("rsvp-declined-count").textContent = String(stats.declinedGuests || 0);
      document.getElementById("rsvp-pending-count").textContent = String(stats.pendingGuests || 0);
      document.getElementById("rsvp-review-count").textContent = String(reviewCount);
      document.getElementById("rsvp-names-title").textContent = "Guest List";
      const reviewCountEl = document.getElementById("rsvp-review-count");
      const reviewTrigger = document.getElementById("rsvp-review-trigger");
      if (reviewCountEl) {
        reviewCountEl.classList.toggle("rsvp-stat-value--clear", reviewCount === 0);
        reviewCountEl.classList.toggle("rsvp-stat-value--flagged", reviewCount > 0);
      }
      if (reviewTrigger) {
        reviewTrigger.disabled = reviewCount === 0;
        reviewTrigger.classList.toggle("breakdown-row--disabled", reviewCount === 0);
      }

      if (!attendingRows.length) {
        stopRsvpAutoScroll();
        list.classList.add("names-scroll--empty");
        list.innerHTML = `
          <div class="rsvp-empty-state">
            <div class="rsvp-empty-icon"><i data-lucide="heart"></i></div>
            <div class="rsvp-empty-headline">No RSVPs yet</div>
            <div class="rsvp-empty-copy">Confirmed guests will appear here as responses come in</div>
          </div>
        `;
        refreshIcons();
        return;
      }

      list.classList.remove("names-scroll--empty");
      list.innerHTML = attendingRows.map((row) => `
        <div class="name-pill name-pill--attending${row.isUnderCount ? " name-pill--undercount" : ""}">
          <span>${escapeHtml(row.name)}</span>
          <span class="name-status">${escapeHtml(formatGuestCountLabel(row.guestCount))}</span>
        </div>
      `).join("");

      startRsvpAutoScroll();
    }

    async function renderRsvpBoardWithData() {
      markPending("rsvp");

      if (shouldHideRsvpScreen()) {
        removeRsvpScreen();
        resolveScreen("rsvp");
        return;
      }

      cachedWeddingSnapshot = null;
      renderRsvpSkeleton();

      const snapshot = await fetchWeddingSnapshotWithAutoMatch();

      if (snapshot === null) {
        cachedWeddingSnapshot = null;
        renderRsvpError();
      } else {
        renderRsvpBoard(snapshot);
      }

      resolveScreen("rsvp");
    }
