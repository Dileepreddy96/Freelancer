const API_BASE = 'http://localhost:3000/api';

// ── App State ─────────────────────────────────────────────────────────────────
let currentUser = null;
let loginRole = 'poster';
let registerRole = 'poster';
let activeContact = null;

// Messages remain local for simplicity in this demo unless backend endpoints are added
function getMessages() { return JSON.parse(localStorage.getItem('fl_messages') || '{}'); }
function saveMessages(m) { localStorage.setItem('fl_messages', JSON.stringify(m)); }
function convKey(a, b) { return [a, b].sort().join('::'); }

// ── API Helpers ───────────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
    try {
        const headers = {};
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }
        const res = await fetch(`${API_BASE}${endpoint}`, { headers, ...options });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'API Error');
        }
        return await res.json();
    } catch (err) {
        if (err instanceof TypeError && err.message === 'Failed to fetch') {
            showToast('Offline: Unable to connect to server.', 'error');
            throw new Error('Server offline');
        } else {
            showToast(err.message, 'error');
            throw err;
        }
    }
}

// ── DOM shortcuts ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const views = () => document.querySelectorAll('.view');

// ── Navigation ────────────────────────────────────────────────────────────────
function navigateTo(route) {
    views().forEach(v => {
        v.id === `view-${route}` ? (v.classList.remove('hidden'), v.classList.add('active'))
            : (v.classList.add('hidden'), v.classList.remove('active'));
    });

    const isAuth = route === 'auth' || route === 'landing';
    $('nav-unauth').classList.toggle('hidden', !isAuth || route === 'auth');
    $('nav-poster').classList.add('hidden');
    $('nav-worker').classList.add('hidden');

    if (!isAuth && currentUser) {
        if (currentUser.role === 'poster') $('nav-poster').classList.remove('hidden');
        else $('nav-worker').classList.remove('hidden');
    }

    document.querySelectorAll('.nav-link').forEach(l => {
        l.classList.toggle('active-link', l.dataset.route === route);
    });
}

// ── Role UI helpers ───────────────────────────────────────────────────────────
function setLoginRole(role) {
    loginRole = role;
    $('login-tab-poster').classList.toggle('active', role === 'poster');
    $('login-tab-worker').classList.toggle('active', role === 'worker');
    $('login-submit-btn').textContent = role === 'poster' ? 'Login as Job Poster' : 'Login as Worker';
    $('preview-poster').classList.toggle('active', role === 'poster');
    $('preview-worker').classList.toggle('active', role === 'worker');
}

function setRegisterRole(role) {
    registerRole = role;
    $('reg-tab-poster').classList.toggle('active', role === 'poster');
    $('reg-tab-worker').classList.toggle('active', role === 'worker');
    $('worker-fields').classList.toggle('hidden', role !== 'worker');
    $('poster-fields').classList.toggle('hidden', role !== 'poster');
    $('reg-submit-btn').textContent = role === 'poster' ? 'Create Job Poster Account' : 'Create Worker Account';
    $('preview-poster').classList.toggle('active', role === 'poster');
    $('preview-worker').classList.toggle('active', role === 'worker');
}

// ── Auth: Login ───────────────────────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const username = $('login-username').value.trim();
    const password = $('login-password').value;

    try {
        const user = await apiFetch('/login', {
            method: 'POST',
            body: JSON.stringify({ username, password, role: loginRole })
        });

        currentUser = user;
        localStorage.setItem('fl_session', username);
        onLogin();
    } catch (err) {
        // Handled by apiFetch toast
    }
}

// ── Auth: Register ────────────────────────────────────────────────────────────
async function handleRegister(e) {
    e.preventDefault();
    if ($('reg-password').value !== $('reg-password-confirm').value)
        return showToast('Passwords do not match!', 'error');

    const formData = new FormData();
    formData.append('username', $('reg-username').value.trim());
    formData.append('password', $('reg-password').value);
    formData.append('name', $('reg-name').value);
    formData.append('email', $('reg-email').value);
    formData.append('number', $('reg-number').value);
    formData.append('role', registerRole);

    if (registerRole === 'worker') {
        formData.append('study', $('reg-study').value);
        formData.append('wage', $('reg-wage').value);
        formData.append('skills', $('reg-skills').value);
        const resumeFile = $('reg-resume').files[0];
        if (resumeFile) formData.append('resume', resumeFile);
    } else {
        formData.append('company', $('reg-company').value);
        formData.append('website', $('reg-website').value);
    }

    try {
        const user = await apiFetch('/register', {
            method: 'POST',
            body: formData // Using FormData for file upload
        });

        currentUser = user;
        localStorage.setItem('fl_session', user.username);
        onLogin();
        showToast('Account created successfully! Welcome 🎉', 'success');
    } catch (err) {
        // Handled by apiFetch
    }
}

function onLogin() {
    updateProfileUI();
    updateDashboard();
    navigateTo('home');
    $('login-form').reset();
    $('register-form').reset();
}

