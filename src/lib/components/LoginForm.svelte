<script lang="ts">
  let username = $state("");
  let password = $state("");
  let error = $state("");
  let loading = $state(false);

  const canSubmit = $derived(
    username.trim() !== "" && password !== "" && !loading,
  );

  function getNextPath(): string {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") ?? "/";
    const trimmed = next.trim();

    // Prevent open redirect: must start with / and not // or protocol
    if (!trimmed.startsWith("/")) return "/";
    if (trimmed.startsWith("//")) return "/";
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return "/";

    return trimmed;
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    error = "";
    loading = true;

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      if (response.ok) {
        window.location.href = getNextPath();
        return;
      }

      if (response.status === 401) {
        error = "Invalid username or password.";
      } else if (response.status === 429) {
        error = "Too many login attempts. Please wait a moment and try again.";
      } else {
        error = "An unexpected error occurred. Please try again.";
      }
    } catch {
      error = "Unable to reach the server. Please check your connection.";
    } finally {
      loading = false;
    }
  }
</script>

<div class="login-page">
  <div class="login-card">
    <div class="login-header">
      <img
        src="/favicon.png"
        alt=""
        class="login-logo"
        width="48"
        height="48"
      />
      <h1>Rackula</h1>
      <p class="login-subtitle">Sign in to continue</p>
    </div>

    <form onsubmit={handleSubmit} class="login-form" novalidate>
      {#if error}
        <div class="login-error" role="alert">
          {error}
        </div>
      {/if}

      <div class="form-field">
        <label for="username">Username</label>
        <input
          id="username"
          name="username"
          type="text"
          autocomplete="username"
          bind:value={username}
          disabled={loading}
          required
        />
      </div>

      <div class="form-field">
        <label for="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          bind:value={password}
          disabled={loading}
          required
        />
      </div>

      <button type="submit" class="login-button" disabled={!canSubmit}>
        {#if loading}
          Signing in...
        {:else}
          Sign in
        {/if}
      </button>
    </form>
  </div>
</div>

<style>
  .login-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: var(--colour-bg, #282a36);
    font-family: var(--font-sans, system-ui, sans-serif);
    color: var(--colour-text, #f8f8f2);
    padding: var(--space-4, 1rem);
  }

  .login-card {
    width: 100%;
    max-width: 400px;
    background: var(--colour-surface, #343746);
    border: 1px solid var(--colour-border, #44475a);
    border-radius: var(--radius-lg, 0.5rem);
    padding: var(--space-8, 2rem);
  }

  .login-header {
    text-align: center;
    margin-bottom: var(--space-6, 1.5rem);
  }

  .login-logo {
    margin-bottom: var(--space-3, 0.75rem);
  }

  .login-header h1 {
    font-size: var(--font-size-2xl, 1.5rem);
    font-weight: var(--font-weight-bold, 700);
    margin: 0 0 var(--space-1, 0.25rem);
    color: var(--colour-primary, #8be9fd);
  }

  .login-subtitle {
    font-size: var(--font-size-sm, 0.8125rem);
    color: var(--colour-text-muted, #9a9a9a);
    margin: 0;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 1rem);
  }

  .login-error {
    padding: var(--space-3, 0.75rem);
    background: var(--colour-error-bg, rgba(255, 85, 85, 0.1));
    border: 1px solid var(--colour-error, #ff5555);
    border-radius: var(--radius-md, 0.375rem);
    color: var(--colour-error, #ff5555);
    font-size: var(--font-size-sm, 0.8125rem);
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5, 0.375rem);
  }

  .form-field label {
    font-size: var(--font-size-sm, 0.8125rem);
    font-weight: var(--font-weight-medium, 500);
    color: var(--colour-text-muted, #9a9a9a);
  }

  .form-field input {
    padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
    background: var(--colour-bg, #282a36);
    border: 1px solid var(--colour-border, #44475a);
    border-radius: var(--radius-md, 0.375rem);
    color: var(--colour-text, #f8f8f2);
    font-size: var(--font-size-base, 0.875rem);
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }

  .form-field input:focus {
    border-color: var(--colour-border-focus, #ff79c6);
    box-shadow: var(--focus-ring-glow, 0 0 0 2px rgba(255, 121, 198, 0.3));
  }

  .form-field input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .login-button {
    padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
    background: var(--colour-button-primary, #c45b9a);
    color: var(--colour-text-on-primary, #ffffff);
    border: none;
    border-radius: var(--radius-md, 0.375rem);
    font-size: var(--font-size-base, 0.875rem);
    font-weight: var(--font-weight-semibold, 600);
    font-family: inherit;
    cursor: pointer;
    transition: background-color 0.15s;
    margin-top: var(--space-2, 0.5rem);
  }

  .login-button:hover:not(:disabled) {
    background: var(--colour-button-primary-hover, #ff79c6);
  }

  .login-button:focus-visible {
    outline: 2px solid var(--colour-focus-ring, #ff79c6);
    outline-offset: 2px;
  }

  .login-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
