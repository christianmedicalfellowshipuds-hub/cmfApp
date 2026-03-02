// --- STATE MANAGEMENT ---
let reportState = {
    type: '',
    attendance: [],
    absent: [],
    answers: {},
    step: 1
};

// --- NAVIGATION LOGIC ---

function startWizard() {
    // Reset State
    reportState = { type: '', attendance: [], absent: [], answers: {}, step: 1 };
    
    // Clear inputs
    document.querySelectorAll('#wizard-view textarea').forEach(txt => txt.value = '');
    
    // Switch Views
    showView('wizard');
    goToStep(1);
}

function cancelWizard() {
    if(confirm("Are you sure you want to cancel? Your progress will be lost.")) {
        showView('executive'); // Go back to dashboard
    }
}

function selectReportType(type) {
    reportState.type = type;
    
    // Populate the checkbox list based on the user's flock
    // Note: We assume 'window.currentFlock' was saved when the dashboard loaded
    populateAttendanceList(window.currentFlock || []); 
    
    nextStep(2);
}

function nextStep(stepNumber) {
    // LOGIC FOR TRANSITIONING TO THE REVIEW STEP (STEP 4)
    if (stepNumber === 4) {
        // 1. Capture Textarea Answers
        // We do this here so the reportState is current before rendering the review
        reportState.answers = {
            topic: document.getElementById('q-topic').value.trim(),
            prayer: document.getElementById('q-prayer').value.trim(),
            challenges: document.getElementById('q-challenges').value.trim()
        };
        
        // 2. Calculate Attendance from Checkboxes
        const checkboxes = document.querySelectorAll('.attendance-checkbox');
        reportState.attendance = [];
        reportState.absent = [];
        
        checkboxes.forEach(cb => {
            if (cb.checked) {
                reportState.attendance.push(cb.value);
            } else {
                reportState.absent.push(cb.value);
            }
        });

        // 3. Update the Review UI (The "Receipt" View)
        // Ensure these IDs exist in your Step 4 HTML
        const reviewTypeEl = document.getElementById('review-type');
        const reviewPresentEl = document.getElementById('review-present');
        const reviewAbsentEl = document.getElementById('review-absent');
        const reviewTopicEl = document.getElementById('review-topic');
        const reviewNamesEl = document.getElementById('review-names-list');

        if (reviewTypeEl) reviewTypeEl.innerText = reportState.type.toUpperCase();
        if (reviewPresentEl) reviewPresentEl.innerText = reportState.attendance.length;
        if (reviewAbsentEl) reviewAbsentEl.innerText = reportState.absent.length;
        if (reviewTopicEl) reviewTopicEl.innerText = reportState.answers.topic || "No topic specified";
        
        if (reviewNamesEl) {
            const nameList = reportState.attendance.length > 0 
                ? reportState.attendance.join(", ") 
                : "No members marked present";
            reviewNamesEl.innerText = `Present: ${nameList}`;
        }

        // Optional: Log state for debugging
        console.log("Proceeding to Review. Current State:", reportState);
    }
    
    // Perform the actual view transition
    goToStep(stepNumber);
}

function prevStep(stepNumber) {
    goToStep(stepNumber);
}

function goToStep(stepNumber) {
    reportState.step = stepNumber;
    document.getElementById('wizard-step-text').innerText = `Step ${stepNumber} of 4`;
    
    // Hide all steps
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.add('hidden'));
    
    // Show current step
    document.getElementById(`step-${stepNumber}`).classList.remove('hidden');
}

// --- DOM POPULATION ---

function populateAttendanceList(flockArray) {
    const listContainer = document.getElementById('wizard-flock-list');
    listContainer.innerHTML = ''; // Clear previous

    if(flockArray.length === 0) {
        listContainer.innerHTML = '<p class="text-red-700 p-4">No members assigned to you yet.</p>';
        return;
    }

    flockArray.forEach(member => {
        const div = document.createElement('div');
        div.className = "flex items-center p-3 bg-white rounded shadow-sm border border-red-100";
        div.innerHTML = `
            <input type="checkbox" id="mem-${member.id}" value="${member.name}" class="attendance-checkbox w-5 h-5 text-red-600 rounded border-red-300 focus:ring-red-500">
            <label for="mem-${member.id}" class="ml-3 block text-red-800 font-medium w-full cursor-pointer">${member.name}</label>
        `;
        listContainer.appendChild(div);
    });
}

// --- PDF GENERATION & SUBMISSION ---

async function submitWizard() {
    const btn = document.getElementById('btn-submit-report');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

    try {
        // 1. Generate PDF (using jsPDF from window)
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const user = JSON.parse(sessionStorage.getItem('church_user'));
        const dateStr = new Date().toISOString().split('T')[0];

        doc.setFontSize(22);
        doc.text("Church Report", 20, 20);
        
        doc.setFontSize(12);
        doc.text(`Type: ${reportState.type.toUpperCase()}`, 20, 30);
        doc.text(`Executive: ${user.name}`, 20, 40);
        doc.text(`Date: ${dateStr}`, 20, 50);
        
        doc.text(`Attendance: ${reportState.attendance.length} Present | ${reportState.absent.length} Absent`, 20, 65);
        
        doc.setFontSize(14);
        doc.text("Meeting Details:", 20, 80);
        doc.setFontSize(11);
        
        // Wrap text to fit PDF width
        const topicLines = doc.splitTextToSize(`Topic: ${reportState.answers.topic}`, 170);
        doc.text(topicLines, 20, 90);
        
        const prayerLines = doc.splitTextToSize(`Prayer/Testimonies: ${reportState.answers.prayer}`, 170);
        doc.text(prayerLines, 20, 110);
        
        const challengeLines = doc.splitTextToSize(`Challenges: ${reportState.answers.challenges}`, 170);
        doc.text(challengeLines, 20, 130);

        // Convert PDF to Base64 (stripping the "data:application/pdf;base64," prefix for R2)
        const pdfDataUri = doc.output('datauristring');
        const base64Pdf = pdfDataUri.split(',')[1];
        const filename = `${dateStr}_${reportState.type}_${user.name.replace(/\s+/g, '')}.pdf`;

        // 2. Send payload to Cloudflare Worker
        const payload = {
            id: crypto.randomUUID(),
            type: reportState.type,
            executive_id: user.id,
            attendance_count: reportState.attendance.length,
            absent_count: reportState.absent.length,
            report_data: reportState.answers,
            file_base64: base64Pdf,
            filename: filename
        };

        const response = await fetch(`${API_BASE_URL}/api/reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) throw new Error(result.error || "Upload failed");

        // Success!
        alert("Report successfully submitted and saved!");
        showView('executive'); // Return to dashboard
        
    } catch (error) {
        console.error("Submission Error:", error);
        alert("Failed to submit report: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Generate & Upload PDF';
    }
}
