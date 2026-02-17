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

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});

// --- AUTHENTICATION & ROUTING ---

function checkAuth() {
    const user = JSON.parse(sessionStorage.getItem('church_user'));
    
    if (!user) {
        showView('login');
        navbar.classList.add('hidden');
    } else {
        navbar.classList.remove('hidden');
        userGreeting.innerText = `Hello, ${user.name}`;
        
        if (user.role === 'Admin' || user.role === 'Master') {
            showView('admin');
            initAdminDashboard();
            // TODO: Fetch Admin Stats
        } else {
            showView('executive');
            fetchFlock(user.id);
            fetchTasks(user.id);
        }
    }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const errorText = document.getElementById('login-error');
    
    try {
        // Calling your Cloudflare Worker
        const res = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });

        if (!res.ok) throw new Error("Invalid credentials");
        
        const user = await res.json();
        sessionStorage.setItem('church_user', JSON.stringify(user));
        
        // Clear form and route
        document.getElementById('login-email').value = '';
        checkAuth();

    } catch (err) {
        errorText.innerText = err.message;
        errorText.classList.remove('hidden');
    }
});

function logout() {
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
    showToast("Sending SMS...", "bg-indigo-600");
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/send-manual-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipients: [phone], content: content })
        });

        if (res.ok) {
            showToast("Message Sent Successfully!", "bg-green-600");
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
    listContainer.innerHTML = '<div class="p-4 text-center"><i class="fa-solid fa-spinner fa-spin text-indigo-500"></i></div>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/flock/${leaderId}`);
        const data = await response.json();
        window.currentFlock = data; 
        listContainer.innerHTML = ''; 

        data.forEach(member => {
            const card = document.createElement('div');
            card.className = "p-4 bg-white rounded-xl border border-gray-100 shadow-sm space-y-3";
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-gray-800">${member.name}</h4>
                        <span class="text-[10px] uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">${member.status}</span>
                    </div>
                    <div class="flex gap-2">
                        <a href="tel:${member.phone}" class="w-9 h-9 bg-green-100 text-green-600 rounded-full flex items-center justify-center hover:bg-green-600 hover:text-white transition">
                            <i class="fa-solid fa-phone-flip text-sm"></i>
                        </a>
                        <button onclick="openSmsModal('${member.name}', '${member.phone}')" class="w-9 h-9 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center hover:bg-blue-600 hover:text-white transition">
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
    taskContainer.innerHTML = '<div class="p-4 text-center"><i class="fa-solid fa-spinner fa-spin text-indigo-500"></i></div>';

    try {
        const res = await fetch(`${API_BASE_URL}/api/tasks/${userId}`);
        const tasks = await res.json();

        if (tasks.length === 0) {
            taskContainer.innerHTML = '<p class="text-gray-400 text-sm italic text-center py-4">No pending tasks. Great job!</p>';
            return;
        }

        taskContainer.innerHTML = tasks.map(task => {
            const dueDate = new Date(task.due_date).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short'
            });

            return `
                <div class="p-4 bg-indigo-50 border border-indigo-100 rounded-xl relative group">
                    <div class="flex items-start gap-3">
                        <div class="mt-1">
                            <i class="fa-solid fa-circle-dot text-indigo-500"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-gray-800 text-sm">${task.title}</h4>
                            <p class="text-xs text-gray-500 mt-0.5">Due: ${dueDate}</p>
                        </div>
                    </div>
                    <button onclick="completeTask('${task.id}')" class="absolute right-4 top-1/2 -translate-y-1/2 bg-white text-indigo-600 border border-indigo-200 p-2 rounded-lg hover:bg-indigo-600 hover:text-white transition shadow-sm">
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
    
    showToast("Updating task...", "bg-indigo-600");

    try {
        const res = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
            method: 'DELETE' // Or 'PATCH' if you prefer to archive them
        });

        if (res.ok) {
            showToast("Task Completed!", "bg-green-600");
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
        loadAttendanceLog()       // The new attendance table
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
        execs.forEach(exec => {
            const opt = document.createElement('option');
            opt.value = exec.id;
            opt.innerText = exec.name;
            dropdown.appendChild(opt);
        });
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

    if (!taskData.assignee_id) return showToast("Please select an executive", "bg-orange-500");

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending SMS...';

    try {
        const res = await fetch(`${API_BASE_URL}/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });

        if (res.ok) {
            showToast("Task Assigned & SMS Sent!", "bg-green-600");
            e.target.reset();
        } else {
            throw new Error();
        }
    } catch (err) {
        showToast("Error assigning task", "bg-red-500");
    } finally {
        btn.disabled = false;
        btn.innerText = "Send Task & SMS";
    }
});

