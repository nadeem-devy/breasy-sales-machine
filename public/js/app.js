// ============================================
// BREASY SALES MACHINE — Frontend JS
// ============================================

// ============================================
// Theme Toggle (Dark / Light)
// ============================================
function getTheme() {
  return localStorage.getItem('breasy-theme') || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('breasy-theme', theme);
  updateThemeUI(theme);
}

function updateThemeUI(theme) {
  const icon = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (!icon || !label) return;
  if (theme === 'light') {
    icon.innerHTML = '&#9728;';   // sun
    label.textContent = 'Dark Mode';
  } else {
    icon.innerHTML = '&#9790;';   // moon
    label.textContent = 'Light Mode';
  }
}

function toggleTheme() {
  const current = getTheme();
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// Highlight active nav link + init theme UI
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (path === href || (href !== '/' && path.startsWith(href))) {
      link.classList.add('active');
    }
  });

  // Set the correct toggle label on load
  updateThemeUI(getTheme());
});

// System pause/resume toggle
async function toggleSystem() {
  try {
    const res = await fetch('/api/dashboard/settings');
    const settings = await res.json();
    const paused = settings.find(s => s.key === 'system_paused');
    const isPaused = paused && paused.value === '1';

    if (isPaused) {
      await fetch('/api/dashboard/resume-system', { method: 'POST' });
      document.getElementById('pauseBtn').textContent = 'Pause System';
      document.getElementById('pauseBtn').className = 'btn btn-danger btn-sm';
    } else {
      if (!confirm('Pause ALL outreach? No messages will be sent until resumed.')) return;
      await fetch('/api/dashboard/pause-system', { method: 'POST' });
      document.getElementById('pauseBtn').textContent = 'Resume System';
      document.getElementById('pauseBtn').className = 'btn btn-success btn-sm';
    }
  } catch (e) {
    console.error('Toggle error:', e);
  }
}

// Check system status on load
(async function checkSystemStatus() {
  try {
    const res = await fetch('/api/dashboard/settings');
    const settings = await res.json();
    const paused = settings.find(s => s.key === 'system_paused');
    if (paused && paused.value === '1') {
      document.getElementById('pauseBtn').textContent = 'Resume System';
      document.getElementById('pauseBtn').className = 'btn btn-success btn-sm';
    }
  } catch (e) {}
})();

