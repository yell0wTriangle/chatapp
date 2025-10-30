/*
 * public/js/profile.js
 *
 * UPDATED:
 * - (Gemini Fix) Swapped to sessionStorage for tab-specific tokens.
 * - (Gemini Fix) Pointed WebSocket to the live Render backend URL.
 */
document.addEventListener("DOMContentLoaded", () => {
  // 1. Get Token and User Info
  // Read from sessionStorage
  const token = sessionStorage.getItem("chatToken");
  if (!token) {
    window.location.href = "/"; // Redirect to login if no token
    return;
  }

  let userInfo;
  try {
    userInfo = JSON.parse(atob(token));
  } catch (e) {
    console.error("Invalid token:", e);
    // Remove from sessionStorage
    sessionStorage.removeItem("chatToken");
    window.location.href = "/";
    return;
  }

  // 2. Get DOM Elements
  const nameInput = document.getElementById("name-input");
  const emailInput = document.getElementById("email-input");
  const roleBadge = document.getElementById("role-badge");
  const saveButton = document.getElementById("save-button");
  const cancelButton = document.getElementById("cancel-button");
  const logoutButton = document.getElementById("logout-button");
  const avatarSmall = document.getElementById("user-avatar-small");
  const avatarLarge = document.getElementById("user-avatar-large");
  const userNameHeader = document.getElementById("user-name-header");
  const userEmailSubheader = document.getElementById("user-email-subheader");

  // --- DEPLOYMENT FIX ---
  // !! REPLACE THIS with your actual Render backend URL
  const BACKEND_HOST = "chatapp-9gjc.onrender.com";
  // --- END FIX ---

  // 3. Populate Form Function
  function populateForm() {
    nameInput.value = userInfo.name || "";
    emailInput.value = userInfo.email;
    roleBadge.textContent = userInfo.role;
    userNameHeader.textContent = userInfo.name;
    userEmailSubheader.textContent = userInfo.email;

    const avatarUrl = `url('${userInfo.avatar}')`;
    avatarSmall.style.backgroundImage = avatarUrl;
    avatarLarge.style.backgroundImage = avatarUrl;
  }

  populateForm(); // Initial population

  // 4. "Cancel" Button Logic
  cancelButton.addEventListener("click", () => {
    populateForm(); // Just resets fields to original token data
  });

  // 5. "Logout" Button Logic
  logoutButton.addEventListener("click", () => {
    // Remove from sessionStorage
    sessionStorage.removeItem("chatToken");
    window.location.href = "/";
  });

  // 6. "Save Changes" Button Logic (The core part)
  saveButton.addEventListener("click", async () => {
    const newName = nameInput.value;

    if (newName === userInfo.name) {
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    // --- DEPLOYMENT FIX ---
    // Use the new backend host for the WebSocket connection
    const socket = new WebSocket(
      `wss://${BACKEND_HOST}?token=${token}&purpose=profile`
    );
    // --- END FIX ---

    socket.onopen = () => {
      // Once connected, send the profile update
      socket.send(
        JSON.stringify({
          type: "profileUpdate",
          newName: newName,
        })
      );
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "profileUpdateSuccess") {
        // 1. Save the new token (which now has the new name)
        // Set in sessionStorage
        sessionStorage.setItem("chatToken", data.newToken);
        userInfo = JSON.parse(atob(data.newToken)); // Update local user info

        // 2. Update the form
        populateForm();

        // 3. Give user feedback
        saveButton.textContent = "Saved!";
        setTimeout(() => {
          saveButton.disabled = false;
          saveButton.textContent = "Save Changes";
        }, 2000);

        // 4. Close this temporary connection
        socket.close();
      }
    };

    socket.onerror = (error) => {
      console.error("Profile update WebSocket error:", error);
      saveButton.disabled = false;
      saveButton.textContent = "Save Changes";
      // TODO: Show an error message to the user
    };
  });
});