function showToast(message, bgColor = "bg-gray-900") {
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
            // MOVE THIS LINE INSIDE THE MAP LOOP
            const lastLogin = exec.last_login ? new Date(exec.last_login).toLocaleDateString() : 'Never';
            
            return `
                <div class="p-4 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center">
                    <div>
                        <p class="font-bold text-gray-800">${exec.name}</p>
                        <p class="text-xs text-gray-500">${exec.email || 'No Email'}</p>
                        <p class="text-[10px] text-gray-400">Last Seen: ${lastLogin}</p>
                    </div>
                    <span class="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold uppercase">Active</span>
                </div>
            `;
        }).join('');
    } catch (err) {
        showToast("Error loading leaders", "bg-red-500");
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

        if (res.ok) {
            showToast("New Executive Added!", "bg-green-600");
            toggleModal('add-exec-modal');
            e.target.reset();
            loadExecutivesList(); // Refresh the list
            initAdminDashboard(); // Refresh the task dropdown
        } else {
            throw new Error();
        }
    } catch (err) {
        showToast("Failed to add leader", "bg-red-500");
    } finally {
        btn.disabled = false;
        btn.innerText = "Save Leader";
    }
});

async function loadAllMembers() {
    const tableBody = document.getElementById('admin-member-table');
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-indigo-500"></i></td></tr>';

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
        <tr class="border-b border-gray-50 hover:bg-gray-50 transition">
            <td class="py-4 px-2">
                <div class="font-bold text-gray-800">${m.name}</div>
                <div class="text-[10px] text-gray-500">${m.phone}</div>
            </td>
            <td class="py-4 px-2">
                <span class="text-[10px] px-2 py-1 rounded-full font-bold bg-indigo-50 text-indigo-600">${m.status}</span>
            </td>
            <td class="py-4 px-2 text-xs text-gray-600">
                ${m.level} <br> <span class="text-gray-400">${m.course}</span>
            </td>
            <td class="py-4 px-2 text-xs font-medium text-gray-700">
                <i class="fa-solid fa-user-tie mr-1 text-gray-300"></i> ${m.leader_name || 'Unassigned'}
            </td>
            <td class="py-4 px-2 text-right">
                <a href="tel:${m.phone}" class="text-green-600 hover:text-green-700 mx-2"><i class="fa-solid fa-phone"></i></a>
                <button onclick="openSmsModal('${m.name}', '${m.phone}')" class="text-blue-600 hover:text-blue-700"><i class="fa-solid fa-comment-sms"></i></button>
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
    if (!tableBody) return;

    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/attendance`);
        const reports = await res.json();
        
        tableBody.innerHTML = reports.map(r => {
            const date = new Date(r.created_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short'
            });
            
            return `
                <tr class="border-b border-gray-50 hover:bg-gray-50 transition text-sm">
                    <td class="py-4 px-2 font-medium text-gray-800">${date}</td>
                    <td class="py-4 px-2 text-gray-600">${r.executive_name || 'System'}</td>
                    <td class="py-4 px-2 text-center font-bold text-green-600">${r.attendance_count}</td>
                    <td class="py-4 px-2 text-center font-bold text-red-600">${r.absent_count}</td>
                    <td class="py-4 px-2 text-right">
                        <button onclick="window.open('${r.pdf_url}', '_blank')" 
                            class="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg border border-indigo-100 hover:bg-indigo-600 hover:text-white transition text-xs font-bold">
                            VIEW PDF <i class="fa-solid fa-file-pdf ml-1"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error("Error loading attendance", err);
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