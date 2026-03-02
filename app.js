// Configuration
const API_BASE_URL = 'https://cmfcmf.christianmedicalfellowshipuds.workers.dev'; // Replace with your actual Worker URL

// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    executive: document.getElementById('executive-view'),
    admin: document.getElementById('admin-view'),
    wizard: document.getElementById('wizard-view')
};
const navbar = document.getElementById('navbar');
const userGreeting = document.getElementById('user-greeting');
let adminRefreshTimer = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refresh-attendance-summary-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => refreshAttendanceSummary());
    }
    checkAuth();
});

// --- AUTHENTICATION & ROUTING ---

function checkAuth() {
    const user = JSON.parse(sessionStorage.getItem('church_user'));
    
    if (!user) {
        stopAdminRefreshLoop();
        showView('login');
        navbar.classList.add('hidden');
    } else {
        navbar.classList.remove('hidden');
        userGreeting.innerText = `Hello, ${user.name}`;
        
        if (user.role === 'Admin' || user.role === 'Master') {
            showView('admin');
            initAdminDashboard();
            startAdminRefreshLoop();
            // TODO: Fetch Admin Stats
        } else {
            stopAdminRefreshLoop();
            showView('executive');
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
            } catch (_) {}
            throw new Error(message);
        }
        
        const user = await res.json();
        sessionStorage.setItem('church_user', JSON.stringify(user));
        
        // Clear form and route
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        errorText.classList.add('hidden');
        checkAuth();

    } catch (err) {
        errorText.innerText = err.message;
        errorText.classList.remove('hidden');
    }
});

function logout() {
    stopAdminRefreshLoop();
    sessionStorage.removeItem('church_user');
    checkAuth();
}

// --- UTILITIES ---

function showView(viewName) {
    // Hide all views
    Object.values(views).forEach(el => el?.classList.add('hidden'));
    // Show target view
    if (views[viewName]) {
        views[viewName].classList.remove('hidden');
    }
}

function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.toggle('hidden');
}

function openSmsModal(name, phone) {
    const user = JSON.parse(sessionStorage.getItem('church_user'));
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
                    <div>
                        <h4 class="font-bold text-red-900">${member.name}</h4>
                        <span class="text-[10px] uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">${member.status}</span>
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
    if (!confirm("Mark this task as completed?")) return;
    
    showToast("Updating task...", "bg-red-700");

    try {
        const res = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
            method: 'DELETE' // Or 'PATCH' if you prefer to archive them
        });

        if (res.ok) {
            showToast("Task Completed!", "bg-red-800");
            const user = JSON.parse(sessionStorage.getItem('church_user'));
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
    // Run all admin initializations
    await Promise.all([
        loadDashboardStats(),
        loadExecutivesDropdown(), // Your current logic moved to a helper
        loadExecutivesList(),     // The new list of leaders
        loadAllMembers(),         // The global member directory
        loadAttendanceLog(),      // The attendance report log table
        loadAttendanceSummary()   // Executive submission summary
    ]);
}

