// ============================================
// STAGE FORM - JAVASCRIPT LOGIC
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
var currentStaffUserId = sessionStorage.getItem('staffUserId');

var stageFormId = null;
var appraisalId = null;
var stageItems = [];
var isCompleted = false;

// ============================================
// STAGE DATA
// ============================================
var STAGES = [
    { number: 1, description: 'Setting out of foundation and building lines' },
    { number: 2, description: 'Foundation trenches' },
    { number: 3, description: 'Foundation concrete' },
    { number: 4, description: 'Foundation brick Work to floor level' },
    { number: 5, description: 'Backfilling and Compaction' },
    { number: 6, description: 'Concrete slab' },
    { number: 7, description: 'Setting out door and window frames' },
    { number: 8, description: 'Brickwork to lintel level' },
    { number: 9, description: 'Brickwork at wall plate and vented' },
    { number: 10, description: 'Roof structure, valleys Flashing and Fascia boards' },
    { number: 11, description: 'Roof covering' },
    { number: 12, description: 'Plastering' },
    { number: 13, description: 'Painting' },
    { number: 14, description: 'Open test and Man hole cover' },
    { number: 15, description: 'Final test and flashing complete' },
    { number: 16, description: 'Completion of building' }
];

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
// STAFF FUNCTIONS
// ============================================
async function fetchUserRoleAndName(userId) {
    if (!userId) {
        return { role: 'building_inspector', name: '' };
    }
    
    try {
        var { data, error } = await supabaseClient
            .from('profiles')
            .select('full_name, role')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.error('Error fetching profile:', error);
            return { role: 'building_inspector', name: '' };
        }

        if (data) {
            return {
                role: data.role || 'building_inspector',
                name: data.full_name || ''
            };
        }
        return { role: 'building_inspector', name: '' };
    } catch (e) {
        console.error('Error:', e);
        return { role: 'building_inspector', name: '' };
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
    console.log('checkStaffLogin called');
    
    if (!currentStaffUser || !currentStaffName || !currentStaffUserId) {
        var infoSection = document.getElementById('staffInfoSection');
        if (infoSection) {
            infoSection.innerHTML = '<div class="error">Please login first. <a href="index.html">Go to Login</a></div>';
        }
        return false;
    }

    initSupabase();
    if (!supabaseClient) {
        var infoSection = document.getElementById('staffInfoSection');
        if (infoSection) {
            infoSection.innerHTML = '<div class="error">Database connection error. Please refresh.</div>';
        }
        return false;
    }

    try {
        var profile = await fetchUserRoleAndName(currentStaffUserId);
        console.log('Profile fetched:', profile);
        currentStaffRole = profile.role || 'building_inspector';
        if (profile.name) {
            currentStaffName = profile.name;
            sessionStorage.setItem('staffDisplayName', currentStaffName);
        }
        sessionStorage.setItem('staffRole', currentStaffRole);
    } catch (e) {
        console.error('Error fetching role:', e);
        currentStaffRole = sessionStorage.getItem('staffRole') || 'building_inspector';
    }

    var nameEl = document.getElementById('staffName');
    var badge = document.getElementById('staffRoleBadge');
    
    if (nameEl) nameEl.textContent = currentStaffName;
    if (badge) {
        badge.textContent = getStaffRoleDisplay(currentStaffRole);
        badge.className = 'role-badge ' + getRoleBadgeClass(currentStaffRole);
    }

    return true;
}

function staffLogout() {
    if (supabaseClient) supabaseClient.auth.signOut();
    sessionStorage.removeItem('staffEmail');
    sessionStorage.removeItem('staffDisplayName');
    sessionStorage.removeItem('staffRole');
    sessionStorage.removeItem('staffUserId');
    window.location.href = 'index.html';
}

