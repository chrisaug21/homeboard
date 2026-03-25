    const SUPABASE_URL = '%%SUPABASE_URL%%';
    const SUPABASE_KEY = '%%SUPABASE_KEY%%';
    const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
    const isAdminMode = pathname === "/admin";
    let sb = null;

    function initSupabaseClient() {
      if (sb) {
        return sb;
      }

      if (!window.supabase || typeof window.supabase.createClient !== "function") {
        return null;
      }

      try {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      } catch(e) {
        console.warn('Supabase unavailable, running with hardcoded data.', e);
      }

      return sb;
    }

    function getSupabaseClient() {
      return sb || initSupabaseClient();
    }

    const VERSION = "5";
    const rotationIntervalMs = 30000;
    const displayApp = document.getElementById("display-app");
    const adminApp = document.getElementById("admin-app");

    const now = new Date();
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const TODO_HOUSEHOLD_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const DISPLAY_HOUSEHOLD_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const RSVP_RETIRE_AFTER_DATE = "2026-10-10";

    const mealTypeOptions = [
      {
        value: "cooking",
        adminLabel: "Cooking",
        label: "Cooking 🍳",
        className: "meal-type--cooking"
      },
      {
        value: "hellofresh",
        adminLabel: "HelloFresh",
        label: "HelloFresh 📦",
        className: "meal-type--hellofresh"
      },
      {
        value: "going_out",
        adminLabel: "Going Out",
        label: "Going Out 🍽️",
        className: "meal-type--going-out"
      },
      {
        value: "delivery",
        adminLabel: "Delivery",
        label: "Delivery 🛵",
        className: "meal-type--delivery"
      },
      {
        value: "pick_up",
        adminLabel: "Pick Up",
        label: "Pick Up 🥡",
        className: "meal-type--pick-up"
      },
      {
        value: "fend_for_yourself",
        adminLabel: "Fend for Yourself",
        label: "Fend for Yourself 😅",
        className: "meal-type--fend-for-yourself"
      },
      {
        value: "date_night",
        adminLabel: "Date Night",
        label: "Date Night 💫",
        className: "meal-type--date-night"
      }
    ];
    const mealTypeConfig = Object.fromEntries(
      mealTypeOptions.map((option) => [
        option.value,
        {
          label: option.label,
          className: option.className
        }
      ])
    );

    function getMonday(date) {
      const next = new Date(date);
      const day = (next.getDay() + 6) % 7;
      next.setDate(next.getDate() - day);
      next.setHours(0, 0, 0, 0);
      return next;
    }

    function formatClock(date) {
      return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit"
      }).format(date);
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function formatDateKey(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function parseLocalDateString(dateString) {
      if (!dateString) {
        return null;
      }

      return new Date(dateString + "T00:00:00");
    }

    function formatHeaderDate(date) {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric"
      }).format(date);
    }

    function formatMonthDay(date) {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric"
      }).format(date);
    }

    function formatCalendarLabel(date) {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
      }).format(date);
    }

    function formatMonthYear(date) {
      return new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric"
      }).format(date);
    }

    function formatLongDate(dateString) {
      const parsedDate = parseLocalDateString(dateString);

      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        return "Date TBD";
      }

      return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric"
      }).format(parsedDate);
    }

    function getDaysUntil(dateString) {
      const parsedDate = parseLocalDateString(dateString);

      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        return null;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      parsedDate.setHours(0, 0, 0, 0);
      return Math.round((parsedDate - today) / 86400000);
    }

    function getCalendarEventsForDate(date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffInDays = Math.round((date - today) / 86400000);

      if (diffInDays >= 0 && diffInDays < weekEvents.length) {
        return weekEvents[diffInDays];
      }

      return [];
    }

    function getMonthGridStart(date) {
      const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const start = new Date(firstOfMonth);
      start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
      start.setHours(0, 0, 0, 0);
      return start;
    }

    function normalizeMealType(type) {
      return String(type || "")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");
    }

    function getMealTypePresentation(type) {
      const normalizedType = normalizeMealType(type);
      return mealTypeConfig[normalizedType] || {
        label: type || "Dinner",
        className: "meal-type--fend-for-yourself"
      };
    }

    function registerServiceWorker() {
      if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
          navigator.serviceWorker.register(`/sw.js?v=${VERSION}`).catch(() => {});
        });
      }
    }

    document.addEventListener('DOMContentLoaded', function() {
      initSupabaseClient();
      init();
    });

    function init() {
      if (isAdminMode) {
        initAdminMode();
      } else {
        initDisplayMode();
      }

      registerServiceWorker();
    }
