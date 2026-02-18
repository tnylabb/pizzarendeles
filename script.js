import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, set, get, onValue, remove } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const firebaseConfig = {
    apiKey: "AIzaSyBo-OauYciOsJmll9ACoq2YD6cZpHb8u2w",
    authDomain: "pizzarendeles-b447f.firebaseapp.com",
    databaseURL: "https://pizzarendeles-b447f-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "pizzarendeles-b447f",
    storageBucket: "pizzarendeles-b447f.firebasestorage.app",
    messagingSenderId: "953608104638",
    appId: "1:953608104638:web:1e44f11c902725fdce0cef"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

let isAdminMode = false;
const ADMIN_PASSWORD = 'Nekimegadom';

// Settings will be loaded from Firebase
let MAX_SLOTS = 4;
let TIME_SLOT_INTERVAL = 10;
let OPEN_HOUR = 17;
let OPEN_MINUTE = 30;
let CLOSE_HOUR = 20;
let CLOSE_MINUTE = 30;
let PRE_ORDER_HOUR = 16;
let PRE_ORDER_MINUTE = 0;

let previousOrderStatuses = {};
let autoDeleteCompleted = false;
let settingsLoaded = false;

// Flag to scroll to my orders after Firebase onValue updates
let pendingScrollToMyOrders = false;

const DEFAULT_BASE_TOPPINGS = [
    { id: 'sonka', name: 'Sonka', enabled: true },
    { id: 'szalami', name: 'Szalámi', enabled: true },
    { id: 'tonhal', name: 'Tonhal', enabled: true },
    { id: 'vegetarianus', name: 'Vegetáriánus', enabled: true }
];

const DEFAULT_EXTRA_TOPPINGS = [
    { id: 'gomba', name: 'Gomba', enabled: true },
    { id: 'kukorica', name: 'Kukorica', enabled: true },
    { id: 'hagyma', name: 'Hagyma', enabled: true },
    { id: 'olajbogyo', name: 'Olajbogyó', enabled: true },
    { id: 'jalapeno', name: 'Jalapeno', enabled: true },
    { id: 'pepperoni', name: 'Pepperoni', enabled: true },
    { id: 'mozzarella', name: 'Mozzarella', enabled: true },
    { id: 'rukkola', name: 'Rukkola', enabled: true }
];

let baseToppings = [];
let extraToppings = [];
let toppingsLoaded = false;

// Load toppings from Firebase
async function loadToppings() {
    try {
        const baseToppingsRef = ref(database, 'toppings/base');
        const extraToppingsRef = ref(database, 'toppings/extra');

        const [baseSnapshot, extraSnapshot] = await Promise.all([
            get(baseToppingsRef),
            get(extraToppingsRef)
        ]);

        if (baseSnapshot.exists()) {
            baseToppings = baseSnapshot.val();
        } else {
            baseToppings = DEFAULT_BASE_TOPPINGS;
            // Try to save defaults, but don't fail if permission denied
            try {
                await set(baseToppingsRef, baseToppings);
            } catch (e) {
                console.warn('Could not save default base toppings to Firebase (permission denied). Check Firebase rules.');
            }
        }

        if (extraSnapshot.exists()) {
            extraToppings = extraSnapshot.val();
        } else {
            extraToppings = DEFAULT_EXTRA_TOPPINGS;
            // Try to save defaults, but don't fail if permission denied
            try {
                await set(extraToppingsRef, extraToppings);
            } catch (e) {
                console.warn('Could not save default extra toppings to Firebase (permission denied). Check Firebase rules.');
            }
        }

        toppingsLoaded = true;
        updateFormSelects();
    } catch (error) {
        console.error('Error loading toppings:', error);
        baseToppings = DEFAULT_BASE_TOPPINGS;
        extraToppings = DEFAULT_EXTRA_TOPPINGS;
        toppingsLoaded = true;
        updateFormSelects();
    }
}

// Watch for toppings changes in real-time
function watchToppings() {
    const baseToppingsRef = ref(database, 'toppings/base');
    const extraToppingsRef = ref(database, 'toppings/extra');

    onValue(baseToppingsRef, (snapshot) => {
        if (snapshot.exists()) {
            baseToppings = snapshot.val();
            if (toppingsLoaded) {
                updateFormSelects();
                renderToppingsManager();
            }
        }
    });

    onValue(extraToppingsRef, (snapshot) => {
        if (snapshot.exists()) {
            extraToppings = snapshot.val();
            if (toppingsLoaded) {
                updateFormSelects();
                renderToppingsManager();
            }
        }
    });
}

// Save toppings to Firebase
async function saveToppingsConfig() {
    try {
        const baseToppingsRef = ref(database, 'toppings/base');
        const extraToppingsRef = ref(database, 'toppings/extra');

        await Promise.all([
            set(baseToppingsRef, baseToppings),
            set(extraToppingsRef, extraToppings)
        ]);

        showToast('✅ Feltétek mentve és szinkronizálva!');
    } catch (error) {
        console.error('Error saving toppings:', error);
        if (error.message && error.message.includes('PERMISSION_DENIED')) {
            showToast('❌ Firebase jogosultsági hiba! Add hozzá a "toppings" szabályt a Firebase Rules-hoz.');
        } else {
            showToast('❌ Hiba történt a feltétek mentésekor');
        }
    }
}

// Load settings from Firebase
async function loadSettings() {
    try {
        const settingsRef = ref(database, 'settings');
        const snapshot = await get(settingsRef);

        if (snapshot.exists()) {
            const settings = snapshot.val();
            MAX_SLOTS = settings.maxSlots || 4;
            TIME_SLOT_INTERVAL = settings.timeInterval || 10;
            OPEN_HOUR = settings.openHour || 17;
            OPEN_MINUTE = settings.openMinute || 30;
            CLOSE_HOUR = settings.closeHour || 20;
            CLOSE_MINUTE = settings.closeMinute || 30;
            PRE_ORDER_HOUR = settings.preOrderHour || 16;
            PRE_ORDER_MINUTE = settings.preOrderMinute || 0;
            autoDeleteCompleted = settings.autoDelete || false;
        }
        settingsLoaded = true;
        checkPreOrderTime();
    } catch (error) {
        console.error('Error loading settings:', error);
        settingsLoaded = true;
        checkPreOrderTime();
    }
}

// Listen for settings changes in real-time
function watchSettings() {
    const settingsRef = ref(database, 'settings');
    onValue(settingsRef, (snapshot) => {
        if (snapshot.exists()) {
            const settings = snapshot.val();
            const oldPreOrderHour = PRE_ORDER_HOUR;
            const oldPreOrderMinute = PRE_ORDER_MINUTE;

            MAX_SLOTS = settings.maxSlots || 4;
            TIME_SLOT_INTERVAL = settings.timeInterval || 10;
            OPEN_HOUR = settings.openHour ?? 17;
            OPEN_MINUTE = settings.openMinute ?? 30;
            CLOSE_HOUR = settings.closeHour ?? 20;
            CLOSE_MINUTE = settings.closeMinute ?? 30;
            PRE_ORDER_HOUR = settings.preOrderHour ?? 16;
            PRE_ORDER_MINUTE = settings.preOrderMinute ?? 0;
            MAX_SLOTS = settings.maxSlots ?? 4;
            TIME_SLOT_INTERVAL = settings.timeInterval ?? 10;
            autoDeleteCompleted = settings.autoDelete ?? false;

            settingsLoaded = true;

            generateTimeSlots();

            if (oldPreOrderHour !== PRE_ORDER_HOUR || oldPreOrderMinute !== PRE_ORDER_MINUTE) {
                checkPreOrderTime();
            }
        }
    });
}

// Save settings to Firebase
async function saveSettings() {
    try {
        const settingsRef = ref(database, 'settings');
        await set(settingsRef, {
            maxSlots: MAX_SLOTS,
            timeInterval: TIME_SLOT_INTERVAL,
            openHour: OPEN_HOUR,
            openMinute: OPEN_MINUTE,
            closeHour: CLOSE_HOUR,
            closeMinute: CLOSE_MINUTE,
            preOrderHour: PRE_ORDER_HOUR,
            preOrderMinute: PRE_ORDER_MINUTE,
            autoDelete: autoDeleteCompleted
        });
    } catch (error) {
        console.error('Error saving settings:', error);
        throw error;
    }
}

// Logo upload functionality
async function uploadLogo(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const logoRef = ref(database, 'logo');
                await set(logoRef, {
                    data: e.target.result,
                    filename: file.name,
                    uploadedAt: Date.now()
                });
                resolve(e.target.result);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function loadLogo() {
    try {
        const logoRef = ref(database, 'logo');
        const snapshot = await get(logoRef);

        if (snapshot.exists()) {
            const logoData = snapshot.val();
            displayLogo(logoData.data);
        }
    } catch (error) {
        console.error('Error loading logo:', error);
    }
}

function displayLogo(dataUrl) {
    const logoImage = document.getElementById('logoImage');
    const logoPreview = document.getElementById('logoPreview');
    const logoPreviewImage = document.getElementById('logoPreviewImage');

    if (dataUrl) {
        logoImage.src = dataUrl;
        logoImage.style.display = 'block';

        if (logoPreview && logoPreviewImage) {
            logoPreviewImage.src = dataUrl;
            logoPreview.style.display = 'block';
        }
    } else {
        logoImage.style.display = 'none';

        if (logoPreview) {
            logoPreview.style.display = 'none';
        }
    }
}

async function removeLogo() {
    try {
        const logoRef = ref(database, 'logo');
        await remove(logoRef);
        displayLogo(null);
        showToast('🗑️ Logo törölve');
    } catch (error) {
        console.error('Error removing logo:', error);
        showToast('❌ Hiba történt a törlés során');
    }
}

// Watch for logo changes in real-time
function watchLogo() {
    const logoRef = ref(database, 'logo');
    onValue(logoRef, (snapshot) => {
        if (snapshot.exists()) {
            const logoData = snapshot.val();
            displayLogo(logoData.data);
        } else {
            displayLogo(null);
        }
    });
}

// Countdown timer
let countdownInterval = null;

function checkPreOrderTime() {
    // Don't check until settings are loaded
    if (!settingsLoaded) {
        return false;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const preOrderMinutes = PRE_ORDER_HOUR * 60 + PRE_ORDER_MINUTE;

    // Admin can always see the page
    if (isAdminMode) {
        document.getElementById('countdownOverlay').classList.remove('show');
        return true;
    }

    // If current time is before pre-order time, show countdown
    if (currentMinutes < preOrderMinutes) {
        showCountdown();
        return false;
    } else {
        hideCountdown();
        return true;
    }
}

function showCountdown() {
    const overlay = document.getElementById('countdownOverlay');
    overlay.classList.add('show');

    // Update the display time
    const preOrderTimeDisplay = document.getElementById('preOrderTimeDisplay');
    preOrderTimeDisplay.textContent = `${String(PRE_ORDER_HOUR).padStart(2, '0')}:${String(PRE_ORDER_MINUTE).padStart(2, '0')}`;

    // Start countdown if not already running
    if (!countdownInterval) {
        updateCountdown();
        countdownInterval = setInterval(updateCountdown, 1000);
    }
}

function hideCountdown() {
    const overlay = document.getElementById('countdownOverlay');
    overlay.classList.remove('show');

    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

function updateCountdown() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), PRE_ORDER_HOUR, PRE_ORDER_MINUTE, 0);

    // If pre-order time has passed today, it means we should show the form
    if (now >= today) {
        hideCountdown();
        checkPreOrderTime();
        return;
    }

    const diff = today - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    document.getElementById('hoursLeft').textContent = String(hours).padStart(2, '0');
    document.getElementById('minutesLeft').textContent = String(minutes).padStart(2, '0');
    document.getElementById('secondsLeft').textContent = String(seconds).padStart(2, '0');
}

function renderToppingsManager() {
    const baseContainer = document.getElementById('baseToppingsManager');
    if (baseContainer) {
        baseContainer.innerHTML = baseToppings.map((topping, index) => `
            <div class="topping-item ${!topping.enabled ? 'disabled' : ''}">
                <input type="checkbox" 
                       ${topping.enabled ? 'checked' : ''} 
                       data-action="toggle-base"
                       data-index="${index}"
                       title="Be/kikapcsolás">
                <input type="text" 
                       value="${topping.name}" 
                       data-action="rename-base"
                       data-index="${index}"
                       placeholder="Feltét neve">
                <button type="button" data-action="delete-base" data-index="${index}">🗑️</button>
            </div>
        `).join('');
    }

    const extraContainer = document.getElementById('extraToppingsManager');
    if (extraContainer) {
        extraContainer.innerHTML = extraToppings.map((topping, index) => `
            <div class="topping-item ${!topping.enabled ? 'disabled' : ''}">
                <input type="checkbox" 
                       ${topping.enabled ? 'checked' : ''} 
                       data-action="toggle-extra"
                       data-index="${index}"
                       title="Be/kikapcsolás">
                <input type="text" 
                       value="${topping.name}" 
                       data-action="rename-extra"
                       data-index="${index}"
                       placeholder="Feltét neve">
                <button type="button" data-action="delete-extra" data-index="${index}">🗑️</button>
            </div>
        `).join('');
    }
}

// Event delegation for topping management
document.addEventListener('change', (e) => {
    const action = e.target.dataset.action;
    const index = parseInt(e.target.dataset.index);

    if (action === 'toggle-base' && !isNaN(index)) {
        baseToppings[index].enabled = e.target.checked;
        saveToppingsConfig();
        renderToppingsManager();
        updateFormSelects();
    } else if (action === 'toggle-extra' && !isNaN(index)) {
        extraToppings[index].enabled = e.target.checked;
        saveToppingsConfig();
        renderToppingsManager();
        updateFormSelects();
    } else if (action === 'rename-base' && !isNaN(index)) {
        const newName = e.target.value.trim();
        if (newName) {
            baseToppings[index].name = newName;
            saveToppingsConfig();
            updateFormSelects();
        }
    } else if (action === 'rename-extra' && !isNaN(index)) {
        const newName = e.target.value.trim();
        if (newName) {
            extraToppings[index].name = newName;
            saveToppingsConfig();
            updateFormSelects();
        }
    }
});

document.addEventListener('click', (e) => {
    const action = e.target.dataset.action || e.target.closest('button')?.dataset.action;
    const index = parseInt(e.target.dataset.index || e.target.closest('button')?.dataset.index);

    if (action === 'delete-base' && !isNaN(index)) {
        if (confirm(`Biztosan törölni szeretnéd: ${baseToppings[index].name}?`)) {
            baseToppings.splice(index, 1);
            saveToppingsConfig();
            renderToppingsManager();
            updateFormSelects();
        }
    } else if (action === 'delete-extra' && !isNaN(index)) {
        if (confirm(`Biztosan törölni szeretnéd: ${extraToppings[index].name}?`)) {
            extraToppings.splice(index, 1);
            saveToppingsConfig();
            renderToppingsManager();
            updateFormSelects();
        }
    }
});

function updateFormSelects() {
    const baseSelect = document.getElementById('baseTopping');
    const currentBase = baseSelect?.value;
    if (baseSelect) {
        baseSelect.innerHTML = '<option value="">Válassz...</option>' +
            baseToppings
                .filter(t => t.enabled)
                .map(t => `<option value="${t.id}">${t.name}</option>`)
                .join('');
        if (currentBase && baseToppings.find(t => t.id === currentBase && t.enabled)) {
            baseSelect.value = currentBase;
        }
    }

    [1, 2, 3].forEach(num => {
        const select = document.getElementById('extraTopping' + num);
        const current = select?.value;
        if (select) {
            select.innerHTML = '<option value="">Nincs</option>' +
                extraToppings
                    .filter(t => t.enabled)
                    .map(t => `<option value="${t.id}">${t.name}</option>`)
                    .join('');
            if (current && extraToppings.find(t => t.id === current && t.enabled)) {
                select.value = current;
            }
        }
    });

    updateEditFormSelects();
}

function updateEditFormSelects() {
    const editBaseSelect = document.getElementById('editBaseTopping');
    const currentEditBase = editBaseSelect?.value;
    if (editBaseSelect) {
        editBaseSelect.innerHTML = '<option value="">Válassz...</option>' +
            baseToppings
                .filter(t => t.enabled)
                .map(t => `<option value="${t.id}">${t.name}</option>`)
                .join('');
        if (currentEditBase && baseToppings.find(t => t.id === currentEditBase && t.enabled)) {
            editBaseSelect.value = currentEditBase;
        }
    }

    [1, 2, 3].forEach(num => {
        const select = document.getElementById('editExtraTopping' + num);
        const current = select?.value;
        if (select) {
            select.innerHTML = '<option value="">Nincs</option>' +
                extraToppings
                    .filter(t => t.enabled)
                    .map(t => `<option value="${t.id}">${t.name}</option>`)
                    .join('');
            if (current && extraToppings.find(t => t.id === current && t.enabled)) {
                select.value = current;
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const addBaseBtn = document.getElementById('addBaseToppingBtn');
    if (addBaseBtn) {
        addBaseBtn.addEventListener('click', () => {
            const name = prompt('Új alap feltét neve:');
            if (name && name.trim()) {
                baseToppings.push({
                    id: 'custom_' + Date.now(),
                    name: name.trim(),
                    enabled: true
                });
                saveToppingsConfig();
                renderToppingsManager();
                updateFormSelects();
                showToast('✅ Új alap feltét hozzáadva: ' + name.trim());
            }
        });
    }

    const addExtraBtn = document.getElementById('addExtraToppingBtn');
    if (addExtraBtn) {
        addExtraBtn.addEventListener('click', () => {
            const name = prompt('Új plusz feltét neve:');
            if (name && name.trim()) {
                extraToppings.push({
                    id: 'custom_' + Date.now(),
                    name: name.trim(),
                    enabled: true
                });
                saveToppingsConfig();
                renderToppingsManager();
                updateFormSelects();
                showToast('✅ Új plusz feltét hozzáadva: ' + name.trim());
            }
        });
    }
});

function getToppingName(id) {
    const baseTopping = baseToppings.find(t => t.id === id);
    if (baseTopping) return baseTopping.name;

    const extraTopping = extraToppings.find(t => t.id === id);
    if (extraTopping) return extraTopping.name;

    return id.charAt(0).toUpperCase() + id.slice(1);
}

function generateTimeSlots(slotCounts = {}) {
    const select = document.getElementById('time');
    const currentValue = select.value;
    select.innerHTML = '<option value="">Válassz időpontot...</option>';
    const startTime = OPEN_HOUR * 60 + OPEN_MINUTE;
    const endTime = CLOSE_HOUR * 60 + CLOSE_MINUTE;
    for (let time = startTime; time <= endTime; time += TIME_SLOT_INTERVAL) {
        const hours = Math.floor(time / 60);
        const minutes = time % 60;
        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        const count = slotCounts[timeString] || 0;
        const free = MAX_SLOTS - count;
        const option = document.createElement('option');
        option.value = timeString;
        if (free <= 0) {
            option.textContent = `${timeString} – FOGLALT`;
            option.disabled = true;
            option.style.color = '#aaa';
        } else {
            option.textContent = `${timeString}  (${free} hely szabad)`;
            option.disabled = false;
            option.style.color = '';
        }
        select.appendChild(option);
    }
    if (currentValue && (slotCounts[currentValue] || 0) < MAX_SLOTS) {
        select.value = currentValue;
    }
}

function updateQuantityOptions() {
    const timeSelect = document.getElementById('time');
    const quantitySelect = document.getElementById('quantity');
    const selectedTime = timeSelect.value;

    if (!selectedTime) {
        quantitySelect.innerHTML = '<option value="1">1 pizza</option>';
        return;
    }

    const option = Array.from(timeSelect.options).find(opt => opt.value === selectedTime);
    if (option && !option.disabled) {
        const text = option.textContent;
        const match = text.match(/\((\d+) hely szabad\)/);
        const available = match ? parseInt(match[1]) : 1;

        quantitySelect.innerHTML = '';
        for (let i = 1; i <= Math.min(available, 10); i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = i === 1 ? '1 pizza' : `${i} pizza`;
            quantitySelect.appendChild(opt);
        }
    }
}

async function generateEditTimeSlots(currentTime, currentSlotKey) {
    const select = document.getElementById('editTime');
    select.innerHTML = '<option value="">Válassz időpontot...</option>';
    const startTime = OPEN_HOUR * 60 + OPEN_MINUTE;
    const endTime = CLOSE_HOUR * 60 + CLOSE_MINUTE;
    const todayKey = getTodayKey();
    const ordersRef = ref(database, `orders/${todayKey}`);
    const snapshot = await get(ordersRef);
    const allData = snapshot.exists() ? snapshot.val() : {};

    const slotCounts = {};
    for (const [t, slots] of Object.entries(allData)) {
        if (!slots || typeof slots !== 'object') continue;
        for (const [sk, order] of Object.entries(slots)) {
            if (!order || order.archived) continue;
            if (t === currentTime && sk === currentSlotKey) continue;
            slotCounts[t] = (slotCounts[t] || 0) + 1;
        }
    }
    for (let time = startTime; time <= endTime; time += TIME_SLOT_INTERVAL) {
        const hours = Math.floor(time / 60);
        const minutes = time % 60;
        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        const count = slotCounts[timeString] || 0;
        const free = MAX_SLOTS - count;

        const option = document.createElement('option');
        option.value = timeString;

        if (timeString === currentTime) {
            option.textContent = `${timeString}  (jelenlegi)`;
        } else if (free <= 0) {
            continue;
        } else {
            option.textContent = `${timeString}  (${free} hely szabad)`;
        }

        select.appendChild(option);
    }
}

function filterMozzarella(isLactoseFree, prefix = '') {
    const suffix = prefix === 'edit' ? 'ExtraTopping' : 'extraTopping';
    const selects = [
        document.getElementById(prefix + suffix + '1'),
        document.getElementById(prefix + suffix + '2'),
        document.getElementById(prefix + suffix + '3')
    ].filter(Boolean);
    selects.forEach(select => {
        const mozzarellaOption = Array.from(select.options).find(opt => opt.value === 'mozzarella');
        if (mozzarellaOption) {
            if (isLactoseFree) {
                if (select.value === 'mozzarella') select.value = '';
                mozzarellaOption.disabled = true;
                mozzarellaOption.style.display = 'none';
            } else {
                mozzarellaOption.disabled = false;
                mozzarellaOption.style.display = '';
            }
        }
    });
    // Margherita alap feltét is tiltva laktózmentes esetén
    filterLactoseFreeBaseToppings(isLactoseFree, prefix);
}

// Laktózmentes esetén a margherita alap feltétet is tiltjuk (sajtot tartalmaz)
function filterLactoseFreeBaseToppings(isLactoseFree, prefix = '') {
    const baseSelectId = prefix === 'edit' ? 'editBaseTopping' : 'baseTopping';
    const baseSelect = document.getElementById(baseSelectId);
    if (!baseSelect) return;

    // Laktózt tartalmazó alap feltétek ID-i
    const dairyBaseToppings = ['margherita'];

    dairyBaseToppings.forEach(id => {
        const opt = Array.from(baseSelect.options).find(o => o.value === id);
        if (!opt) return;
        if (isLactoseFree) {
            if (baseSelect.value === id) baseSelect.value = '';
            opt.disabled = true;
            opt.style.color = '#ccc';
            if (!opt.textContent.includes('🚫')) opt.textContent = '🚫 ' + opt.textContent;
        } else {
            opt.disabled = false;
            opt.style.color = '';
            opt.textContent = opt.textContent.replace('🚫 ', '');
        }
    });
}

function filterMeatToppings(isVegetarian, prefix = '') {
    const suffix = prefix === 'edit' ? 'ExtraTopping' : 'extraTopping';
    const selects = [
        document.getElementById(prefix + suffix + '1'),
        document.getElementById(prefix + suffix + '2'),
        document.getElementById(prefix + suffix + '3')
    ].filter(Boolean);

    const meatToppings = ['pepperoni'];

    selects.forEach(select => {
        meatToppings.forEach(meat => {
            const meatOption = Array.from(select.options).find(opt => opt.value === meat);
            if (meatOption) {
                if (isVegetarian) {
                    if (select.value === meat) select.value = '';
                    meatOption.disabled = true;
                    meatOption.style.color = '#ccc';
                    meatOption.textContent = meatOption.textContent.includes('🚫')
                        ? meatOption.textContent
                        : '🚫 ' + meatOption.textContent;
                } else {
                    meatOption.disabled = false;
                    meatOption.style.color = '';
                    meatOption.textContent = meatOption.textContent.replace('🚫 ', '');
                }
            }
        });
    });
}

function showToast(message) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function getDeviceId() {
    let id = getCookie('pizzeria_device_id');
    if (!id) {
        id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        setCookie('pizzeria_device_id', id, 365);
    }
    return id;
}

function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name) {
    return document.cookie.split('; ').reduce((acc, part) => {
        const [k, v] = part.split('=');
        return k === name ? decodeURIComponent(v) : acc;
    }, null);
}

function saveMyOrderToCookie(time, slotKey) {
    const todayKey = getTodayKey();
    const cookieName = `my_orders_${todayKey}`;
    const existing = getCookie(cookieName);
    const entries = existing ? JSON.parse(existing) : [];
    const already = entries.some(e => e.time === time && e.slotKey === slotKey);
    if (!already) {
        entries.push({ time, slotKey });
        setCookie(cookieName, JSON.stringify(entries), 1);
    }
}

function removeMyOrderFromCookie(time, slotKey) {
    const todayKey = getTodayKey();
    const cookieName = `my_orders_${todayKey}`;
    const existing = getCookie(cookieName);
    if (!existing) return;
    const entries = JSON.parse(existing).filter(e => !(e.time === time && e.slotKey === slotKey));
    setCookie(cookieName, JSON.stringify(entries), 1);
}

function updateMyOrderCookie(oldTime, oldSlotKey, newTime, newSlotKey) {
    removeMyOrderFromCookie(oldTime, oldSlotKey);
    saveMyOrderToCookie(newTime, newSlotKey);
}

function getMyOrderEntries() {
    const todayKey = getTodayKey();
    const existing = getCookie(`my_orders_${todayKey}`);
    if (!existing) return [];
    const parsed = JSON.parse(existing);
    return parsed.map(e => typeof e === 'string' ? { time: e, slotKey: null } : e);
}

function displayMyOrders(allOrders) {
    const myEntries = getMyOrderEntries();
    const myList = document.getElementById('myOrdersList');
    const myOrders = allOrders.filter(o =>
        !o.archived &&
        myEntries.some(e => e.time === o.time && (e.slotKey === o.slotKey || e.slotKey === null))
    );

    if (myOrders.length === 0) {
        myList.innerHTML = '<div class="empty-state">Még nem adtál le rendelést erről az eszközről.</div>';
        return;
    }

    myOrders.forEach(order => {
        const orderKey = `${order.time}_${order.slotKey}`;
        const currentStatus = getStatus(order);
        const previousStatus = previousOrderStatuses[orderKey];

        if (previousStatus && previousStatus !== currentStatus) {
            const statusMessages = {
                preparing: `🍳 Állapot frissítve: ${order.time}-es rendelésed készülőben! (kb. 10-15 perc)`,
                completed: `✅ Állapot frissítve: ${order.time}-es rendelésed kész, átveheted!`,
                pending: `⏳ Állapot frissítve: ${order.time}-es rendelésed visszaállítva függőben állapotba`
            };

            if (statusMessages[currentStatus]) {
                showToast(statusMessages[currentStatus]);
            }
        }

        previousOrderStatuses[orderKey] = currentStatus;
    });

    myList.innerHTML = myOrders.map(order => {
        const extras = [order.extraTopping1, order.extraTopping2, order.extraTopping3]
            .filter(t => t && t !== '')
            .map(id => getToppingName(id))
            .join(', ');
        const status = getStatus(order);
        const statusClass = status === 'completed' ? ' completed' : status === 'preparing' ? ' preparing' : '';
        const statusMsg = {
            pending: '',
            preparing: '<div class="order-status" style="color:#856404">🍳 Készülőben – kb. 10–15 perc!</div>',
            completed: '<div class="order-status" style="color:#155724">✅ Kész – hamarosan átveheted!</div>'
        }[status];

        const canEdit = canEditOrder(order.time, status);
        const editButton = canEdit
            ? `<button class="btn-edit" data-time="${order.time}" data-slot="${order.slotKey}"><span>✏️ Szerkesztés</span></button>`
            : `<button class="btn-edit" disabled style="opacity: 0.5; cursor: not-allowed;" title="Nem szerkeszthető (készülőben vagy 30 percen belül)"><span>✏️ Szerkesztés</span></button>`;

        return `
            <div class="my-order-item${statusClass}" data-time="${order.time}" data-slot="${order.slotKey}">
                <div class="my-order-badge">🍕 Saját rendelés</div>
                <div class="order-time">${order.time}</div>
                <div class="order-details">
                    <strong>Név:</strong> ${order.name}<br>
                    <strong>Alap feltét:</strong> ${getToppingName(order.baseTopping)}
                    ${extras ? '<br><strong>Plusz feltétek:</strong> ' + extras : ''}
                    ${order.lactoseFree ? '<br><strong>Laktózmentes</strong>' : ''}
                </div>
                ${statusMsg}
                <div class="order-actions">
                    ${editButton}
                    <button class="btn-delete" data-time="${order.time}" data-slot="${order.slotKey}"><span>🗑️ Törlés</span></button>
                </div>
            </div>`;
    }).join('');
}

function getTodayKey() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function loadOrders() {
    const todayKey = getTodayKey();
    const ordersRef = ref(database, `orders/${todayKey}`);
    onValue(ordersRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            generateTimeSlots([]);
            document.getElementById('ordersList').innerHTML = '<div class="empty-state">Még nincsenek rendelések a mai napra.</div>';
            displayArchiveOrders([]);
            displayMyOrders([]);
            displayStatistics([]);
            return;
        }
        const allOrders = [];
        for (const [time, slots] of Object.entries(data)) {
            if (slots && typeof slots === 'object') {
                for (const [slotKey, order] of Object.entries(slots)) {
                    if (order && typeof order === 'object') {
                        allOrders.push({ time, slotKey, ...order });
                    }
                }
            }
        }

        const active = allOrders.filter(o => !o.archived);
        const archived = allOrders.filter(o => o.archived);
        active.sort((a, b) => a.time.localeCompare(b.time) || a.slotKey.localeCompare(b.slotKey));
        archived.sort((a, b) => a.time.localeCompare(b.time) || a.slotKey.localeCompare(b.slotKey));

        const slotCounts = {};
        for (const o of active) {
            slotCounts[o.time] = (slotCounts[o.time] || 0) + 1;
        }
        generateTimeSlots(slotCounts);

        displayOrders(active);
        displayArchiveOrders(archived);
        displayMyOrders(allOrders);
        displayStatistics(allOrders);

        // Ha rendelés után vár a scroll, most hajtjuk végre (Firebase már visszaigazolta)
        if (pendingScrollToMyOrders) {
            pendingScrollToMyOrders = false;
            document.getElementById('myOrdersSection').scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
}

function displayArchiveOrders(orders) {
    const archiveContent = document.getElementById('archiveContent');
    if (orders.length === 0) {
        archiveContent.innerHTML = '<div class="empty-state">Még nincsenek archivált rendelések.</div>';
        return;
    }
    archiveContent.innerHTML = orders.map(order => {
        const extras = [order.extraTopping1, order.extraTopping2, order.extraTopping3]
            .filter(t => t && t !== '')
            .map(id => getToppingName(id))
            .join(', ');
        const archivedDate = order.archivedAt ? new Date(order.archivedAt).toLocaleString('hu-HU') : '';
        return `
            <div class="archive-item">
                <div class="order-time">${order.time}</div>
                <div class="order-details">
                    <strong>Név:</strong> ${order.name}<br>
                    <strong>Alap feltét:</strong> ${getToppingName(order.baseTopping)}
                    ${extras ? '<br><strong>Plusz feltétek:</strong> ' + extras : ''}
                    ${order.lactoseFree ? '<br><strong>Laktózmentes</strong>' : ''}
                    ${archivedDate ? '<div class="archive-date">Archiválva: ' + archivedDate + '</div>' : ''}
                </div>
            </div>`;
    }).join('');
}

function displayStatistics(allOrders) {
    // Active orders: pending + preparing (not yet completed)
    const activeOrders = allOrders.filter(o => {
        if (o.archived) return false;
        const status = getStatus(o);
        return status === 'pending' || status === 'preparing';
    });

    // Completed orders: completed status OR archived orders that were completed
    const completedOrders = allOrders.filter(o => {
        const status = getStatus(o);
        return status === 'completed' || (o.archived && o.completed);
    });

    // Active orders ingredients (pending + preparing)
    const activeIngredients = {};
    let totalActive = activeOrders.length;
    let activeLactoseFree = 0;

    activeOrders.forEach(order => {
        if (order.baseTopping) {
            activeIngredients[order.baseTopping] = (activeIngredients[order.baseTopping] || 0) + 1;
        }
        [order.extraTopping1, order.extraTopping2, order.extraTopping3].forEach(topping => {
            if (topping && topping !== '') {
                activeIngredients[topping] = (activeIngredients[topping] || 0) + 1;
            }
        });
        if (order.lactoseFree) activeLactoseFree++;
    });

    // Completed orders ingredients (including archived)
    const completedIngredients = {};
    let totalCompleted = completedOrders.length;
    let completedLactoseFree = 0;

    completedOrders.forEach(order => {
        if (order.baseTopping) {
            completedIngredients[order.baseTopping] = (completedIngredients[order.baseTopping] || 0) + 1;
        }
        [order.extraTopping1, order.extraTopping2, order.extraTopping3].forEach(topping => {
            if (topping && topping !== '') {
                completedIngredients[topping] = (completedIngredients[topping] || 0) + 1;
            }
        });
        if (order.lactoseFree) completedLactoseFree++;
    });

    // Stats cards
    const statsGrid = document.getElementById('statsGrid');
    statsGrid.innerHTML = `
        <div class="stat-card" style="border-left-color: #FFC107;">
            <h3 style="color: #FFC107;">${totalActive}</h3>
            <p>🍕 Készítésre vár / Készülőben</p>
        </div>
        <div class="stat-card" style="border-left-color: #4CAF50;">
            <h3 style="color: #4CAF50;">${totalCompleted}</h3>
            <p>✅ Elkészült (mai nap összes)</p>
        </div>
        <div class="stat-card" style="border-left-color: #FFC107;">
            <h3 style="color: #FFC107;">${activeLactoseFree}</h3>
            <p>🍕 Laktózmentes (aktív)</p>
        </div>
        <div class="stat-card" style="border-left-color: #4CAF50;">
            <h3 style="color: #4CAF50;">${completedLactoseFree}</h3>
            <p>✅ Laktózmentes (elkészült)</p>
        </div>
    `;

    // Ingredients list - két oszlop
    const ingredientsList = document.getElementById('ingredientsList');

    const sortedActive = Object.entries(activeIngredients).sort((a, b) => b[1] - a[1]);
    const sortedCompleted = Object.entries(completedIngredients).sort((a, b) => b[1] - a[1]);

    ingredientsList.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            <div>
                <h4 style="font-family: 'Bebas Neue', sans-serif; font-size: 1.5rem; color: #FFC107; margin-bottom: 1rem; text-align: center;">
                    🍕 Aktív rendelések alapanyagai
                </h4>
                <div style="background: #FFFDF0; padding: 1rem; border-radius: 8px; border: 2px solid #FFC107;">
                    ${sortedActive.length > 0 ? sortedActive.map(([id, count]) => `
                        <div class="ingredient-item">
                            <span class="ingredient-name">${getToppingName(id)}</span>
                            <span class="ingredient-count" style="color: #FFC107;">${count} adag</span>
                        </div>
                    `).join('') : '<div class="empty-state">Nincs aktív rendelés</div>'}
                </div>
            </div>
            <div>
                <h4 style="font-family: 'Bebas Neue', sans-serif; font-size: 1.5rem; color: #4CAF50; margin-bottom: 1rem; text-align: center;">
                    ✅ Elkészült pizzák alapanyagai (mai nap)
                </h4>
                <div style="background: #F1F8F4; padding: 1rem; border-radius: 8px; border: 2px solid #4CAF50;">
                    ${sortedCompleted.length > 0 ? sortedCompleted.map(([id, count]) => `
                        <div class="ingredient-item">
                            <span class="ingredient-name">${getToppingName(id)}</span>
                            <span class="ingredient-count" style="color: #4CAF50;">${count} adag</span>
                        </div>
                    `).join('') : '<div class="empty-state">Még nincs elkészült pizza</div>'}
                </div>
            </div>
        </div>
    `;
}

function statusLabel(status) {
    if (status === 'preparing') return '<span class="status-badge preparing">🍳 Készülőben (10–15p)</span>';
    if (status === 'completed') return '<span class="status-badge completed">✅ Kész</span>';
    return '<span class="status-badge pending">⏳ Függőben</span>';
}

function nextStatusBtn(status, time, slotKey) {
    if (status === 'pending') return `<button class="btn-status to-preparing" data-time="${time}" data-slot="${slotKey}"><span>▶ Készülőben</span></button>`;
    if (status === 'preparing') return `<button class="btn-status to-completed" data-time="${time}" data-slot="${slotKey}"><span>✔ Kész</span></button>`;
    if (status === 'completed') return `<button class="btn-status to-picked-up" data-time="${time}" data-slot="${slotKey}"><span>👍 Átvéve</span></button>`;
}

function canEditOrder(orderTime, orderStatus) {
    if (orderStatus === 'preparing' || orderStatus === 'completed') {
        return false;
    }

    const now = new Date();
    const [hours, minutes] = orderTime.split(':').map(Number);
    const pickupTime = new Date();
    pickupTime.setHours(hours, minutes, 0, 0);

    const timeDiff = (pickupTime - now) / (1000 * 60);

    if (timeDiff < 30) {
        return false;
    }

    return true;
}

function getStatus(order) {
    if (order.status) return order.status;
    if (order.completed) return 'completed';
    return 'pending';
}

function displayOrders(orders) {
    const ordersList = document.getElementById('ordersList');
    if (orders.length === 0) {
        ordersList.innerHTML = '<div class="empty-state">Még nincsenek rendelések a mai napra.</div>';
        return;
    }
    ordersList.innerHTML = orders.map(order => {
        const extras = [order.extraTopping1, order.extraTopping2, order.extraTopping3]
            .filter(t => t && t !== '')
            .map(id => getToppingName(id))
            .join(', ');
        const status = getStatus(order);
        return `
            <div class="order-item ${status}" data-time="${order.time}" data-slot="${order.slotKey}">
                <div class="order-content">
                    <div class="order-time">${order.time} <small style="font-size:0.7em;color:#aaa">#${order.slotKey}</small></div>
                    <div class="order-details">
                        <strong>Név:</strong> ${order.name}<br>
                        <strong>Alap feltét:</strong> ${getToppingName(order.baseTopping)}
                        ${extras ? '<br><strong>Plusz feltétek:</strong> ' + extras : ''}
                        ${order.lactoseFree ? '<br><strong>Laktózmentes</strong>' : ''}
                    </div>
                    ${statusLabel(status)}
                    <div class="order-actions">
                        ${nextStatusBtn(status, order.time, order.slotKey)}
                        <button class="btn-edit" data-time="${order.time}" data-slot="${order.slotKey}"><span>✏️ Szerkesztés</span></button>
                        <button class="btn-delete" data-time="${order.time}" data-slot="${order.slotKey}"><span>🗑️ Törlés</span></button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

document.addEventListener('click', async (e) => {
    const statusBtn = e.target.closest('.btn-status');
    if (statusBtn) {
        const time = statusBtn.dataset.time;
        const slotKey = statusBtn.dataset.slot;
        if (!time || !slotKey) return;
        if (statusBtn.classList.contains('to-preparing')) await cycleOrderStatus(time, slotKey, 'preparing');
        else if (statusBtn.classList.contains('to-completed')) await cycleOrderStatus(time, slotKey, 'completed');
        else if (statusBtn.classList.contains('to-picked-up')) await pickUpOrder(time, slotKey);
        return;
    }

    const deleteBtn = e.target.closest('.btn-delete');
    if (deleteBtn) {
        const time = deleteBtn.dataset.time;
        const slotKey = deleteBtn.dataset.slot;
        if (time && slotKey && confirm(`Biztosan törölni szeretnéd a ${time}-es rendelést?`)) {
            await deleteOrder(time, slotKey);
        }
        return;
    }

    const editBtn = e.target.closest('.btn-edit');
    if (editBtn && !editBtn.disabled) {
        const time = editBtn.dataset.time;
        const slotKey = editBtn.dataset.slot;
        if (time && slotKey) await openEditModal(time, slotKey);
        return;
    }
});

async function cycleOrderStatus(time, slotKey, toStatus) {
    try {
        const todayKey = getTodayKey();
        const orderRef = ref(database, `orders/${todayKey}/${time}/${slotKey}`);
        const snapshot = await get(orderRef);
        if (snapshot.exists()) {
            const order = snapshot.val();
            order.status = toStatus;
            order.completed = (toStatus === 'completed');

            await set(orderRef, order);
            const msgs = {
                preparing: '🍳 Rendelés: Készülőben',
                completed: '✅ Rendelés: Kész és átvehető',
                pending: '↩ Rendelés visszaállítva'
            };
            showToast(msgs[toStatus]);
        }
    } catch (error) {
        console.error('Error updating status:', error);
        showToast('❌ Hiba történt');
    }
}

async function pickUpOrder(time, slotKey) {
    try {
        const todayKey = getTodayKey();
        const orderRef = ref(database, `orders/${todayKey}/${time}/${slotKey}`);
        const snapshot = await get(orderRef);
        if (snapshot.exists()) {
            const order = snapshot.val();
            order.archived = true;
            order.archivedAt = Date.now();
            await set(orderRef, order);
            showToast('👍 Rendelés átvéve és archiválva');
        }
    } catch (error) {
        console.error('Error marking as picked up:', error);
        showToast('❌ Hiba történt');
    }
}

async function deleteOrder(time, slotKey) {
    try {
        const todayKey = getTodayKey();
        const orderRef = ref(database, `orders/${todayKey}/${time}/${slotKey}`);
        const snapshot = await get(orderRef);
        if (snapshot.exists()) {
            const order = snapshot.val();
            await set(orderRef, { ...order, archived: true, archivedAt: Date.now() });
            removeMyOrderFromCookie(time, slotKey);
            showToast('📦 Rendelés archiválva');
        }
    } catch (error) {
        console.error('Error archiving order:', error);
        showToast('❌ Hiba történt az archiválás során');
    }
}

async function clearAllArchive() {
    if (!confirm('Biztosan törölni szeretnéd az összes archivált rendelést? Ez a művelet nem vonható vissza!')) {
        return;
    }

    try {
        const todayKey = getTodayKey();
        const ordersRef = ref(database, `orders/${todayKey}`);
        const snapshot = await get(ordersRef);

        if (!snapshot.exists()) {
            showToast('⚠️ Nincsenek archivált rendelések');
            return;
        }

        const data = snapshot.val();
        let deletedCount = 0;

        for (const [time, slots] of Object.entries(data)) {
            if (slots && typeof slots === 'object') {
                for (const [slotKey, order] of Object.entries(slots)) {
                    if (order && order.archived) {
                        const orderRef = ref(database, `orders/${todayKey}/${time}/${slotKey}`);
                        await remove(orderRef);
                        deletedCount++;
                    }
                }
            }
        }

        if (deletedCount > 0) {
            showToast(`✅ ${deletedCount} archivált rendelés törölve`);
        } else {
            showToast('⚠️ Nincsenek archivált rendelések');
        }
    } catch (error) {
        console.error('Error clearing archive:', error);
        showToast('❌ Hiba történt a törlés során');
    }
}

let editingOrderOriginalTime = null;
let editingOrderSlotKey = null;

async function openEditModal(time, slotKey) {
    try {
        const todayKey = getTodayKey();
        const orderRef = ref(database, `orders/${todayKey}/${time}/${slotKey}`);
        const snapshot = await get(orderRef);
        if (snapshot.exists()) {
            const order = snapshot.val();
            editingOrderOriginalTime = time;
            editingOrderSlotKey = slotKey;
            document.getElementById('editName').value = order.name;
            document.getElementById('editLactoseFree').checked = order.lactoseFree;
            document.getElementById('editBaseTopping').value = order.baseTopping;
            document.getElementById('editExtraTopping1').value = order.extraTopping1 || '';
            document.getElementById('editExtraTopping2').value = order.extraTopping2 || '';
            document.getElementById('editExtraTopping3').value = order.extraTopping3 || '';
            await generateEditTimeSlots(time, slotKey);
            document.getElementById('editTime').value = time;
            filterMozzarella(order.lactoseFree, 'edit');
            filterMeatToppings(order.baseTopping === 'vegetarianus', 'edit');
            document.getElementById('editModal').classList.add('show');
        }
    } catch (error) {
        console.error('Error opening edit modal:', error);
        showToast('❌ Hiba történt');
    }
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
    editingOrderOriginalTime = null;
    editingOrderSlotKey = null;
}

// In-memory slot tracker for the current submit session (resets each submit)
// Prevents multiple orders in same session from picking the same slot
const _pendingSlots = {};

async function saveOrder(orderData) {
    try {
        const todayKey = getTodayKey();
        const timeKey = orderData.time;
        const timeRef = ref(database, `orders/${todayKey}/${timeKey}`);
        const snapshot = await get(timeRef);
        const existing = snapshot.exists() ? snapshot.val() : {};

        // Merge already-pending (in-session) slots so we don't double-book
        const pending = _pendingSlots[timeKey] || [];

        let slotKey = null;
        let activeCount = 0;

        for (let i = 1; i <= MAX_SLOTS; i++) {
            const key = `slot_${i}`;
            const isOccupied = existing[key] && !existing[key].archived;
            const isPending = (pending || []).includes(key);

            if (isOccupied || isPending) {
                activeCount++;
            } else if (!slotKey) {
                slotKey = key;
            }
        }

        if (activeCount >= MAX_SLOTS) {
            showToast('❌ Ez az időpont már tele van (max ' + MAX_SLOTS + ' rendelés)');
            return false;
        }

        if (!slotKey) {
            showToast('❌ Nincs szabad hely erre az időpontra');
            return false;
        }

        // Reserve this slot in-session immediately
        if (!_pendingSlots[timeKey]) _pendingSlots[timeKey] = [];
        _pendingSlots[timeKey].push(slotKey);

        const slotRef = ref(database, `orders/${todayKey}/${timeKey}/${slotKey}`);
        await set(slotRef, { ...orderData, slotKey });
        return slotKey;
    } catch (error) {
        console.error('Error saving order:', error);
        showToast('❌ Hiba történt a mentés során: ' + error.message);
        return false;
    }
}

function showAdminLogin() {
    document.getElementById('adminLogin').classList.add('show');
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminPassword').focus();
}

function hideAdminLogin() {
    document.getElementById('adminLogin').classList.remove('show');
}

function toggleAdminMode(enable) {
    isAdminMode = enable;
    if (enable) {
        document.body.classList.add('admin-mode');
        document.getElementById('adminIndicator').classList.add('show');
        document.getElementById('adminToggle').textContent = '🔓';
        showToast('🔐 Admin mód aktiválva');
        hideCountdown();
    } else {
        document.body.classList.remove('admin-mode');
        document.getElementById('adminIndicator').classList.remove('show');
        document.getElementById('adminToggle').textContent = '🔐';
        showToast('👋 Admin mód kikapcsolva');
        checkPreOrderTime();
    }
}

// Event listeners
document.getElementById('adminToggle').addEventListener('click', () => {
    if (isAdminMode) toggleAdminMode(false);
    else showAdminLogin();
});
document.getElementById('cancelLogin').addEventListener('click', hideAdminLogin);
document.getElementById('loginButton').addEventListener('click', () => {
    const password = document.getElementById('adminPassword').value;
    if (password === ADMIN_PASSWORD) {
        toggleAdminMode(true);
        hideAdminLogin();
    } else {
        showToast('❌ Hibás jelszó');
        document.getElementById('adminPassword').value = '';
        document.getElementById('adminPassword').focus();
    }
});
document.getElementById('adminPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('loginButton').click();
});
document.getElementById('adminLogin').addEventListener('click', (e) => {
    if (e.target.id === 'adminLogin') hideAdminLogin();
});
document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeEditModal();
});
document.getElementById('lactoseFree').addEventListener('change', (e) => {
    filterMozzarella(e.target.checked);
});
document.getElementById('editLactoseFree').addEventListener('change', (e) => {
    filterMozzarella(e.target.checked, 'edit');
});
document.getElementById('baseTopping').addEventListener('change', (e) => {
    filterMeatToppings(e.target.value === 'vegetarianus');
});
document.getElementById('editBaseTopping').addEventListener('change', (e) => {
    filterMeatToppings(e.target.value === 'vegetarianus', 'edit');
});
document.getElementById('clearArchiveBtn').addEventListener('click', clearAllArchive);
document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newTime = document.getElementById('editTime').value;
    try {
        const todayKey = getTodayKey();
        const oldRef = ref(database, `orders/${todayKey}/${editingOrderOriginalTime}/${editingOrderSlotKey}`);
        const oldSnapshot = await get(oldRef);
        const wasStatus = oldSnapshot.exists() ? (oldSnapshot.val().status || 'pending') : 'pending';
        const orderData = {
            name: document.getElementById('editName').value,
            time: newTime,
            lactoseFree: document.getElementById('editLactoseFree').checked,
            baseTopping: document.getElementById('editBaseTopping').value,
            extraTopping1: document.getElementById('editExtraTopping1').value,
            extraTopping2: document.getElementById('editExtraTopping2').value,
            extraTopping3: document.getElementById('editExtraTopping3').value,
            status: wasStatus,
            completed: (wasStatus === 'completed'),
            timestamp: Date.now()
        };

        if (editingOrderOriginalTime !== newTime) {
            await set(oldRef, { ...oldSnapshot.val(), archived: true, archivedAt: Date.now() });
            const newTimeRef = ref(database, `orders/${todayKey}/${newTime}`);
            const newSnap = await get(newTimeRef);
            const existing = newSnap.exists() ? newSnap.val() : {};
            let newSlotKey = null;
            for (let i = 1; i <= MAX_SLOTS; i++) {
                const k = `slot_${i}`;
                if (!existing[k] || existing[k].archived) { newSlotKey = k; break; }
            }
            if (!newSlotKey) { showToast('❌ Az új időpontban nincs szabad hely'); return; }
            orderData.slotKey = newSlotKey;
            const newSlotRef = ref(database, `orders/${todayKey}/${newTime}/${newSlotKey}`);
            await set(newSlotRef, orderData);
            updateMyOrderCookie(editingOrderOriginalTime, editingOrderSlotKey, newTime, newSlotKey);
        } else {
            orderData.slotKey = editingOrderSlotKey;
            await set(oldRef, orderData);
        }
        showToast('✅ Rendelés sikeresen módosítva!');
        closeEditModal();
    } catch (error) {
        console.error('Error updating order:', error);
        showToast('❌ Hiba történt a módosítás során: ' + error.message);
    }
});
document.getElementById('activeTab').addEventListener('click', () => {
    document.getElementById('activeTab').classList.add('active');
    document.getElementById('statisticsTab').classList.remove('active');
    document.getElementById('archiveTab').classList.remove('active');
    document.getElementById('settingsTab').classList.remove('active');
    document.getElementById('ordersList').classList.add('active');
    document.getElementById('statisticsList').classList.remove('active');
    document.getElementById('archiveList').classList.remove('active');
    document.getElementById('settingsList').classList.remove('active');
});
document.getElementById('statisticsTab').addEventListener('click', () => {
    document.getElementById('statisticsTab').classList.add('active');
    document.getElementById('activeTab').classList.remove('active');
    document.getElementById('archiveTab').classList.remove('active');
    document.getElementById('settingsTab').classList.remove('active');
    document.getElementById('statisticsList').classList.add('active');
    document.getElementById('ordersList').classList.remove('active');
    document.getElementById('archiveList').classList.remove('active');
    document.getElementById('settingsList').classList.remove('active');
});
document.getElementById('archiveTab').addEventListener('click', () => {
    document.getElementById('archiveTab').classList.add('active');
    document.getElementById('activeTab').classList.remove('active');
    document.getElementById('statisticsTab').classList.remove('active');
    document.getElementById('settingsTab').classList.remove('active');
    document.getElementById('archiveList').classList.add('active');
    document.getElementById('ordersList').classList.remove('active');
    document.getElementById('statisticsList').classList.remove('active');
    document.getElementById('settingsList').classList.remove('active');
});
document.getElementById('settingsTab').addEventListener('click', () => {
    document.getElementById('settingsTab').classList.add('active');
    document.getElementById('activeTab').classList.remove('active');
    document.getElementById('statisticsTab').classList.remove('active');
    document.getElementById('archiveTab').classList.remove('active');
    document.getElementById('settingsList').classList.add('active');
    document.getElementById('ordersList').classList.remove('active');
    document.getElementById('statisticsList').classList.remove('active');
    document.getElementById('archiveList').classList.remove('active');

    document.getElementById('settingsAutoDelete').checked = autoDeleteCompleted;
    document.getElementById('settingsTimeInterval').value = TIME_SLOT_INTERVAL;
    document.getElementById('settingsMaxSlots').value = MAX_SLOTS;
    document.getElementById('settingsPreOrderHour').value = PRE_ORDER_HOUR;
    document.getElementById('settingsPreOrderMinute').value = PRE_ORDER_MINUTE;
    document.getElementById('settingsOpenTime').value = OPEN_HOUR;
    document.getElementById('settingsOpenMinute').value = OPEN_MINUTE;
    document.getElementById('settingsCloseTime').value = CLOSE_HOUR;
    document.getElementById('settingsCloseMinute').value = CLOSE_MINUTE;
    renderToppingsManager();
});
document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    const newAutoDelete = document.getElementById('settingsAutoDelete').checked;
    const newTimeInterval = parseInt(document.getElementById('settingsTimeInterval').value);
    const newMaxSlots = parseInt(document.getElementById('settingsMaxSlots').value);
    const newOpenHour = parseInt(document.getElementById('settingsOpenTime').value) || 0;
    const newOpenMinute = parseInt(document.getElementById('settingsOpenMinute').value) || 0;
    const newCloseHour = parseInt(document.getElementById('settingsCloseTime').value) || 0;
    const newCloseMinute = parseInt(document.getElementById('settingsCloseMinute').value) || 0;
    const newPreOrderHour = parseInt(document.getElementById('settingsPreOrderHour').value) || 0;
    const newPreOrderMinute = parseInt(document.getElementById('settingsPreOrderMinute').value) || 0;

    if (newTimeInterval < 5 || newTimeInterval > 30) {
        showToast('❌ Az időslot intervallum 5-30 perc között lehet');
        return;
    }
    if (newMaxSlots < 1 || newMaxSlots > 10) {
        showToast('❌ A max pizzák száma 1-10 között lehet');
        return;
    }
    if (newPreOrderHour < 0 || newPreOrderHour > 23 || newPreOrderMinute < 0 || newPreOrderMinute > 59) {
        showToast('❌ Érvénytelen előrendelés idő');
        return;
    }
    if (newOpenHour < 0 || newOpenHour > 23 || newOpenMinute < 0 || newOpenMinute > 59) {
        showToast('❌ Érvénytelen nyitási idő');
        return;
    }
    if (newCloseHour < 0 || newCloseHour > 23 || newCloseMinute < 0 || newCloseMinute > 59) {
        showToast('❌ Érvénytelen zárási idő');
        return;
    }

    const preOrderTime = newPreOrderHour * 60 + newPreOrderMinute;
    const openTime = newOpenHour * 60 + newOpenMinute;
    const closeTime = newCloseHour * 60 + newCloseMinute;

    if (preOrderTime >= openTime) {
        showToast('❌ Az előrendelés időpontja korábbi kell legyen mint a nyitás');
        return;
    }

    if (closeTime <= openTime) {
        showToast('❌ A zárás időpontja későbbi kell legyen mint a nyitás');
        return;
    }

    autoDeleteCompleted = newAutoDelete;
    TIME_SLOT_INTERVAL = newTimeInterval;
    MAX_SLOTS = newMaxSlots;
    PRE_ORDER_HOUR = newPreOrderHour;
    PRE_ORDER_MINUTE = newPreOrderMinute;
    OPEN_HOUR = newOpenHour;
    OPEN_MINUTE = newOpenMinute;
    CLOSE_HOUR = newCloseHour;
    CLOSE_MINUTE = newCloseMinute;

    try {
        await saveSettings();
        showToast('✅ Beállítások mentve és szinkronizálva minden eszközre!');
    } catch (error) {
        showToast('❌ Hiba történt a mentés során: ' + error.message);
    }
});

