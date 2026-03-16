// Configuration
const API_BASE_URL = 'https://cmfcmf.christianmedicalfellowshipuds.workers.dev'; // Replace with your actual Worker URL

// DOM Elements
const views = {
    login: document.getElementById('login-container'),
    app: document.getElementById('app-wrapper'),
    wizard: document.getElementById('wizard-view')
};
const mobileHeader = document.getElementById('mobile-header');
const navUserName = document.getElementById('nav-user-name');
const navUserRole = document.getElementById('nav-user-role');
let adminRefreshTimer = null;
const pendingActionConfirms = new Map();

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refresh-attendance-summary-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => refreshAttendanceSummary());
    }
    initPasswordToggles();
    initButtonClickFeedback();
    initInviteeForms();
    checkAuth();
});

// --- AUTHENTICATION & ROUTING ---

function checkAuth() {
    const user = JSON.parse(localStorage.getItem('church_user'));

    if (!user) {
        stopAdminRefreshLoop();
        showView('login');
        mobileHeader.classList.add('hidden');
        views.app.classList.add('hidden');
    } else {
        views.login.classList.add('hidden');
        views.app.classList.remove('hidden');
        mobileHeader.classList.remove('hidden');

        navUserName.innerText = user.name;
        navUserRole.innerText = user.role;

        // Default to Dashboard
        switchTab('dashboard');

        if (user.role === 'Admin' || user.role === 'Master') {
            startAdminRefreshLoop();
        } else {
            stopAdminRefreshLoop();
            fetchFlock(user.id);
            fetchTasks(user.id);
        }
    }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorText = document.getElementById('login-error');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Signing In...';
    }
    showToast("Signing in...", "bg-red-700");

    try {
        // Calling your Cloudflare Worker
        const res = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!res.ok) {
            let message = "Invalid credentials";
            try {
                const errPayload = await res.json();
                if (errPayload?.error) message = errPayload.error;
            } catch (_) { }
            throw new Error(message);
        }

        const user = await res.json();
        localStorage.setItem('church_user', JSON.stringify(user));

        // Clear form and route
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        errorText.classList.add('hidden');
        showToast("Login successful", "bg-red-800");
        checkAuth();

    } catch (err) {
        errorText.innerText = err.message;
        errorText.classList.remove('hidden');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "Sign In";
        }
    }
});

function logout() {
    stopAdminRefreshLoop();
    localStorage.removeItem('church_user');
    checkAuth();
}

// --- UTILITIES ---

function showView(viewName) {
    if (viewName === 'login') {
        views.login.classList.remove('hidden');
        views.app.classList.add('hidden');
        views.wizard.classList.add('hidden');
        mobileHeader.classList.add('hidden');
    } else if (viewName === 'wizard') {
        views.wizard.classList.remove('hidden');
        // We keep 'app' visible in background or just hidden? 
        // Usually wizard covers everything.
        // Actually, in the new layout, wizard can just be another section or a centered overlay.
        // For now, let's make it cover the main-content area.
        views.app.classList.remove('hidden');
        document.querySelector('.main-content').classList.add('overflow-hidden');
    } else {
        views.login.classList.add('hidden');
        views.app.classList.remove('hidden');
        mobileHeader.classList.remove('hidden');
        views.wizard.classList.add('hidden');
        document.querySelector('.main-content').classList.remove('overflow-hidden');
    }
}

function switchTab(tabId) {
    const user = JSON.parse(localStorage.getItem('church_user'));
    if (!user) return;

    // 1. Update Sidebar UI
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        }
    });

    // 2. Toggle Tab Sections
    document.querySelectorAll('.tab-section').forEach(section => {
        section.classList.remove('active');
    });
    const targetTab = document.getElementById(`tab-${tabId}`);
    if (!targetTab) return;
    targetTab.classList.add('active');

    // 3. Toggle Role-based subviews inside the tab
    const rolePrefix = (user.role === 'Admin' || user.role === 'Master') ? 'admin' : 'executive';

    // Manage subviews within the newly active tab
    const subViews = targetTab.querySelectorAll('[id$="-view"]');
    subViews.forEach(sv => {
        if (sv.id.startsWith(rolePrefix)) {
            sv.classList.remove('hidden', 'fade-in');
            void sv.offsetWidth; // trigger reflow for animation
            sv.classList.add('fade-in');
        } else {
            sv.classList.add('hidden');
        }
    });

    // 4. Close sidebar on mobile
    if (window.innerWidth < 768) {
        document.getElementById('sidebar').classList.remove('open');
    }

    // 5. Special Refresh logic
    if (tabId === 'dashboard' && rolePrefix === 'admin') {
        initAdminDashboard();
    }
    if (tabId === 'dashboard' && rolePrefix === 'executive') {
        fetchFlock(user.id);
        fetchTasks(user.id);
    }
    if (tabId === 'members') {
        if (rolePrefix === 'admin') {
            loadExecutivesList();
            loadAllMembers();
        } else {
            fetchFlock(user.id);
        }
    }
    if (tabId === 'reports') {
        if (rolePrefix === 'admin') {
            refreshAttendanceSummary(true);
        }
    }
    if (tabId === 'next-service') {
        loadNextTuesdayServicePlan(true);
    }
    if (tabId === 'invitees') {
        loadInvitees();
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.toggle('hidden');
}

function initPasswordToggles() {
    const toggleButtons = document.querySelectorAll('[data-password-toggle]');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-password-toggle');
            const input = document.getElementById(targetId);
            if (!input) return;
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            btn.innerHTML = `<i class="fa-solid ${isHidden ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
            btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
        });
    });
}

function initButtonClickFeedback() {
    document.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        button.classList.add('btn-clicked');
        setTimeout(() => button.classList.remove('btn-clicked'), 180);
    });
}

function confirmActionWithToast(actionKey, prompt, timeoutMs = 4000) {
    const now = Date.now();
    const lastClick = pendingActionConfirms.get(actionKey);

    if (lastClick && (now - lastClick) < timeoutMs) {
        pendingActionConfirms.delete(actionKey);
        return true;
    }

    pendingActionConfirms.set(actionKey, now);
    showToast(`${prompt} Click again to confirm.`, "bg-red-600");
    setTimeout(() => {
        const stored = pendingActionConfirms.get(actionKey);
        if (stored === now) pendingActionConfirms.delete(actionKey);
    }, timeoutMs);
    return false;
}

function openSmsModal(name, phone) {
    const user = JSON.parse(localStorage.getItem('church_user'));
    const defaultMsg = `Hi ${name}, this is ${user.name} from Church. Just checking in on you! How is your week going?`;

    document.getElementById('sms-modal-title').innerText = `Message to ${name}`;
    document.getElementById('sms-modal-content').value = defaultMsg;
    document.getElementById('sms-modal-phone').value = phone;

    toggleModal('sms-modal');
}

async function confirmSendSMS() {
    const phone = document.getElementById('sms-modal-phone').value;
    const content = document.getElementById('sms-modal-content').value;

    toggleModal('sms-modal'); // Close modal immediately
    showToast("Sending SMS...", "bg-red-700");

    try {
        const res = await fetch(`${API_BASE_URL}/api/send-manual-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipients: [phone], content: content })
        });

        if (res.ok) {
            showToast("Message Sent Successfully!", "bg-red-800");
        } else {
            throw new Error();
        }
    } catch (err) {
        showToast("Failed to send message", "bg-red-500");
    }
}

