// ============================================
// PLAN APPRAISAL FORM - JAVASCRIPT LOGIC
// ============================================

// ============================================
// SUPABASE CONFIGURATION
// ============================================
var SUPABASE_URL = 'https://ocojsigqagaehlebubdw.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_njwmRaZK-bnzut7bZPDpNQ_0VolCv-C';

var supabaseClient = null;
var currentStaffUser = sessionStorage.getItem('staffEmail');
var currentStaffName = sessionStorage.getItem('staffDisplayName');
var currentStaffRole = sessionStorage.getItem('staffRole') || 'building_inspector';

var appraisalId = null;
var planFileUrl = null;
var planFilePath = null;

// ============================================
// QUESTIONS DATA - Exactly from Word document
// ============================================
var questions = [{
    section: '1',
    sectionLabel: 'GENERAL',
    items: [
        { id: '1a', text: 'Stand No corresponding to owner' },
        { id: '1b', text: 'External wall thickness' }
    ]
}, {
    section: '2',
    sectionLabel: 'SITE PLAN',
    items: [
        { id: '2a', text: 'North sign' },
        { id: '2b', text: 'Building lines' },
        { id: '2c', text: 'Access roads' },
        { id: '2d', text: 'Surrounding features e.g. other stands' },
        { id: '2e', text: 'Drainage - disposal facility, direction of flow etc' },
        { id: '2f', text: 'Stand dimensions' },
        { id: '2g', text: 'Shading - proposed building existing one' }
    ]
}, {
    section: '3',
    sectionLabel: 'SECTION',
    items: [
        { id: '3a', text: 'Roof pitch' },
        { id: '3b', text: 'Lintels' },
        { id: '3c', text: 'Concrete slab' },
        { id: '3d', text: 'Hard core' },
        { id: '3e', text: 'Minimum foundation depth' },
        { id: '3f', text: 'Section to correspond with the floor plan' },
        { id: '3g', text: 'Rain water disposal facility' }
    ]
}, {
    section: '4',
    sectionLabel: 'FLOOR PLAN / ELEVATIONS',
    items: [
        { id: '4a', text: 'Indicate window type' },
        { id: '4b', text: 'Indicate air bricks' },
        { id: '4c', text: 'Floor plan area requirements' },
        { id: '4d', text: 'Lettering of rooms' },
        { id: '4e', text: 'Dimensions e.g overall dimension' },
        { id: '4f', text: 'Floor plan corresponding to elevation site-plan' },
        { id: '4g', text: 'Check minimum/maximum building coverage on stand' },
        { id: '4h', text: 'Provide sink, whb, wc, bath, show correct positions' },
        { id: '4i', text: 'Minimum width of passage' },
        { id: '4j', text: 'Sections to be taken across a window opening' },
        { id: '4k', text: 'Window opening to be 10% floor area' },
        { id: '4l', text: 'Drain gradient to be within 1:40' }
    ]
}, {
    section: '5',
    sectionLabel: 'OTHERS',
    items: [
        { id: '5a', text: 'ARCHITECT\'S DETAILS' }
    ]
}, {
    section: '6',
    sectionLabel: 'SIGNED',
    items: [
        { id: '6a', text: 'ASSESSMENT DATE' }
    ]
}, {
    section: '7',
    sectionLabel: 'APPROVED',
    items: [
        { id: '7a', text: 'FINAL APPROVAL' }
    ]
}];

// ============================================
// STATE MANAGEMENT
// ============================================
var appraisalState = {
    answers: {},
    comments: {},
    hod_approved: false,
    ceo_approved: false,
    status: 'building_inspector',
    inspector_signed: false,
    tech_signed: false,
    planner_signed: false,
    inspector_signature: null,
    tech_signature: null,
    planner_signature: null
};

var canvases = {
    inspector: null,
    tech: null,
    planner: null
};

var ctxs = {
    inspector: null,
    tech: null,
    planner: null
};

var drawing = {
    inspector: false,
    tech: false,
    planner: false
};

// ============================================
// SUPABASE INITIALIZATION
// ============================================
function initSupabase() {
    if (!supabaseClient) {
        var provider = window.supabase || (window.supabaseJS ? window.supabaseJS : null);
        if (provider && provider.createClient) {
            supabaseClient = provider.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log("Supabase initialized");
        } else {
            console.error("Supabase script not loaded");
        }
    }
    return supabaseClient;
}