// =====================================================================
// FIX: Rendelés azonnali megjelenítése beküldés után (F5 nélkül)
// =====================================================================
document.getElementById('pizzaForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const quantity = parseInt(document.getElementById('quantity').value) || 1;
    const orderData = {
        name: document.getElementById('name').value,
        time: document.getElementById('time').value,
        lactoseFree: document.getElementById('lactoseFree').checked,
        baseTopping: document.getElementById('baseTopping').value,
        extraTopping1: document.getElementById('extraTopping1').value,
        extraTopping2: document.getElementById('extraTopping2').value,
        extraTopping3: document.getElementById('extraTopping3').value,
        completed: false,
        timestamp: Date.now()
    };

    let successCount = 0;
    const savedSlots = [];

    // Reset in-session slot tracker for this new submission
    for (const key in _pendingSlots) delete _pendingSlots[key];

    for (let i = 0; i < quantity; i++) {
        const slotKey = await saveOrder(orderData);
        if (slotKey) {
            saveMyOrderToCookie(orderData.time, slotKey);
            savedSlots.push(slotKey);
            successCount++;
        } else {
            break;
        }
    }

    if (successCount > 0) {
        const msg = successCount === 1
            ? '✅ Rendelés sikeresen leadva!'
            : `✅ ${successCount} rendelés sikeresen leadva!`;
        showToast(msg);

        document.getElementById('pizzaForm').reset();
        updateQuantityOptions();

        // Azonnal olvassuk vissza a friss adatot Firebase-ből és rendereljük
        try {
            const todayKey = getTodayKey();
            const freshSnapshot = await get(ref(database, `orders/${todayKey}`));
            if (freshSnapshot.exists()) {
                const data = freshSnapshot.val();
                const allOrders = [];
                for (const [time, slots] of Object.entries(data)) {
                    if (slots && typeof slots === 'object') {
                        for (const [slotKey, order] of Object.entries(slots)) {
                            if (order && typeof order === 'object') {
                                allOrders.push({ time, slotKey, ...order });
                            }
                        }
                    }
                }
                displayMyOrders(allOrders);
            }
        } catch (err) {
            console.error('Error fetching fresh orders:', err);
        }

        // Scroll a saját rendelések szekcióhoz
        document.getElementById('myOrdersSection').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
});