// ============================================
// SEARCH APPROVED PLAN
// ============================================
async function searchApprovedPlan() {
    var ownerName = document.getElementById('searchOwnerName').value.trim();
    var standType = document.getElementById('searchStandType').value.trim();
    var location = document.getElementById('searchLocation').value.trim();
    var standNumber = document.getElementById('searchStandNumber').value.trim();

    if (!ownerName || !standType || !location || !standNumber) {
        showError('Please fill in all search fields.');
        return;
    }

    showLoading('Searching for approved plan...');

    try {
        initSupabase();
        if (!supabaseClient) {
            throw new Error('Database connection error');
        }

        var { data: appraisals, error: searchError } = await supabaseClient
            .from('plan_appraisals')
            .select('*')
            .eq('owner_name', ownerName)
            .eq('zone', standType)
            .eq('location', location)
            .eq('stand_number', standNumber)
            .eq('status', 'approved')
            .order('created_at', { ascending: false });

        if (searchError) throw searchError;

        var resultsDiv = document.getElementById('searchResults');
        var stageFormSection = document.getElementById('stageFormSection');

        if (!appraisals || appraisals.length === 0) {
            resultsDiv.innerHTML = `
                <div class="error">
                    <strong>No approved plan found</strong><br>
                    No approved plan matches the search criteria. Please verify the details and try again.
                    <br><br>
                    <small>Tip: Make sure the plan has been approved in the Consideration Schedule 261.</small>
                </div>
            `;
            stageFormSection.classList.remove('visible');
            hideLoading();
            return;
        }

        var appraisal = appraisals[0];
        appraisalId = appraisal.id;

        resultsDiv.innerHTML = `
            <div class="appraisal-result">
                <h4>Approved Plan Found</h4>
                <div class="info-grid">
                    <div><strong>Appraisal Number:</strong> ${escapeHtml(appraisal.appraisal_number)}</div>
                    <div><strong>Owner Name:</strong> ${escapeHtml(appraisal.owner_name)}</div>
                    <div><strong>Stand Type:</strong> ${escapeHtml(appraisal.zone)}</div>
                    <div><strong>Location:</strong> ${escapeHtml(appraisal.location)}</div>
                    <div><strong>Stand Number:</strong> ${escapeHtml(appraisal.stand_number)}</div>
                    <div><strong>Approval Date:</strong> ${appraisal.updated_at ? new Date(appraisal.updated_at).toLocaleDateString() : 'N/A'}</div>
                </div>
            </div>
        `;

        await loadExistingStageForm(appraisal.id, appraisal);
        stageFormSection.classList.add('visible');
        hideLoading();
        showSuccess('Plan found. Loading stage form...');

    } catch (error) {
        console.error('Search error:', error);
        showError('Error searching for plan: ' + error.message);
        hideLoading();
    }
}

// ============================================
// LOAD EXISTING STAGE FORM
// ============================================
async function loadExistingStageForm(appraisalId, appraisal) {
    try {
        var { data: existingForm, error: formError } = await supabaseClient
            .from('stage_forms')
            .select('*')
            .eq('appraisal_id', appraisalId)
            .maybeSingle();

        if (formError) throw formError;

        document.getElementById('displayAppraisalNumber').textContent = appraisal.appraisal_number;
        document.getElementById('displayOwnerName').textContent = appraisal.owner_name;
        document.getElementById('displayStandType').textContent = appraisal.zone;
        document.getElementById('displayLocation').textContent = appraisal.location;
        document.getElementById('displayStandNumber').textContent = appraisal.stand_number;
        document.getElementById('displayApprovalDate').textContent = appraisal.updated_at ? new Date(appraisal.updated_at).toLocaleDateString() : 'N/A';

        if (existingForm) {
            stageFormId = existingForm.id;
            isCompleted = existingForm.status === 'completed';

            if (isCompleted) {
                var completedBanner = document.getElementById('completedBanner');
                completedBanner.classList.remove('hidden');
                document.getElementById('completedMessage').textContent = 
                    'Completed on: ' + new Date(existingForm.completed_at).toLocaleDateString() + 
                    ' by ' + (existingForm.completed_by || 'Unknown');
                document.getElementById('formStatus').textContent = 'Status: Completed';
                document.getElementById('formStatus').className = 'status-badge status-yes';
                document.getElementById('saveProgressBtn').disabled = true;
            } else {
                var resumeBanner = document.getElementById('resumeBanner');
                resumeBanner.classList.remove('hidden');
                document.getElementById('resumeMessage').textContent = 
                    'Last saved on: ' + new Date(existingForm.updated_at).toLocaleString() + 
                    ' by ' + (existingForm.inspector_name || 'Unknown');
                document.getElementById('formStatus').textContent = 'Status: In Progress';
                document.getElementById('formStatus').className = 'status-badge status-pending';
                document.getElementById('saveProgressBtn').disabled = false;
            }

            await loadStageItems(existingForm.id);
        } else {
            await createNewStageForm(appraisal);
        }

    } catch (error) {
        console.error('Error loading existing form:', error);
        throw error;
    }
}

