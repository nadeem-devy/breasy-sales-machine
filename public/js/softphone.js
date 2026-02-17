/**
 * Breasy Softphone — Browser-based calling via Twilio Client SDK
 * Uses Twilio.Device for WebRTC voice calls from the browser.
 * In dev mode (no Twilio keys), simulates calls for testing.
 */
const BreasySoftphone = (function () {
  let device = null;
  let activeCall = null;
  let timerInterval = null;
  let callStartTime = null;
  let devMode = false;
  let initialized = false;
  let currentLeadId = null;
  let micStream = null;
  let tunnelBaseUrl = null;
  let currentCallLogId = null;
  let callDurationSecs = 0;

  // ========== UI ==========
  function injectPanel() {
    if (document.getElementById('sp-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'sp-panel';
    panel.className = 'sp-panel sp-hidden';
    panel.innerHTML = `
      <div class="sp-header">
        <span class="sp-title">Breasy Phone</span>
        <button class="sp-close" onclick="BreasySoftphone.hangup()" title="Close">&times;</button>
      </div>
      <div class="sp-caller" id="sp-caller">—</div>
      <div class="sp-status" id="sp-status">Idle</div>
      <div class="sp-timer" id="sp-timer">00:00</div>
      <div class="sp-controls" id="sp-controls">
        <button class="sp-btn sp-btn-mute" id="sp-mute-btn" onclick="BreasySoftphone.toggleMute()" title="Mute">
          <span id="sp-mute-icon">&#128263;</span>
        </button>
        <button class="sp-btn sp-btn-hangup" onclick="BreasySoftphone.hangup()" title="Hang Up">
          &#128383;
        </button>
      </div>
      <div class="sp-incoming-controls" id="sp-incoming-controls" style="display:none;">
        <button class="sp-btn sp-btn-accept" onclick="BreasySoftphone.acceptIncoming()">Accept</button>
        <button class="sp-btn sp-btn-reject" onclick="BreasySoftphone.rejectIncoming()">Decline</button>
      </div>
      <div class="sp-outcome" id="sp-outcome" style="display:none;">
        <div class="sp-outcome-title">How did the call go?</div>
        <div class="sp-outcome-grid" id="sp-outcome-grid">
          <button class="sp-outcome-btn sp-outcome-qualified" data-outcome="qualified">Qualified</button>
          <button class="sp-outcome-btn sp-outcome-callback" data-outcome="callback">Callback</button>
          <button class="sp-outcome-btn sp-outcome-not-interested" data-outcome="not_interested">Not Interested</button>
          <button class="sp-outcome-btn sp-outcome-no-answer" data-outcome="no_answer">No Answer</button>
          <button class="sp-outcome-btn sp-outcome-voicemail" data-outcome="voicemail">Voicemail</button>
          <button class="sp-outcome-btn sp-outcome-wrong-number" data-outcome="wrong_number">Wrong Number</button>
          <button class="sp-outcome-btn sp-outcome-busy" data-outcome="busy">Busy</button>
          <button class="sp-outcome-btn sp-outcome-gatekeeper" data-outcome="gatekeeper">Gatekeeper</button>
        </div>
        <textarea class="sp-outcome-notes" id="sp-outcome-notes" placeholder="Notes (optional)..." rows="2"></textarea>
        <button class="sp-outcome-skip" onclick="BreasySoftphone.skipOutcome()">Skip</button>
      </div>
    `;
    document.body.appendChild(panel);

    // Wire up outcome buttons
    panel.querySelectorAll('.sp-outcome-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        BreasySoftphone.submitOutcome(btn.dataset.outcome);
      });
    });
  }

  function showPanel(state) {
    const panel = document.getElementById('sp-panel');
    if (!panel) return;
    panel.classList.remove('sp-hidden', 'sp-connecting', 'sp-active', 'sp-incoming');
    if (state) panel.classList.add('sp-' + state);
  }

  function hidePanel() {
    const panel = document.getElementById('sp-panel');
    if (panel) panel.classList.add('sp-hidden');
    stopTimer();
  }

  function setStatus(text) {
    const el = document.getElementById('sp-status');
    if (el) el.textContent = text;
  }

  function setCaller(text) {
    const el = document.getElementById('sp-caller');
    if (el) el.textContent = text;
  }

  function showControls(type) {
    const main = document.getElementById('sp-controls');
    const incoming = document.getElementById('sp-incoming-controls');
    const outcome = document.getElementById('sp-outcome');
    if (main) main.style.display = type === 'call' ? '' : 'none';
    if (incoming) incoming.style.display = type === 'incoming' ? '' : 'none';
    if (outcome) outcome.style.display = type === 'outcome' ? '' : 'none';
  }

  // ========== Timer ==========
  function startTimer() {
    callStartTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    const el = document.getElementById('sp-timer');
    if (el) el.textContent = '00:00';
  }

  function updateTimer() {
    if (!callStartTime) return;
    const secs = Math.floor((Date.now() - callStartTime) / 1000);
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    const el = document.getElementById('sp-timer');
    if (el) el.textContent = `${m}:${s}`;
  }

  // ========== Init ==========
  async function init() {
    if (initialized) return;
    injectPanel();

    try {
      const res = await fetch('/api/leads/voice-token');
      const data = await res.json();

      if (data.dev_mode || !data.token) {
        devMode = true;
        console.log('[Softphone] Dev mode — calls will be simulated' + (data.reason ? ': ' + data.reason : ''));
        initialized = true;
        return;
      }

      // Store base URL for tunnel check
      tunnelBaseUrl = data.baseUrl || null;

      // Check if Twilio SDK is loaded
      if (typeof Twilio === 'undefined' || !Twilio.Device) {
        console.warn('[Softphone] Twilio SDK not loaded — falling back to dev mode');
        devMode = true;
        initialized = true;
        return;
      }

      // Production: initialize Twilio Device
      device = new Twilio.Device(data.token, {
        closeProtection: true,
        codecPreferences: ['opus', 'pcmu'],
      });

      device.on('registered', () => console.log('[Softphone] Device registered'));

      device.on('incoming', (call) => handleIncomingCall(call));

      device.on('tokenWillExpire', async () => {
        console.log('[Softphone] Token expiring, refreshing...');
        try {
          const r = await fetch('/api/leads/voice-token');
          const d = await r.json();
          if (d.token) device.updateToken(d.token);
        } catch (e) { console.error('[Softphone] Token refresh failed:', e); }
      });

      device.on('error', (err) => {
        console.error('[Softphone] Device error:', err);
        const errMsg = err.message || err.code || 'Unknown error';
        if (errMsg.includes('Application not found') || errMsg.includes('31002')) {
          setStatus('TwiML App not configured');
        } else if (errMsg.includes('Authentication') || errMsg.includes('31201')) {
          setStatus('Twilio auth failed');
        } else {
          setStatus('Error: ' + errMsg.substring(0, 40));
        }
        setTimeout(() => setStatus('Idle'), 5000);
      });

      await device.register();

      // Set up audio input device
      if (device.audio) {
        try {
          await device.audio.setInputDevice('default');
          console.log('[Softphone] Audio input set to default mic');
        } catch (e) {
          console.warn('[Softphone] Could not set audio input:', e.message);
        }

        device.audio.on('inputVolume', () => {}); // keeps input alive
      }

      initialized = true;
      console.log('[Softphone] Initialized with Twilio Device');
    } catch (e) {
      console.error('[Softphone] Init error:', e);
      devMode = true;
      initialized = true;
    }
  }

  // ========== Make Call ==========
  async function makeCall(leadId) {
    if (!initialized) await init();
    currentLeadId = leadId;

    // Fetch lead info for display
    let callerName = `Lead #${leadId}`;
    try {
      const r = await fetch(`/api/leads/${leadId}`);
      const d = await r.json();
      if (d.lead) {
        callerName = `${d.lead.first_name || ''} ${d.lead.last_name || ''}`.trim() || callerName;
        if (d.lead.company_name) callerName += ` (${d.lead.company_name})`;
      }
    } catch (e) {}

    setCaller(callerName);
    setStatus('Connecting...');
    showControls('call');
    showPanel('connecting');

    if (devMode) {
      // Dev mode: simulate the call
      try {
        const r = await fetch(`/api/leads/${leadId}/call-browser`, { method: 'POST' });
        const d = await r.json();
        if (d.callLogId) currentCallLogId = d.callLogId;
      } catch (e) {}
      setTimeout(() => {
        setStatus('Connected');
        showPanel('active');
        startTimer();
      }, 1500);
      return;
    }

    // Check if tunnel/base URL is reachable (prevents cryptic "application error")
    if (tunnelBaseUrl && !tunnelBaseUrl.includes('localhost')) {
      try {
        setStatus('Checking tunnel...');
        const check = await fetch(tunnelBaseUrl + '/health', { mode: 'no-cors', signal: AbortSignal.timeout(5000) });
      } catch (e) {
        console.error('[Softphone] Tunnel unreachable:', tunnelBaseUrl);
        setStatus('Tunnel offline — start ngrok first');
        setTimeout(hidePanel, 4000);
        return;
      }
    }

    // Production: connect via Twilio Device
    try {
      // Acquire mic and keep the stream alive during the call
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        console.log('[Softphone] Mic acquired:', micStream.getAudioTracks()[0].label);
      } catch (micErr) {
        console.error('[Softphone] Mic access denied:', micErr);
        setStatus('Mic access denied');
        setTimeout(hidePanel, 3000);
        return;
      }

      activeCall = await device.connect({
        params: { leadId: String(leadId) },
      });

      console.log('[Softphone] Call connecting...');
      console.log('[Softphone] Call isMuted:', activeCall.isMuted());

      // Make sure call is NOT muted
      if (activeCall.isMuted()) {
        activeCall.mute(false);
        console.log('[Softphone] Unmuted call');
      }

      activeCall.on('accept', () => {
        console.log('[Softphone] Call accepted / connected');
        console.log('[Softphone] Muted?', activeCall.isMuted());

        // Ensure not muted after accept
        if (activeCall.isMuted()) {
          activeCall.mute(false);
        }

        setStatus('Connected');
        showPanel('active');
        startTimer();
      });

      activeCall.on('ringing', () => {
        console.log('[Softphone] Ringing...');
        setStatus('Ringing...');
      });

      activeCall.on('disconnect', () => {
        releaseMic();
        endCall();
      });
      activeCall.on('cancel', () => {
        releaseMic();
        endCall();
      });
      activeCall.on('error', (err) => {
        console.error('[Softphone] Call error:', err);
        releaseMic();
        const errMsg = err.message || err.code || 'Unknown';
        if (errMsg.includes('31005') || errMsg.includes('Application')) {
          setStatus('TwiML App error — check Twilio config');
        } else {
          setStatus('Call failed: ' + errMsg.substring(0, 40));
        }
        setTimeout(hidePanel, 4000);
      });

      activeCall.on('warning', (name, data) => {
        console.warn('[Softphone] Warning:', name, data);
      });

      activeCall.on('warning-cleared', (name) => {
        console.log('[Softphone] Warning cleared:', name);
      });
    } catch (e) {
      console.error('[Softphone] Connect error:', e);
      releaseMic();
      setStatus('Connect failed: ' + (e.message || 'unknown').substring(0, 40));
      setTimeout(hidePanel, 4000);
    }
  }

  function releaseMic() {
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
  }

  // ========== Incoming Call ==========
  function handleIncomingCall(call) {
    activeCall = call;
    const from = call.parameters.From || 'Unknown';

    // Try to identify the caller
    setCaller(from);
    setStatus('Incoming Call...');
    showControls('incoming');
    showPanel('incoming');

    call.on('cancel', () => endCall());
    call.on('disconnect', () => endCall());
  }

  function acceptIncoming() {
    if (!activeCall) return;
    activeCall.accept();
    setStatus('Connected');
    showControls('call');
    showPanel('active');
    startTimer();
  }

  function rejectIncoming() {
    if (!activeCall) return;
    activeCall.reject();
    endCall();
  }

  // ========== Controls ==========
  function toggleMute() {
    if (devMode) {
      const icon = document.getElementById('sp-mute-icon');
      const btn = document.getElementById('sp-mute-btn');
      const isMuted = btn.classList.toggle('muted');
      icon.innerHTML = isMuted ? '&#128264;' : '&#128263;';
      return;
    }
    if (!activeCall) return;
    const muted = !activeCall.isMuted();
    activeCall.mute(muted);
    console.log('[Softphone] Mute toggled:', muted);
    const icon = document.getElementById('sp-mute-icon');
    const btn = document.getElementById('sp-mute-btn');
    if (muted) {
      btn.classList.add('muted');
      icon.innerHTML = '&#128264;';
    } else {
      btn.classList.remove('muted');
      icon.innerHTML = '&#128263;';
    }
  }

  function hangup() {
    if (devMode) {
      endCall();
      return;
    }
    if (activeCall) {
      activeCall.disconnect();
    } else {
      endCall();
    }
    releaseMic();
  }

  function endCall() {
    activeCall = null;
    // Capture duration before stopping timer
    if (callStartTime) {
      callDurationSecs = Math.floor((Date.now() - callStartTime) / 1000);
    }
    stopTimer();

    const btn = document.getElementById('sp-mute-btn');
    if (btn) btn.classList.remove('muted');
    const icon = document.getElementById('sp-mute-icon');
    if (icon) icon.innerHTML = '&#128263;';

    // Show outcome form if we have a lead
    if (currentLeadId) {
      setStatus('Call ended');
      showControls('outcome');
      showPanel('active');
      const notesEl = document.getElementById('sp-outcome-notes');
      if (notesEl) notesEl.value = '';
    } else {
      setStatus('Call ended');
      showControls('call');
      setTimeout(hidePanel, 2000);
    }
  }

  // ========== Outcome ==========
  async function submitOutcome(outcome) {
    if (!currentLeadId) { closeOutcome(); return; }

    // Disable buttons while submitting
    const btns = document.querySelectorAll('.sp-outcome-btn');
    btns.forEach(b => b.disabled = true);
    setStatus('Saving...');

    const notes = (document.getElementById('sp-outcome-notes')?.value || '').trim();

    try {
      await fetch(`/api/leads/${currentLeadId}/call-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          notes,
          duration: callDurationSecs,
          callLogId: currentCallLogId,
        }),
      });
      setStatus('Saved!');
    } catch (e) {
      console.error('[Softphone] Outcome save error:', e);
      setStatus('Save failed');
    }

    setTimeout(closeOutcome, 1000);
  }

  function skipOutcome() {
    closeOutcome();
  }

  function closeOutcome() {
    currentLeadId = null;
    currentCallLogId = null;
    callDurationSecs = 0;
    showControls('call');
    hidePanel();
    // Refresh lead detail page if we're on one
    if (typeof loadLead === 'function') {
      try { loadLead(); } catch(e) {}
    }
  }

  // ========== Public API ==========
  return {
    init,
    makeCall,
    hangup,
    toggleMute,
    acceptIncoming,
    rejectIncoming,
    submitOutcome,
    skipOutcome,
  };
})();

// Auto-init on page load
document.addEventListener('DOMContentLoaded', () => BreasySoftphone.init());
