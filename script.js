window.Engine = {
    role: "User",
    ADMIN_KEY: "chengalpattu2025",
    // Get a free key at aqicn.org/api/ - "demo" works for some locations
    WAQI_API_KEY: "demo", 
    volunteers: JSON.parse(localStorage.getItem('vols_v2')) || [],
    incidents: JSON.parse(localStorage.getItem('incs_v2')) || [],

    init() {
        // Check if user is logged in (from our separate login page logic)
        const savedRole = localStorage.getItem('userRole');
        if (savedRole) {
            this.role = savedRole;
        }

        this.refreshStats();
        this.automation.startMonitoring();
        
        // Initial render based on role
        if (this.role === 'Admin') {
            this.renderReviewQueue();
            this.renderVerificationList();
        }
    },

    // --- GEOLOCATION UTILITY ---
    getGPS() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                console.error("Geolocation not supported");
                resolve("GPS Unsupported");
            }
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const coords = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
                    resolve(coords);
                },
                (err) => {
                    console.warn("GPS Access Denied");
                    resolve("Location Restricted");
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        });
    },

    // --- AUTOMATION MODULE (SENSORS) ---
    automation: {
        startMonitoring() {
            console.log("E-CTZN Automation Online...");
            // Run checks immediately on load
            this.checkSeismicActivity();
            this.checkAirQuality();
            
            // Set intervals: Quakes every 5 mins, AQI every 15 mins
            setInterval(() => this.checkSeismicActivity(), 300000);
            setInterval(() => this.checkAirQuality(), 900000);
        },

        async checkSeismicActivity() {
            try {
                // Fetching significant quakes from last 24 hours
                const resp = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
                const data = await resp.json();
                
                // For demo: we check the most recent significant quake
                const quake = data.features[0]; 
                if (quake && quake.properties.mag >= 5.0) {
                    const location = quake.properties.place;
                    const msg = `Automated Alert: Magnitude ${quake.properties.mag} recorded at ${location}`;
                    
                    // Only generate if not already logged
                    Engine.autoGenerateEmergency("Seismic Event", msg, "HIGH", "Structural Collapse");
                }
            } catch (e) { console.error("Seismic Monitor Offline"); }
        },

        async checkAirQuality() {
            try {
                // 'here' keyword uses the user's IP-based location for AQI
                const resp = await fetch(`https://api.waqi.info/feed/here/?token=${Engine.WAQI_API_KEY}`);
                const data = await resp.json();
                
                if (data.status === "ok" && data.data.aqi > 150) {
                    const msg = `Air Quality Index Critical: ${data.data.aqi} (Health Hazard)`;
                    Engine.autoGenerateEmergency("AQI Alert", msg, "LOW", "Medical Mass Casualty");
                }
            } catch (e) { console.error("AQI Monitor Offline"); }
        }
    },

    autoGenerateEmergency(type, address, criticality, category) {
        // Prevent duplicates by checking if address already exists
        if (this.incidents.some(i => i.address === address)) return;

        const autoInc = {
            id: 'AUTO-' + Math.random().toString(36).substr(2, 4).toUpperCase(),
            type: category,
            criticality: criticality,
            address: address,
            victims: "Scanning...",
            hazmat: "Pending Analysis",
            maxNeeded: 5,
            location: "District Wide",
            requiredSkills: ["Medical Aid", "Heavy Rescue"],
            status: 'UNAUTHORIZED', // Admins must authorize automated alerts
            responders: []
        };

        this.incidents.push(autoInc);
        this.save();
        this.refreshStats();
        if (this.role === 'Admin') this.renderReviewQueue();
    },

    // --- CORE LOGIC ---
    showSection(id) {
        document.querySelectorAll('.content-section').forEach(s => s.classList.add('d-none'));
        document.getElementById(id + 'Section').classList.remove('d-none');
        
        document.querySelectorAll('.nav-link').forEach(a => {
            a.classList.remove('active');
            a.classList.add('text-white-50');
        });
        const activeLink = document.getElementById('link-' + id);
        if(activeLink) {
            activeLink.classList.add('active');
            activeLink.classList.remove('text-white-50');
        }

        if (id === 'task') this.renderReviewQueue();
        if (id === 'volunteer') this.renderVerificationList();
        if (id === 'dashboard') this.renderDashboard();
        this.refreshStats();
    },

    async registerVolunteer() {
        const skills = Array.from(document.querySelectorAll('input[name="vskill"]:checked')).map(i => i.value);
        const geoTag = await this.getGPS(); // Capture GPS during registration

        this.volunteers.push({
            name: document.getElementById('volName').value || "Anonymous",
            govID: document.getElementById('volGovID').value || "N/A",
            tier: document.getElementById('volMainSkill').value,
            avail: document.getElementById('volAvail').value,
            skills, 
            location: document.getElementById('volLocation').value,
            gps: geoTag,
            isVerified: false 
        });

        this.save();
        alert(`Credentials Logged. GPS Tag: ${geoTag}. Verification Pending.`);
        this.showSection('home');
    },

    createIncident() {
        const reqs = Array.from(document.querySelectorAll('input[name="tskill"]:checked')).map(i => i.value);
        const taskLoc = document.getElementById('taskLocation').value;
        const maxNeeded = parseInt(document.getElementById('taskMaxVolunteers').value) || 1;

        const newInc = {
            id: 'OPS-' + Math.random().toString(36).substr(2, 4).toUpperCase(),
            type: document.getElementById('taskType').value,
            criticality: document.getElementById('taskCriticality').value,
            address: document.getElementById('taskAddress').value,
            victims: document.getElementById('taskVictims').value,
            hazmat: document.getElementById('taskHazmat').value,
            maxNeeded, location: taskLoc, requiredSkills: reqs,
            status: (this.role === 'Admin') ? 'PENDING' : 'UNAUTHORIZED',
            responders: []
        };

        if (this.role === 'Admin') {
            const matches = this.volunteers.filter(v => 
                v.isVerified && 
                v.location === taskLoc && 
                v.skills.some(s => reqs.includes(s))
            ).slice(0, maxNeeded);
            
            if (matches.length > 0) { 
                newInc.status = 'IN_PROGRESS'; 
                newInc.responders = matches.map(m => m.name); 
            }
        }

        this.incidents.push(newInc);
        this.save();
        this.showSection('dashboard');
    },

    authorizeReport(index) {
        const inc = this.incidents[index];
        const matches = this.volunteers.filter(v => 
            v.isVerified && 
            v.location === inc.location && 
            v.skills.some(s => inc.requiredSkills.includes(s))
        ).slice(0, inc.maxNeeded);
        
        inc.status = matches.length > 0 ? 'IN_PROGRESS' : 'PENDING';
        inc.responders = matches.map(m => m.name);
        this.save();
        this.renderReviewQueue();
        this.refreshStats();
    },

    // --- RENDERING ENGINE ---
    renderReviewQueue() {
        const queue = document.getElementById('reviewQueueList');
        const container = document.getElementById('adminReviewSection');
        if (this.role !== 'Admin') { container.classList.add('d-none'); return; }
        
        const pending = this.incidents.filter(i => i.status === 'UNAUTHORIZED');
        if(pending.length === 0) { container.classList.add('d-none'); } 
        else { container.classList.remove('d-none'); }
        
        queue.innerHTML = '';
        this.incidents.forEach((inc, idx) => {
            if (inc.status === 'UNAUTHORIZED') {
                const col = document.createElement('div');
                col.className = 'col-md-6';
                col.innerHTML = `
                    <div class="card border-warning h-100 shadow-sm">
                        <div class="card-body">
                            <h6 class="card-title fw-bold text-danger">${inc.id}: ${inc.type}</h6>
                            <p class="card-text mb-1 small"><b>Location:</b> ${inc.address}</p>
                            <p class="card-text mb-2">
                                <span class="badge bg-dark">Hazmat: ${inc.hazmat}</span>
                                <span class="badge bg-secondary">Victims: ${inc.victims}</span>
                            </p>
                            <button class="btn btn-warning btn-sm w-100 fw-bold" onclick="Engine.authorizeReport(${idx})">VALIDATE & DEPLOY</button>
                        </div>
                    </div>`;
                queue.appendChild(col);
            }
        });
    },

    renderDashboard() {
        const containers = { 
            PENDING: document.getElementById('list-pending'), 
            IN_PROGRESS: document.getElementById('list-progress'), 
            RESOLVED: document.getElementById('list-resolved') 
        };
        Object.values(containers).forEach(c => { if(c) c.innerHTML = ''; });
        
        this.incidents.filter(i => i.status !== 'UNAUTHORIZED').forEach(inc => {
            const card = document.createElement('div');
            const borderClass = inc.criticality === 'HIGH' ? 'border-danger border-start border-4' : 'border-secondary';
            
            card.className = `card shadow-sm mb-2 ${borderClass}`;
            card.innerHTML = `
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between mb-2">
                        <span class="fw-bold small">${inc.id}</span>
                        <span class="badge ${inc.criticality === 'HIGH' ? 'bg-danger' : 'bg-warning text-dark'}">${inc.criticality}</span>
                    </div>
                    <h6 class="card-title fw-bold mb-1">${inc.type}</h6>
                    <p class="small text-muted mb-2">${inc.address}</p>
                    <div class="progress mb-2" style="height: 6px;">
                        <div class="progress-bar bg-success" style="width: ${(inc.responders.length/inc.maxNeeded)*100}%"></div>
                    </div>
                    <small class="d-block text-secondary" style="font-size:0.75rem">
                        Responders: ${inc.responders.join(', ') || '<span class="text-danger">AWAITING ASSETS...</span>'}
                    </small>
                </div>`;
            if(containers[inc.status]) containers[inc.status].appendChild(card);
        });
    },

    renderVerificationList() {
        const list = document.getElementById('pendingVolunteerList');
        const container = document.getElementById('verificationAdminCard');
        
        if (this.role !== 'Admin' || !list) { if(container) container.classList.add('d-none'); return; }
        container.classList.remove('d-none');
        
        list.innerHTML = '';
        this.volunteers.forEach((v, i) => {
            const col = document.createElement('div');
            col.className = 'col-md-6';
            
            const statusHtml = !v.isVerified 
                ? `<button class="btn btn-success btn-sm mt-2 w-100" onclick="Engine.authorizeResponder(${i})">APPROVE CREDENTIALS</button>` 
                : `<div class="mt-2 text-success small fw-bold"><i class="bi bi-geo-alt"></i> Verified at: ${v.gps}</div>`;

            col.innerHTML = `
                <div class="card h-100 border-light shadow-sm">
                    <div class="card-body">
                        <h6 class="fw-bold mb-1">${v.name}</h6>
                        <p class="small text-muted mb-0">${v.tier} | ID: ${v.govID}</p>
                        <p class="small mb-0 text-primary">Area: ${v.location}</p>
                        ${statusHtml}
                    </div>
                </div>`;
            list.appendChild(col);
        });
    },

    authorizeResponder(i) { 
        this.volunteers[i].isVerified = true; 
        this.save(); 
        this.renderVerificationList(); 
        this.refreshStats();
    },
    
    refreshStats() { 
        const vCount = document.getElementById('statVols');
        const iCount = document.getElementById('statIncidents');
        if(vCount) vCount.innerText = this.volunteers.filter(v => v.isVerified).length;
        if(iCount) iCount.innerText = this.incidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'UNAUTHORIZED').length;
    },
    
    save() { 
        localStorage.setItem('vols_v2', JSON.stringify(this.volunteers)); 
        localStorage.setItem('incs_v2', JSON.stringify(this.incidents)); 
    }
};

document.addEventListener('DOMContentLoaded', () => Engine.init());