// ============================================
// STAFF FUNCTIONS - Using profiles table
// ============================================
async function fetchUserRole(email) {
    try {
        var { data, error } = await supabaseClient
            .from('profiles')
            .select('full_name, role')
            .eq('email', email)
            .maybeSingle();

        if (error) {
            console.error('Error fetching role:', error);
            return 'building_inspector';
        }

        if (data && data.role) {
            return data.role;
        }
        return 'building_inspector';
    } catch (e) {
        console.error('Error:', e);
        return 'building_inspector';
    }
}

function getStaffRoleDisplay(role) {
    var roleMap = {
        'building_inspector': 'Building Inspector',
        'planning_tech': 'Planning Technician',
        'district_planner': 'District Planner'
    };
    return roleMap[role] || 'Building Inspector';
}

function getRoleBadgeClass(role) {
    var roleMap = {
        'building_inspector': 'role-inspector',
        'planning_tech': 'role-tech',
        'district_planner': 'role-planner'
    };
    return roleMap[role] || 'role-inspector';
}

async function checkStaffLogin() {
    if (!currentStaffUser || !currentStaffName) {
        document.getElementById('staffInfoSection').innerHTML =
            '<div class="error">Please login first. <a href="index.html">Go to Login</a></div>';
        return false;
    }

    // Get role from sessionStorage or fetch from profiles
    if (!sessionStorage.getItem('staffRole')) {
        var role = await fetchUserRole(currentStaffUser);
        sessionStorage.setItem('staffRole', role);
        currentStaffRole = role;
    } else {
        currentStaffRole = sessionStorage.getItem('staffRole');
    }

    document.getElementById('staffName').textContent = currentStaffName;
    var badge = document.getElementById('staffRoleBadge');
    badge.textContent = getStaffRoleDisplay(currentStaffRole);
    badge.className = 'role-badge ' + getRoleBadgeClass(currentStaffRole);

    return true;
}

function staffLogout() {
    if (supabaseClient) supabaseClient.auth.signOut();
    sessionStorage.removeItem('staffEmail');
    sessionStorage.removeItem('staffDisplayName');
    sessionStorage.removeItem('staffRole');
    window.location.href = 'index.html';
}

// ============================================
// FILE UPLOAD HANDLING
// ============================================
function handleFileSelect(event) {
    var file = event.target.files[0];
    if (file) {
        document.getElementById('fileNameDisplay').textContent = file.name;
    }
}

// ============================================
// START APPRAISAL
// ============================================
async function startAppraisal() {
    var ownerName = document.getElementById('ownerName').value.trim();
    var zone = document.getElementById('zone').value.trim();
    var location = document.getElementById('location').value.trim();
    var standNumber = document.getElementById('standNumber').value.trim();
    var fileInput = document.getElementById('planFileInput');

    if (!ownerName || !zone || !location || !standNumber) {
        showError('Please fill in all customer details.');
        return;
    }

    if (!fileInput.files || fileInput.files.length === 0) {
        showError('Please upload the building plan (PDF).');
        return;
    }

    var file = fileInput.files[0];
    if (file.type !== 'application/pdf') {
        showError('Please upload a PDF file.');
        return;
    }

    initSupabase();
    if (!supabaseClient) {
        showError('Database connection error. Please refresh.');
        return;
    }

    hideError();
    showLoading('Uploading plan and creating appraisal...');

    try {
        var appraisalNumber = 'APR-' + Date.now() + '-' + Math.floor(Math.random() * 900 + 100);
        var filePath = 'plan_appraisals/' + appraisalNumber + '_' + file.name;

        var { data: uploadData, error: uploadError } = await supabaseClient
            .storage
            .from('plan-uploads')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;

        var { data: publicUrlData } = supabaseClient
            .storage
            .from('plan-uploads')
            .getPublicUrl(filePath);

        planFileUrl = publicUrlData.publicUrl;
        planFilePath = filePath;

        var { data: appraisalData, error: insertError } = await supabaseClient
            .from('plan_appraisals')
            .insert([{
                appraisal_number: appraisalNumber,
                owner_name: ownerName,
                zone: zone,
                location: location,
                stand_number: standNumber,
                plan_file_url: planFileUrl,
                plan_file_path: filePath,
                status: 'building_inspector',
                answers: {},
                comments: {},
                created_by_email: currentStaffUser,
                created_by_name: currentStaffName
            }])
            .select()
            .single();

        if (insertError) throw insertError;

        appraisalId = appraisalData.id;

        document.getElementById('stepDetails').classList.add('hidden');
        document.getElementById('stepAppraisal').classList.remove('hidden');

        document.getElementById('displayOwnerName').textContent = ownerName;
        document.getElementById('displayZone').textContent = zone;
        document.getElementById('displayLocation').textContent = location;
        document.getElementById('displayStandNumber').textContent = standNumber;
        document.getElementById('displayPlanFile').textContent = file.name;
        document.getElementById('displayAppraisalNumber').textContent = appraisalNumber;

        renderAppraisalTable();
        initializeCanvases();

        hideLoading();
        showSuccess('Appraisal created successfully!');

    } catch (error) {
        console.error('Error:', error);
        hideLoading();
        showError('Error creating appraisal: ' + error.message);
    }
}

