    function goToScreen(index) {
      if (isScreenTransitioning) {
        return false;
      }

      const entries = syncActiveScreenState();
      const screenCount = entries.length;
      if (!screenCount) {
        return false;
      }
      const isForwardWrap = index >= screenCount;
      const isBackwardWrap = index < 0;

      if (isForwardWrap) {
        // Teleport track to appear one screen to the right of the first screen,
        // then animate forward (left) into it — so wrap feels like a continuation.
        track.style.transition = "none";
        track.style.transform = "translateX(100%)";
        void track.getBoundingClientRect();
        track.style.transition = "";
      } else if (isBackwardWrap) {
        // Teleport track to appear one screen to the left of the last screen,
        // then animate backward (right) into it.
        track.style.transition = "none";
        track.style.transform = "translateX(-" + (screenCount * 100) + "%)";
        void track.getBoundingClientRect();
        track.style.transition = "";
      }

      currentIndex = (index + screenCount) % screenCount;
      activeScreenKey = entries[currentIndex]?.key || activeScreenKey;
      beginScreenTransition();
      track.style.transform = "translateX(-" + (currentIndex * 100) + "%)";
      renderProgress();
      return true;
    }

    function navigateToScreenIndex(index) {
      if (!goToScreen(index)) {
        return false;
      }

      resetAutoRotate();
      return true;
    }

    function getTimerForCurrentScreen() {
      const screen = getActiveScreenEntry()?.screen;
      if (!screen) return (screenTimers.default || 30) * 1000;
      if (screen.classList.contains("screen--calendar")) return (screenTimers.upcoming_calendar || 30) * 1000;
      if (screen.classList.contains("screen--month")) return (screenTimers.monthly_calendar || 60) * 1000;
      if (screen.classList.contains("screen--todos")) return (screenTimers.todos || 45) * 1000;
      if (screen.classList.contains("screen--meals")) return (screenTimers.meals || 30) * 1000;
      if (screen.classList.contains("countdown-screen")) return (screenTimers.countdowns || 15) * 1000;
      if (screen.classList.contains("scorecard-screen")) return (screenTimers.scorecards || 30) * 1000;
      if (screen.classList.contains("rsvp-screen")) return (screenTimers.rsvp || 30) * 1000;
      return (screenTimers.default || 30) * 1000;
    }

    function resetAutoRotate(reason = "unknown") {
      window.clearTimeout(autoRotateId);
      autoRotateToken += 1;
      const token = autoRotateToken;
      const delay = getTimerForCurrentScreen();
      console.log(`[rotation] reset via ${reason}; token=${token}; delayMs=${delay}`);
      autoRotateId = window.setTimeout(() => autoAdvanceAndSchedule(token), delay);
    }

    function autoAdvanceAndSchedule(token) {
      if (token !== autoRotateToken) {
        console.log(`[rotation] skipped stale auto-rotate callback; token=${token}; current=${autoRotateToken}`);
        return;
      }

      nextScreen();
      const nextDelay = getTimerForCurrentScreen();
      autoRotateId = window.setTimeout(() => autoAdvanceAndSchedule(token), nextDelay);
    }

    function nextScreen() {
      return goToScreen(currentIndex + 1);
    }

    function previousScreen() {
      return goToScreen(currentIndex - 1);
    }

    function manualNavigate(direction) {
      if (direction === "next") {
        return navigateToScreenIndex(currentIndex + 1);
      } else {
        return navigateToScreenIndex(currentIndex - 1);
      }
    }

    function handlePointerDown(event) {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      pauseAutoRotate("pointerdown");
      pointerStartX = event.clientX;
      pointerDeltaX = 0;
    }

    function handlePointerMove(event) {
      if (pointerStartX === null) {
        return;
      }

      pointerDeltaX = event.clientX - pointerStartX;
    }

    function handlePointerUp() {
      if (pointerStartX === null) {
        return;
      }

      let didNavigate = false;
      if (Math.abs(pointerDeltaX) >= 60) {
        didNavigate = manualNavigate(pointerDeltaX < 0 ? "next" : "previous") === true;
      }

      pointerStartX = null;
      pointerDeltaX = 0;
      if (!didNavigate) {
        resetAutoRotate("pointerup");
      }
    }

    function handleKeydown(event) {
      if (event.key === "ArrowRight") {
        manualNavigate("next");
      }

      if (event.key === "ArrowLeft") {
        manualNavigate("previous");
      }
    }
