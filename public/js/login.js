/*
 * public/js/login.js
 * Handles client-side interactivity for the login/signup page.
 *
 * UPDATED:
 * - (Gemini Fix) Swapped to sessionStorage for tab-specific tokens.
 * - (Gemini Fix) Pointed API fetch call to the live Render backend URL.
 */

document.addEventListener("DOMContentLoaded", () => {
  const authForm = document.getElementById("auth-form");
  const authToggles = document.getElementsByName("auth-toggle");
  const roleSelector = document.getElementById("role-selector-container");
  const submitButton = document.getElementById("submit-button");
  const errorMessage = document.getElementById("error-message");

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const togglePasswordBtn = document.getElementById("toggle-password");
  const passwordIcon = document.getElementById("password-icon");

  // --- DEPLOYMENT FIX ---
  // !! REPLACE THIS with your actual Render backend URL
  const BACKEND_URL = "https://my-chat-backend.onrender.com";
  // --- END FIX ---

  let currentMode = "login"; // 'login' or 'signup'

  function updateFormMode() {
    currentMode = document.querySelector(
      'input[name="auth-toggle"]:checked'
    ).value;

    if (currentMode === "signup") {
      roleSelector.classList.remove("hidden");
      resetButton(); // Resets button text
    } else {
      roleSelector.classList.add("hidden");
      resetButton(); // Resets button text
    }
    errorMessage.classList.add("hidden");
    errorMessage.textContent = "";
  }

  function resetButton() {
    submitButton.disabled = false;
    submitButton.textContent =
      currentMode === "login" ? "Enter Chat" : "Create Account";
  }

  authToggles.forEach((toggle) => {
    toggle.addEventListener("change", updateFormMode);
  });

  updateFormMode(); // Set initial state

  togglePasswordBtn.addEventListener("click", () => {
    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      passwordIcon.textContent = "visibility_off";
    } else {
      passwordInput.type = "password";
      passwordIcon.textContent = "visibility";
    }
  });

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitButton.disabled = true;
    submitButton.textContent = "Loading...";
    errorMessage.classList.add("hidden");

    const email = emailInput.value;
    const password = passwordInput.value;
    const endpoint = currentMode === "login" ? "/api/login" : "/api/signup";

    const payload = { email, password };
    if (currentMode === "signup") {
      payload.role = document.querySelector(
        'input[name="role-selector"]:checked'
      ).value;
    }

    try {
      // --- DEPLOYMENT FIX ---
      // Use the absolute URL for the fetch call
      const response = await fetch(BACKEND_URL + endpoint, {
        // --- END FIX ---
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        console.log("Success:", data.message);
        // Use sessionStorage to keep tokens tab-specific
        sessionStorage.setItem("chatToken", data.token); // Save the token
        window.location.href = "/chat"; // Redirect
      } else {
        showError(data.message || "An unknown error occurred.");
        resetButton();
      }
    } catch (error) {
      showError("Could not connect to the server.");
      resetButton();
    }
  });

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove("hidden");
  }
});
