let reportState = {
    type: '',
    attendance: [],
    absent: [],
    answers: {},
    step: 1
};

function startWizard() {
    reportState = { type: '', attendance: [], absent: [], answers: {}, step: 1 };
    const dynamicContainer = document.getElementById('dynamic-questions-container');
    if (dynamicContainer) dynamicContainer.innerHTML = '';
    showView('wizard');
    goToStep(1);
}

function cancelWizard() {
    if (typeof confirmActionWithToast === 'function' && !confirmActionWithToast('cancel-wizard', 'Discard current report?')) {
        return;
    }
    showView('app');
    showToast('Report canceled', 'bg-red-500');
}

function selectReportType(type) {
    reportState.type = type;
    populateAttendanceList(window.currentFlock || []);
    setStep2Prompt();
    nextStep(2);
}

function setStep2Prompt() {
    const titleEl = document.getElementById('step-2-title');
    const descEl = document.getElementById('step-2-description');
    if (!titleEl || !descEl) return;

    if (reportState.type === 'outreach') {
        titleEl.textContent = 'Outreach Attendance';
        descEl.textContent = 'How many of your members are coming for outreach? Tick those coming.';
    } else if (reportState.type === 'cell') {
        titleEl.textContent = 'Cell Meeting Attendance';
        descEl.textContent = 'Tick members that attended the cell meeting.';
    } else {
        titleEl.textContent = 'Church Service Attendance';
        descEl.textContent = 'Tick members that attended the church service.';
    }
}

function nextStep(stepNumber) {
    if (stepNumber === 3) {
        captureAttendanceSelection();
        buildStep3();
    }

    if (stepNumber === 4) {
        captureAttendanceSelection();
        captureStep3Answers();
        updateReviewUI();
    }

    goToStep(stepNumber);
}

function prevStep(stepNumber) {
    goToStep(stepNumber);
}

function goToStep(stepNumber) {
    reportState.step = stepNumber;
    const stepText = document.getElementById('wizard-step-text');
    if (stepText) stepText.textContent = `Step ${stepNumber} of 4`;
    document.querySelectorAll('.wizard-step').forEach((el) => el.classList.add('hidden'));
    const targetStep = document.getElementById(`step-${stepNumber}`);
    if (targetStep) targetStep.classList.remove('hidden');
}

function captureAttendanceSelection() {
    const checkboxes = document.querySelectorAll('.attendance-checkbox');
    reportState.attendance = [];
    reportState.absent = [];
    checkboxes.forEach((cb) => {
        if (cb.checked) {
            reportState.attendance.push(cb.value);
        } else {
            reportState.absent.push(cb.value);
        }
    });
}

function populateAttendanceList(flockArray) {
    const listContainer = document.getElementById('wizard-flock-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (!Array.isArray(flockArray) || flockArray.length === 0) {
        listContainer.innerHTML = '<p class="text-red-700 p-4">No members assigned to you yet.</p>';
        return;
    }

    flockArray.forEach((member) => {
        const div = document.createElement('div');
        div.className = 'flex items-center p-3 bg-white rounded shadow-sm border border-red-100';
        div.innerHTML = `
            <input type="checkbox" id="mem-${member.id}" value="${member.name}" class="attendance-checkbox w-5 h-5 text-red-600 rounded border-red-300 focus:ring-red-500">
            <label for="mem-${member.id}" class="ml-3 block text-red-800 font-medium w-full cursor-pointer">${member.name}</label>
        `;
        listContainer.appendChild(div);
    });
}

function buildStep3() {
    const container = document.getElementById('dynamic-questions-container');
    const title = document.getElementById('step-3-title');
    if (!container || !title) return;

    let html = '';
    const absentSection = buildAbsentReasonsSection();

    if (reportState.type === 'cell') {
        title.textContent = 'Cell Meeting Questions';
        html = `
            <div>
                <label class="block text-sm font-bold text-red-900 mb-1">When did you have your cell meeting? (date and time)</label>
                <input type="datetime-local" id="dyn-meeting-date" class="input-brand">
            </div>
            ${absentSection}
            <div>
                <label class="block text-sm font-bold text-red-900 mb-1">How was the cell meeting?</label>
                <textarea id="dyn-cell-meeting-how" class="input-brand h-24" placeholder="Share how the meeting went"></textarea>
            </div>
            <div>
                <label class="block text-sm font-bold text-red-900 mb-1">Did any new member join?</label>
                <select id="dyn-new-member-joined" class="input-brand bg-white">
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-bold text-red-900 mb-1">If yes, who joined?</label>
                <input type="text" id="dyn-new-member-name" class="input-brand" placeholder="Name(s) of new member(s)">
            </div>
        `;
    } else if (reportState.type === 'outreach') {
        title.textContent = 'Outreach Report Questions';
        html = `
            ${absentSection}
            <div>
                <label class="block text-sm font-bold text-red-900 mb-1">How was your outreach? (challenges/testimonies)</label>
                <textarea id="dyn-outreach-how" class="input-brand h-24" placeholder="Share outreach challenges and testimonies"></textarea>
            </div>
        `;
    } else {
        title.textContent = 'Church Service Questions';
        html = `
            ${absentSection}
            <div>
                <label class="block text-sm font-bold text-red-900 mb-1">How was the church service?</label>
                <textarea id="dyn-service-review" class="input-brand h-24" placeholder="General service review"></textarea>
            </div>
            <div>
                <label class="block text-sm font-bold text-red-900 mb-1">Testimonies</label>
                <textarea id="dyn-service-testimonies" class="input-brand h-20" placeholder="Share testimonies"></textarea>
            </div>
            <div>
                <label class="block text-sm font-bold text-red-900 mb-1">Challenges</label>
                <textarea id="dyn-service-challenges" class="input-brand h-20" placeholder="Share challenges"></textarea>
            </div>
        `;
    }

    container.innerHTML = html;
}