// ============================================
// RENDER APPRAISAL TABLE - FIXED YES/NO BUTTONS
// ============================================
function renderAppraisalTable() {
    var tbody = document.getElementById('appraisalTableBody');
    tbody.innerHTML = '';

    var role = currentStaffRole;

    questions.forEach(function(section) {
        // Section header row
        var headerRow = document.createElement('tr');
        headerRow.className = 'section-header';
        headerRow.innerHTML = `
            <td colspan="5"><strong>${section.section}. ${section.sectionLabel}</strong></td>
        `;
        tbody.appendChild(headerRow);

        // Items
        section.items.forEach(function(item) {
            var row = document.createElement('tr');

            // Item ID
            var idCell = document.createElement('td');
            idCell.textContent = item.id;
            row.appendChild(idCell);

            // Question text
            var qCell = document.createElement('td');
            qCell.textContent = item.text;
            if (item.id.includes('.')) {
                qCell.style.paddingLeft = '30px';
            }
            row.appendChild(qCell);

            // Building Inspector column
            var inspectorCell = document.createElement('td');
            inspectorCell.innerHTML = generateColumnHTML(item.id, 'building_inspector', role);
            row.appendChild(inspectorCell);

            // Planning Tech column
            var techCell = document.createElement('td');
            techCell.innerHTML = generateColumnHTML(item.id, 'planning_tech', role);
            row.appendChild(techCell);

            // District Planner column
            var plannerCell = document.createElement('td');
            plannerCell.innerHTML = generateColumnHTML(item.id, 'district_planner', role);
            row.appendChild(plannerCell);

            tbody.appendChild(row);
        });
    });

    addSignatureRows(tbody);

    // Re-bind click events for Yes/No buttons
    bindYesNoEvents();
}

function generateColumnHTML(itemId, columnRole, currentRole) {
    var canEdit = false;

    // Determine if current user can edit this column
    if (currentRole === 'building_inspector' && columnRole === 'building_inspector') {
        canEdit = true;
    } else if (currentRole === 'planning_tech' && (columnRole === 'building_inspector' || columnRole === 'planning_tech')) {
        canEdit = true;
    } else if (currentRole === 'district_planner') {
        canEdit = true;
    }

    var key = itemId + '_' + columnRole;
    var value = appraisalState.answers[key] || '';
    var comment = appraisalState.comments[key] || '';

    var html = '<div style="display:flex;flex-direction:column;gap:3px;">';
    
    // Yes/No buttons
    html += '<div style="display:flex;gap:5px;justify-content:center;">';

    if (canEdit) {
        // Create buttons with data attributes
        html += `<button class="yn-btn yes-btn ${value === 'yes' ? 'active-yes' : ''}" 
                        data-item="${itemId}" 
                        data-column="${columnRole}" 
                        data-value="yes"
                        style="padding:3px 12px; border:1px solid #ddd; border-radius:4px; cursor:pointer; font-size:11px; background:${value === 'yes' ? '#28a745' : 'white'}; color:${value === 'yes' ? 'white' : '#333'};">
                    Yes
                 </button>`;
        html += `<button class="yn-btn no-btn ${value === 'no' ? 'active-no' : ''}" 
                        data-item="${itemId}" 
                        data-column="${columnRole}" 
                        data-value="no"
                        style="padding:3px 12px; border:1px solid #ddd; border-radius:4px; cursor:pointer; font-size:11px; background:${value === 'no' ? '#dc3545' : 'white'}; color:${value === 'no' ? 'white' : '#333'};">
                    No
                 </button>`;
    } else {
        // Read-only display
        html += `<span style="font-size:11px;color:#666;padding:3px 12px;border:1px solid #ddd;border-radius:4px;background:#f8f9fa;">
                    ${value === 'yes' ? '✅ Yes' : value === 'no' ? '❌ No' : '—'}
                </span>`;
    }

    html += '</div>';

    // Comment box - only show if "No" is selected OR there's an existing comment
    if (value === 'no' || comment) {
        var displayValue = value === 'no' ? 'No' : (value === 'yes' ? 'Yes' : '—');
        html += `<div class="comment-small" style="margin-top:4px;border-top:1px solid #eee;padding-top:4px;">`;
        html += `<span style="font-size:6pt;color:#999;">Comment ${displayValue}:</span>`;
        if (canEdit) {
            html += `<textarea class="comment-textarea" 
                                data-item="${itemId}" 
                                data-column="${columnRole}"
                                placeholder="Reason for No..." 
                                style="font-size:7pt; padding:2px 4px; min-height:20px; border:none; background:transparent; width:100%; resize:none;">${comment}</textarea>`;
        } else {
            html += `<div style="font-size:6pt;color:#555;word-wrap:break-word;">${comment || '—'}</div>`;
        }
        html += `</div>`;
    }

    html += '</div>';
    return html;
}

