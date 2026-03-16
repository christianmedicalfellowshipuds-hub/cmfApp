import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Extract major blocks
# Executive View content (Tasks + Flock)
exec_view_match = re.search(r'<div id="executive-view".*?>(.*?)</div>\s+</div>\s+<div id="wizard-view"', content, re.DOTALL)
exec_view_content = exec_view_match.group(1) if exec_view_match else ""

# Admin Stats (Metric cards)
admin_stats_match = re.search(r'(<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">.*?</div>)', content, re.DOTALL)
admin_stats = admin_stats_match.group(1) if admin_stats_match else ""

# Assign Task Form
task_form_match = re.search(r'(<div class="section-card p-6">.*?Assign New Task.*?</div>)', content, re.DOTALL)
task_form = task_form_match.group(1) if task_form_match else ""

# Executives List
execs_list_match = re.search(r'(<div class="section-card p-6 mb-6">.*?Church Executives.*?</div>)', content, re.DOTALL)
execs_list = execs_list_match.group(1) if execs_list_match else ""

# Member Directory
member_dir_match = re.search(r'(<div class="section-card p-6 mb-6">.*?Member Directory.*?</div>)', content, re.DOTALL)
member_dir = member_dir_match.group(1) if member_dir_match else ""

# AI Insights
ai_insights_match = re.search(r'(<div class="section-card p-6 mb-6">.*?Daily AI Insights.*?</div>)', content, re.DOTALL)
ai_insights = ai_insights_match.group(1) if ai_insights_match else ""

# Attendance Summary
att_summary_match = re.search(r'(<div class="section-card p-6">.*?Attendance Submission Summary.*?</div>)', content, re.DOTALL)
att_summary = att_summary_match.group(1) if att_summary_match else ""

# Dashboard Tab
dashboard_tab = f"""
                <div id="admin-dashboard-view" class="hidden space-y-6">
                    {admin_stats}
                    {task_form}
                </div>
                <div id="executive-dashboard-view" class="hidden space-y-6">
                    <div class="section-card hero-card p-6 md:p-7">
                        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                            <div class="flex items-center gap-4">
                                <img src="https://firebasestorage.googleapis.com/v0/b/mealone-29b00.firebasestorage.app/o/WhatsApp%20Image%202026-01-27%20at%207.32.38%20AM.jpeg?alt=media&token=6913ddcf-3f97-40a7-9164-9e0b77eab524" class="app-logo w-14 h-14">
                                <div>
                                    <p class="brand-badge">Executive Dashboard</p>
                                    <h2 class="brand-serif text-2xl text-red-900 mt-2">Shepherd Your Flock</h2>
                                </div>
                            </div>
                            <button onclick="startWizard()" class="btn-brand px-6 py-4 text-base md:text-lg flex items-center justify-center gap-2">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> Start New Report
                            </button>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="section-card p-6">
                            <h3 class="text-lg font-extrabold mb-4 flex items-center gap-2 text-red-900">
                                <i class="fa-solid fa-list-check text-red-500"></i> My Tasks
                            </h3>
                            <div id="task-list" class="space-y-3">
                                <p class="text-red-800/70 text-sm italic text-center py-4">Checking for tasks...</p>
                            </div>
                        </div>
                        <div class="section-card p-6">
                             <h3 class="text-lg font-extrabold mb-4 flex items-center gap-2 text-red-900">
                                <i class="fa-solid fa-users text-red-500"></i> Quick Access
                            </h3>
                            <button onclick="switchTab('members')" class="w-full btn-outline-brand py-3 mb-2">View Full Flock</button>
                            <button onclick="switchTab('academics')" class="w-full btn-outline-brand py-3">Academic Overviews</button>
                        </div>
                    </div>
                </div>
"""

# Members Tab
members_tab = f"""
                <div id="admin-members-view" class="hidden space-y-6">
                    {execs_list}
                    {member_dir}
                </div>
                <div id="executive-members-view" class="hidden space-y-6">
                    <div class="section-card p-6 relative">
                        <h3 class="text-lg font-extrabold mb-4 flex items-center gap-2 text-red-900">
                            <i class="fa-solid fa-users text-red-500"></i> My Flock
                        </h3>
                        <div id="flock-list" class="space-y-3 max-h-[70vh] overflow-y-auto no-scrollbar pb-16"></div>
                        <button onclick="toggleModal('add-soul-modal')" class="absolute bottom-6 right-6 btn-brand w-14 h-14 rounded-full flex items-center justify-center text-2xl active:scale-95 z-10">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                </div>
"""

# Reports Tab
reports_tab = f"""
                <div id="admin-reports-view" class="hidden space-y-6">
                    {ai_insights}
                    {att_summary}
                </div>
                <div id="executive-reports-view" class="hidden space-y-6">
                    <div class="section-card p-6 text-center py-20">
                        <i class="fa-solid fa-clock-rotate-left text-6xl text-red-100 mb-4"></i>
                        <h3 class="text-xl font-bold text-red-900">My Submissions</h3>
                        <p class="text-red-600">History of your cell and service reports will appear here soon.</p>
                    </div>
                </div>
"""

# 2. Inject into placeholders
content = re.sub(r'<!-- Dashboard content moved here later -->', dashboard_tab, content)
content = re.sub(r'<!-- Members content moved here -->', members_tab, content)
content = re.sub(r'<!-- Reports content moved here -->', reports_tab, content)

# 3. Remove old blocks
# Remove executive-view and admin-view
content = re.sub(r'<div id="executive-view".*?</div>\s+</div>\s+<div id="wizard-view"', '<div id="wizard-view"', content, flags=re.DOTALL)
# Note: Admin view was at the end of the sections usually. Need to be careful.
content = re.sub(r'<div id="admin-view".*?</div>\s+</div>\s+</main>', '</main>', content, flags=re.DOTALL)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("HTML Restructured successfully")
