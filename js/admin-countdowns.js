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

    function getCountdownPhotoDraftKey(form) {
      if (!form) return null;
      return adminModalType === "edit-countdown"
        ? form.getAttribute("data-countdown-id")
        : "modal-create";
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

    function getCountdownPhotoData(countdown) {
      if (countdown?.custom_image_url) {
        return {
          imageUrl: countdown.custom_image_url,
          imageCredit: "Custom photo",
          thumbnailUrl: countdown.custom_image_url,
          source: "custom"
        };
      }

      let imageUrl = null;
      let imageCredit = null;
      if (countdown?.unsplash_image_url) {
        try {
          const parsed = JSON.parse(countdown.unsplash_image_url);
          imageUrl = parsed.url || null;
          imageCredit = parsed.credit || null;
        } catch {
          imageUrl = countdown.unsplash_image_url;
        }
      }

      return {
        imageUrl,
        imageCredit,
        thumbnailUrl: imageUrl ? unsplashThumbnailUrl(imageUrl) : null,
        source: imageUrl ? "unsplash" : null
      };
    }

    function getCountdownCustomPhotoData(countdown) {
      const imageUrl = String(countdown?.custom_image_url || "").trim() || null;
      return {
        imageUrl,
        imageCredit: imageUrl ? "Custom photo" : null,
        thumbnailUrl: imageUrl,
        source: imageUrl ? "custom" : null
      };
    }

    function getCountdownUnsplashPhotoData(countdown) {
      const unsplashImageUrl = String(countdown?.unsplash_image_url || "").trim();
      if (!unsplashImageUrl) {
        return {
          imageUrl: null,
          imageCredit: null,
          thumbnailUrl: null,
          source: null
        };
      }

      return getCountdownPhotoData({ unsplash_image_url: unsplashImageUrl });
    }

    function buildCountdownPendingPhotoMarkup(photo) {
      return `
        <img src="${escapeHtml(photo.previewUrl || photo.imageUrl || "")}" alt="" aria-hidden="true">
        <div class="admin-form-photo-preview-meta">
          ${photo.credit ? `<span>${escapeHtml(photo.credit)}</span>` : ""}
          <button class="admin-button admin-button--ghost-danger" type="button" data-action="clear-pending-photo-modal" data-clear-kind="${escapeHtml(photo.kind || "")}">Remove photo</button>
        </div>
      `;
    }

    function getCountdownPhotoPreviewElement(form, kind) {
      return form?.querySelector(`.admin-edit-photo-preview[data-photo-source='${kind}']`) || null;
    }

    function getCountdownPendingPhotoElement(form, kind) {
      return form?.querySelector(`.admin-modal-photo-pending[data-photo-kind='${kind}']`) || null;
    }

    function hasCountdownRemovalFlag(form, kind) {
      return !!form?.querySelector(`[name='${kind === "custom" ? "remove_custom_photo" : "remove_unsplash_photo"}']`);
    }

    function clearCountdownRemovalFlag(form, kind) {
      const input = form?.querySelector(`[name='${kind === "custom" ? "remove_custom_photo" : "remove_unsplash_photo"}']`);
      if (input) {
        input.remove();
      }
    }

    function hasVisibleCountdownPhoto(form, kind) {
      const savedPreview = getCountdownPhotoPreviewElement(form, kind);
      const pendingPreview = getCountdownPendingPhotoElement(form, kind);
      return (!!savedPreview && !savedPreview.hidden) || (!!pendingPreview && !pendingPreview.hidden);
    }

    function getCountdownPhotoUiState(form) {
      if (hasVisibleCountdownPhoto(form, "custom")) {
        return "custom";
      }
      if (hasVisibleCountdownPhoto(form, "unsplash")) {
        return "unsplash";
      }
      return "empty";
    }

    function syncCountdownPhotoUi(form) {
      if (!form) return;
      const state = getCountdownPhotoUiState(form);
      const unsplashSearch = form.querySelector("[data-countdown-photo-control='unsplash-search']");
      const customUploadPrimary = form.querySelector("[data-countdown-photo-control='custom-upload-primary']");
      const customUploadReplace = form.querySelector("[data-countdown-photo-control='custom-upload-replace']");
      const unsplashCurrent = form.querySelector("[data-countdown-photo-current='unsplash']");
      const customCurrent = form.querySelector("[data-countdown-photo-current='custom']");
      if (unsplashSearch) unsplashSearch.hidden = state !== "empty";
      if (customUploadPrimary) customUploadPrimary.hidden = state !== "empty";
      if (customUploadReplace) customUploadReplace.hidden = state !== "unsplash";
      if (unsplashCurrent) unsplashCurrent.hidden = state !== "unsplash";
      if (customCurrent) customCurrent.hidden = state !== "custom";
      form.setAttribute("data-countdown-photo-state", state);
    }

    function setPendingCountdownPhoto(key, nextPhoto) {
      const existingPhotos = adminPendingPhotos.get(key) || {};
      if (existingPhotos.custom?.previewUrl && nextPhoto?.kind === "custom") {
        URL.revokeObjectURL(existingPhotos.custom.previewUrl);
      }
      if (!nextPhoto) {
        adminPendingPhotos.set(key, existingPhotos);
        return;
      }
      adminPendingPhotos.set(key, {
        ...existingPhotos,
        [nextPhoto.kind]: nextPhoto
      });
    }

    function clearPendingCountdownPhoto(key) {
      const pendingPhotos = adminPendingPhotos.get(key);
      if (pendingPhotos?.custom?.previewUrl) {
        URL.revokeObjectURL(pendingPhotos.custom.previewUrl);
      }
      adminPendingPhotos.delete(key);
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

    function clearCountdownPendingPhotoFromForm(form, kind) {
      if (!form) return;
      const key = getCountdownPhotoDraftKey(form);
      const pendingPhotos = key ? (adminPendingPhotos.get(key) || {}) : {};
      if (key && kind === "custom" && pendingPhotos.custom?.previewUrl) {
        URL.revokeObjectURL(pendingPhotos.custom.previewUrl);
      }
      if (key && kind) {
        const nextPhotos = { ...pendingPhotos };
        delete nextPhotos[kind];
        if (nextPhotos.custom || nextPhotos.unsplash) {
          adminPendingPhotos.set(key, nextPhotos);
        } else {
          adminPendingPhotos.delete(key);
        }
      }
      const pendingContainer = form.querySelector(`.admin-modal-photo-pending[data-photo-kind='${kind}']`);
      if (pendingContainer) {
        pendingContainer.innerHTML = "";
        pendingContainer.hidden = true;
      }
      if (kind === "custom") {
        form.querySelectorAll("[name='custom_photo_file']").forEach((fileInput) => {
          fileInput.value = "";
        });
      }
      const existing = form.querySelector(`.admin-edit-photo-preview[data-photo-source='${kind}']`);
      if (existing) {
        existing.hidden = false;
      }
      clearCountdownRemovalFlag(form, kind);
      syncCountdownPhotoUi(form);
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

    function getCustomPhotoExtension(file) {
      const typeToExt = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
      };

      if (typeToExt[file.type]) {
        return typeToExt[file.type];
      }

      const name = String(file.name || "");
      const match = name.match(/\.([a-z0-9]+)$/i);
      const ext = match ? match[1].toLowerCase() : "";
      return COUNTDOWN_CUSTOM_PHOTO_EXTENSIONS.includes(ext) ? ext : "";
    }

    function inferCountdownCustomPhotoName(file) {
      const rawName = String(file?.name || "").replace(/\.[a-z0-9]+$/i, "").trim();
      const safeBase = rawName
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
      return `${safeBase || "countdown-photo"}.jpg`;
    }

    function canvasToBlob(canvas, type, quality) {
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          reject(new Error("Image export failed."));
        }, type, quality);
      });
    }

    async function buildProcessedCountdownPhotoFile(canvas, originalFileName) {
      const sourceWidth = canvas.width;
      const sourceHeight = canvas.height;
      const longestSide = Math.max(sourceWidth, sourceHeight);
      const scale = longestSide > COUNTDOWN_UPLOAD_MAX_SIDE
        ? COUNTDOWN_UPLOAD_MAX_SIDE / longestSide
        : 1;
      const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
      const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = outputWidth;
      outputCanvas.height = outputHeight;
      const context = outputCanvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas is unavailable.");
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(canvas, 0, 0, outputWidth, outputHeight);
      const blob = await canvasToBlob(outputCanvas, "image/jpeg", COUNTDOWN_UPLOAD_QUALITY);
      return new File([blob], inferCountdownCustomPhotoName({ name: originalFileName }), {
        type: "image/jpeg",
        lastModified: Date.now()
      });
    }

    function destroyCountdownPhotoCropper() {
      if (adminCountdownCropper && typeof adminCountdownCropper.destroy === "function") {
        adminCountdownCropper.destroy();
      }
      adminCountdownCropper = null;
    }

    function closeCountdownPhotoCropper(options = {}) {
      const preserveFileInput = options.preserveFileInput === true;
      destroyCountdownPhotoCropper();
      if (adminCropperOverlay) {
        adminCropperOverlay.hidden = true;
      }
      if (adminCropperImage) {
        adminCropperImage.onload = null;
        adminCropperImage.removeAttribute("src");
      }
      if (adminCropperConfirmButton) {
        adminCropperConfirmButton.disabled = false;
        adminCropperConfirmButton.textContent = "Use this crop";
      }
      if (!preserveFileInput && adminCountdownCropState?.input) {
        adminCountdownCropState.input.value = "";
      }
      if (adminCountdownCropState?.objectUrl) {
        URL.revokeObjectURL(adminCountdownCropState.objectUrl);
      }
      adminCountdownCropState = null;
    }

    function openCountdownPhotoCropper(input, file) {
      if (!input || !file || !adminCropperOverlay || !adminCropperImage) {
        return;
      }
      if (!window.Cropper) {
        showToast("Photo editing is not available right now. Please try again.");
        input.value = "";
        return;
      }
      closeCountdownPhotoCropper({ preserveFileInput: true });
      const objectUrl = URL.createObjectURL(file);
      adminCountdownCropState = { input, file, objectUrl };
      adminCropperImage.onload = () => {
        destroyCountdownPhotoCropper();
        adminCountdownCropper = new window.Cropper(adminCropperImage, {
          aspectRatio: COUNTDOWN_PHOTO_ASPECT_RATIO,
          viewMode: 1,
          dragMode: "move",
          guides: false,
          background: false,
          autoCropArea: 1,
          responsive: true,
          toggleDragModeOnDblclick: false
        });
      };
      adminCropperImage.src = objectUrl;
      adminCropperOverlay.hidden = false;
      refreshIcons();
    }

    async function confirmCountdownPhotoCrop() {
      if (!adminCountdownCropper || !adminCountdownCropState?.input) {
        return;
      }
      if (adminCropperConfirmButton) {
        adminCropperConfirmButton.disabled = true;
        adminCropperConfirmButton.textContent = "Preparing…";
      }
      try {
        const croppedCanvas = adminCountdownCropper.getCroppedCanvas({
          imageSmoothingEnabled: true,
          imageSmoothingQuality: "high"
        });
        if (!croppedCanvas) {
          throw new Error("Crop failed.");
        }
        const processedFile = await buildProcessedCountdownPhotoFile(
          croppedCanvas,
          adminCountdownCropState.file?.name || "countdown-photo.jpg"
        );
        const previewUrl = URL.createObjectURL(processedFile);
        const form = adminCountdownCropState.input.closest("form[data-modal-form='countdown']");
        const key = getCountdownPhotoDraftKey(form);
        if (!form || !key) {
          URL.revokeObjectURL(previewUrl);
          throw new Error("Form is unavailable.");
        }
        clearCountdownRemovalFlag(form, "custom");
        setPendingCountdownPhoto(key, {
          kind: "custom",
          file: processedFile,
          extension: "jpg",
          imageUrl: previewUrl,
          previewUrl,
          credit: "Custom photo"
        });
        const previewContainer = getCountdownPendingPhotoElement(form, "custom");
        setFormPhotoPreview(previewContainer, (adminPendingPhotos.get(key) || {}).custom);
        syncCountdownPhotoUi(form);
        closeCountdownPhotoCropper({ preserveFileInput: false });
      } catch (error) {
        console.warn("Custom photo crop failed:", error);
        showToast("Couldn't prepare that photo. Please try another one.");
        closeCountdownPhotoCropper({ preserveFileInput: false });
      }
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

    async function removeCountdownCustomPhotoAssets(countdownId) {
      const client = getSupabaseClient();
      if (!client || !countdownId) return;
      const paths = COUNTDOWN_CUSTOM_PHOTO_EXTENSIONS.map((ext) => `${DISPLAY_HOUSEHOLD_ID}/${countdownId}.${ext}`);
      try {
        await client.storage.from(COUNTDOWN_CUSTOM_PHOTO_BUCKET).remove(paths);
      } catch {}
    }

    async function uploadCountdownCustomPhoto(countdownId, pendingPhoto) {
      const client = getSupabaseClient();
      if (!client || !countdownId || !pendingPhoto?.file || pendingPhoto.kind !== "custom") {
        return null;
      }

      const path = `${DISPLAY_HOUSEHOLD_ID}/${countdownId}.${pendingPhoto.extension}`;
      const { error: uploadError } = await client.storage
        .from(COUNTDOWN_CUSTOM_PHOTO_BUCKET)
        .upload(path, pendingPhoto.file, {
          upsert: true,
          contentType: pendingPhoto.file.type || undefined
        });
      if (uploadError) {
        console.error("Countdown custom photo upload failed.", uploadError);
        return null;
      }

      const { data } = client.storage.from(COUNTDOWN_CUSTOM_PHOTO_BUCKET).getPublicUrl(path);
      const publicUrl = data?.publicUrl || null;
      if (!publicUrl) {
        console.error("Countdown custom photo public URL missing.", { countdownId, path });
        return null;
      }

      const { error: updateError } = await client
        .from("countdowns")
        .update({ custom_image_url: publicUrl })
        .eq("id", countdownId)
        .eq("household_id", DISPLAY_HOUSEHOLD_ID);
      if (updateError) {
        console.error("Countdown custom photo URL save failed.", updateError);
        return null;
      }

      // Clean up other extension variants after the new upload and DB update both succeed.
      // Skip the extension that was just uploaded so we don't delete the new file.
      const otherPaths = COUNTDOWN_CUSTOM_PHOTO_EXTENSIONS
        .filter((ext) => ext !== pendingPhoto.extension)
        .map((ext) => `${DISPLAY_HOUSEHOLD_ID}/${countdownId}.${ext}`);
      if (otherPaths.length) {
        try {
          await client.storage.from(COUNTDOWN_CUSTOM_PHOTO_BUCKET).remove(otherPaths);
        } catch {}
      }
      return publicUrl;
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
      const pendingPhotos = adminPendingPhotos.get("modal-create") || {};

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
      clearPendingCountdownPhoto("modal-create");

      if (pendingPhotos.custom?.kind === "custom") {
        try {
          const publicUrl = await uploadCountdownCustomPhoto(insertedRow.id, pendingPhotos.custom);
          if (!publicUrl) {
            showToast("Countdown saved, but the custom photo upload failed.");
          }
        } catch (error) {
          console.warn("Custom photo upload failed:", error);
          showToast("Countdown saved, but the custom photo upload failed.");
        }
      }

      if (pendingPhotos.unsplash?.kind === "unsplash") {
        try {
          await updateCountdownPhoto(insertedRow.id, {
          url: pendingPhotos.unsplash.imageUrl,
          credit: pendingPhotos.unsplash.credit,
          photographerProfile: pendingPhotos.unsplash.photographerProfile || null
          });
        } catch (error) {
          console.warn("Background photo save failed:", error);
        }
      } else {
        try {
          const photo = await fetchUnsplashPhoto(photoKeyword || name);
          if (photo) {
            await updateCountdownPhoto(insertedRow.id, photo);
          }
        } catch (error) {
          console.warn("Background photo fetch failed:", error);
        }
      }

      closeAdminModal();
      await loadAdminCountdowns();
    }

    async function updateAdminCountdown(id, name, eventDate, icon, daysBeforeVisible, photoKeyword, originalName, options) {
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
      if (options.removeUnsplashPhoto) updatePayload.unsplash_image_url = null;
      if (options.removeCustomPhoto) updatePayload.custom_image_url = null;

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

      const pendingPhotos = adminPendingPhotos.get(id) || {};
      clearPendingCountdownPhoto(id);

      if (options.removeCustomPhoto) {
        removeCountdownCustomPhotoAssets(id).catch((e) => console.warn("Custom photo cleanup failed:", e));
      }

      if (pendingPhotos.custom?.kind === "custom") {
        try {
          const publicUrl = await uploadCountdownCustomPhoto(id, pendingPhotos.custom);
          if (!publicUrl) {
            showToast("Changes saved, but the custom photo upload failed.");
          }
        } catch (error) {
          console.warn("Custom photo upload failed:", error);
          showToast("Changes saved, but the custom photo upload failed.");
        }
      }

      if (!options.removeUnsplashPhoto) {
        if (pendingPhotos.unsplash?.kind === "unsplash") {
          try {
            await updateCountdownPhoto(id, {
              url: pendingPhotos.unsplash.imageUrl,
              credit: pendingPhotos.unsplash.credit,
              photographerProfile: pendingPhotos.unsplash.photographerProfile || null
            });
          } catch (error) {
            console.warn("Background photo save failed:", error);
          }
        } else if (photoKeyword || name !== originalName || !options.hadUnsplashPhoto) {
          try {
            const photo = await fetchUnsplashPhoto(photoKeyword || name);
            if (photo) {
              await updateCountdownPhoto(id, photo);
            }
          } catch (error) {
            console.warn("Background photo fetch failed:", error);
          }
        }
      }

      closeAdminModal();
      await loadAdminCountdowns({ preserveScroll: true });
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

      removeCountdownCustomPhotoAssets(id).catch((e) => console.warn("Countdown photo cleanup failed:", e));

      await loadAdminCountdowns();
    }

    function setFormPhotoPreview(container, photo) {
      if (!container || !photo) return;
      container.innerHTML = buildCountdownPendingPhotoMarkup(photo);
      container.hidden = false;
      const form = container.closest("form");
      if (form) {
        const existing = form.querySelector(`.admin-edit-photo-preview[data-photo-source='${photo.kind}']`);
        if (existing) existing.hidden = true;
      }
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

    async function fetchAdminSavedCountdowns() {
      const client = getSupabaseClient();

      if (!client) {
        return null;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await client
        .from("countdowns")
        .select("id, name, icon, event_date, unsplash_image_url, custom_image_url, days_before_visible, photo_keyword")
        .eq("household_id", DISPLAY_HOUSEHOLD_ID)
        .gte("event_date", formatDateKey(today))
        .order("event_date", { ascending: true });

      if (error || !Array.isArray(data)) {
        return null;
      }

      return data;
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

        const photoData = getCountdownPhotoData(c);
        const thumbnailUrl = photoData.thumbnailUrl;
        const daysBeforeLabel = c.days_before_visible != null
          ? `Shows ${c.days_before_visible}d before`
          : null;

        return `
          <article class="admin-saved-countdown-card" data-countdown-id="${escapeHtml(c.id)}">
            <div class="admin-countdown-card-main">
              ${thumbnailUrl ? `
              <button class="admin-countdown-preview-btn" type="button" data-action="view-photo" data-full-url="${escapeHtml(photoData.imageUrl)}" data-credit="${escapeHtml(photoData.imageCredit || "")}" aria-label="View photo for ${escapeHtml(c.name)}">
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

    async function handleGetPhotoModal() {
      const modalBody = document.getElementById("admin-modal-body");
      if (!modalBody) return;
      const keywordInput = modalBody.querySelector("[name='photo_keyword']");
      const nameInput = modalBody.querySelector("[name='name']");
      const previewContainer = modalBody.querySelector(".admin-modal-photo-pending[data-photo-kind='unsplash']");
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
      // Abort if the modal was closed or switched to a different countdown while fetching
      if (adminModalType !== capturedModalType || (adminModalContext && adminModalContext.id) !== capturedContextId) {
        return;
      }
      const photoKey = capturedModalType === "edit-countdown" ? capturedContextId : "modal-create";
      setPendingCountdownPhoto(photoKey, {
        kind: "unsplash",
        imageUrl: photo.url,
        previewUrl: unsplashThumbnailUrl(photo.url),
        credit: photo.credit,
        photographerProfile: photo.photographerProfile || null
      });
      const form = modalBody.querySelector("form[data-modal-form='countdown']");
      clearCountdownRemovalFlag(form, "unsplash");
      setFormPhotoPreview(previewContainer, (adminPendingPhotos.get(photoKey) || {}).unsplash);
      syncCountdownPhotoUi(form);
    }

    function handleCountdownCustomPhotoSelection(input) {
      const file = input.files && input.files[0];
      if (!file) {
        return;
      }

      const extension = getCustomPhotoExtension(file);
      if (!extension) {
        showToast("Please choose a JPG, PNG, or WebP image.");
        input.value = "";
        return;
      }
      openCountdownPhotoCropper(input, file);
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

      let existingUnsplashPhotoHTML = "";
      let existingCustomPhotoHTML = "";
      if (isEdit) {
        const customPhoto = getCountdownCustomPhotoData(countdown);
        if (customPhoto.imageUrl) {
          existingCustomPhotoHTML = `
            <div class="admin-edit-photo-preview" data-photo-source="custom">
              <button class="admin-countdown-preview-btn" type="button" data-action="view-photo"
                data-full-url="${escapeHtml(customPhoto.imageUrl)}" data-credit="${escapeHtml(customPhoto.imageCredit || "")}"
                aria-label="View full photo">
                <img class="admin-edit-photo-thumb" src="${escapeHtml(customPhoto.thumbnailUrl)}" alt="" aria-hidden="true"
                  onerror="this.closest('.admin-edit-photo-preview').remove();">
              </button>
              <div class="admin-edit-photo-meta">
                <span class="admin-edit-photo-credit">${escapeHtml(customPhoto.imageCredit || "Custom photo")}</span>
                <button class="admin-button admin-button--ghost-danger" type="button"
                  data-action="remove-photo-modal" data-countdown-id="${id}" data-remove-type="custom"
                  aria-label="Remove photo" style="margin-left:0">Remove photo</button>
              </div>
            </div>
          `;
        }

        const unsplashPhoto = getCountdownUnsplashPhotoData(countdown);
        if (unsplashPhoto.imageUrl) {
          existingUnsplashPhotoHTML = `
            <div class="admin-edit-photo-preview" data-photo-source="unsplash">
              <button class="admin-countdown-preview-btn" type="button" data-action="view-photo"
                data-full-url="${escapeHtml(unsplashPhoto.imageUrl)}" data-credit="${escapeHtml(unsplashPhoto.imageCredit || "")}"
                aria-label="View full photo">
                <img class="admin-edit-photo-thumb" src="${escapeHtml(unsplashPhoto.thumbnailUrl)}" alt="" aria-hidden="true"
                  onerror="this.closest('.admin-edit-photo-preview').remove();">
              </button>
              <div class="admin-edit-photo-meta">
                ${unsplashPhoto.imageCredit ? `<span class="admin-edit-photo-credit">${escapeHtml(unsplashPhoto.imageCredit)}</span>` : ""}
                <button class="admin-button admin-button--ghost-danger" type="button"
                  data-action="remove-photo-modal" data-countdown-id="${id}" data-remove-type="unsplash"
                  aria-label="Remove photo" style="margin-left:0">Remove photo</button>
              </div>
            </div>
          `;
        }
      }

      const formAttrs = isEdit
        ? `data-countdown-id="${id}" data-original-name="${name}" data-had-unsplash-photo="${countdown.unsplash_image_url ? "1" : "0"}"`
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
          <section class="admin-countdown-photo-panel" aria-labelledby="modal-cd-photo-label">
            <div class="admin-countdown-photo-heading">
              <div>
                <label id="modal-cd-photo-label" class="admin-countdown-photo-title">Photo</label>
                <p class="admin-field-hint">Pick a background for this countdown.</p>
              </div>
            </div>
            <div class="admin-field admin-countdown-photo-option" data-countdown-photo-control="unsplash-search">
              <label for="modal-cd-keyword">Search Unsplash</label>
              <div class="admin-icon-row">
                <input id="modal-cd-keyword" name="photo_keyword" type="text" maxlength="100"
                  value="${photoKeyword}" placeholder="e.g. beach, mountains" autocomplete="off">
                <button class="admin-button admin-button--secondary" type="button"
                  data-action="get-photo-modal">Get photo</button>
              </div>
              <p class="admin-field-hint">Search for a fallback photo you can save to this countdown.</p>
            </div>
            <div class="admin-countdown-photo-current" data-countdown-photo-current="unsplash" hidden>
              <div class="admin-countdown-photo-current-label">Saved Unsplash photo</div>
              ${existingUnsplashPhotoHTML}
              <div class="admin-modal-photo-pending" data-photo-kind="unsplash" hidden></div>
              <div class="admin-field admin-countdown-photo-replace" data-countdown-photo-control="custom-upload-replace" hidden>
                <label for="modal-cd-custom-photo-replace">Upload your own to replace it</label>
                <input id="modal-cd-custom-photo-replace" name="custom_photo_file" type="file" accept="image/jpeg,image/png,image/webp">
                <p class="admin-field-hint">JPG, PNG, or WebP. Your uploaded photo will take over on the display.</p>
              </div>
            </div>
            <div class="admin-field admin-countdown-photo-option admin-countdown-photo-option--secondary" data-countdown-photo-control="custom-upload-primary">
              <label for="modal-cd-custom-photo-primary">Upload your own</label>
              <input id="modal-cd-custom-photo-primary" name="custom_photo_file" type="file" accept="image/jpeg,image/png,image/webp">
              <p class="admin-field-hint">JPG, PNG, or WebP. Your uploaded photo will be used on the display.</p>
            </div>
            <div class="admin-countdown-photo-current" data-countdown-photo-current="custom" hidden>
              <div class="admin-countdown-photo-current-label">Your photo</div>
              ${existingCustomPhotoHTML}
              <div class="admin-modal-photo-pending" data-photo-kind="custom" hidden></div>
            </div>
          </section>
          <div class="admin-field admin-countdown-icon-field">
            <label for="modal-cd-icon">Icon &mdash; <a href="https://lucide.dev/icons" target="_blank" rel="noopener noreferrer" class="admin-icon-link">Browse ↗</a></label>
            <input id="modal-cd-icon" name="icon" type="text" maxlength="60"
              value="${icon}" placeholder="e.g. plane, heart, gem" autocomplete="off">
            <p class="admin-field-hint">Lucide icon name. Optional.</p>
          </div>
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
      syncCountdownPhotoUi(document.querySelector("#admin-modal-body form[data-modal-form='countdown']"));
    }

    function openEditCountdownModal(countdown) {
      adminModalType = "edit-countdown";
      adminModalContext = { id: countdown.id };
      openAdminModal("Edit Countdown", buildCountdownFormHTML(countdown));
      syncCountdownPhotoUi(document.querySelector("#admin-modal-body form[data-modal-form='countdown']"));
    }

    function handleAdminCountdownCalListClick(event) {
      const card = event.target.closest("[data-cal-name]");
      if (!card) return;
      openAddCountdownModal({
        name: card.getAttribute("data-cal-name"),
        date: card.getAttribute("data-cal-date")
      });
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