function addSignatureRows(tbody) {
    var row6 = document.createElement('tr');
    row6.innerHTML = `
        <td>6</td>
        <td><strong>SIGNED</strong></td>
        <td id="inspectorSignedCell">${appraisalState.inspector_signed ? '✅ Signed' : '⏳ Pending'}</td>
        <td id="techSignedCell">${appraisalState.tech_signed ? '✅ Signed' : '⏳ Pending'}</td>
        <td id="plannerSignedCell">${appraisalState.planner_signed ? '✅ Signed' : '⏳ Pending'}</td>
    `;
    tbody.appendChild(row6);

    var row7 = document.createElement('tr');
    row7.innerHTML = `
        <td>7</td>
        <td><strong>APPROVED</strong></td>
        <td>${appraisalState.hod_approved ? '✅' : '—'}</td>
        <td>${appraisalState.ceo_approved ? '✅' : '—'}</td>
        <td id="finalApprovedCell">${appraisalState.planner_signed && appraisalState.ceo_approved ? '✅ APPROVED' : '⏳ Pending'}</td>
    `;
    tbody.appendChild(row7);
}

// ============================================
// BIND YES/NO EVENTS
// ============================================
function bindYesNoEvents() {
    // Yes/No button clicks
    var buttons = document.querySelectorAll('.yn-btn');
    buttons.forEach(function(btn) {
        btn.onclick = function(e) {
            e.preventDefault();
            var itemId = this.getAttribute('data-item');
            var columnRole = this.getAttribute('data-column');
            var value = this.getAttribute('data-value');
            setAnswer(itemId, columnRole, value);
        };
    });

    // Comment textarea changes
    var textareas = document.querySelectorAll('.comment-textarea');
    textareas.forEach(function(ta) {
        ta.oninput = function() {
            var itemId = this.getAttribute('data-item');
            var columnRole = this.getAttribute('data-column');
            setComment(itemId, columnRole, this.value);
        };
    });
}

// ============================================
// ANSWER AND COMMENT FUNCTIONS
// ============================================
function setAnswer(itemId, columnRole, value) {
    var key = itemId + '_' + columnRole;
    
    // Toggle: if clicking the same value, deselect it
    if (appraisalState.answers[key] === value) {
        appraisalState.answers[key] = '';
    } else {
        appraisalState.answers[key] = value;
    }
    
    // Save and re-render
    renderAppraisalTable();
    saveAppraisalState();
}

function setComment(itemId, columnRole, value) {
    var key = itemId + '_' + columnRole;
    appraisalState.comments[key] = value;
    saveAppraisalState();
}

// ============================================
// SAVE STATE TO SUPABASE
// ============================================
async function saveAppraisalState() {
    if (!appraisalId || !supabaseClient) return;

    try {
        var { error } = await supabaseClient
            .from('plan_appraisals')
            .update({
                answers: appraisalState.answers,
                comments: appraisalState.comments,
                hod_approved: appraisalState.hod_approved,
                ceo_approved: appraisalState.ceo_approved,
                status: appraisalState.status,
                updated_at: new Date().toISOString()
            })
            .eq('id', appraisalId);

        if (error) console.error('Save error:', error);
    } catch (e) {
        console.error('Save error:', e);
    }
}