// ============================================
// CREATE NEW STAGE FORM
// ============================================
async function createNewStageForm(appraisal) {
    try {
        var { data: newForm, error: createError } = await supabaseClient
            .from('stage_forms')
            .insert([{
                appraisal_id: appraisal.id,
                appraisal_number: appraisal.appraisal_number,
                owner_name: appraisal.owner_name,
                stand_type: appraisal.zone,
                location: appraisal.location,
                stand_number: appraisal.stand_number,
                inspector_name: currentStaffName,
                status: 'in_progress'
            }])
            .select()
            .single();

        if (createError) throw createError;

        stageFormId = newForm.id;
        isCompleted = false;
        document.getElementById('saveProgressBtn').disabled = false;

        var stageItemsData = STAGES.map(function(stage) {
            return {
                stage_form_id: newForm.id,
                stage_number: stage.number,
                stage_description: stage.description,
                status: 'pending',
                receipt_number: null
            };
        });

        var { error: itemsError } = await supabaseClient
            .from('stage_items')
            .insert(stageItemsData);

        if (itemsError) throw itemsError;

        document.getElementById('formStatus').textContent = 'Status: New';
        document.getElementById('formStatus').className = 'status-badge status-pending';

        await loadStageItems(newForm.id);

    } catch (error) {
        console.error('Error creating stage form:', error);
        throw error;
    }
}

// ============================================
// LOAD STAGE ITEMS
// ============================================
async function loadStageItems(formId) {
    try {
        var { data: items, error: itemsError } = await supabaseClient
            .from('stage_items')
            .select('*')
            .eq('stage_form_id', formId)
            .order('stage_number', { ascending: true });

        if (itemsError) throw itemsError;

        stageItems = items || [];
        renderStageTable();
        updateProgressBar();
        updateSaveButtonState();

    } catch (error) {
        console.error('Error loading stage items:', error);
        throw error;
    }
}

// ============================================
// RENDER STAGE TABLE
// ============================================
function renderStageTable() {
    var tbody = document.getElementById('stageTableBody');
    tbody.innerHTML = '';

    if (!stageItems || stageItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No stages found.</td></tr>';
        return;
    }

    var isDisabled = isCompleted || false;

    // Find the last saved receipt from any completed stage
    var lastReceiptNumber = '';
    for (var i = 0; i < stageItems.length; i++) {
        if (stageItems[i].receipt_number && stageItems[i].receipt_number.trim() !== '') {
            lastReceiptNumber = stageItems[i].receipt_number;
        }
    }

    stageItems.forEach(function(item, index) {
        var row = document.createElement('tr');

        // Stage Number
        var numCell = document.createElement('td');
        numCell.className = 'stage-number';
        numCell.textContent = item.stage_number;
        row.appendChild(numCell);

        // Stage Description
        var descCell = document.createElement('td');
        descCell.className = 'stage-description';
        descCell.textContent = item.stage_description;
        row.appendChild(descCell);

        // Status Badge
        var statusCell = document.createElement('td');
        statusCell.className = 'stage-status';
        var statusClass = 'status-' + item.status;
        var statusLabel = item.status.toUpperCase();
        statusCell.innerHTML = '<span class="status-badge ' + statusClass + '">' + statusLabel + '</span>';
        row.appendChild(statusCell);

        // Receipt Number Input
        var receiptCell = document.createElement('td');
        receiptCell.className = 'stage-receipt';
        var receiptInput = document.createElement('input');
        receiptInput.type = 'text';
        receiptInput.placeholder = 'Enter receipt no...';
        
        // If the stage has a receipt, show it
        if (item.receipt_number && item.receipt_number.trim() !== '') {
            receiptInput.value = item.receipt_number;
        } 
        // If this stage is pending and we have a last receipt, auto-fill
        else if (item.status === 'pending' && lastReceiptNumber) {
            receiptInput.value = lastReceiptNumber;
            item.receipt_number = lastReceiptNumber;
        }
        
        // Lock the receipt input if the stage already has a status (Yes/No/N/A) with a receipt
        // This prevents editing of previously completed stages
        var isReceiptLocked = isCompleted || (item.status !== 'pending' && item.receipt_number && item.receipt_number.trim() !== '');
        receiptInput.disabled = isReceiptLocked;
        
        // Add visual indicator for locked receipts
        if (isReceiptLocked) {
            receiptInput.style.background = '#e9ecef';
            receiptInput.style.cursor = 'not-allowed';
        }
        
        receiptInput.dataset.stageIndex = index;
        receiptInput.className = 'receipt-input';
        receiptInput.oninput = function() {
            var idx = parseInt(this.dataset.stageIndex);
            if (!isNaN(idx) && stageItems[idx]) {
                stageItems[idx].receipt_number = this.value;
                console.log('Receipt updated for stage ' + stageItems[idx].stage_number + ': ' + this.value);
                updateSaveButtonState();
            }
        };
        receiptCell.appendChild(receiptInput);
        row.appendChild(receiptCell);

        // Actions
        var actionCell = document.createElement('td');
        actionCell.className = 'stage-actions';

        actionCell.innerHTML = `
            <button class="stage-btn ${item.status === 'yes' ? 'active-yes' : ''}" 
                    onclick="setStageStatus(${index}, 'yes')" 
                    ${isDisabled ? 'disabled' : ''}>
                Yes
            </button>
            <button class="stage-btn ${item.status === 'no' ? 'active-no' : ''}" 
                    onclick="setStageStatus(${index}, 'no')" 
                    ${isDisabled ? 'disabled' : ''}>
                No
            </button>
            <button class="stage-btn ${item.status === 'n/a' ? 'active-na' : ''}" 
                    onclick="setStageStatus(${index}, 'n/a')" 
                    ${isDisabled ? 'disabled' : ''}>
                N/A
            </button>
        `;
        row.appendChild(actionCell);

        tbody.appendChild(row);
    });

    updateSaveButtonState();
}