function logout() {
    currentUser = null;
    localStorage.removeItem('fl_session');
    navigateTo('landing');
}

async function checkSession() {
    const saved = localStorage.getItem('fl_session');
    if (saved) {
        try {
            currentUser = await apiFetch(`/users/${saved}`);
            updateProfileUI();
            updateDashboard();
            navigateTo('home');
            return;
        } catch (err) {
            localStorage.removeItem('fl_session');
        }
    }
    navigateTo('landing');
}

function toggleAuthView(view) {
    $('login-container').classList.toggle('hidden', view !== 'login');
    $('register-container').classList.toggle('hidden', view !== 'register');
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function updateDashboard() {
    if (!currentUser) return;

    // Refresh user data (for wallet, streaks, etc)
    try {
        currentUser = await apiFetch(`/users/${currentUser.username}`);
    } catch (e) { }

    const firstName = currentUser.name.split(' ')[0];
    $('home-user-name').textContent = firstName;

    const roleTag = $('home-role-tag');
    roleTag.textContent = currentUser.role === 'poster' ? '🏢 Job Poster' : '💼 Worker';
    roleTag.className = 'inline-role-tag ' + (currentUser.role === 'poster' ? 'tag-poster' : 'tag-worker');

    const homeBtn = $('home-action-btn');

    try {
        const allJobs = await apiFetch('/jobs').catch(() => []);
        const allBids = await apiFetch('/bids').catch(() => []);

        if (currentUser.role === 'poster') {
            $('poster-stats').classList.remove('hidden');
            $('worker-stats').classList.add('hidden');
            homeBtn.textContent = '+ Post a Job';
            homeBtn.onclick = () => navigateTo('post-job');

            const myJobs = allJobs.filter(j => j.poster_username === currentUser.username);
            $('stat-active-jobs').textContent = myJobs.filter(j => j.status === 'Open').length;
            $('stat-bids-received').textContent = allBids.filter(b => myJobs.some(j => j.id === b.job_id)).length;
            $('stat-jobs-completed').textContent = myJobs.filter(j => j.status === 'Completed').length;

            $('activity-list').innerHTML = myJobs.length
                ? myJobs.slice(-3).map(j => `<li>📢 You posted "<strong>${j.title}</strong>"</li>`).join('')
                : '<li>No activity yet. Post your first job!</li>';
        } else {
            $('worker-stats').classList.remove('hidden');
            $('poster-stats').classList.add('hidden');
            homeBtn.textContent = '🔍 Browse Jobs';
            homeBtn.onclick = () => navigateTo('jobs');

            const myBids = allBids.filter(b => b.worker_username === currentUser.username);
            $('stat-active-bids').textContent = myBids.length;
            $('stat-jobs-won').textContent = myBids.filter(b => b.status === 'Accepted').length;
            $('stat-earned').textContent = `₹${currentUser.wallet_balance || 0}`;

            $('activity-list').innerHTML = myBids.length
                ? myBids.slice(-3).map(b => `<li>✅ You bid on "<strong>${b.job_title}</strong>" — ₹${b.total}</li>`).join('')
                : '<li>No activity yet. Browse jobs and place a bid!</li>';
        }
    } catch (e) {
        console.error(e);
    }
}

// ── Profile ───────────────────────────────────────────────────────────────────
function updateProfileUI() {
    if (!currentUser) return;
    $('profile-name').textContent = currentUser.name;
    $('profile-email').textContent = currentUser.email;
    $('profile-email-detail').textContent = currentUser.email;
    $('profile-phone').textContent = currentUser.number || '—';
    $('profile-initials').textContent = currentUser.name.charAt(0).toUpperCase();

    // Sidebar update
    if ($('sidebar-avatar')) {
        $('sidebar-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
        $('sidebar-email').textContent = currentUser.email;
    }

    const badge = $('profile-role-badge');
    badge.textContent = currentUser.role === 'poster' ? '🏢 Job Poster' : '💼 Worker';
    badge.className = 'role-badge ' + (currentUser.role === 'poster' ? 'role-poster' : 'role-worker');

    // Wallet
    $('profile-wallet').textContent = currentUser.wallet_balance || 0;
    if (currentUser.role === 'worker') {
        $('btn-withdraw').style.display = 'inline-block';
        $('btn-add-funds').style.display = 'none';
    } else {
        $('btn-add-funds').style.display = 'inline-block';
        $('btn-withdraw').style.display = 'none';
    }

    if (currentUser.role === 'worker') {
        $('pd-study-group').classList.remove('hidden');
        $('pd-wage-group').classList.remove('hidden');
        $('pd-skills-group').classList.remove('hidden');
        $('pd-company-group').classList.add('hidden');
        $('pd-website-group').classList.add('hidden');
        $('pd-gamification-group').style.display = 'block';

        $('profile-study').textContent = currentUser.study || '—';
        $('profile-wage').textContent = currentUser.wage ? `₹${currentUser.wage}/hr` : '—';
        $('profile-skills').innerHTML = (currentUser.skills || []).map(s => `<span class="skill-tag">${s}</span>`).join('');

        // Gamification
        $('profile-streak').textContent = currentUser.streak || 0;
        const badges = currentUser.badges || [];
        $('profile-badges').innerHTML = badges.length ? badges.map(b => `<span class="skill-tag" style="background:#fbbf24;color:#000;">🏆 ${b}</span>`).join('') : '<small>No badges yet</small>';

    } else {
        $('pd-study-group').classList.add('hidden');
        $('pd-wage-group').classList.add('hidden');
        $('pd-skills-group').classList.add('hidden');
        $('pd-gamification-group').style.display = 'none';
        $('pd-company-group').classList.remove('hidden');
        $('pd-website-group').classList.remove('hidden');
        $('profile-company').textContent = currentUser.company || '—';
        $('profile-website').textContent = currentUser.website || '—';
    }
}

// ── Jobs: Render (Worker Browse) ──────────────────────────────────────────────
async function renderJobs(filter = '') {
    try {
        const jobs = await apiFetch('/jobs');
        const openJobs = jobs.filter(j => j.status === 'Open' && j.poster_username !== currentUser?.username);

        const filtered = openJobs.filter(j => {
            if (!filter) return true;
            const q = filter.toLowerCase();
            return j.title.toLowerCase().includes(q) || (j.desc_text || '').toLowerCase().includes(q) || (j.skills || []).join(' ').toLowerCase().includes(q);
        });

        $('jobs-container').innerHTML = filtered.length ? filtered.map(job => {
            const ago = timeAgo(job.posted_at);
            return `
            <div class="job-card">
                <div class="job-info">
                    <div class="job-card-top">
                        <h3>${job.title}</h3>
                        <span class="category-tag">${job.category}</span>
                    </div>
                    <p class="job-meta">${job.desc_text}</p>
                    <div class="job-tags">${(job.skills || []).map(s => `<span class="skill-tag">${s}</span>`).join('')}</div>
                    <div class="job-footer-meta">
                        <span class="job-budget">₹${job.budget}/hr</span>
                        <span class="job-duration">⏱ ${job.duration}</span>
                        <span class="job-posted">🕐 ${ago}</span>
                        <span class="job-poster-name clickable-profile" onclick="event.stopPropagation(); loadProfile('${job.poster_username}')" style="cursor:pointer; color:var(--primary);">👤 ${job.poster_username || 'Client'}</span>
                    </div>
                </div>
                <button class="btn-primary bid-btn" onclick="openBidModal(${job.id}, '${job.title.replace(/'/g, "'")}')">Bid Now</button>
            </div>`;
        }).join('') : '<p class="empty-state">No jobs found. Check back soon!</p>';
    } catch (e) { }
}

// ── Jobs: My Jobs (Poster) ────────────────────────────────────────────────────
async function renderMyJobs() {
    try {
        const jobs = await apiFetch('/jobs');
        const myJobs = jobs.filter(j => j.poster_username === currentUser.username);
        const bids = await apiFetch('/bids');

        $('my-jobs-container').innerHTML = myJobs.length ? myJobs.map(job => {
            const jobBids = bids.filter(b => b.job_id === job.id);
            return `
            <div class="job-card my-job-card">
                <div class="job-info">
                    <div class="job-card-top">
                        <h3>${job.title} <span style="font-size:0.8em; padding:2px 8px; border-radius:12px; background:#e2e8f0;">${job.status}</span></h3>
                        <span class="category-tag">${job.category}</span>
                    </div>
                    <p class="job-meta">${job.desc_text}</p>
                    <div class="job-footer-meta">
                        <span class="job-budget">₹${job.budget}/hr</span>
                        <span class="job-duration">⏱ ${job.duration}</span>
                    </div>
                    
                    ${job.status !== 'Completed' ? `
                    <div style="margin-top:1rem; display:flex; gap:0.5rem; align-items:center;">
                        <label><strong>Change Status:</strong></label>
                        <select onchange="updateJobStatus(${job.id}, this.value)" class="select-input" style="padding:0.25rem; width:auto;">
                            <option value="Open" ${job.status === 'Open' ? 'selected' : ''}>Open</option>
                            <option value="In Progress" ${job.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                            <option value="Completed" ${job.status === 'Completed' ? 'selected' : ''}>Completed</option>
                            <option value="Cancelled" ${job.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                    </div>` : ''}

                    ${jobBids.length ? `<div class="bids-received"><strong>Bids received (${jobBids.length}):</strong><ul>${jobBids.map(b => `<li class="bid-item"><div class="bid-item-info"><strong class="clickable-profile" onclick="loadProfile('${b.worker_username}')" style="cursor:pointer; color:var(--primary);">${b.worker_name}</strong> — ${b.hours} hrs @ ₹${b.rate}/hr = <strong>₹${b.total}</strong><br><small>${b.message || ''}</small></div><button class="btn-primary btn-msg" onclick="openChat('${b.worker_username}')">💬 Message</button></li>`).join('')}</ul></div>` : '<p class="no-bids">No bids yet.</p>'}
                </div>
            </div>`;
        }).join('') : '<p class="empty-state">You haven\'t posted any jobs yet. <a href="#" onclick="navigateTo(\'post-job\')">Post your first job →</a></p>';
    } catch (e) { }
}

window.updateJobStatus = async function (jobId, status) {
    if (!confirm(`Change job status to ${status}?`)) {
        renderMyJobs(); // Reset UI
        return;
    }
    try {
        await apiFetch(`/jobs/${jobId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
        showToast(`Job marked as ${status}`, 'success');

        if (status === 'Completed') {
            // Very simplified: just pay the first person who bid for demo purposes
            // In a real app, the poster would select which worker to pay.
            const bids = await apiFetch('/bids');
            const jobBids = bids.filter(b => b.job_id === jobId);
            if (jobBids.length > 0) {
                const winner = jobBids[0];
                await apiFetch('/wallet/pay', {
                    method: 'POST',
                    body: JSON.stringify({
                        posterUsername: currentUser.username,
                        workerUsername: winner.worker_username,
                        amount: winner.total,
                        jobId: jobId
                    })
                });
                showToast(`Paid ₹${winner.total} to ${winner.worker_username}`, 'success');
            }
        }

        renderMyJobs();
        updateDashboard();
    } catch (e) {
        renderMyJobs();
    }
};

// ── Jobs: My Bids (Worker) ────────────────────────────────────────────────────
async function renderMyBids() {
    try {
        const bids = await apiFetch('/bids');
        const myBids = bids.filter(b => b.worker_username === currentUser.username);

        $('my-bids-container').innerHTML = myBids.length ? myBids.map(b => {
            return `
            <div class="job-card">
                <div class="job-info">
                    <h3>${b.job_title}</h3>
                    <div class="job-footer-meta">
                        <span class="job-budget">₹${b.total} total</span>
                        <span class="job-duration">${b.hours} hrs @ ₹${b.rate}/hr</span>
                        <span class="job-poster-name clickable-profile" onclick="event.stopPropagation(); loadProfile('${b.poster_username}')" style="cursor:pointer; color:var(--primary);">👤 ${b.poster_username || 'Client'}</span>
                    </div>
                    <p class="job-meta">${b.message || ''}</p>
                </div>
                <div class="bid-actions">
                    <button class="btn-primary btn-msg" onclick="openChat('${b.poster_username}')">💬 Message</button>
                    <span class="bid-status pending">${b.status || 'Pending'}</span>
                </div>
            </div>`;
        }).join('')
            : '<p class="empty-state">You haven\'t placed any bids yet. <a href="#" onclick="navigateTo(\'jobs\')">Browse jobs →</a></p>';
    } catch (e) { }
}

// ── Bid Modal ─────────────────────────────────────────────────────────────────
window.openBidModal = function (jobId, jobTitle) {
    $('bid-job-id').value = jobId;
    $('bid-job-title').textContent = jobTitle;
    $('bid-rate').textContent = currentUser.wage || 0;
    $('bid-hours').value = '';
    $('bid-total').textContent = '0';
    $('bid-message').value = '';
    $('job-modal').classList.remove('hidden');
};

function closeJobModal() { $('job-modal').classList.add('hidden'); }

function calculateBid() {
    const hours = parseInt($('bid-hours').value) || 0;
    const rate = parseInt(currentUser.wage) || 0;
    $('bid-total').textContent = hours * rate;
}

async function submitBid(e) {
    e.preventDefault();
    const jobId = parseInt($('bid-job-id').value);
    const jobTitle = $('bid-job-title').textContent;

    try {
        const jobs = await apiFetch('/jobs');
        const job = jobs.find(j => j.id === jobId);

        await apiFetch('/bids', {
            method: 'POST',
            body: JSON.stringify({
                jobId,
                jobTitle,
                posterUsername: job.poster_username,
                workerUsername: currentUser.username,
                workerName: currentUser.name,
                rate: currentUser.wage,
                hours: parseInt($('bid-hours').value),
                total: parseInt($('bid-total').textContent),
                message: $('bid-message').value
            })
        });

        closeJobModal();
        showToast('Bid submitted successfully! ✅', 'success');
        updateDashboard();
    } catch (e) { }
}

// ── Post Job ──────────────────────────────────────────────────────────────────
async function handlePostJob(e) {
    e.preventDefault();

    const payload = {
        posterUsername: currentUser.username,
        title: $('job-title').value,
        category: $('job-category').value,
        desc: $('job-desc').value,
        budget: parseInt($('job-budget').value),
        duration: $('job-duration').value,
        skills: $('job-skills').value.split(',').map(s => s.trim()).filter(Boolean)
    };

    try {
        await apiFetch('/jobs', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        $('post-job-form').reset();
        updateDashboard();
        navigateTo('my-jobs');
        showToast('Job posted successfully! 🚀', 'success');
    } catch (e) { }
}

// ── Messaging System (Local Storage Based for now) ────────────────────────────

// Derive contacts from local bids for UI simplicity
async function getContacts() {
    const bids = await apiFetch('/bids').catch(() => []);
    const contacts = {};
    if (currentUser.role === 'poster') {
        const myJobs = await apiFetch('/jobs').catch(() => []);
        const myJobIds = new Set(myJobs.filter(j => j.poster_username === currentUser.username).map(j => j.id));
        bids.filter(b => myJobIds.has(b.job_id)).forEach(b => {
            if (!contacts[b.worker_username]) contacts[b.worker_username] = { username: b.worker_username, name: b.worker_name, role: 'worker', context: b.job_title };
        });
    } else {
        bids.filter(b => b.worker_username === currentUser.username).forEach(b => {
            if (b.poster_username && !contacts[b.poster_username]) contacts[b.poster_username] = { username: b.poster_username, name: 'Client', role: 'poster', context: b.job_title };
        });
    }
    return Object.values(contacts);
}

async function renderContacts() {
    const contacts = await getContacts();
    const messages = getMessages();
    const list = $('contact-list');
    if (!contacts.length) {
        list.innerHTML = `<li class="contact-empty">${currentUser.role === 'poster'
            ? '📭 No workers have bid yet.<br><small>Post a job to get started.</small>'
            : '📭 No contacts yet.<br><small>Bid on a job to connect with a poster.</small>'
            }</li>`;
        return;
    }
    list.innerHTML = contacts.map(c => {
        const key = convKey(currentUser.username, c.username);
        const conv = messages[key] || [];
        const last = conv[conv.length - 1];
        const unread = conv.filter(m => m.to === currentUser.username && !m.read).length;
        return `
        <li class="contact-item ${activeContact === c.username ? 'active' : ''}" onclick="openChat('${c.username}')">
            <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
            <div class="contact-details">
                <div class="contact-name-row">
                    <span class="contact-name">${c.name}</span>
                    ${unread ? `<span class="unread-badge">${unread}</span>` : ''}
                </div>
                <span class="contact-preview">${last ? last.text.substring(0, 35) + (last.text.length > 35 ? '…' : '') : c.context || ''}</span>
            </div>
        </li>`;
    }).join('');
}

window.openChat = async function (contactUsername) {
    activeContact = contactUsername;
    navigateTo('messages');
    renderContacts();

    let contactName = contactUsername;
    let contactRole = 'user';
    try {
        const contact = await apiFetch(`/users/${contactUsername}`);
        contactName = contact.name;
        contactRole = contact.role;
    } catch (e) { }

    // Mark messages as read
    const allMessages = getMessages();
    const key = convKey(currentUser.username, contactUsername);
    if (allMessages[key]) {
        allMessages[key] = allMessages[key].map(m => m.to === currentUser.username ? { ...m, read: true } : m);
        saveMessages(allMessages);
    }

    $('chat-empty-state').classList.add('hidden');
    $('chat-active').classList.remove('hidden');
    $('msg-contact-avatar').textContent = contactName.charAt(0).toUpperCase();
    $('msg-contact-name').textContent = contactName;
    const rb = $('msg-contact-role');
    rb.textContent = contactRole === 'poster' ? '🏢 Job Poster' : '💼 Worker';
    rb.className = 'role-badge ' + (contactRole === 'poster' ? 'role-poster' : 'role-worker');
    loadConversation(contactUsername);
};

function loadConversation(contactUsername) {
    const allMessages = getMessages();
    const key = convKey(currentUser.username, contactUsername);
    const conv = allMessages[key] || [];
    const history = $('message-history');
    history.innerHTML = conv.length ? conv.map(m => {
        const isMine = m.from === currentUser.username;
        const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `<div class="message ${isMine ? 'sent' : 'received'}">
            <div class="bubble">${m.text}<span class="msg-time">${time}</span></div>
        </div>`;
    }).join('') : `<div class="conv-start">👋 Start of your conversation</div>`;
    history.scrollTop = history.scrollHeight;
}

function sendMessage(e) {
    e.preventDefault();
    if (!activeContact) return;
    const text = $('msg-input').value.trim();
    if (!text) return;
    const allMessages = getMessages();
    const key = convKey(currentUser.username, activeContact);
    if (!allMessages[key]) allMessages[key] = [];
    allMessages[key].push({ id: Date.now(), from: currentUser.username, to: activeContact, text, timestamp: Date.now(), read: false });
    saveMessages(allMessages);
    $('msg-input').value = '';
    loadConversation(activeContact);
    renderContacts();
}

// ── Gamification / Leaderboard / Community Placeholder ────────────────────────
function renderLeaderboard() {
    // Dummy Data
    const workers = [
        { name: 'John Doe', badges: ['Top Rated', 'Fast Learner'], points: 1200 },
        { name: 'Alice Smith', badges: ['Design Guru'], points: 950 },
        { name: 'Bob Worker', badges: ['Reliable'], points: 800 }
    ];
    $('leaderboard-container').innerHTML = workers.map((w, i) => `
        <div class="job-card" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <h3>#${i + 1} ${w.name}</h3>
                <div class="job-tags">${w.badges.map(b => `<span class="skill-tag">🏆 ${b}</span>`).join('')}</div>
            </div>
            <div style="font-size:1.5rem; font-weight:bold; color:#2563eb;">${w.points} pts</div>
        </div>
    `).join('');
}

function renderCommunity() {
    const posts = [
        { title: 'Best tips for getting your first freelance gig?', author: 'NewbieDev', replies: 12 },
        { title: 'How to negotiate rates smoothly', author: 'ProWorker', replies: 5 },
        { title: 'Showcase: My latest React Native project', author: 'ReactNinja', replies: 8 }
    ];
    $('forum-container').innerHTML = posts.map(p => `
        <div class="job-card">
            <h3>${p.title}</h3>
            <p style="color:#64748b;">Posted by <strong>${p.author}</strong> • ${p.replies} Replies</p>
        </div>
    `).join('');
}


// ── Sidebar Fetch Functions ───────────────────────────────────────────────────

async function renderSidebarProfile() {
    if (!currentUser) return;
    try {
        const data = await apiFetch(`/sidebar/profile?email=${currentUser.email}`);
        Object.assign(currentUser, data);
        updateProfileUI();
    } catch (e) {
        console.error('Error fetching profile:', e);
        showToast('Failed to load profile details', 'error');
    }
}

async function renderSidebarWallet() {
    if (!currentUser) return;
    try {
        const data = await apiFetch(`/sidebar/wallet?email=${currentUser.email}`);
        $('wallet-balance-display').textContent = data.balance || 0;

        const list = $('wallet-transactions');
        list.innerHTML = data.transactions && data.transactions.length
            ? data.transactions.map(t => `<li><strong>${t.type}</strong>: ₹${t.amount} <small>(${new Date(parseInt(t.timestamp)).toLocaleDateString()})</small> - ${t.description}</li>`).join('')
            : '<li class="empty-state">No recent transactions.</li>';
    } catch (e) {
        console.error('Error fetching wallet:', e);
        showToast('Failed to load wallet', 'error');
    }
}

async function renderSidebarHistory() {
    if (!currentUser) return;
    try {
        const data = await apiFetch(`/sidebar/history?email=${currentUser.email}`);
        $('history-container').innerHTML = data.length
            ? data.map(job => `
                <div class="job-card my-job-card">
                    <div class="job-info">
                        <h3>${job.title} <span style="font-size:0.8em; padding:2px 8px; border-radius:12px; background:#e2e8f0;">${job.status}</span></h3>
                        <p class="job-meta">Budget: ₹${job.budget}/hr • Duration: ${job.duration}</p>
                        <small>Posted on: ${new Date(parseInt(job.posted_at)).toLocaleDateString()}</small>
                    </div>
                </div>
            `).join('')
            : '<p class="empty-state">No project history found.</p>';
    } catch (e) {
        console.error('Error fetching history:', e);
        showToast('Failed to load project history', 'error');
    }
}

async function renderSidebarAnalytics() {
    if (!currentUser) return;
    try {
        const data = await apiFetch(`/sidebar/analytics?email=${currentUser.email}`);
        $('analytics-completed').textContent = data.total_completed || 0;
        $('analytics-spent').textContent = `₹${data.total_spent || 0}`;
        $('analytics-active').textContent = data.active_hires || 0;
    } catch (e) {
        console.error('Error fetching analytics:', e);
        showToast('Failed to load analytics', 'error');
    }
}

async function renderSidebarSettings() {
    const form = $('settings-form');
    if (form) form.reset();
}

async function handleSettingsSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;
    
    const passwordInput = document.getElementById('settings-password');
    const password = passwordInput.value;
    
    // Client-side validation
    if (!password || password.trim() === '') {
        showToast('Password cannot be empty', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters long', 'error');
        return;
    }

    try {
        const response = await fetch('/api/settings/password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            // Using email as the session identifier as it's the primary key for the current user
            body: JSON.stringify({ email: currentUser.email, password: password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Network response failure');
        }
        
        showToast(data.message || 'Settings updated successfully', 'success');
        document.getElementById('settings-form').reset();
    } catch (error) {
        console.error('Error updating settings:', error);
        showToast(error.message || 'Failed to update settings', 'error');
    }
}

async function renderSidebarHelp() {
    const container = document.getElementById('help-container');
    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-light);">Loading FAQs...</div>';

    try {
        const response = await fetch('/api/help');
        if (!response.ok) throw new Error(`Network response failure: ${response.status}`);
        const faqs = await response.json();

        container.innerHTML = ''; // Clear loading/error text

        faqs.forEach(faq => {
            const faqElement = document.createElement('div');
            faqElement.className = 'faq-item';
            faqElement.innerHTML = `
                <button class="faq-question" onclick="toggleFaq(this)">
                    <span>${faq.question}</span>
                    <span class="faq-icon">+</span>
                </button>
                <div class="faq-answer">
                    <p>${faq.answer}</p>
                </div>
            `;
            container.appendChild(faqElement);
        });
    } catch (error) {
        console.error('Fetch error:', error);
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--danger);">Failed to load FAQs. Please try again later.</div>';
    }
}

window.toggleFaq = function (button) {
    const item = button.parentElement;
    const isActive = item.classList.contains('active');

    // Close all other FAQs
    document.querySelectorAll('.faq-item').forEach(faq => {
        faq.classList.remove('active');
        const icon = faq.querySelector('.faq-icon');
        if (icon) icon.textContent = '+';
    });

    // Toggle current
    if (!isActive) {
        item.classList.add('active');
        const icon = item.querySelector('.faq-icon');
        if (icon) icon.textContent = '−';
    }
};


// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);
}

// ── Utility ───────────────────────────────────────────────────────────────────
function timeAgo(ts) {
    if (!ts) return 'Unknown';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

// ── Region to Country Code Mapping ─────────────────────────────────────────────
const regionCodes = {
    'US': '+1',
    'IN': '+91',
    'UK': '+44',
    'CA': '+1',
    'AU': '+61'
};

function setupRegionSelector() {
    const regionSelect = $('reg-region');
    const numberInput = $('reg-number');
    if (regionSelect && numberInput) {
        regionSelect.addEventListener('change', (e) => {
            const code = regionCodes[e.target.value] || '+1';
            numberInput.placeholder = `${code} 234 567 890`;
            // If the input is empty or just contains a country code, update it
            if (numberInput.value === '' || Object.values(regionCodes).some(c => numberInput.value.trim() === c)) {
                numberInput.value = code + ' ';
            }
        });
        // Initial setup
        const initialCode = regionCodes[regionSelect.value] || '+1';
        numberInput.placeholder = `${initialCode} 234 567 890`;
    }
}

// ── Event Listeners ───────────────────────────────────────────────────────────
function setupEventListeners() {
    setupRegionSelector();
    $('login-form').addEventListener('submit', handleLogin);
    $('register-form').addEventListener('submit', handleRegister);
    $('show-register-link').addEventListener('click', e => { e.preventDefault(); toggleAuthView('register'); });
    $('show-login-link').addEventListener('click', e => { e.preventDefault(); toggleAuthView('login'); });

    $('login-tab-poster').addEventListener('click', () => setLoginRole('poster'));
    $('login-tab-worker').addEventListener('click', () => setLoginRole('worker'));
    $('reg-tab-poster').addEventListener('click', () => setRegisterRole('poster'));
    $('reg-tab-worker').addEventListener('click', () => setRegisterRole('worker'));
    // Sidebar toggle logic
    const hamburgerPoster = $('hamburger-poster');
    const hamburgerWorker = $('hamburger-worker');
    const sidebar = $('main-sidebar');
    const sidebarOverlay = $('sidebar-overlay');
    const sidebarClose = $('sidebar-close');

    function openSidebar() {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('show');
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('show');
    }

    if (hamburgerPoster) hamburgerPoster.addEventListener('click', openSidebar);
    if (hamburgerWorker) hamburgerWorker.addEventListener('click', openSidebar);
    if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', () => {
            if (link.id !== 'sidebar-logout') closeSidebar();
        });
    });

    const logoutBtn = $('sidebar-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', e => {
            e.preventDefault();
            closeSidebar();
            logout();
        });
    }

    $('nav-login-btn').addEventListener('click', e => { e.preventDefault(); navigateTo('auth'); toggleAuthView('login'); });
    $('nav-signup-btn').addEventListener('click', e => { e.preventDefault(); navigateTo('auth'); toggleAuthView('register'); });

    $('hero-poster-btn').addEventListener('click', () => { setRegisterRole('poster'); setLoginRole('poster'); navigateTo('auth'); toggleAuthView('register'); });
    $('hero-worker-btn').addEventListener('click', () => { setRegisterRole('worker'); setLoginRole('worker'); navigateTo('auth'); toggleAuthView('register'); });
    $('hero-find-talent-btn').addEventListener('click', () => { setLoginRole('poster'); navigateTo('auth'); toggleAuthView('login'); });
    $('nav-hire-link').addEventListener('click', e => { e.preventDefault(); setRegisterRole('poster'); navigateTo('auth'); toggleAuthView('register'); });
    $('nav-find-work-link').addEventListener('click', e => { e.preventDefault(); setRegisterRole('worker'); navigateTo('auth'); toggleAuthView('register'); });

    $('toggle-hire-btn').addEventListener('click', () => {
        $('toggle-hire-btn').classList.add('active'); $('toggle-work-btn').classList.remove('active');
        $('hero-heading-text').innerHTML = 'Grow at the speed<br>of your ambition';
        $('hero-subheading-text').innerHTML = 'Hire experts who deliver real results —<br>turning complex work into outcomes fast.';
        $('hero-find-talent-btn').textContent = 'Find Talent';
    });
    $('toggle-work-btn').addEventListener('click', () => {
        $('toggle-work-btn').classList.add('active'); $('toggle-hire-btn').classList.remove('active');
        $('hero-heading-text').innerHTML = 'Find great work<br>and unlock new opportunities';
        $('hero-subheading-text').innerHTML = 'Discover projects from clients worldwide<br>and build your freelance career.';
        $('hero-find-talent-btn').textContent = 'Find Work';
    });

    document.querySelectorAll('.nav-link[data-route], .sidebar-link[data-route]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const r = link.dataset.route;
            navigateTo(r);
            if (r === 'jobs') renderJobs();
            if (r === 'my-jobs') renderMyJobs();
            if (r === 'my-bids') renderMyBids();
            if (r === 'leaderboard') renderLeaderboard();
            if (r === 'community') renderCommunity();
            if (r === 'profile') renderSidebarProfile();
            if (r === 'wallet') renderSidebarWallet();
            if (r === 'history') renderSidebarHistory();
            if (r === 'analytics') renderSidebarAnalytics();
            if (r === 'settings') renderSidebarSettings();
            if (r === 'help') renderSidebarHelp();
            if (r === 'messages') {
                activeContact = null;
                renderContacts();
                $('chat-empty-state').classList.remove('hidden');
                $('chat-active').classList.add('hidden');
            }
        });
    });

    $('close-job-modal').addEventListener('click', closeJobModal);
    $('bid-hours').addEventListener('input', calculateBid);
    $('bid-form').addEventListener('submit', submitBid);
    $('job-search-input').addEventListener('input', e => renderJobs(e.target.value));

    $('post-job-form').addEventListener('submit', handlePostJob);
    $('message-form').addEventListener('submit', sendMessage);
    const settingsForm = $('settings-form');
    if (settingsForm) settingsForm.addEventListener('submit', handleSettingsSubmit);

    // Wallet actions
    $('btn-withdraw').addEventListener('click', () => {
        showToast('Withdrawal request initiated. Processing will take 1-2 business days.', 'success');
    });
    $('btn-add-funds').addEventListener('click', () => {
        showToast('Redirecting to payment gateway...', 'info');
    });

    const closeProfileBtn = $('close-public-profile-btn');
    if (closeProfileBtn) {
        closeProfileBtn.addEventListener('click', () => {
            $('public-profile-modal').classList.add('hidden');
            // Clear data to prevent flickering on next open
            $('public-profile-name').textContent = '';
            $('public-profile-email').textContent = '';
            $('public-profile-study').textContent = '—';
            $('public-profile-wage').textContent = '—';
            $('public-profile-skills').innerHTML = '';
            $('public-profile-company').textContent = '—';
            $('public-profile-jobs').textContent = '0';
        });
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
setupEventListeners();
checkSession();

window.loadProfile = async function (username) {
    try {
        const user = await apiFetch(`/public/users/${username}`);

        $('public-profile-avatar').style.backgroundColor = user.role === 'poster' ? 'var(--poster)' : 'var(--primary)';
        $('public-profile-initials').textContent = user.name.charAt(0).toUpperCase();
        $('public-profile-name').textContent = user.name;
        $('public-profile-email').textContent = user.email;

        const badge = $('public-profile-role-badge');
        badge.textContent = user.role === 'poster' ? '🏢 Job Poster' : '💼 Worker';
        badge.className = 'role-badge ' + (user.role === 'poster' ? 'role-poster' : 'role-worker');

        const memberSince = user.created_at ? new Date(parseInt(user.created_at)).toLocaleDateString() : 'Recently';
        $('public-profile-member-since').textContent = memberSince;

        if (user.role === 'poster') {
            $('public-company-group').classList.remove('hidden');
            $('public-jobs-group').classList.remove('hidden');
            $('public-study-group').classList.add('hidden');
            $('public-wage-group').classList.add('hidden');
            $('public-skills-group').classList.add('hidden');

            $('public-profile-company').textContent = user.company || '—';
            $('public-profile-jobs').textContent = user.total_jobs || 0;
        } else {
            $('public-company-group').classList.add('hidden');
            $('public-jobs-group').classList.add('hidden');
            $('public-study-group').classList.remove('hidden');
            $('public-wage-group').classList.remove('hidden');
            $('public-skills-group').classList.remove('hidden');

            $('public-profile-study').textContent = user.study || '—';
            $('public-profile-wage').textContent = user.wage ? `₹${user.wage}/hr` : '—';

            let skillsHtml = (user.skills || []).map(s => `<span class="skill-tag">${s}</span>`).join('');
            if (user.resume_path) {
                skillsHtml += `<br><br><a href="${user.resume_path}" target="_blank" class="btn-primary" style="display:inline-block; padding:0.4rem 0.8rem; text-decoration:none;">📄 View Resume</a>`;
            }
            $('public-profile-skills').innerHTML = skillsHtml || '—';
        }

        $('public-profile-modal').classList.remove('hidden');
    } catch (e) {
        console.error('Error fetching profile:', e);
        showToast('Failed to load profile', 'error');
    }
};