// ============================================
// CANVAS INITIALIZATION
// ============================================
function initializeCanvases() {
    var canvasIds = ['inspector', 'tech', 'planner'];

    canvasIds.forEach(function(id) {
        var canvas = document.getElementById(id + 'Canvas');
        if (!canvas) return;

        var container = canvas.parentElement;
        var containerWidth = container.clientWidth || 200;
        canvas.width = Math.min(200, containerWidth - 20);
        canvas.height = 80;

        var ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        canvases[id] = canvas;
        ctxs[id] = ctx;
        drawing[id] = false;

        if (appraisalState[id + '_signature']) {
            var img = new Image();
            img.onload = function() {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = appraisalState[id + '_signature'];
        }

        canvas.addEventListener('mousedown', function(e) { startDrawing(e, id); });
        canvas.addEventListener('mousemove', function(e) { draw(e, id); });
        canvas.addEventListener('mouseup', function(e) { stopDrawing(e, id); });
        canvas.addEventListener('mouseleave', function(e) { stopDrawing(e, id); });

        canvas.addEventListener('touchstart', function(e) { startDrawing(e, id); }, { passive: false });
        canvas.addEventListener('touchmove', function(e) { draw(e, id); }, { passive: false });
        canvas.addEventListener('touchend', function(e) { stopDrawing(e, id); }, { passive: false });
    });
}

function getCanvasCoords(e, canvas) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;

    var clientX, clientY;
    if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    var x = (clientX - rect.left) * scaleX;
    var y = (clientY - rect.top) * scaleY;
    x = Math.max(0, Math.min(canvas.width, x));
    y = Math.max(0, Math.min(canvas.height, y));
    return { x: x, y: y };
}

function startDrawing(e, id) {
    var canvas = canvases[id];
    if (!canvas) return;
    var ctx = ctxs[id];
    var pos = getCanvasCoords(e, canvas);
    drawing[id] = true;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    e.preventDefault();
}