function buildAbsentReasonsSection() {
    if (!Array.isArray(reportState.absent) || reportState.absent.length === 0) {
        return `
            <div class="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                No absentees recorded in this step.
            </div>
        `;
    }

    const questions = reportState.absent.map((name, index) => `
        <div>
            <label class="block text-xs font-bold text-red-700 mb-1">Why is ${name} not coming?</label>
            <input type="text" id="dyn-absent-${index}" class="input-brand text-sm py-2" placeholder="Reason">
        </div>
    `).join('');

    return `
        <div class="pt-2 border-t border-red-100">
            <h4 class="font-bold text-red-900 mb-2">
                <i class="fa-solid fa-users-slash text-red-500"></i> Reasons for Absence
            </h4>
            <div class="space-y-3">
                ${questions}
            </div>
        </div>
    `;
}

function captureStep3Answers() {
    const answers = {
        confirmed_members: [...reportState.attendance],
        not_coming_members: [...reportState.absent],
        absent_reasons: []
    };

    reportState.absent.forEach((name, index) => {
        const field = document.getElementById(`dyn-absent-${index}`);
        answers.absent_reasons.push({
            name,
            reason: field ? field.value.trim() : ''
        });
    });

    if (reportState.type === 'cell') {
        answers.meeting_date_time = document.getElementById('dyn-meeting-date')?.value || '';
        answers.cell_meeting_feedback = document.getElementById('dyn-cell-meeting-how')?.value.trim() || '';
        answers.new_member_joined = document.getElementById('dyn-new-member-joined')?.value || 'no';
        answers.new_member_name = document.getElementById('dyn-new-member-name')?.value.trim() || '';
    } else if (reportState.type === 'outreach') {
        answers.outreach_feedback = document.getElementById('dyn-outreach-how')?.value.trim() || '';
    } else {
        answers.service_review = document.getElementById('dyn-service-review')?.value.trim() || '';
        answers.service_testimonies = document.getElementById('dyn-service-testimonies')?.value.trim() || '';
        answers.service_challenges = document.getElementById('dyn-service-challenges')?.value.trim() || '';
    }

    reportState.answers = answers;
}

function updateReviewUI() {
    const reviewType = document.getElementById('review-type');
    const reviewPresent = document.getElementById('review-present');
    const reviewAbsent = document.getElementById('review-absent');
    const reviewTopic = document.getElementById('review-topic');
    const reviewNames = document.getElementById('review-names-list');

    if (reviewType) reviewType.textContent = `${formatReportTypeLabel(reportState.type)} Report`;
    if (reviewPresent) reviewPresent.textContent = String(reportState.attendance.length);
    if (reviewAbsent) reviewAbsent.textContent = String(reportState.absent.length);

    if (reviewTopic) {
        if (reportState.type === 'cell') {
            reviewTopic.textContent = reportState.answers.meeting_date_time
                ? `Meeting Date: ${new Date(reportState.answers.meeting_date_time).toLocaleString()}`
                : 'Meeting Date: not provided';
        } else if (reportState.type === 'outreach') {
            reviewTopic.textContent = 'Outreach confirmation and feedback captured.';
        } else {
            reviewTopic.textContent = 'Church service feedback captured.';
        }
    }

    if (reviewNames) {
        reviewNames.textContent = reportState.attendance.length > 0
            ? `Confirmed: ${reportState.attendance.join(', ')}`
            : 'No members marked present/confirmed';
    }

    const attendanceInput = document.getElementById('wizard-attendance-input');
    const absentInput = document.getElementById('wizard-absent-input');
    const typeInput = document.getElementById('wizard-type-select');
    if (attendanceInput) attendanceInput.value = String(reportState.attendance.length);
    if (absentInput) absentInput.value = String(reportState.absent.length);
    if (typeInput) typeInput.value = reportState.type;
}

function formatReportTypeLabel(type) {
    if (type === 'cell') return 'Cell Meeting';
    if (type === 'service') return 'Church Service';
    if (type === 'outreach') return 'Outreach';
    return type || 'General';
}

