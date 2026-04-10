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

    function applyExpectedPartyRsvpState(query, expectedRsvpId) {
      return expectedRsvpId
        ? query.eq("rsvp_id", expectedRsvpId)
        : query.is("rsvp_id", null);
    }

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
      adminRsvpUnmatchedNote.textContent = "Loading RSVP matches\u2026";
      adminRsvpGuestListNote.textContent = "Loading invited parties\u2026";
      adminRsvpUnmatchedList.innerHTML = buildAdminRsvpReviewSkeletonHTML();
      adminRsvpGuestList.innerHTML = buildAdminRsvpGuestSkeletonHTML();

      const snapshot = await fetchWeddingRsvpSnapshot();
      if (!snapshot) {
        adminRsvpUnmatchedNote.textContent = "Couldn't load RSVP matches.";
        adminRsvpGuestListNote.textContent = "Couldn't load invited parties.";
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