function draw(e, id) {
    if (!drawing[id]) return;
    var canvas = canvases[id];
    if (!canvas) return;
    var ctx = ctxs[id];
    var pos = getCanvasCoords(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    e.preventDefault();
}

function stopDrawing(e, id) {
    drawing[id] = false;
    ctxs[id].beginPath();
}

function clearSignature(id) {
    var canvas = canvases[id];
    if (!canvas) return;
    var ctx = ctxs[id];
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    appraisalState[id + '_signature'] = null;
    updateSignatureStatus(id);
}

function getSignatureDataURL(id) {
    var canvas = canvases[id];
    if (!canvas) return null;
    var imageData = canvas.toDataURL('image/png');
    var pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    var blank = true;
    for (var i = 0; i < pixels.data.length; i += 4) {
        if (pixels.data[i] < 250 || pixels.data[i + 1] < 250 || pixels.data[i + 2] < 250) {
            blank = false;
            break;
        }
    }
    if (blank) return null;
    return imageData;
}

function updateSignatureStatus(id) {
    var statusMap = {
        'inspector': 'inspectorStatus',
        'tech': 'techStatus',
        'planner': 'plannerStatus'
    };
    var statusEl = document.getElementById(statusMap[id]);
    if (!statusEl) return;

    var hasSig = appraisalState[id + '_signature'];
    if (hasSig) {
        statusEl.innerHTML = '✅ Signature captured';
        statusEl.style.color = '#28a745';
    } else {
        statusEl.innerHTML = '⏳ Awaiting signature';
        statusEl.style.color = '#666';
    }
}

// ============================================
// SUBMIT APPROVALS
// ============================================
function submitInspectorApproval() {
    if (currentStaffRole !== 'building_inspector' && currentStaffRole !== 'planning_tech' && currentStaffRole !== 'district_planner') {
        showError('You do not have permission to submit as Building Inspector.');
        return;
    }

    var sig = getSignatureDataURL('inspector');
    if (!sig) {
        showError('Please provide your signature.');
        return;
    }

    var allAnswered = checkColumnAnswered('building_inspector');
    if (!allAnswered) {
        showError('Please answer all questions in the Building Inspector column.');
        return;
    }

    appraisalState.inspector_signed = true;
    appraisalState.inspector_signature = sig;
    appraisalState.status = 'planning_tech';

    saveAppraisalState();
    updateSignatureStatus('inspector');
    document.getElementById('inspectorSignedCell').innerHTML = '✅ Signed';
    document.getElementById('inspectorStatus').innerHTML = '✅ Submitted';

    showSuccess('Building Inspector approval submitted!');

    checkAllApproved();
}

function submitTechApproval() {
    if (currentStaffRole !== 'planning_tech' && currentStaffRole !== 'district_planner') {
        showError('You do not have permission to submit as Planning Technician.');
        return;
    }

    var sig = getSignatureDataURL('tech');
    if (!sig) {
        showError('Please provide your signature.');
        return;
    }

    var allAnswered = checkColumnAnswered('planning_tech');
    if (!allAnswered) {
        showError('Please answer all questions in the Planning Tech column.');
        return;
    }

    appraisalState.tech_signed = true;
    appraisalState.tech_signature = sig;
    appraisalState.status = 'district_planner';

    saveAppraisalState();
    updateSignatureStatus('tech');
    document.getElementById('techSignedCell').innerHTML = '✅ Signed';
    document.getElementById('techStatus').innerHTML = '✅ Submitted';

    showSuccess('Planning Technician approval submitted!');

    checkAllApproved();
}

function submitPlannerApproval() {
    if (currentStaffRole !== 'district_planner') {
        showError('Only the District Planner can give final approval.');
        return;
    }

    var sig = getSignatureDataURL('planner');
    if (!sig) {
        showError('Please provide your signature.');
        return;
    }

    var allAnswered = checkColumnAnswered('district_planner');
    if (!allAnswered) {
        showError('Please answer all questions in the District Planner column.');
        return;
    }

    appraisalState.planner_signed = true;
    appraisalState.planner_signature = sig;
    appraisalState.ceo_approved = true;
    appraisalState.hod_approved = true;
    appraisalState.status = 'approved';

    saveAppraisalState();
    updateSignatureStatus('planner');
    document.getElementById('plannerSignedCell').innerHTML = '✅ Signed';
    document.getElementById('finalApprovedCell').innerHTML = '✅ APPROVED';
    document.getElementById('plannerStatus').innerHTML = '✅ Approved';

    showSuccess('District Planner final approval submitted!');

    document.getElementById('downloadPdfBtn').style.display = 'inline-block';
    sendApprovalEmails('final');
}

function checkColumnAnswered(column) {
    var allItems = [];
    questions.forEach(function(section) {
        section.items.forEach(function(item) {
            allItems.push(item.id);
        });
    });

    var unanswered = [];
    allItems.forEach(function(itemId) {
        var key = itemId + '_' + column;
        if (!appraisalState.answers[key] || appraisalState.answers[key] === '') {
            var isApplicable = true;
            if (column === 'building_inspector') isApplicable = true;
            else if (column === 'planning_tech') isApplicable = true;
            else if (column === 'district_planner') isApplicable = true;

            if (isApplicable) {
                unanswered.push(itemId);
            }
        }
    });

    if (unanswered.length > 0) {
        console.log('Unanswered in ' + column + ':', unanswered);
        return false;
    }
    return true;
}

function checkAllApproved() {
    if (appraisalState.inspector_signed && appraisalState.tech_signed && appraisalState.planner_signed) {
        document.getElementById('downloadPdfBtn').style.display = 'inline-block';
        document.getElementById('appraisalStatusText').textContent = 'Status: ✅ Fully Approved';
    } else if (appraisalState.inspector_signed && appraisalState.tech_signed) {
        document.getElementById('appraisalStatusText').textContent = 'Status: Waiting for District Planner';
    } else if (appraisalState.inspector_signed) {
        document.getElementById('appraisalStatusText').textContent = 'Status: Waiting for Planning Technician';
    } else {
        document.getElementById('appraisalStatusText').textContent = 'Status: Waiting for Building Inspector';
    }
}

// ============================================
// EMERGENCY ACCESS
// ============================================
var emergencyPassword = 'dp2024';

function showEmergencyModal() {
    if (currentStaffRole !== 'planning_tech') {
        showError('Only Planning Technicians can use emergency access.');
        return;
    }
    document.getElementById('emergencyModal').style.display = 'flex';
    document.getElementById('emergencyPassword').value = '';
    document.getElementById('emergencyError').classList.add('hidden');
}

function closeEmergencyModal() {
    document.getElementById('emergencyModal').style.display = 'none';
}

function verifyEmergencyPassword() {
    var password = document.getElementById('emergencyPassword').value.trim();
    var errorEl = document.getElementById('emergencyError');

    if (password === emergencyPassword) {
        currentStaffRole = 'district_planner';
        sessionStorage.setItem('staffRole', 'district_planner');

        var badge = document.getElementById('staffRoleBadge');
        badge.textContent = 'District Planner (Emergency)';
        badge.className = 'role-badge role-planner';

        closeEmergencyModal();
        showSuccess('Emergency access granted! You now have District Planner rights.');
        renderAppraisalTable();
        initializeCanvases();

        console.log('Emergency access used by:', currentStaffUser, 'at:', new Date().toISOString());
    } else {
        errorEl.classList.remove('hidden');
        errorEl.innerHTML = '❌ Incorrect emergency password.';
    }
}

// ============================================
// EMAIL NOTIFICATIONS
// ============================================
async function sendApprovalEmails(type) {
    console.log('Email notification sent for:', type);
}

// ============================================
// DOWNLOAD FINAL PDF
// ============================================
function downloadFinalPDF() {
    if (appraisalState.status !== 'approved') {
        showError('The appraisal must be fully approved before downloading.');
        return;
    }

    showSuccess('PDF generation in progress...');

    setTimeout(function() {
        showSuccess('PDF generated successfully! (Demo)');
    }, 2000);
}

// ============================================
// UI HELPERS
// ============================================
function showError(msg) {
    var el = document.getElementById('errorDisplay');
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('error');
}

function hideError() {
    document.getElementById('errorDisplay').classList.add('hidden');
}

function showSuccess(msg) {
    var el = document.getElementById('successDisplay');
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('success');
    setTimeout(function() {
        el.classList.add('hidden');
    }, 5000);
}

function showLoading(msg) {
    console.log('Loading:', msg);
}

function hideLoading() {}

// ============================================
// LOAD EXISTING APPRAISAL
// ============================================
function checkForTracking() {
    var urlParams = new URLSearchParams(window.location.search);
    var trackId = urlParams.get('track');
    if (trackId) {
        loadAppraisalForTracking(trackId);
        return true;
    }
    return false;
}

async function loadAppraisalForTracking(id) {
    initSupabase();
    if (!supabaseClient) return;

    var { data: appraisal, error } = await supabaseClient
        .from('plan_appraisals')
        .select('*')
        .eq('id', id)
        .single();

    if (appraisal) {
        appraisalId = appraisal.id;
        appraisalState.answers = appraisal.answers || {};
        appraisalState.comments = appraisal.comments || {};
        appraisalState.hod_approved = appraisal.hod_approved || false;
        appraisalState.ceo_approved = appraisal.ceo_approved || false;
        appraisalState.status = appraisal.status || 'building_inspector';
        appraisalState.inspector_signed = appraisal.inspector_signed || false;
        appraisalState.tech_signed = appraisal.tech_signed || false;
        appraisalState.planner_signed = appraisal.planner_signed || false;

        document.getElementById('stepDetails').classList.add('hidden');
        document.getElementById('stepAppraisal').classList.remove('hidden');

        document.getElementById('displayOwnerName').textContent = appraisal.owner_name;
        document.getElementById('displayZone').textContent = appraisal.zone || '-';
        document.getElementById('displayLocation').textContent = appraisal.location || '-';
        document.getElementById('displayStandNumber').textContent = appraisal.stand_number || '-';
        document.getElementById('displayPlanFile').textContent = appraisal.plan_file_url || '-';
        document.getElementById('displayAppraisalNumber').textContent = appraisal.appraisal_number;

        renderAppraisalTable();
        initializeCanvases();

        if (appraisalState.status === 'approved') {
            document.getElementById('downloadPdfBtn').style.display = 'inline-block';
        }

        checkAllApproved();
    }
}

// ============================================
// INITIALIZE
// ============================================
initSupabase();

if (!checkStaffLogin()) {
    // Staff not logged in
} else {
    if (!checkForTracking()) {
        // Normal mode
    }
}

document.getElementById('emergencyModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeEmergencyModal();
    }
});