// --- DATA FETCHING STUBS ---

async function fetchFlock(leaderId) {
    const listContainer = document.getElementById('flock-list');
    listContainer.innerHTML = '<div class="p-4 text-center"><i class="fa-solid fa-spinner fa-spin text-red-500"></i></div>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/flock/${leaderId}`);
        const data = await response.json();
        window.currentFlock = data;
        listContainer.innerHTML = '';

        data.forEach(member => {
            const card = document.createElement('div');
            card.className = "p-4 bg-white rounded-xl border border-red-100 shadow-sm space-y-3";
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="cursor-pointer hover:opacity-80 transition" onclick="openProfile('members', '${member.id}')">
                        <div class="flex items-center gap-3">
                            <img src="${member.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=fee2e2&color=991b1b`}" class="w-10 h-10 rounded-full border border-red-200 object-cover">
                            <div>
                                <h4 class="font-bold text-red-900 hover:text-red-600 hover:underline inline-block">${member.name}</h4>
                                <br>
                                <span class="text-[10px] uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">${member.status}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <a href="tel:${member.phone}" class="w-9 h-9 bg-red-100 text-red-600 rounded-full flex items-center justify-center hover:bg-red-600 hover:text-white transition">
                            <i class="fa-solid fa-phone-flip text-sm"></i>
                        </a>
                        <button onclick="openSmsModal('${member.name}', '${member.phone}')" class="w-9 h-9 bg-red-100 text-red-600 rounded-full flex items-center justify-center hover:bg-red-600 hover:text-white transition">
                            <i class="fa-solid fa-comment-sms text-sm"></i>
                        </button>
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
        });
    } catch (err) {
        showToast("Connection failed", "bg-red-500");
    }
}

async function fetchTasks(userId) {
    const taskContainer = document.getElementById('task-list');
    // Show spinner while loading
    taskContainer.innerHTML = '<div class="p-4 text-center"><i class="fa-solid fa-spinner fa-spin text-red-500"></i></div>';

    try {
        const res = await fetch(`${API_BASE_URL}/api/tasks/${userId}`);
        const tasks = await res.json();

        if (tasks.length === 0) {
            taskContainer.innerHTML = '<p class="text-red-500 text-sm italic text-center py-4">No pending tasks. Great job!</p>';
            return;
        }

        taskContainer.innerHTML = tasks.map(task => {
            const dueDate = new Date(task.due_date).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short'
            });

            return `
                <div class="p-4 bg-red-50 border border-red-100 rounded-xl relative group">
                    <div class="flex items-start gap-3">
                        <div class="mt-1">
                            <i class="fa-solid fa-circle-dot text-red-500"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-red-900 text-sm">${task.title}</h4>
                            <p class="text-xs text-red-700 mt-0.5">Due: ${dueDate}</p>
                        </div>
                    </div>
                    <button onclick="completeTask('${task.id}')" class="absolute right-4 top-1/2 -translate-y-1/2 bg-white text-red-600 border border-red-200 p-2 rounded-lg hover:bg-red-700 hover:text-white transition shadow-sm">
                        <i class="fa-solid fa-check"></i>
                    </button>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error("Task fetch error:", err);
        taskContainer.innerHTML = '<p class="text-red-400 text-xs text-center py-4">Failed to load tasks.</p>';
    }
}

async function completeTask(taskId) {
    if (!confirmActionWithToast(`complete-task-${taskId}`, "Mark task as completed?")) return;

    showToast("Updating task...", "bg-red-700");

    try {
        const res = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
            method: 'DELETE' // Or 'PATCH' if you prefer to archive them
        });

        if (res.ok) {
            showToast("Task Completed!", "bg-red-800");
            const user = JSON.parse(localStorage.getItem('church_user'));
            fetchTasks(user.id); // Refresh the list
        }
    } catch (err) {
        showToast("Error updating task", "bg-red-500");
    }
}

function startWizard() {
    // Transitions UI to the Step-by-Step Reporting interface
    showView('wizard');
    // initWizardFlow(); // We will build this next
}

/**
 * Initializes the Admin Dashboard: Stats and Executive List
 */
async function initAdminDashboard() {
    // Run sequentially to reduce burst failures on unstable networks.
    await loadDashboardStats();
    await loadExecutivesDropdown();
    await loadExecutivesList();
    await loadAllMembers();
    await loadAttendanceLog();
    await loadAttendanceSummary();
    await loadNextTuesdayServicePlan(true);
    await loadInvitees();
}

// Your current logic moved here for cleanliness
async function loadExecutivesDropdown() {
    try {
        const res = await fetchWithRetry(`${API_BASE_URL}/api/executives`);
        const payload = await res.json();
        if (!res.ok) {
            throw new Error(payload?.error || 'Failed to load executives');
        }
        const execs = Array.isArray(payload) ? payload : [];

        const dropdown = document.getElementById('task-assignee-select');
        if (!dropdown) return;

        dropdown.innerHTML = '<option value="">Select Executive...</option>';
        const activeExecs = execs.filter(exec => Number(exec.is_disabled || 0) !== 1);
        activeExecs.forEach(exec => {
            const opt = document.createElement('option');
            opt.value = exec.id;
            opt.innerText = exec.name;
            dropdown.appendChild(opt);
        });

        if (activeExecs.length === 0) {
            dropdown.innerHTML = '<option value="">No active executive available</option>';
        }
    } catch (err) {
        console.error("Failed to load dropdown", err);
        const dropdown = document.getElementById('task-assignee-select');
        if (dropdown) {
            dropdown.innerHTML = '<option value="">Failed to load executives</option>';
        }
    }
}

// --- TASK ASSIGNMENT SUBMISSION ---

document.getElementById('assign-task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');

    const taskData = {
        id: crypto.randomUUID(),
        title: document.getElementById('task-title').value,
        description: "Assigned by Admin", // You can add a description field to HTML if needed
        assignee_id: document.getElementById('task-assignee-select').value,
        due_date: document.getElementById('task-due-date').value
    };

    if (!taskData.assignee_id) return showToast("Please select an executive", "bg-red-500");

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending SMS...';

    try {
        const res = await fetch(`${API_BASE_URL}/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });
        let payload = {};
        try { payload = await res.json(); } catch (_) { }

        if (!res.ok) {
            let message = "Error assigning task";
            if (payload?.error) message = payload.error;
            throw new Error(message);
        }

        if (Array.isArray(payload?.warnings) && payload.warnings.length > 0) {
            showToast(`Task assigned. ${payload.warnings[0]}`, "bg-red-500");
        } else {
            showToast("Task assigned and notifications sent", "bg-red-800");
        }
        e.target.reset();
    } catch (err) {
        showToast(err.message || "Error assigning task", "bg-red-500");
    } finally {
        btn.disabled = false;
        btn.innerText = "Send Task & SMS";
    }
});