// ============================================
// Real-time Notifications (SSE)
// ============================================
(function initNotifications() {
  // Create toast container
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  // Connect to SSE stream
  const evtSource = new EventSource('/api/notifications/stream');

  evtSource.addEventListener('ai-call-ended', (e) => {
    try {
      const data = JSON.parse(e.data);
      showAICallToast(data);
      // Also try browser notification
      sendBrowserNotification(data);
    } catch (err) {
      console.error('[Notify] Parse error:', err);
    }
  });

  evtSource.addEventListener('sms-received', (e) => {
    try {
      const data = JSON.parse(e.data);
      showSmsToast(data);
      sendSmsBrowserNotification(data);
    } catch (err) {
      console.error('[Notify] SMS parse error:', err);
    }
  });

  evtSource.addEventListener('connected', () => {
    console.log('[Notify] SSE connected');
  });

  evtSource.onerror = () => {
    console.warn('[Notify] SSE connection lost, will auto-reconnect');
  };

  // Request browser notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  function showAICallToast(data) {
    const toast = document.createElement('div');
    toast.className = 'toast';

    const outcomeTag = data.outcome === 'qualified'
      ? '<span class="tag tag-green">Qualified</span>'
      : data.outcome === 'callback'
        ? '<span class="tag tag-yellow">Callback</span>'
        : data.outcome === 'no_answer'
          ? '<span class="tag tag-red">No Answer</span>'
          : `<span class="tag">${data.outcome || 'Unknown'}</span>`;

    const interestTag = data.interestLevel && data.interestLevel !== 'none'
      ? `<span class="tag tag-yellow">${data.interestLevel} interest</span>`
      : '';

    const extras = [];
    if (data.wantsMeeting) extras.push('Wants meeting');
    if (data.wantsApp) extras.push('Wants app');
    const extrasHtml = extras.length
      ? `<br><strong>${extras.join(' | ')}</strong>`
      : '';

    const durationMin = data.duration ? `${Math.floor(data.duration / 60)}:${String(data.duration % 60).padStart(2, '0')}` : '0:00';

    toast.innerHTML = `
      <div class="toast-header">
        <span class="toast-icon">&#128222;</span>
        <span class="toast-title">AI Call Finished</span>
        <button class="toast-close" onclick="this.closest('.toast').remove()">&times;</button>
      </div>
      <div class="toast-body">
        <strong>${data.leadName || 'Unknown Lead'}</strong> (${data.phone || '?'})<br>
        ${data.summary || 'No summary available.'}
        ${extrasHtml}
      </div>
      <div class="toast-meta">
        ${outcomeTag}
        ${interestTag}
        <span>${durationMin}</span>
      </div>
    `;

    // Click toast to navigate to lead detail
    toast.addEventListener('click', (e) => {
      if (e.target.classList.contains('toast-close')) return;
      if (data.leadId) window.location.href = `/lead/${data.leadId}`;
    });

    container.appendChild(toast);

    // Auto-dismiss after 15 seconds
    setTimeout(() => {
      toast.classList.add('toast-leaving');
      setTimeout(() => toast.remove(), 300);
    }, 15000);
  }

  function sendBrowserNotification(data) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const n = new Notification('AI Call Finished', {
      body: `${data.leadName || 'Lead'}: ${data.outcome || 'completed'} (${data.duration || 0}s)\n${data.summary || ''}`.substring(0, 200),
      icon: '/favicon.ico',
      tag: `ai-call-${data.leadId}`,
    });

    n.onclick = () => {
      window.focus();
      if (data.leadId) window.location.href = `/lead/${data.leadId}`;
    };
  }

  function showSmsToast(data) {
    const toast = document.createElement('div');
    toast.className = 'toast';

    toast.innerHTML = `
      <div class="toast-header">
        <span class="toast-icon">&#128172;</span>
        <span class="toast-title">New SMS Received</span>
        <button class="toast-close" onclick="this.closest('.toast').remove()">&times;</button>
      </div>
      <div class="toast-body">
        <strong>${data.leadName || 'Unknown'}</strong>${data.company ? ' — ' + data.company : ''}<br>
        <span style="color:var(--text-dim);font-size:12px;">${data.phone || ''}</span><br>
        <div style="margin-top:6px;padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;font-style:italic;">"${data.message || ''}"</div>
      </div>
      <div class="toast-meta">
        <span class="tag tag-green">SMS Reply</span>
        <span style="font-size:11px;color:var(--text-dim);">just now</span>
      </div>
    `;

    toast.addEventListener('click', (e) => {
      if (e.target.classList.contains('toast-close')) return;
      if (data.leadId) window.location.href = `/lead/${data.leadId}`;
    });

    container.appendChild(toast);

    // Play a subtle notification sound
    try { new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkYuEenFkYGV0g46VkYd9cGRiZ3V+ipGRioB0aGRpcH2IkJGMgXZqZGhtdn+Ij5CLgXdsamdsdH2GjY+Lg3lvamtwe4WMjouEe3Fsbm93gYmNi4V9dW5ucHR8g4mLiYR+eHJxcnV6gISHh4WCfnl2dnZ3e3+DhYWEgn98eXd4eHp+gYOEg4KAfnx6enp6fX+BgoKBgX99fHt7fH1/gIGBgIB/fn18fHx9fn+AgICAf39+fX19fX5/f4CAgH9/f359fX1+fn+AgIB/f39+fn5+fn5/f39/f39/f39+fn5+f39/f39/f39/f35+fn5+f39/f39/f39/fn5+fn5/f39/f39/f39+fn5+fn9/f39/f39/f35+fn5+f39/fw==').play(); } catch(e) {}

    setTimeout(() => {
      toast.classList.add('toast-leaving');
      setTimeout(() => toast.remove(), 300);
    }, 20000);
  }

  function sendSmsBrowserNotification(data) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const n = new Notification('New SMS from ' + (data.leadName || data.phone || 'Lead'), {
      body: data.message ? data.message.substring(0, 200) : 'New message received',
      icon: '/favicon.ico',
      tag: `sms-${data.leadId}-${Date.now()}`,
    });

    n.onclick = () => {
      window.focus();
      if (data.leadId) window.location.href = `/lead/${data.leadId}`;
    };
  }
})();