// ============================================
// SET STAGE STATUS
// ============================================
async function setStageStatus(index, status) {
    if (isCompleted) {
        showError('This form is already completed. No further changes allowed.');
        return;
    }

    try {
        var item = stageItems[index];
        if (!item) return;

        var newStatus = item.status === status ? 'pending' : status;

        // If marking a stage, auto-fill receipt if empty
        if (newStatus !== 'pending') {
            // Find the last entered receipt number from any stage
            var lastReceipt = '';
            for (var i = 0; i < stageItems.length; i++) {
                if (stageItems[i].receipt_number && stageItems[i].receipt_number.trim() !== '') {
                    lastReceipt = stageItems[i].receipt_number;
                }
            }
            
            if (!item.receipt_number || item.receipt_number.trim() === '') {
                item.receipt_number = lastReceipt;
            }
        }

        var { error: updateError } = await supabaseClient
            .from('stage_items')
            .update({ 
                status: newStatus,
                updated_at: new Date().toISOString()
            })
            .eq('id', item.id);

        if (updateError) throw updateError;

        item.status = newStatus;
        
        // If status is set back to pending, clear the receipt number
        if (newStatus === 'pending') {
            item.receipt_number = '';
        }
        
        renderStageTable();
        updateProgressBar();
        updateSaveButtonState();

    } catch (error) {
        console.error('Error setting stage status:', error);
        showError('Error updating stage: ' + error.message);
    }
}

// ============================================
// UPDATE PROGRESS BAR
// ============================================
function updateProgressBar() {
    if (!stageItems || stageItems.length === 0) return;

    var completed = stageItems.filter(function(item) { 
        return item.status !== 'pending'; 
    }).length;

    var total = stageItems.length;
    var percentage = Math.round((completed / total) * 100);

    var progressBar = document.getElementById('progressBar');
    progressBar.style.width = percentage + '%';
    progressBar.textContent = percentage + '% Complete (' + completed + '/' + total + ')';
}

// ============================================
// UPDATE SAVE BUTTON STATE
// ============================================
function updateSaveButtonState() {
    var saveBtn = document.getElementById('saveProgressBtn');
    if (!saveBtn) return;

    if (isCompleted) {
        saveBtn.disabled = true;
        return;
    }

    // ONLY check stages that have been marked (Yes/No/N/A) AND are NOT locked (newly marked by current user)
    var markedStages = stageItems.filter(function(item) {
        return item.status !== 'pending';
    });

    // If no stages are marked, save button is enabled (can save empty form)
    if (markedStages.length === 0) {
        saveBtn.disabled = false;
        console.log('Save button enabled: No stages marked');
        return;
    }

    // Check if any marked stage is missing a receipt number
    // This includes both new and existing marked stages
    var missingReceipt = markedStages.some(function(item) {
        return !item.receipt_number || item.receipt_number.trim() === '';
    });

    saveBtn.disabled = missingReceipt;
    console.log('Save button state:', saveBtn.disabled ? 'DISABLED' : 'ENABLED');
    console.log('Marked stages with missing receipts:', markedStages.filter(function(item) {
        return !item.receipt_number || item.receipt_number.trim() === '';
    }).length);
}