function showToast(message, bgColor = "bg-red-900") {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    // Reset classes to ensure transitions work every time
    toast.className = `fixed bottom-10 left-1/2 -translate-x-1/2 text-white px-6 py-3 rounded-full shadow-2xl transition-all duration-300 z-[100] ${bgColor}`;
    toast.classList.remove('hidden', 'opacity-0');
    toast.classList.add('opacity-100');

    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3000);
}

function startAdminRefreshLoop() {
    stopAdminRefreshLoop();
    adminRefreshTimer = setInterval(() => {
        const user = JSON.parse(localStorage.getItem('church_user') || '{}');
        const isAdmin = user.role === 'Admin' || user.role === 'Master';
        if (!isAdmin) return;

        const activeTab = document.querySelector('.tab-section.active')?.id;
        if (activeTab === 'tab-reports') {
            refreshAttendanceSummary(true);
        }
    }, 60000);
}

function stopAdminRefreshLoop() {
    if (adminRefreshTimer) {
        clearInterval(adminRefreshTimer);
        adminRefreshTimer = null;
    }
}

function formatDateTimeLabel(rawDate) {
    if (!rawDate) return "No submission yet";
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return rawDate;
    return date.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatReportType(type) {
    if (!type) return '';
    if (type === 'cell') return 'Cell';
    if (type === 'service') return 'Service';
    if (type === 'outreach') return 'Outreach';
    return type;
}

async function fetchWithRetry(url, options = {}, retries = 2, baseDelayMs = 700) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fetch(url, options);
        } catch (err) {
            lastError = err;
            if (attempt === retries) break;
            const delay = baseDelayMs * (attempt + 1);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

async function refreshAttendanceSummary(silent = false) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!silent) showToast("You are offline. Reconnect and try again.", "bg-red-500");
        return;
    }
    const [summaryOk, logOk] = await Promise.all([
        loadAttendanceSummary(),
        loadAttendanceLog()
    ]);

    if (silent) return;
    if (summaryOk && logOk) {
        showToast("Attendance tables refreshed", "bg-red-800");
    } else {
        showToast("Some attendance data failed to refresh", "bg-red-500");
    }
}

