    function openEventDetailModal(event, dateStr) {
      const titleEl = document.getElementById("event-detail-title");
      const bodyEl = document.getElementById("event-detail-body");

      titleEl.textContent = event.title;

      const timeLabel = event.isAllDay ? "All day" : event.time;
      const dateLabel = formatLongDate(dateStr);

      let html = `
        <div class="event-detail-row">
          <i data-lucide="clock"></i>
          <span class="event-detail-text">${escapeHtml(dateLabel)} &middot; ${escapeHtml(timeLabel)}</span>
        </div>
      `;

      if (event.location) {
        html += `
          <div class="event-detail-row">
            <i data-lucide="map-pin"></i>
            <span class="event-detail-text">${escapeHtml(event.location)}</span>
          </div>
        `;
      }

      if (event.description) {
        html += `
          <div class="event-detail-row">
            <i data-lucide="align-left"></i>
            <span class="event-detail-text">${escapeHtml(event.description).replace(/\n/g, "<br>")}</span>
          </div>
        `;
      }

      bodyEl.innerHTML = html;
      document.getElementById("event-detail-modal").hidden = false;
      resetAutoRotate("event-detail-open");
      refreshIcons();
    }

    function closeEventDetailModal() {
      document.getElementById("event-detail-modal").hidden = true;
      resetAutoRotate("event-detail-close");
    }

    function openTodoDetailModal(todo) {
      const titleEl = document.getElementById("todo-detail-title");
      const bodyEl = document.getElementById("todo-detail-body");
      if (!titleEl || !bodyEl) {
        return;
      }

      titleEl.textContent = todo.title;
      bodyEl.innerHTML = `
        <div class="todo-detail-text">${escapeHtml(todo.description || "").replace(/\n/g, "<br>")}</div>
      `;
      document.getElementById("todo-detail-modal").hidden = false;
      resetAutoRotate("todo-detail-open");
      refreshIcons();
    }

    function closeTodoDetailModal() {
      document.getElementById("todo-detail-modal").hidden = true;
      resetAutoRotate("todo-detail-close");
    }

    function openDayDetailModal(dateKey) {
      const date = new Date(dateKey + "T00:00:00");
      document.getElementById("day-detail-title").textContent = formatHeaderDate(date);

      const allEvents = calendarEventsMap.get(dateKey) || [];
      const bodyEl = document.getElementById("day-detail-body");

      if (!allEvents.length) {
        bodyEl.innerHTML = `<p class="event-detail-text" style="color:var(--muted);">No events this day.</p>`;
      } else {
        bodyEl.innerHTML = allEvents.map((event) => `
          <div class="day-event-item" role="button" tabindex="0"
               data-event-title="${escapeHtml(event.title)}"
               data-event-time="${escapeHtml(event.time)}"
               data-event-location="${escapeHtml(event.location || "")}"
               data-event-description="${escapeHtml(event.description || "")}"
               data-event-isallday="${event.isAllDay ? "true" : "false"}"
               data-event-date="${escapeHtml(dateKey)}">
            <div class="day-event-item-time">${escapeHtml(event.time)}</div>
            <div class="day-event-item-title">${escapeHtml(event.title)}</div>
          </div>
        `).join("");
      }

      document.getElementById("day-detail-modal").hidden = false;
      resetAutoRotate("day-detail-open");
    }

    function closeDayDetailModal() {
      document.getElementById("day-detail-modal").hidden = true;
      resetAutoRotate("day-detail-close");
    }

    function openRsvpDetailModal(title, names) {
      const titleEl = document.getElementById("rsvp-detail-title");
      const bodyEl = document.getElementById("rsvp-detail-body");
      if (!titleEl || !bodyEl) return;

      titleEl.textContent = title;
      if (!Array.isArray(names) || !names.length) {
        bodyEl.innerHTML = `<p class="event-detail-text" style="color:var(--muted);">No parties to show.</p>`;
      } else {
        bodyEl.innerHTML = `
          <div class="rsvp-detail-list">
            ${names.map((name) => `<div class="rsvp-detail-item">${escapeHtml(name)}</div>`).join("")}
          </div>
        `;
      }
      document.getElementById("rsvp-detail-modal").hidden = false;
      resetAutoRotate("rsvp-detail-open");
    }

    function closeRsvpDetailModal() {
      document.getElementById("rsvp-detail-modal").hidden = true;
      resetAutoRotate("rsvp-detail-close");
    }

    function getDisplayReviewResponseLabel(rsvp) {
      if (!rsvp) {
        return "";
      }
      return rsvp.attending
        ? `Attending • ${formatGuestCountLabel(rsvp.guestCount)}`
        : "Declining";
    }

    function openRsvpReviewModal() {
      const reviewItems = cachedWeddingSnapshot?.reviewItems || [];
      const count = reviewItems.length;
      if (!count) return;
      const bodyEl = document.getElementById("rsvp-review-body");
      bodyEl.innerHTML = `
        <div class="rsvp-review-copy">
          <p><strong>${count}</strong> RSVP${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} a closer look.</p>
          <div class="rsvp-detail-list rsvp-review-list">
            ${reviewItems.map((item) => `
              <div class="rsvp-detail-item rsvp-review-item">
                <div class="rsvp-review-item-header">
                  <span>${escapeHtml(item.rsvp?.name || "Unnamed RSVP")}</span>
                  <span class="rsvp-review-badge">${escapeHtml(item.issueLabel || "Review")}</span>
                </div>
                <div class="rsvp-review-item-meta">${escapeHtml(getDisplayReviewResponseLabel(item.rsvp))}</div>
              </div>
            `).join("")}
          </div>
          <p class="rsvp-review-cta">Open the RSVP tab in the admin on your phone to sort these out.</p>
        </div>
      `;
      document.getElementById("rsvp-review-modal").hidden = false;
      resetAutoRotate("rsvp-review-open");
    }

    function closeRsvpReviewModal() {
      document.getElementById("rsvp-review-modal").hidden = true;
      resetAutoRotate("rsvp-review-close");
    }