// ============================================
// SAVE PROGRESS
// ============================================
async function saveProgress() {
    if (isCompleted) {
        showError('This form is already completed. No further changes allowed.');
        return;
    }

    // Check all marked stages have receipt numbers
    var markedStages = stageItems.filter(function(item) {
        return item.status !== 'pending';
    });

    var missingReceipt = markedStages.some(function(item) {
        return !item.receipt_number || item.receipt_number.trim() === '';
    });

    if (missingReceipt) {
        showError('Please enter receipt numbers for all inspected stages (Yes/No/N/A).');
        return;
    }

    showLoading('Saving progress...');

    try {
        initSupabase();
        if (!supabaseClient) {
            throw new Error('Database connection error');
        }

        // Update each stage item with its receipt number
        for (var i = 0; i < stageItems.length; i++) {
            var item = stageItems[i];
            var { error: updateError } = await supabaseClient
                .from('stage_items')
                .update({
                    receipt_number: item.receipt_number || null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', item.id);

            if (updateError) {
                console.error('Error updating stage receipt:', updateError);
                throw updateError;
            }
        }

        // Update stage form
        var { error: formUpdateError } = await supabaseClient
            .from('stage_forms')
            .update({
                inspector_name: currentStaffName,
                updated_at: new Date().toISOString()
            })
            .eq('id', stageFormId);

        if (formUpdateError) throw formUpdateError;

        // Add history entry
        await supabaseClient
            .from('stage_form_history')
            .insert([{
                stage_form_id: stageFormId,
                action: 'progress_saved',
                performed_by: currentStaffName,
                previous_status: 'in_progress',
                new_status: 'in_progress'
            }]);

        hideLoading();
        showSuccess('Progress saved successfully! You can continue later.');

        document.getElementById('formStatus').textContent = 'Status: In Progress';
        document.getElementById('formStatus').className = 'status-badge status-pending';

        // Refresh the table to lock in the receipts
        renderStageTable();

    } catch (error) {
        console.error('Save error:', error);
        showError('Error saving progress: ' + error.message);
        hideLoading();
    }
}

// ============================================
// UI HELPERS
// ============================================
function showError(msg) {
    var el = document.getElementById('errorDisplay');
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('error');
    setTimeout(function() {
        el.classList.add('hidden');
    }, 8000);
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

function hideSuccess() {
    document.getElementById('successDisplay').classList.add('hidden');
}

function showLoading(msg) {
    var el = document.getElementById('successDisplay');
    el.textContent = 'Processing: ' + msg;
    el.classList.remove('hidden', 'success');
    el.style.background = '#fff3cd';
    el.style.color = '#856404';
}

function hideLoading() {
    document.getElementById('successDisplay').classList.add('hidden');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ============================================
// INITIALIZE
// ============================================
(async function init() {
    console.log('Initializing Stage Form...');
    initSupabase();
    await checkStaffLogin();

    var urlParams = new URLSearchParams(window.location.search);
    var trackId = urlParams.get('track');
    if (trackId) {
        document.getElementById('searchSection').classList.add('hidden');
        await loadExistingStageFormDirect(trackId);
    }
})();

async function loadExistingStageFormDirect(appraisalId) {
    try {
        var { data: appraisal, error: appraisalError } = await supabaseClient
            .from('plan_appraisals')
            .select('*')
            .eq('id', appraisalId)
            .single();

        if (appraisalError) throw appraisalError;

        if (appraisal) {
            document.getElementById('searchSection').classList.add('hidden');
            await loadExistingStageForm(appraisal.id, appraisal);
            document.getElementById('stageFormSection').classList.add('visible');
        }
    } catch (error) {
        console.error('Error loading direct form:', error);
        showError('Error loading form: ' + error.message);
    }
}