function toReadableLabel(key) {
    const map = {
        meeting_date_time: 'Meeting Date & Time',
        cell_meeting_feedback: 'Cell Meeting Feedback',
        new_member_joined: 'New Member Joined',
        new_member_name: 'New Member Name(s)',
        outreach_feedback: 'Outreach Feedback (Challenges/Testimonies)',
        service_review: 'Service Review',
        service_testimonies: 'Service Testimonies',
        service_challenges: 'Service Challenges'
    };
    return map[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAnswerRows(answerObj) {
    const rows = [];
    Object.entries(answerObj || {}).forEach(([key, value]) => {
        if (key === 'confirmed_members' || key === 'not_coming_members' || key === 'absent_reasons') {
            return;
        }
        if (Array.isArray(value)) {
            rows.push([toReadableLabel(key), value.join(', ') || 'None']);
            return;
        }
        rows.push([toReadableLabel(key), value || '']);
    });
    return rows;
}

function addPdfSection(doc, currentY, title, content) {
    let y = currentY;
    const lines = doc.splitTextToSize(content || 'Not provided', 172);
    const sectionHeight = Math.max(16, lines.length * 5 + 10);

    if (y + sectionHeight > 280) {
        doc.addPage();
        y = 16;
    }

    doc.setFillColor(255, 245, 245);
    doc.roundedRect(14, y, 182, sectionHeight, 3, 3, 'F');
    doc.setTextColor(120, 30, 30);
    doc.setFontSize(11);
    doc.text(title, 18, y + 7);
    doc.setTextColor(55, 22, 22);
    doc.setFontSize(10.5);
    doc.text(lines, 18, y + 13);

    return y + sectionHeight + 6;
}

function drawSummaryCard(doc, x, y, title, value) {
    doc.setFillColor(255, 245, 245);
    doc.roundedRect(x, y, 56, 20, 3, 3, 'F');
    doc.setTextColor(120, 30, 30);
    doc.setFontSize(8.5);
    doc.text(title.toUpperCase(), x + 4, y + 6);
    doc.setTextColor(49, 17, 17);
    doc.setFontSize(14);
    doc.text(String(value), x + 4, y + 15);
}

async function submitWizard() {
    const btn = document.getElementById('btn-submit-report');
    if (!btn) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    showToast('Submitting report...', 'bg-red-700');

    try {
        const user = JSON.parse(localStorage.getItem('church_user') || '{}');
        if (!user?.id) throw new Error('Session expired. Please sign in again.');

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const displayDate = now.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        doc.setFillColor(153, 27, 27);
        doc.rect(0, 0, 210, 32, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(19);
        doc.text('CMF Leadership Report', 14, 14);
        doc.setFontSize(11);
        doc.text(`${formatReportTypeLabel(reportState.type)} Report`, 14, 22);
        doc.text(`Executive: ${user.name || 'Unknown'} | ${displayDate}`, 14, 28);

        drawSummaryCard(doc, 14, 38, 'Present/Confirmed', reportState.attendance.length);
        drawSummaryCard(doc, 76, 38, 'Absent/Not Coming', reportState.absent.length);
        drawSummaryCard(doc, 138, 38, 'Report Type', formatReportTypeLabel(reportState.type));

        let y = 66;
        const confirmedText = reportState.attendance.length > 0 ? reportState.attendance.join(', ') : 'None';
        y = addPdfSection(doc, y, 'Confirmed Members', confirmedText);

        const absentReasons = Array.isArray(reportState.answers.absent_reasons)
            ? reportState.answers.absent_reasons
                .map((item) => `${item.name}: ${item.reason || 'No reason provided'}`)
                .join(' | ')
            : '';
        y = addPdfSection(doc, y, 'Absentee Reasons', absentReasons || 'No reasons supplied.');

        const rows = formatAnswerRows(reportState.answers);
        rows.forEach(([label, value]) => {
            y = addPdfSection(doc, y, label, String(value || ''));
        });

        const pageCount = doc.internal.getNumberOfPages();
        for (let page = 1; page <= pageCount; page += 1) {
            doc.setPage(page);
            doc.setTextColor(120, 30, 30);
            doc.setFontSize(8);
            doc.text(`Generated by CMF Portal | Page ${page} of ${pageCount}`, 105, 292, { align: 'center' });
        }

        const pdfDataUri = doc.output('datauristring');
        const base64Pdf = pdfDataUri.split(',')[1];
        const safeName = String(user.name || 'executive').replace(/\s+/g, '');
        const filename = `${dateStr}_${reportState.type}_${safeName}.pdf`;

        const payload = {
            id: crypto.randomUUID(),
            type: reportState.type,
            executive_id: user.id,
            attendance_count: reportState.attendance.length,
            absent_count: reportState.absent.length,
            report_data: reportState.answers,
            file_base64: base64Pdf,
            filename
        };

        const response = await fetch(`${API_BASE_URL}/api/reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Upload failed');

        showToast('Report submitted successfully', 'bg-red-800');
        showView('app');
        switchTab('reports');
        if (reportState.type === 'outreach' && typeof loadNextTuesdayServicePlan === 'function') {
            loadNextTuesdayServicePlan(true);
        }
    } catch (error) {
        console.error('Submission Error:', error);
        showToast(`Failed to submit report: ${error.message}`, 'bg-red-500');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Generate & Upload PDF';
    }
}