// Your current logic moved here for cleanliness
async function loadExecutivesDropdown() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/executives`);
        const execs = await res.json();
        
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

        if (!res.ok) {
            let message = "Error assigning task";
            try {
                const errPayload = await res.json();
                if (errPayload?.error) message = errPayload.error;
            } catch (_) {}
            throw new Error(message);
        }

        showToast("Task Assigned & SMS Sent!", "bg-red-800");
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
        const adminVisible = views.admin && !views.admin.classList.contains('hidden');
        if (adminVisible) refreshAttendanceSummary(true);
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
    return type;
}

async function refreshAttendanceSummary(silent = false) {
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
        const res = await fetch(`${API_BASE_URL}/api/admin/attendance-summary`);
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
        const res = await fetch(`${API_BASE_URL}/api/executives`);
        const execs = await res.json();
        
        
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
                        <div>
                            <p class="font-bold text-red-900">${exec.name}</p>
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
    if (!confirm(`Do you want to ${actionText} ${execName}'s account?`)) return;

    try {
        const res = await fetch(`${API_BASE_URL}/api/executives/${execId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_disabled: willDisable })
        });

        let payload = {};
        try { payload = await res.json(); } catch (_) {}
        if (!res.ok) throw new Error(payload?.error || `Failed to ${actionText} account`);

        showToast(`Account ${willDisable ? 'disabled' : 'enabled'} for ${execName}`, "bg-red-800");
        await Promise.all([loadExecutivesList(), loadExecutivesDropdown(), loadAttendanceSummary()]);
    } catch (err) {
        showToast(err.message || `Failed to ${actionText} account`, "bg-red-500");
    }
}

async function removeExecutive(execId, execName) {
    const warning = `Remove ${execName} permanently?\n\nThis will:\n- Unassign members from this executive\n- Delete assigned tasks\n- Keep report records but detach from this account`;
    if (!confirm(warning)) return;

    try {
        const res = await fetch(`${API_BASE_URL}/api/executives/${execId}`, {
            method: 'DELETE'
        });
        let payload = {};
        try { payload = await res.json(); } catch (_) {}
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

        if (!res.ok) {
            let message = "Failed to add leader";
            try {
                const errPayload = await res.json();
                if (errPayload?.error) message = errPayload.error;
            } catch (_) {}
            throw new Error(message);
        }

        showToast("New Executive Added!", "bg-red-800");
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
    const user = JSON.parse(sessionStorage.getItem('church_user'));

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
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-red-500"></i></td></tr>';

    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/all-members`);
        window.allMembersData = await res.json(); // Store globally for search filtering
        renderMemberTable(window.allMembersData);
    } catch (err) {
        showToast("Failed to load members", "bg-red-500");
    }
}

function renderMemberTable(data) {
    const tableBody = document.getElementById('admin-member-table');
    tableBody.innerHTML = data.map(m => `
        <tr class="border-b border-red-100 hover:bg-red-50 transition">
            <td class="py-4 px-2">
                <div class="font-bold text-red-900">${m.name}</div>
                <div class="text-[10px] text-red-700">${m.phone}</div>
            </td>
            <td class="py-4 px-2">
                <span class="text-[10px] px-2 py-1 rounded-full font-bold bg-red-50 text-red-600">${m.status}</span>
            </td>
            <td class="py-4 px-2 text-xs text-red-700">
                ${m.level} <br> <span class="text-red-500">${m.course}</span>
            </td>
            <td class="py-4 px-2 text-xs font-medium text-red-800">
                <i class="fa-solid fa-user-tie mr-1 text-red-300"></i> ${m.leader_name || 'Unassigned'}
            </td>
            <td class="py-4 px-2 text-right">
                <a href="tel:${m.phone}" class="text-red-600 hover:text-red-800 mx-2"><i class="fa-solid fa-phone"></i></a>
                <button onclick="openSmsModal('${m.name}', '${m.phone}')" class="text-red-600 hover:text-red-800"><i class="fa-solid fa-comment-sms"></i></button>
            </td>
        </tr>
    `).join('');
}

function filterMembers() {
    const term = document.getElementById('member-search').value.toLowerCase();
    const filtered = window.allMembersData.filter(m => 
        m.name.toLowerCase().includes(term) || 
        m.phone.includes(term) ||
        m.status.toLowerCase().includes(term)
    );
    renderMemberTable(filtered);
}

async function loadAttendanceLog() {
    const tableBody = document.getElementById('attendance-table-body');
    if (!tableBody) return false;

    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-6"><i class="fa-solid fa-spinner fa-spin text-red-500"></i></td></tr>';

    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/attendance`);
        if (!res.ok) throw new Error('Attendance request failed');
        const reports = await res.json();

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
        const res = await fetch(`${API_BASE_URL}/api/admin/stats`);
        const stats = await res.json();

        document.getElementById('stat-total-members').innerText = stats.totalMembers;
        document.getElementById('stat-total-execs').innerText = stats.totalExecutives;
        document.getElementById('stat-last-attendance').innerText = stats.lastService;
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

