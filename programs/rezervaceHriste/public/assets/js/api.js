/* Shared fetch helper */
const API = {
  csrfToken() {
    const el = document.querySelector('meta[name="csrf-token"]');
    if (el) return el.content;
    // Fallback: read from hidden field in page if present
    const f = document.querySelector('input[name="_csrf"]');
    return f ? f.value : '';
  },

  async post(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrfToken(),
        'Accept': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async get(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    return res.json();
  },
};