async function loadAttendanceSummary() {
    const tableBody = document.getElementById('attendance-summary-table-body');
    const updatedAtEl = document.getElementById('attendance-summary-updated-at');
    if (!tableBody) return false;

    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-6"><i class="fa-solid fa-spinner fa-spin text-red-500"></i></td></tr>';

    try {
        const res = await fetchWithRetry(`${API_BASE_URL}/api/admin/attendance-summary`);
        if (!res.ok) throw new Error('Summary request failed');

        const payload = await res.json();
        const rows = Array.isArray(payload.executives) ? payload.executives : [];

        if (rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-red-600 text-sm">No executives found.</td></tr>';
        } else {
            tableBody.innerHTML = rows.map(row => {
                const submitted = Number(row.submitted_services || 0);
                const expected = Number(row.expected_services || 0);
                const pending = Math.max(Number(row.pending_services || 0), 0);
                const ratio = `${submitted}/${expected}`;
                const lastSubmitted = formatDateTimeLabel(row.last_submitted_at);
                const reportType = formatReportType(row.last_report_type);
                const reportTypeText = reportType ? `<div class="text-[10px] uppercase tracking-wide text-red-500 mt-0.5">${reportType}</div>` : '';

                return `
                    <tr class="border-b border-red-100 hover:bg-red-50 transition text-sm">
                        <td class="py-3 px-2">
                            <div class="font-bold text-red-900">${row.name}</div>
                            <div class="text-[10px] text-red-600">${row.email || 'No Email'}</div>
                        </td>
                        <td class="py-3 px-2 text-center font-extrabold text-red-900">${ratio}</td>
                        <td class="py-3 px-2 text-center font-semibold text-red-700">${submitted}</td>
                        <td class="py-3 px-2 text-center font-semibold text-red-700">${expected}</td>
                        <td class="py-3 px-2 text-center font-semibold ${pending === 0 ? 'text-red-700' : 'text-red-600'}">${pending}</td>
                        <td class="py-3 px-2 text-xs text-red-800">
                            <div>${lastSubmitted}</div>
                            ${reportTypeText}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        if (updatedAtEl) {
            const nowLabel = formatDateTimeLabel(new Date().toISOString());
            const rangeLabel = payload?.range_start && payload?.range_end
                ? `${payload.range_start} to ${payload.range_end}`
                : '';
            updatedAtEl.textContent = rangeLabel ? `Updated ${nowLabel} | ${rangeLabel}` : `Updated ${nowLabel}`;
        }
        return true;
    } catch (err) {
        console.error("Error loading attendance summary:", err);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-red-500 text-sm">Failed to load summary.</td></tr>';
        return false;
    }
}

// Function to fetch and display executives on the Admin Dashboard
async function loadExecutivesList() {
    const listContainer = document.getElementById('executives-list');
    try {
        const res = await fetchWithRetry(`${API_BASE_URL}/api/executives`);
        const payload = await res.json();
        if (!res.ok) {
            throw new Error(payload?.error || 'Failed to load executives');
        }
        const execs = Array.isArray(payload) ? payload : [];


        console.log("Executives found:", execs); // CHECK THIS IN F12 CONSOLE

        const dropdown = document.getElementById('task-assignee-select');
        if (!dropdown) {
            console.error("Dropdown element NOT found in HTML!");
            return;
        }

        listContainer.innerHTML = execs.map(exec => {
            const lastLogin = exec.last_login ? new Date(exec.last_login).toLocaleDateString() : 'Never';
            const isDisabled = Number(exec.is_disabled || 0) === 1;
            const memberCount = Number(exec.assigned_members || 0);
            const safeId = String(exec.id || '').replace(/'/g, "\\'");
            const safeName = String(exec.name || 'Executive').replace(/'/g, "\\'");

            return `
                <div class="p-4 bg-red-50 rounded-xl border border-red-100">
                    <div class="flex justify-between items-start gap-3">
                        <div class="cursor-pointer hover:opacity-80 transition" onclick="openProfile('users', '${safeId}')">
                            <p class="font-bold text-red-900 hover:text-red-600 hover:underline inlibe-block">${exec.name}</p>
                            <p class="text-xs text-red-700">${exec.email || 'No Email'}</p>
                            <p class="text-[10px] text-red-500">Last Seen: ${lastLogin}</p>
                            <p class="text-[10px] text-red-600 mt-1">Assigned Members: ${memberCount}</p>
                        </div>
                        <span class="text-[10px] ${isDisabled ? 'bg-red-200 text-red-800' : 'bg-red-100 text-red-700'} px-2 py-1 rounded-full font-bold uppercase">
                            ${isDisabled ? 'Disabled' : 'Active'}
                        </span>
                    </div>
                    <div class="mt-3 grid grid-cols-2 gap-2">
                        <button onclick="toggleExecutiveAccount('${safeId}', ${isDisabled ? 1 : 0}, '${safeName}')" class="px-3 py-2 rounded-lg border border-red-200 text-xs font-bold text-red-700 hover:bg-red-100 transition">
                            <i class="fa-solid ${isDisabled ? 'fa-user-check' : 'fa-user-slash'} mr-1"></i>
                            ${isDisabled ? 'Enable Account' : 'Disable Account'}
                        </button>
                        <button onclick="removeExecutive('${safeId}', '${safeName}')" class="px-3 py-2 rounded-lg border border-red-300 text-xs font-bold text-red-700 hover:bg-red-200 transition">
                            <i class="fa-solid fa-trash-can mr-1"></i> Remove Executive
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        showToast("Error loading leaders", "bg-red-500");
    }
}

async function toggleExecutiveAccount(execId, currentDisabled, execName) {
    const willDisable = Number(currentDisabled) !== 1;
    const actionText = willDisable ? 'disable' : 'enable';
    if (!confirmActionWithToast(`toggle-exec-${execId}`, `Click again to ${actionText} ${execName}.`)) return;

    try {
        const res = await fetch(`${API_BASE_URL}/api/executives/${execId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_disabled: willDisable })
        });

        let payload = {};
        try { payload = await res.json(); } catch (_) { }
        if (!res.ok) throw new Error(payload?.error || `Failed to ${actionText} account`);

        showToast(`Account ${willDisable ? 'disabled' : 'enabled'} for ${execName}`, "bg-red-800");
        await Promise.all([loadExecutivesList(), loadExecutivesDropdown(), loadAttendanceSummary()]);
    } catch (err) {
        showToast(err.message || `Failed to ${actionText} account`, "bg-red-500");
    }
}

async function removeExecutive(execId, execName) {
    if (!confirmActionWithToast(`remove-exec-${execId}`, `Remove ${execName} permanently?`, 5000)) return;

    try {
        const res = await fetch(`${API_BASE_URL}/api/executives/${execId}`, {
            method: 'DELETE'
        });
        let payload = {};
        try { payload = await res.json(); } catch (_) { }
        if (!res.ok) throw new Error(payload?.error || "Failed to remove executive");

        showToast(`${execName} removed`, "bg-red-800");
        await initAdminDashboard();
    } catch (err) {
        showToast(err.message || "Failed to remove executive", "bg-red-500");
    }
}

// Handle Form Submission
document.getElementById('add-exec-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');

    const execData = {
        id: crypto.randomUUID(),
        name: document.getElementById('exec-name').value,
        email: document.getElementById('exec-email').value,
        phone: document.getElementById('exec-phone').value,
        password: document.getElementById('exec-password').value,
        role: 'Executive'
    };

    btn.disabled = true;
    btn.innerText = "Saving...";

    try {
        const res = await fetch(`${API_BASE_URL}/api/users/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(execData)
        });
        let payload = {};
        try { payload = await res.json(); } catch (_) { }

        if (!res.ok) {
            let message = "Failed to add leader";
            if (payload?.error) message = payload.error;
            throw new Error(message);
        }

        if (Array.isArray(payload?.warnings) && payload.warnings.length > 0) {
            showToast(`Executive added. ${payload.warnings[0]}`, "bg-red-500");
        } else {
            showToast("New executive added and email sent", "bg-red-800");
        }
        toggleModal('add-exec-modal');
        e.target.reset();
        loadExecutivesList(); // Refresh the list
        initAdminDashboard(); // Refresh the task dropdown
    } catch (err) {
        showToast(err.message || "Failed to add leader", "bg-red-500");
    } finally {
        btn.disabled = false;
        btn.innerText = "Save Leader";
    }
});

document.getElementById('add-soul-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const user = JSON.parse(localStorage.getItem('church_user'));

    if (!user?.id) {
        showToast("Session expired. Please login again.", "bg-red-500");
        return;
    }

    const payload = {
        id: crypto.randomUUID(),
        name: document.getElementById('soul-name').value.trim(),
        phone: document.getElementById('soul-phone').value.trim(),
        status: document.getElementById('soul-status').value,
        leader_id: user.id,
        level: '',
        course: ''
    };

    btn.disabled = true;
    btn.innerText = "Saving...";

    try {
        const res = await fetch(`${API_BASE_URL}/api/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error();

        showToast("New soul added", "bg-red-800");
        toggleModal('add-soul-modal');
        e.target.reset();
        fetchFlock(user.id);
    } catch (err) {
        showToast("Failed to add soul", "bg-red-500");
    } finally {
        btn.disabled = false;
        btn.innerText = "Save Soul";
    }
});

async function loadAllMembers() {
    const tableBody = document.getElementById('admin-member-table');
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-red-500"></i></td></tr>';

    try {
        const res = await fetchWithRetry(`${API_BASE_URL}/api/admin/all-members`);
        const payload = await res.json();
        if (!res.ok || !Array.isArray(payload)) {
            throw new Error('Failed to load members');
        }
        window.allMembersData = payload; // Store globally for search filtering
        renderMemberTable(window.allMembersData);
    } catch (err) {
        showToast("Failed to load members", "bg-red-500");
    }
}

function parseStreakPattern(member) {
    if (Array.isArray(member?.attendance_streak_pattern)) {
        return member.attendance_streak_pattern.slice(0, 5).map((v) => Number(v) === 1 ? 1 : 0);
    }
    if (typeof member?.attendance_streak_pattern === 'string') {
        try {
            const parsed = JSON.parse(member.attendance_streak_pattern);
            if (Array.isArray(parsed)) {
                return parsed.slice(0, 5).map((v) => Number(v) === 1 ? 1 : 0);
            }
        } catch (_) { }
    }
    const count = Math.max(0, Math.min(5, Number(member?.attendance_streak || 0)));
    return Array.from({ length: 5 }, (_, idx) => (idx < count ? 1 : 0));
}

function renderStreakDots(member) {
    const pattern = parseStreakPattern(member);
    const active = pattern.filter((v) => v === 1).length;
    return `
        <div class="flex items-center justify-center gap-1" title="Attendance streak in last 5 reports: ${active}/5">
            ${pattern.map((value) => `
                <span class="inline-block w-2.5 h-2.5 rounded-full ${value ? 'bg-red-600' : 'bg-red-200'}"></span>
            `).join('')}
        </div>
    `;
}

function renderMemberTable(data) {
    const tableBody = document.getElementById('admin-member-table');
    const rows = Array.isArray(data) ? data : [];

    if (rows.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="py-6 px-2 text-sm text-red-600 text-center">No members found.</td></tr>';
        return;
    }

    const grouped = rows.reduce((acc, member) => {
        const key = member.leader_name || 'Unassigned';
        if (!acc[key]) acc[key] = [];
        acc[key].push(member);
        return acc;
    }, {});

    const groupKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
    let html = '';

    groupKeys.forEach((leaderName) => {
        const members = grouped[leaderName].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        html += `
            <tr class="bg-red-50/80 border-y border-red-100">
                <td colspan="6" class="py-2 px-2 text-xs font-bold uppercase tracking-wide text-red-700">
                    <i class="fa-solid fa-user-tie mr-2 text-red-400"></i>${leaderName} (${members.length})
                </td>
            </tr>
        `;

        members.forEach((m) => {
            const streakDots = renderStreakDots(m);
            html += `
                <tr class="border-b border-red-100 hover:bg-red-50 transition">
                    <td class="py-4 px-2">
                        <div class="flex items-center gap-3 cursor-pointer hover:opacity-80 transition" onclick="openProfile('members', '${m.id}')">
                            <img src="${m.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=fee2e2&color=991b1b`}" class="w-8 h-8 rounded-full border border-red-200 object-cover hidden md:block">
                            <div>
                                <div class="font-bold text-red-900 hover:text-red-600 hover:underline inline-block">${m.name}</div>
                                <div class="text-[10px] text-red-700">${m.phone || '-'}</div>
                            </div>
                        </div>
                    </td>
                    <td class="py-4 px-2">
                        <span class="text-[10px] px-2 py-1 rounded-full font-bold bg-red-50 text-red-600">${m.status || '-'}</span>
                    </td>
                    <td class="py-4 px-2 text-xs text-red-700">
                        ${m.level || '-'} <br> <span class="text-red-500">${m.course || '-'}</span>
                    </td>
                    <td class="py-4 px-2 text-xs font-medium text-red-800">
                        <i class="fa-solid fa-user-tie mr-1 text-red-300"></i> ${m.leader_name || 'Unassigned'}
                    </td>
                    <td class="py-4 px-2 text-center">${streakDots}</td>
                    <td class="py-4 px-2 text-right">
                        <a href="tel:${m.phone || ''}" class="text-red-600 hover:text-red-800 mx-2"><i class="fa-solid fa-phone"></i></a>
                        <button onclick="openSmsModal('${m.name}', '${m.phone || ''}')" class="text-red-600 hover:text-red-800"><i class="fa-solid fa-comment-sms"></i></button>
                    </td>
                </tr>
            `;
        });
    });

    tableBody.innerHTML = html;
}

function filterMembers() {
    const term = document.getElementById('member-search').value.toLowerCase();
    const source = Array.isArray(window.allMembersData) ? window.allMembersData : [];
    const filtered = source.filter(m =>
        String(m.name || '').toLowerCase().includes(term) ||
        String(m.phone || '').includes(term) ||
        String(m.status || '').toLowerCase().includes(term) ||
        String(m.leader_name || '').toLowerCase().includes(term)
    );
    renderMemberTable(filtered);
}

async function loadAttendanceLog() {
    const tableBody = document.getElementById('attendance-table-body');
    if (!tableBody) return false;

    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-6"><i class="fa-solid fa-spinner fa-spin text-red-500"></i></td></tr>';

    try {
        const res = await fetchWithRetry(`${API_BASE_URL}/api/admin/attendance`);
        if (!res.ok) throw new Error('Attendance request failed');
        const reports = await res.json();
        window.adminReportsData = Array.isArray(reports) ? reports : [];

        if (!Array.isArray(reports) || reports.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-red-600 text-sm">No reports submitted yet.</td></tr>';
            return true;
        }

        tableBody.innerHTML = reports.map(r => {
            const submittedAt = formatDateTimeLabel(r.created_at);
            const reportType = formatReportType(r.type) || '-';

            return `
                <tr class="border-b border-red-100 hover:bg-red-50 transition text-sm">
                    <td class="py-4 px-2 font-medium text-red-900">${submittedAt}</td>
                    <td class="py-4 px-2 text-red-700 uppercase tracking-wide text-xs font-bold">${reportType}</td>
                    <td class="py-4 px-2 text-red-700">${r.executive_name || 'System'}</td>
                    <td class="py-4 px-2 text-center font-bold text-red-600">${r.attendance_count}</td>
                    <td class="py-4 px-2 text-center font-bold text-red-600">${r.absent_count}</td>
                    <td class="py-4 px-2 text-right">
                        <button onclick="window.open('${r.pdf_url}', '_blank')" 
                            class="bg-red-50 text-red-600 px-3 py-1 rounded-lg border border-red-100 hover:bg-red-700 hover:text-white transition text-xs font-bold">
                            VIEW PDF <i class="fa-solid fa-file-pdf ml-1"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        return true;
    } catch (err) {
        console.error("Error loading attendance", err);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-red-500 text-sm">Failed to load attendance reports.</td></tr>';
        return false;
    }
}

function getNextTuesdayDate(baseDate = new Date()) {
    const next = new Date(baseDate);
    const day = next.getDay(); // Sun=0 ... Sat=6
    const daysUntilTuesday = (2 - day + 7) % 7 || 7;
    next.setDate(next.getDate() + daysUntilTuesday);
    next.setHours(0, 0, 0, 0);
    return next;
}

function normalizeName(value) {
    return String(value || '').trim().toLowerCase();
}

function parseReportData(report) {
    if (!report || !report.report_data) return {};
    if (typeof report.report_data === 'object') return report.report_data;
    try {
        return JSON.parse(report.report_data);
    } catch (_) {
        return {};
    }
}

function collectConfirmedOutreachMembers(reports, executiveFilter = null) {
    const confirmed = new Set();
    const rows = Array.isArray(reports) ? reports : [];

    rows.forEach((row) => {
        if (String(row.type || '').toLowerCase() !== 'outreach') return;
        if (executiveFilter && !executiveFilter(row)) return;

        const data = parseReportData(row);
        const members = Array.isArray(data.confirmed_members)
            ? data.confirmed_members
            : Array.isArray(data.attendance)
                ? data.attendance
                : [];

        members.forEach((name) => {
            if (name) confirmed.add(String(name).trim());
        });
    });

    return Array.from(confirmed);
}

async function loadNextTuesdayServicePlan(silent = false) {
    const user = JSON.parse(localStorage.getItem('church_user') || '{}');
    if (!user?.id) return;

    const isAdmin = user.role === 'Admin' || user.role === 'Master';
    const nextTuesday = getNextTuesdayDate();
    const dateLabel = nextTuesday.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });

    const labelEl = document.getElementById('next-service-date-label');
    if (labelEl) labelEl.textContent = `Service date: ${dateLabel}`;

    let reports = window.adminReportsData;
    if (!Array.isArray(reports)) {
        try {
            const reportRes = await fetchWithRetry(`${API_BASE_URL}/api/admin/attendance`);
            reports = reportRes.ok ? await reportRes.json() : [];
            window.adminReportsData = Array.isArray(reports) ? reports : [];
        } catch (_) {
            reports = [];
        }
    }

    if (isAdmin) {
        try {
            const memberRes = await fetchWithRetry(`${API_BASE_URL}/api/admin/all-members`);
            const members = memberRes.ok ? await memberRes.json() : [];
            const memberRows = Array.isArray(members) ? members : [];
            const confirmedMembers = collectConfirmedOutreachMembers(reports);
            const confirmedByNormalized = new Set(confirmedMembers.map((name) => normalizeName(name)));

            const expectedCountEl = document.getElementById('next-service-expected-count');
            const confirmedCountEl = document.getElementById('next-service-confirmed-count');
            if (expectedCountEl) expectedCountEl.textContent = String(memberRows.length);
            if (confirmedCountEl) confirmedCountEl.textContent = String(confirmedMembers.length);

            const tableBody = document.getElementById('next-service-member-table-body');
            if (tableBody) {
                if (memberRows.length === 0) {
                    tableBody.innerHTML = '<tr><td colspan="3" class="py-4 px-2 text-sm text-red-600">No members found.</td></tr>';
                } else {
                    tableBody.innerHTML = memberRows.map((member) => {
                        const isConfirmed = confirmedByNormalized.has(normalizeName(member.name));
                        return `
                            <tr class="border-b border-red-100 hover:bg-red-50 transition text-sm">
                                <td class="py-3 px-2 font-semibold text-red-900">${member.name}</td>
                                <td class="py-3 px-2 text-red-700">${member.phone || '-'}</td>
                                <td class="py-3 px-2 text-right">
                                    <span class="text-[10px] px-2 py-1 rounded-full font-bold ${isConfirmed ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}">
                                        ${isConfirmed ? 'Confirmed Expected' : 'Expected'}
                                    </span>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }
            }

            const confirmedList = document.getElementById('next-service-confirmed-list');
            if (confirmedList) {
                confirmedList.innerHTML = confirmedMembers.length > 0
                    ? confirmedMembers.map((name) => `<span class="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">${name}</span>`).join('')
                    : '<p class="text-sm text-red-600">No confirmed members from outreach reports yet.</p>';
            }
        } catch (err) {
            if (!silent) showToast('Failed to load Tuesday service monitor', 'bg-red-500');
        }
    } else {
        const mine = collectConfirmedOutreachMembers(reports, (row) => {
            return row.executive_id === user.id || String(row.executive_name || '').trim() === String(user.name || '').trim();
        });
        const execList = document.getElementById('executive-next-service-confirmed-list');
        if (execList) {
            execList.innerHTML = mine.length > 0
                ? mine.map((name) => `<span class="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">${name}</span>`).join('')
                : '<p class="text-sm text-red-600">Submit an outreach report to confirm members for Tuesday service.</p>';
        }
    }
}

function initInviteeForms() {
    const adminForm = document.getElementById('invitee-form-admin');
    const execForm = document.getElementById('invitee-form-exec');

    if (adminForm) {
        adminForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitInvitee('admin');
        });
    }
    if (execForm) {
        execForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitInvitee('exec');
        });
    }
}

function getInviteeField(role, field) {
    return document.getElementById(`invitee-${field}-${role}`);
}

async function submitInvitee(role) {
    const user = JSON.parse(localStorage.getItem('church_user') || '{}');
    if (!user?.id) {
        showToast('Session expired. Please sign in again.', 'bg-red-500');
        return;
    }

    const name = getInviteeField(role, 'name')?.value.trim() || '';
    const phone = getInviteeField(role, 'phone')?.value.trim() || '';
    const serviceDate = getInviteeField(role, 'service-date')?.value || '';
    const serviceLabel = getInviteeField(role, 'service-label')?.value.trim() || '';
    const notes = getInviteeField(role, 'notes')?.value.trim() || '';

    if (!name || !serviceDate || !serviceLabel) {
        showToast('Name, service date, and service label are required.', 'bg-red-500');
        return;
    }

    const payload = {
        id: crypto.randomUUID(),
        name,
        phone,
        service_date: serviceDate,
        service_label: serviceLabel,
        notes,
        invited_by: user.id
    };

    try {
        const res = await fetch(`${API_BASE_URL}/api/invitees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Failed to save invitee');

        showToast('Invitee recorded', 'bg-red-800');
        const form = document.getElementById(`invitee-form-${role}`);
        if (form) form.reset();
        await loadInvitees();
    } catch (err) {
        showToast(err.message || 'Failed to save invitee', 'bg-red-500');
    }
}

function renderInviteeRows(rows, targetId, includeInviter = false) {
    const tableBody = document.getElementById(targetId);
    if (!tableBody) return;

    if (!Array.isArray(rows) || rows.length === 0) {
        const colspan = includeInviter ? 5 : 4;
        tableBody.innerHTML = `<tr><td colspan="${colspan}" class="py-4 px-2 text-sm text-red-600">No invitees recorded yet.</td></tr>`;
        return;
    }

    tableBody.innerHTML = rows.map((row) => {
        const inviterCol = includeInviter ? `<td class="py-3 px-2 text-red-700">${row.invited_by_name || '-'}</td>` : '';
        return `
            <tr class="border-b border-red-100 hover:bg-red-50 transition text-sm">
                <td class="py-3 px-2 font-semibold text-red-900">${row.name}</td>
                <td class="py-3 px-2 text-red-700">${row.phone || '-'}</td>
                <td class="py-3 px-2 text-red-700">${row.service_label || '-'}</td>
                <td class="py-3 px-2 text-red-700">${row.service_date || '-'}</td>
                ${inviterCol}
            </tr>
        `;
    }).join('');
}

async function loadInvitees() {
    const user = JSON.parse(localStorage.getItem('church_user') || '{}');
    if (!user?.id) return;

    const isAdmin = user.role === 'Admin' || user.role === 'Master';

    try {
        const adminRes = await fetchWithRetry(`${API_BASE_URL}/api/invitees`);
        const adminRows = adminRes.ok ? await adminRes.json() : [];
        const rows = Array.isArray(adminRows) ? adminRows : [];

        if (isAdmin) {
            renderInviteeRows(rows, 'invitee-table-body-admin', true);
        }

        const myRows = rows.filter((row) => row.invited_by === user.id);
        renderInviteeRows(myRows, 'invitee-table-body-exec', false);
    } catch (err) {
        showToast('Failed to load invitees', 'bg-red-500');
    }
}

function exportMemberData() {
    if (!window.allMembersData) return;

    const headers = "Name,Phone,Status,Level,Course\n";
    const csvContent = window.allMembersData.map(m =>
        `${m.name},${m.phone},${m.status},${m.level},${m.course}`
    ).join("\n");

    const blob = new Blob([headers + csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CMF_Members_${new Date().toLocaleDateString()}.csv`;
    a.click();
}

async function loadDashboardStats() {
    try {
        const res = await fetchWithRetry(`${API_BASE_URL}/api/admin/stats`);
        const stats = await res.json();
        if (!res.ok || !stats || typeof stats !== 'object') {
            throw new Error('Failed to load stats');
        }

        document.getElementById('stat-total-members').innerText = Number(stats.totalMembers || 0);
        document.getElementById('stat-total-execs').innerText = Number(stats.totalExecutives || 0);
        document.getElementById('stat-last-attendance').innerText = Number(stats.lastService || 0);
    } catch (err) {
        console.error("Failed to load stats", err);
    }
}

function showReportPreview() {
    // 1. Collect data from your Wizard inputs
    const attendance = document.getElementById('wizard-attendance-input').value;
    const absentees = document.getElementById('wizard-absent-input').value;
    const reportType = document.getElementById('wizard-type-select').value;

    // 2. Populate the Summary UI (Make sure these IDs exist in your Wizard HTML)
    document.getElementById('preview-attendance').innerText = attendance;
    document.getElementById('preview-absent').innerText = absentees;
    document.getElementById('preview-type').innerText = reportType;

    // 3. Navigate to the Review Step
    // Assuming your wizard uses a 'step' counter or simple class toggling
    goToStep(4);
}


// --- DAILY AI INSIGHTS ---

async function fetchDailyInsights() {
    const datePicker = document.getElementById('insight-date-picker');
    const selectedDate = datePicker.value;
    if (!selectedDate) {
        showToast("Please select a date", "bg-red-500");
        return;
    }

    const btn = document.getElementById('btn-analyze-insights');
    const insightBox = document.getElementById('ai-insight-box');
    const insightText = document.getElementById('ai-insight-text');
    const resultsContainer = document.getElementById('insight-results');
    const submittedList = document.getElementById('insight-submitted-list');
    const missingList = document.getElementById('insight-missing-list');

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';

    insightBox.classList.remove('hidden');
    insightText.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-red-500"></i> Generating insights...';
    resultsContainer.classList.add('hidden');

    try {
        const res = await fetchWithRetry(`${API_BASE_URL}/api/admin/reports-by-date?date=${selectedDate}`);
        if (!res.ok) throw new Error("Failed to fetch insights");
        const data = await res.json();

        // 1. Render AI Insight
        insightText.innerText = data.ai_insight || "No insights generated.";

        // 2. Render Submitted
        if (data.submitted && data.submitted.length > 0) {
            submittedList.innerHTML = data.submitted.map(r => `
                <div class="p-3 bg-red-50 border border-red-100 rounded-lg flex justify-between items-center text-sm shadow-sm transition hover:shadow">
                    <div>
                        <span class="font-bold text-red-900">${r.executive_name}</span>
                        <span class="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full inline-block uppercase font-bold mt-1">${r.type}</span>
                    </div>
                    <a href="${r.pdf_url}" target="_blank" class="text-red-700 hover:text-white hover:bg-red-600 bg-white p-2 rounded-lg border border-red-200 transition">
                        <i class="fa-solid fa-file-pdf"></i> View
                    </a>
                </div>
            `).join('');
        } else {
            submittedList.innerHTML = '<p class="text-xs text-red-500 italic">No reports submitted on this date.</p>';
        }

        // 3. Render Missing
        window.currentMissingExecs = data.missing || [];
        if (data.missing && data.missing.length > 0) {
            missingList.innerHTML = data.missing.map(m => `
                <div class="p-3 bg-white border border-red-100 rounded-lg flex justify-between items-center text-sm shadow-sm">
                    <span class="font-bold text-red-900">${m.name}</span>
                    <button onclick="openSmsModal('${m.name}', '${m.phone}')" class="text-red-500 p-2 hover:bg-red-50 rounded transition" title="Send SMS reminder">
                        <i class="fa-solid fa-comment-sms"></i>
                    </button>
                </div>
            `).join('');
            document.getElementById('btn-remind-missing').classList.remove('hidden');
        } else {
            missingList.innerHTML = '<p class="text-xs text-green-600 italic font-bold">Everyone submitted! Great job leadership!</p>';
            document.getElementById('btn-remind-missing').classList.add('hidden');
        }

        resultsContainer.classList.remove('hidden');

    } catch (err) {
        insightText.innerHTML = '<span class="text-red-600 font-bold"><i class="fa-solid fa-triangle-exclamation"></i> Error loading insights. Ensure Cloudflare AI is bound in Wrangler correctly.</span>';
        showToast("Error loading daily insights", "bg-red-500");
    } finally {
        btn.disabled = false;
        btn.innerText = 'Analyze';
    }
}

async function remindMissingReports() {
    if (!window.currentMissingExecs || window.currentMissingExecs.length === 0) return;
    if (!confirmActionWithToast('remind-all', 'Send SMS reminder to all missing executives?')) return;

    const phones = window.currentMissingExecs.map(m => m.phone).filter(p => p);
    if (phones.length === 0) {
        showToast("No phone numbers available", "bg-red-500");
        return;
    }

    const dateStr = document.getElementById('insight-date-picker').value;
    const content = `Hello Executive, friendly reminder to submit your report for ${dateStr}. God bless you! - CMF Admin`;

    try {
        showToast("Sending reminders...", "bg-red-700");
        const res = await fetch(`${API_BASE_URL}/api/send-manual-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipients: phones, content: content })
        });
        if (res.ok) {
            showToast(`Reminders sent to ${phones.length} executives!`, "bg-red-800");
        } else {
            throw new Error();
        }
    } catch (e) {
        showToast("Failed to send reminders", "bg-red-500");
    }
}

// --- PROFILES & ACADEMICS ---

async function openProfile(type, id) {
    toggleModal('profile-view-modal');
    document.getElementById('profile-view-name').innerText = 'Loading...';
    document.getElementById('profile-view-role').innerText = type.toUpperCase();
    document.getElementById('profile-view-course').innerText = '...';
    document.getElementById('profile-view-level').innerText = '...';
    document.getElementById('profile-academic-list').innerHTML = '<p class="text-xs text-red-500 italic">Fetching records...</p>';
    document.getElementById('profile-view-photo').src = 'https://ui-avatars.com/api/?name=Loading&background=fee2e2&color=991b1b';

    try {
        const res = await fetchWithRetry(`${API_BASE_URL}/api/${type}/${id}/profile`);
        if (!res.ok) throw new Error();
        const profile = await res.json();

        document.getElementById('profile-view-name').innerText = profile.name;
        document.getElementById('profile-view-photo').src = profile.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=fee2e2&color=991b1b`;
        document.getElementById('profile-view-course').innerText = profile.course || 'Not Set';
        document.getElementById('profile-view-level').innerText = profile.level || profile.current_level || 'Not Set';

        // Set up the Edit button
        const btnEdit = document.getElementById('btn-edit-profile');
        btnEdit.onclick = () => {
            toggleModal('profile-view-modal');
            toggleModal('edit-profile-modal');
            document.getElementById('edit-profile-id').value = id;
            document.getElementById('edit-profile-type').value = type;
            document.getElementById('edit-profile-course').value = profile.course || '';
            document.getElementById('edit-profile-level').value = profile.level || profile.current_level || '';
            document.getElementById('edit-profile-photo').value = profile.photo_url || '';
        };

        // Set up Academic Log button
        const btnAcad = document.getElementById('btn-add-academic-record');
        btnAcad.onclick = () => {
            toggleModal('profile-view-modal');
            toggleModal('add-academic-record-modal');
            document.getElementById('academic-student-id').value = id;
            document.getElementById('academic-student-type').value = type === 'users' ? 'Executive' : 'Member';
            document.getElementById('academic-student-course').value = profile.course || '';
        };

        // Render Academics
        const acadContainer = document.getElementById('profile-academic-list');
        if (profile.academics && profile.academics.length > 0) {
            acadContainer.innerHTML = profile.academics.map(a => `
                <div class="p-3 bg-white border border-red-100 rounded-lg flex justify-between items-center text-sm shadow-sm transition hover:shadow group">
                    <div>
                        <span class="font-bold text-red-900 block">Year ${a.academic_year} - ${a.term_identifier}</span>
                        <span class="text-[10px] text-red-600 font-bold uppercase tracking-wider">Score/GPA: ${a.score}</span>
                    </div>
                    <div class="px-3 py-1 bg-red-50 border border-red-200 text-red-800 rounded font-black text-xl">
                        ${a.grade}
                    </div>
                </div>
            `).join('');
        } else {
            acadContainer.innerHTML = '<p class="text-xs text-red-500 italic font-medium">No results recorded yet.</p>';
        }

    } catch (e) {
        showToast("Error loading profile details", "bg-red-500");
        toggleModal('profile-view-modal');
    }
}

document.getElementById('edit-profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const id = document.getElementById('edit-profile-id').value;
    const type = document.getElementById('edit-profile-type').value;

    const payload = {
        course: document.getElementById('edit-profile-course').value.trim(),
        level: document.getElementById('edit-profile-level').value.trim(),
        photo_url: document.getElementById('edit-profile-photo').value.trim()
    };

    btn.disabled = true;
    btn.innerText = "Saving...";

    try {
        const res = await fetch(`${API_BASE_URL}/api/${type}/${id}/profile`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error();

        showToast("Profile updated!", "bg-red-800");
        toggleModal('edit-profile-modal');
        e.target.reset();
        openProfile(type, id); // Refresh profile view

        // Refresh underlying lists if admin view
        const user = JSON.parse(localStorage.getItem('church_user'));
        if (user && user.role !== 'Executive') {
            if (typeof loadAllMembers === 'function') setTimeout(loadAllMembers, 500);
            if (typeof loadExecutives === 'function') setTimeout(loadExecutives, 500);
        } else if (user) {
            setTimeout(() => fetchFlock(user.id), 500);
        }

    } catch (err) {
        showToast("Update failed.", "bg-red-500");
    } finally {
        btn.disabled = false;
        btn.innerText = "Save Profile";
    }
});

document.getElementById('add-academic-record-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');

    const payload = {
        student_id: document.getElementById('academic-student-id').value,
        student_type: document.getElementById('academic-student-type').value,
        course: document.getElementById('academic-student-course').value,
        academic_year: document.getElementById('academic-year').value,
        term_identifier: document.getElementById('academic-term').value.trim(),
        score: document.getElementById('academic-score').value.trim()
    };

    btn.disabled = true;
    btn.innerText = "Saving...";

    try {
        const res = await fetch(`${API_BASE_URL}/api/academic-records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        showToast(`Result saved! Grade: ${data.grade}`, "bg-red-800");
        toggleModal('add-academic-record-modal');
        e.target.reset();

        // Re-open profile to see new records
        const type = payload.student_type === 'Executive' ? 'users' : 'members';
        openProfile(type, payload.student_id);

    } catch (err) {
        showToast("Failed to save record.", "bg-red-500");
    } finally {
        btn.disabled = false;
        btn.innerText = "Save Record";
    }
});
