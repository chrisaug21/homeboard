    async function fetchDisplayWeddingSnapshot() {
      const initialSnapshot = await fetchWeddingRsvpSnapshot();
      if ((initialSnapshot?.stats?.totalParties || 0) > 0) {
        return initialSnapshot;
      }

      const client = getSupabaseClient();
      if (!client) {
        return initialSnapshot;
      }

      // RSVP data is global and intentionally not scoped by household.
      const [
        { data: activeRsvpRows, error: activeRsvpError },
        { data: supersededRsvpRows, error: supersededRsvpError },
        { data: partyRows, error: partyError }
      ] = await Promise.all([
        client
          .from("rsvps")
          .select("id, name, attending, guest_count, created_at, status, merged_into_party_id")
          .eq("status", "active")
          .order("created_at", { ascending: false }),
        client
          .from("rsvps")
          .select("id, name, attending, guest_count, created_at, status, merged_into_party_id")
          .eq("status", "superseded")
          .order("created_at", { ascending: false }),
        client
          .from("invited_parties")
          .select("id, name, invited_count, rsvp_id, created_at")
          .order("name", { ascending: true })
      ]);

      if (
        activeRsvpError || supersededRsvpError || partyError
        || !Array.isArray(activeRsvpRows) || !Array.isArray(supersededRsvpRows) || !Array.isArray(partyRows)
      ) {
        return initialSnapshot;
      }

      return buildWeddingRsvpSnapshot(
        [...activeRsvpRows, ...supersededRsvpRows].map(mapWeddingRsvp),
        partyRows.map(mapInvitedParty)
      );
    }

    async function fetchWeddingSnapshotWithAutoMatch() {
      const snapshot = await fetchDisplayWeddingSnapshot();
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
      if (rsvpScrollId !== null) {
        window.cancelAnimationFrame(rsvpScrollId);
        rsvpScrollId = null;
      }
    }

    function startRsvpAutoScroll() {
      stopRsvpAutoScroll();

      const container = document.querySelector(".names-list");
      const list = document.getElementById("rsvp-names");

      if (!container || !list) {
        return;
      }

      const maxScroll = Math.max(list.scrollHeight - container.clientHeight, 0);
      container.scrollTop = 0;

      if (!maxScroll) {
        return;
      }

      let direction = 1;
      let lastTimestamp = 0;
      let pauseUntil = 0;
      const speed = 18;

      const step = (timestamp) => {
        if (!lastTimestamp) {
          lastTimestamp = timestamp;
          pauseUntil = timestamp + 1600;
        }

        const delta = timestamp - lastTimestamp;
        lastTimestamp = timestamp;

        if (timestamp >= pauseUntil) {
          const nextScrollTop = container.scrollTop + direction * speed * (delta / 1000);

          if (nextScrollTop >= maxScroll) {
            container.scrollTop = maxScroll;
            direction = -1;
            pauseUntil = timestamp + 1600;
          } else if (nextScrollTop <= 0) {
            container.scrollTop = 0;
            direction = 1;
            pauseUntil = timestamp + 1600;
          } else {
            container.scrollTop = nextScrollTop;
          }
        }

        rsvpScrollId = window.requestAnimationFrame(step);
      };

      rsvpScrollId = window.requestAnimationFrame(step);
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
