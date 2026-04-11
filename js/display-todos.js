    function mapSupabaseTodo(todo) {
      const description = String(todo.description || "").trim();
      return {
        id: todo.id,
        title: todo.title || "Untitled task",
        assignee: todo.assignee || "",
        description: description || null,
        duePill: getTodoDuePill(todo.due_date),
        isOverdue: isTodoOverdue(todo.due_date)
      };
    }

    function getDisplayCelebrationAnimationName() {
      if (!celebrationBag.length) {
        celebrationBag = [
          "confetti-burst",
          "star-shower",
          "fireworks",
          "bubble-float",
          "thumbs-up-bounce",
          "sparkle-trail",
          "ink-splash"
        ];

        for (let index = celebrationBag.length - 1; index > 0; index -= 1) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          const current = celebrationBag[index];
          celebrationBag[index] = celebrationBag[swapIndex];
          celebrationBag[swapIndex] = current;
        }
      }

      return celebrationBag.pop();
    }

    function getTodoCelebrationOrigin(cardEl) {
      const trigger = cardEl?.querySelector(".todo-check-btn") || cardEl;
      const rect = trigger?.getBoundingClientRect?.();

      if (!rect) {
        return {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2
        };
      }

      return {
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2)
      };
    }

    function createCelebrationLayer(animationName, origin) {
      const host = document.getElementById("display-app");
      if (!host) {
        return null;
      }

      const layer = document.createElement("div");
      layer.className = `todo-celebration-layer todo-celebration-layer--${animationName}`;
      layer.setAttribute("aria-hidden", "true");
      layer.style.setProperty("--origin-x", `${origin.x}px`);
      layer.style.setProperty("--origin-y", `${origin.y}px`);
      host.appendChild(layer);
      return layer;
    }

    function waitForCelebration(duration = 1800) {
      return new Promise((resolve) => {
        window.setTimeout(resolve, duration);
      });
    }

    function getCelebrationPalette() {
      const styles = getComputedStyle(document.documentElement);
      const accent = String(styles.getPropertyValue("--color-accent") || "").trim() || "#b45309";
      return [accent, "#ffffff", "#fbbf24", "#22c55e"];
    }

    function getCelebrationPaletteNoWhite() {
      const styles = getComputedStyle(document.documentElement);
      const accent = String(styles.getPropertyValue("--color-accent") || "").trim() || "#b45309";
      return [accent, "#fbbf24", "#f97316", "#14b8a6", "#a855f7", "#22c55e"];
    }

    function createConfettiInstance(layer) {
      if (!layer || typeof confetti === "undefined") {
        return null;
      }

      const canvas = document.createElement("canvas");
      canvas.className = "todo-celebration-canvas";
      layer.appendChild(canvas);
      return {
        canvas,
        fire: confetti.create(canvas, {
          resize: true,
          useWorker: true
        })
      };
    }

    function playFallbackParticleBurst(origin) {
      const layer = createCelebrationLayer("fallback-burst", origin);
      if (!layer) {
        return Promise.resolve();
      }

      const colors = getCelebrationPalette();
      const particles = Array.from({ length: 14 }, (_, index) => {
        const particle = document.createElement("span");
        const angle = (Math.PI * 2 * index) / 14;
        const distance = 46 + Math.random() * 38;
        const driftY = 28 + Math.random() * 52;
        const size = 7 + Math.random() * 8;
        particle.className = "todo-fallback-particle";
        particle.style.left = `${origin.x}px`;
        particle.style.top = `${origin.y}px`;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.background = colors[index % colors.length];
        particle.style.setProperty("--burst-x", `${Math.cos(angle) * distance}px`);
        particle.style.setProperty("--burst-y", `${Math.sin(angle) * distance + driftY}px`);
        particle.style.setProperty("--burst-rotate", `${160 + Math.random() * 180}deg`);
        layer.appendChild(particle);
        return particle;
      });

      return waitForCelebration(1500).finally(() => {
        particles.forEach((particle) => particle.remove());
        layer.remove();
      });
    }

    function playCanvasConfettiBurst() {
      const layer = createCelebrationLayer("confetti-burst", {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      });
      const instance = createConfettiInstance(layer);
      const colors = getCelebrationPalette();

      if (!instance) {
        layer?.remove();
        return playFallbackParticleBurst({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2
        });
      }

      instance.fire({
        particleCount: 120,
        spread: 80,
        startVelocity: 42,
        ticks: 360,
        origin: { x: 0.5, y: 0.48 },
        colors
      });

      return waitForCelebration(4400).finally(() => layer.remove());
    }

    function playCanvasStarShower() {
      const layer = createCelebrationLayer("star-shower", {
        x: window.innerWidth / 2,
        y: 0
      });
      const instance = createConfettiInstance(layer);
      const colors = getCelebrationPalette();

      if (!instance) {
        layer?.remove();
        return playFallbackParticleBurst({
          x: window.innerWidth / 2,
          y: Math.max(window.innerHeight * 0.22, 120)
        });
      }

      const start = Date.now();
      const duration = 7000;
      const frame = () => {
        if (!layer || !instance || !layer.isConnected) {
          return;
        }

        if (Date.now() - start >= duration) {
          return;
        }

        instance.fire({
          particleCount: 10,
          angle: 90,
          spread: 40,
          startVelocity: 18,
          gravity: 0.7,
          ticks: 580,
          scalar: 1.05,
          origin: { x: 0.15 + (Math.random() * 0.7), y: -0.08 },
          shapes: ["star"],
          colors
        });

        if (layer.isConnected) {
          window.setTimeout(frame, 380);
        }
      };

      frame();
      return waitForCelebration(7600).finally(() => layer.remove());
    }

    function playCanvasFireworks() {
      const layer = createCelebrationLayer("fireworks", {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      });
      const instance = createConfettiInstance(layer);
      const colors = getCelebrationPaletteNoWhite();

      if (!instance) {
        layer?.remove();
        return playFallbackParticleBurst({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2
        });
      }

      const bursts = [
        { x: 0.16, y: 0.22, delay: 0 },
        { x: 0.82, y: 0.2, delay: 900 },
        { x: 0.7, y: 0.52, delay: 1800 }
      ];

      bursts.forEach((burst) => {
        window.setTimeout(() => {
          instance.fire({
            particleCount: 42,
            spread: 62,
            startVelocity: 34,
            ticks: 320,
            origin: { x: burst.x, y: burst.y },
            colors
          });
        }, burst.delay);
      });

      return waitForCelebration(4500).finally(() => layer.remove());
    }

    function createGsapPiece(className, content = "") {
      const element = document.createElement("span");
      element.className = className;
      if (content) {
        element.textContent = content;
      }
      return element;
    }

    function playRippleRings(origin) {
      const layer = createCelebrationLayer("ripple-rings", origin);
      if (!layer) {
        return Promise.resolve();
      }
      const accent = String(getComputedStyle(document.documentElement).getPropertyValue("--color-accent") || "").trim() || "#b45309";
      Array.from({ length: 3 }, (_, index) => {
        const ring = document.createElement("span");
        ring.className = "todo-ripple-ring";
        ring.style.left = `${origin.x}px`;
        ring.style.top = `${origin.y}px`;
        ring.style.borderColor = accent;
        ring.style.animationDelay = `${index * 120}ms`;
        layer.appendChild(ring);
        return ring;
      });

      return waitForCelebration(1600).finally(() => layer.remove());
    }

    function playGsapBubbleFloat(origin) {
      if (typeof gsap === "undefined") {
        return playFallbackParticleBurst(origin);
      }

      const layer = createCelebrationLayer("bubble-float", origin);
      if (!layer) {
        return Promise.resolve();
      }

      const colors = getCelebrationPaletteNoWhite();
      const pieces = Array.from({ length: 7 }, (_, index) => {
        const piece = createGsapPiece("todo-gsap-piece todo-gsap-piece--bubble");
        const size = 18 + Math.round(Math.random() * 12);
        const baseX = (Math.random() * 24) - 12;
        const amplitude = 18 + Math.random() * 28;
        const frequency = 1.3 + Math.random() * 1.4;
        const phase = Math.random() * Math.PI * 2;
        const duration = 4.75 + Math.random() * 0.22;
        const delay = index * (0.1 + Math.random() * 0.1);
        const riseDistance = Math.max(window.innerHeight * 0.74, 460) + (Math.random() * 60);
        piece.style.left = `${origin.x}px`;
        piece.style.top = `${origin.y}px`;
        piece.style.width = `${size}px`;
        piece.style.height = `${size}px`;
        piece.style.background = colors[index % colors.length];
        piece.style.opacity = "0.12";
        layer.appendChild(piece);
        gsap.to(piece, {
          y: -riseDistance,
          duration,
          delay,
          ease: "none",
          onUpdate() {
            const progress = this.progress();
            const sway = Math.sin((progress * Math.PI * 2 * frequency) + phase) * amplitude;
            const grow = progress < 0.72
              ? 0.52 + (progress * 0.72)
              : 1.04 + ((progress - 0.72) * 0.12);
            const opacity = progress > 0.9
              ? Math.max(0, 0.64 * (1 - ((progress - 0.9) / 0.1)))
              : 0.64;

            gsap.set(piece, {
              x: baseX + sway,
              scale: grow,
              opacity
            });
          }
        });
        return piece;
      });

      return waitForCelebration(5000).finally(() => {
        gsap.killTweensOf(pieces);
        layer.remove();
      });
    }

    function playGsapThumbsUp(origin) {
      if (typeof gsap === "undefined") {
        return playFallbackParticleBurst(origin);
      }

      const layer = createCelebrationLayer("thumbs-up-bounce", origin);
      if (!layer) {
        return Promise.resolve();
      }

      const thumb = createGsapPiece("todo-thumbs-up", "👍");
      thumb.style.left = `${origin.x}px`;
      thumb.style.top = `${origin.y}px`;
      layer.appendChild(thumb);

      const timeline = gsap.timeline();
      timeline
        .fromTo(thumb,
          { scale: 0, opacity: 0, y: 18 },
          { scale: 1, opacity: 1, y: -18, duration: 0.7, ease: "back.out(2.5)" }
        )
        .to(thumb, { duration: 1.7, y: -22 })
        .to(thumb, { duration: 0.42, rotation: -10, y: -26, ease: "power1.inOut" })
        .to(thumb, { duration: 0.42, rotation: 10, y: -21, ease: "power1.inOut" })
        .to(thumb, { duration: 0.36, rotation: 0, y: -24, ease: "power1.inOut" })
        .to(thumb, { opacity: 0, y: -78, duration: 0.82, ease: "power2.out" });

      return waitForCelebration(4000).finally(() => {
        timeline.kill();
        layer.remove();
      });
    }

    function playGsapInkSplash(origin) {
      if (typeof gsap === "undefined") {
        return playFallbackParticleBurst(origin);
      }

      const layer = createCelebrationLayer("ink-splash", origin);
      if (!layer) {
        return Promise.resolve();
      }

      const colors = getCelebrationPaletteNoWhite();
      const blobs = Array.from({ length: 7 }, (_, index) => {
        const blob = createGsapPiece("todo-gsap-piece todo-gsap-piece--ink");
        const angle = (-0.9 + ((Math.PI * 1.8 * index) / 7)) + ((Math.random() - 0.5) * 0.38);
        const distance = 48 + Math.random() * 72;
        const size = 30 + Math.random() * 50;
        const delay = index * (0.04 + Math.random() * 0.02);

        blob.style.left = `${origin.x}px`;
        blob.style.top = `${origin.y}px`;
        blob.style.width = `${size}px`;
        blob.style.height = `${size * (0.82 + Math.random() * 0.36)}px`;
        blob.style.background = colors[index % colors.length];
        blob.style.borderRadius = `${48 + Math.random() * 30}% ${52 + Math.random() * 26}% ${46 + Math.random() * 28}% ${54 + Math.random() * 24}%`;
        blob.style.opacity = "0.9";
        layer.appendChild(blob);

        const timeline = gsap.timeline({ delay });
        timeline
          .fromTo(blob,
            { x: 0, y: 0, scale: 0, opacity: 0.9, rotation: -18 + (Math.random() * 36) },
            {
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance,
              scale: 1,
              duration: 0.55,
              ease: "back.out(1.7)"
            }
          )
          .to(blob, {
            scale: 1.15,
            duration: 0.2,
            ease: "power1.out"
          })
          .to(blob, {
            scale: 0,
            opacity: 0,
            duration: 0.45,
            ease: "power2.in"
          });
        return blob;
      });

      const ring = document.createElement("span");
      ring.className = "todo-ink-ring";
      ring.style.left = `${origin.x}px`;
      ring.style.top = `${origin.y}px`;
      ring.style.borderColor = colors[0];
      layer.appendChild(ring);
      gsap.fromTo(ring,
        { scale: 0.18, opacity: 0.75 },
        { scale: 8.5, opacity: 0, duration: 0.8, ease: "power2.out" }
      );

      return waitForCelebration(2800).finally(() => {
        gsap.killTweensOf([...blobs, ring]);
        layer.remove();
      });
    }

    function playTodoCelebration(cardEl) {
      if (!cardEl || document.documentElement.getAttribute("data-mode") !== "display") {
        return Promise.resolve();
      }

      const animationName = getDisplayCelebrationAnimationName();
      const origin = getTodoCelebrationOrigin(cardEl);
      switch (animationName) {
        case "confetti-burst":
          return playCanvasConfettiBurst();
        case "star-shower":
          return playCanvasStarShower();
        case "fireworks":
          return playCanvasFireworks();
        case "bubble-float":
          return playGsapBubbleFloat(origin);
        case "thumbs-up-bounce":
          return playGsapThumbsUp(origin);
        case "sparkle-trail":
          return playRippleRings(origin);
        case "ink-splash":
          return playGsapInkSplash(origin);
        default:
          return playRippleRings(origin);
      }
    }

    function renderTodoItems(todoItems) {
      cachedDisplayTodos = todoItems;
      const list = document.getElementById("todo-list");

      if (!todoItems.length) {
        list.innerHTML = `
          <article class="todo-card todo-card--empty">
            <div class="todo-copy">
              <div class="todo-title">All clear!</div>
              <div class="todo-meta">No open household tasks.</div>
            </div>
          </article>
        `;
        return;
      }

      list.innerHTML = todoItems.map((todo) => {
        const pill = todo.duePill
          ? `<span class="todo-due-pill ${escapeHtml(todo.duePill.cssClass)}">${escapeHtml(todo.duePill.label)}</span>`
          : "";
        const assignee = todo.assignee ? getAssigneeMarkup(todo.assignee) : "";
        const overdueClass = todo.isOverdue ? " todo-card--overdue" : "";
        const contentMarkup = `
          <div class="todo-title-row">
            <div class="todo-title">${escapeHtml(todo.title)}</div>
            ${todo.description ? `<span class="todo-detail-indicator" aria-hidden="true"><i data-lucide="info"></i></span>` : ""}
          </div>
          <div class="todo-pills">${assignee}${pill}</div>
        `;
        return `
          <article class="todo-card${overdueClass}" data-todo-id="${escapeHtml(todo.id)}">
            <button class="todo-check-btn" type="button" aria-label="Complete ${escapeHtml(todo.title)}">
              <div class="todo-check">
                <svg class="todo-check-icon" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M1 5L4.5 8.5L11 1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </button>
            ${todo.description
              ? `<button class="todo-copy todo-detail-trigger" type="button" data-action="open-todo-detail" aria-label="View details for ${escapeHtml(todo.title)}">${contentMarkup}</button>`
              : `<div class="todo-copy">${contentMarkup}</div>`}
          </article>
        `;
      }).join("");

      list.querySelectorAll(".todo-check-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const card = btn.closest("[data-todo-id]");
          if (card && !card.classList.contains("is-completing")) {
            completeTodoFromDisplay(card.dataset.todoId, card);
          }
        });
      });

      list.querySelectorAll("[data-action='open-todo-detail']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const card = btn.closest("[data-todo-id]");
          if (!card) {
            return;
          }

          const todo = cachedDisplayTodos.find((item) => item.id === card.dataset.todoId);
          if (todo?.description) {
            openTodoDetailModal(todo);
          }
        });
      });

      refreshIcons();
    }

    async function completeTodoFromDisplay(todoId, cardEl) {
      const client = getSupabaseClient();
      if (!client) {
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      cardEl.classList.add("is-completing");
      resetAutoRotate("todo-complete");
      playTodoCelebration(cardEl).catch(() => {});

      const { error } = await client
        .from("todos")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", todoId)
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null);
      if (error) {
        cardEl.classList.remove("is-completing");
        showDisplayToast("Something went wrong saving your changes. Please try again.");
        return;
      }

      window.setTimeout(() => {
        if (!cardEl.isConnected) {
          return;
        }

        cardEl.classList.add("is-done");
        cardEl.addEventListener("transitionend", () => {
          cardEl.remove();
          const list = document.getElementById("todo-list");
          if (list && !list.querySelector("[data-todo-id]")) {
            renderTodoItems([]);
          }
        }, { once: true });
      }, TODO_CELEBRATION_FADE_DELAY_MS);
    }

    async function fetchTodos() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const { data, error } = await client
        .from("todos")
        .select("id, title, description, due_date, assignee, archived_at, created_at")
        .eq("household_id", TODO_HOUSEHOLD_ID)
        .is("archived_at", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data.map(mapSupabaseTodo);
    }

    async function renderTodos() {
      markPending("todos");
      renderTodoSkeleton();
      let remoteTodos = await fetchTodos();
      if (remoteTodos === null) {
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        remoteTodos = await fetchTodos();
      }
      if (remoteTodos === null) {
        renderScreenError(
          document.getElementById("todo-list"),
          "Something went wrong loading your data \u2014 tap to retry",
          renderTodos
        );
      } else {
        renderTodoItems(remoteTodos);
      }
      resolveScreen("todos");
    }