document.getElementById('time').addEventListener('change', (e) => {
    updateQuantityOptions();
});

generateTimeSlots();
loadOrders();
updateQuantityOptions();

// Load toppings and settings from Firebase
loadToppings().then(() => {
    updateFormSelects();
});

// Load settings from Firebase first
loadSettings().then(() => {
    // Watch for settings changes in real-time
    watchSettings();
    // Watch for toppings changes
    watchToppings();
    // Watch for logo changes
    watchLogo();
    // Load logo
    loadLogo();
});

// Check every minute if countdown should appear/disappear
setInterval(checkPreOrderTime, 60000);

// Logo upload button - wrapped in try-catch with proper element checking
document.addEventListener('DOMContentLoaded', () => {
    const uploadBtn = document.getElementById('uploadLogoBtn');
    const removeBtn = document.getElementById('removeLogoBtn');
    const fileInput = document.getElementById('logoUpload');

    if (uploadBtn) {
        uploadBtn.addEventListener('click', async () => {
            const file = fileInput?.files[0];

            if (!file) {
                showToast('❌ Kérlek válassz ki egy képet!');
                return;
            }

            if (!file.type.match(/image\/(png|jpeg|jpg)/)) {
                showToast('❌ Csak PNG vagy JPG formátum engedélyezett!');
                return;
            }

            if (file.size > 2 * 1024 * 1024) {
                showToast('❌ A kép maximum 2MB lehet!');
                return;
            }

            try {
                await uploadLogo(file);
                showToast('✅ Logo sikeresen feltöltve!');
                if (fileInput) fileInput.value = '';
            } catch (error) {
                console.error('Error uploading logo:', error);
                showToast('❌ Hiba történt a feltöltés során: ' + error.message);
            }
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener('click', async () => {
            if (confirm('Biztosan törölni szeretnéd a logót?')) {
                await removeLogo();
            }
        });
    }
});
