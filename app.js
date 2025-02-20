// State management
const state = {
    items: [],
    selectedItem: null,
    map: null,
    currentLocation: {
        lat: 54.87157,
        lng: 23.93421,
        zoom: 15
    }
};

// DOM Elements
const mapArea = document.getElementById('mapArea');
const itemsContainer = document.getElementById('itemsContainer');
const locationSearch = document.getElementById('locationSearch');
const searchButton = document.getElementById('searchButton');

// Debug logging
function log(message) {
    console.log(`[EventPlanner] ${message}`);
}

// Initialize Leaflet Map
function initializeMap() {
    // Create the map
    state.map = L.map('map').setView(
        [state.currentLocation.lat, state.currentLocation.lng],
        state.currentLocation.zoom
    );

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(state.map);

    // Add zoom control
    state.map.zoomControl.setPosition('topright');

    log('Map initialized');
}

// Search location using OpenStreetMap Nominatim
async function searchLocation(query) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
        );
        const data = await response.json();
        
        if (data && data.length > 0) {
            const location = data[0];
            state.map.setView(
                [parseFloat(location.lat), parseFloat(location.lon)],
                16
            );
            
            state.currentLocation = {
                lat: parseFloat(location.lat),
                lng: parseFloat(location.lon),
                zoom: 16
            };
        }
    } catch (error) {
        console.error('Error searching location:', error);
    }
}

// Helper Functions
function createItemElement(type, x, y) {
    const element = document.createElement('div');
    element.className = 'placed-item';
    element.setAttribute('data-type', type);
    element.style.left = `${x - 24}px`;
    element.style.top = `${y - 24}px`;
    
    const toolItem = document.querySelector(`[data-tool-type="${type}"]`);
    element.innerHTML = toolItem.innerHTML;
    
    return element;
}

function addItem(type, x, y) {
    const id = Date.now();
    const point = state.map.containerPointToLatLng([x, y]);
    
    const item = {
        id,
        type,
        x,
        y,
        coordinates: [point.lat, point.lng]
    };
    
    state.items.push(item);
    const element = createItemElement(type, x, y);
    element.setAttribute('data-id', id);
    itemsContainer.appendChild(element);
    
    initializeDraggable(element);
    log(`Added new item: ${type} at (${x}, ${y})`);
    saveState();
}

// Interact.js Configuration
function initializeDraggable(element) {
    interact(element).draggable({
        inertia: false,
        modifiers: [
            interact.modifiers.restrictRect({
                restriction: 'parent',
                endOnly: true
            })
        ],
        listeners: {
            start: (event) => {
                log('Started dragging placed item');
                event.target.classList.add('dragging');
            },
            move: dragMoveListener,
            end: dragEndListener
        }
    });
}

function dragMoveListener(event) {
    const target = event.target;
    const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
    const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

    target.style.transform = `translate(${x}px, ${y}px)`;
    target.setAttribute('data-x', x);
    target.setAttribute('data-y', y);
}

function dragEndListener(event) {
    const target = event.target;
    target.classList.remove('dragging');
    
    const id = parseInt(target.getAttribute('data-id'));
    const item = state.items.find(item => item.id === id);
    if (item) {
        const x = parseFloat(target.getAttribute('data-x')) || 0;
        const y = parseFloat(target.getAttribute('data-y')) || 0;
        item.x = x;
        item.y = y;
        
        // Update map coordinates
        const point = state.map.containerPointToLatLng([
            x + target.offsetWidth / 2,
            y + target.offsetHeight / 2
        ]);
        item.coordinates = [point.lat, point.lng];
        
        saveState();
    }
    log('Finished dragging placed item');
}

// Initialize Drag and Drop
document.addEventListener('DOMContentLoaded', () => {
    log('Initializing application...');
    
    // Initialize map
    initializeMap();

    // Initialize search with debounce
    searchButton.addEventListener('click', () => {
        const query = locationSearch.value.trim();
        if (query) {
            searchLocation(query);
        }
    });

    locationSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = locationSearch.value.trim();
            if (query) {
                searchLocation(query);
            }
        }
    });

    // Initialize Tool Palette Items
    interact('.tool-item')
        .draggable({
            inertia: false,
            autoScroll: true,
            listeners: {
                start(event) {
                    log('Started dragging tool item');
                    event.target.style.opacity = '0.5';
                },
                move(event) {
                    const position = {
                        x: (parseFloat(event.target.getAttribute('data-x')) || 0) + event.dx,
                        y: (parseFloat(event.target.getAttribute('data-y')) || 0) + event.dy
                    };

                    event.target.style.transform = 
                        `translate(${position.x}px, ${position.y}px)`;
                        
                    event.target.setAttribute('data-x', position.x);
                    event.target.setAttribute('data-y', position.y);
                },
                end(event) {
                    log('Finished dragging tool item');
                    event.target.style.opacity = '1';
                    event.target.style.transform = 'none';
                    event.target.removeAttribute('data-x');
                    event.target.removeAttribute('data-y');
                }
            }
        });

    // Initialize Map Area as Dropzone
    interact('.map-area')
        .dropzone({
            accept: '.tool-item',
            overlap: 0.5,
            ondropactivate: function (event) {
                log('Dropzone activated');
                event.target.classList.add('drop-active');
            },
            ondragenter: function (event) {
                log('Drag entered dropzone');
                event.target.classList.add('drop-target');
                event.relatedTarget.classList.add('can-drop');
            },
            ondragleave: function (event) {
                log('Drag left dropzone');
                event.target.classList.remove('drop-target');
                event.relatedTarget.classList.remove('can-drop');
            },
            ondrop: function (event) {
                log('Item dropped');
                const toolType = event.relatedTarget.getAttribute('data-tool-type');
                const rect = itemsContainer.getBoundingClientRect();
                const x = event.dragEvent.clientX - rect.left;
                const y = event.dragEvent.clientY - rect.top;
                
                addItem(toolType, x, y);
            },
            ondropdeactivate: function (event) {
                log('Dropzone deactivated');
                event.target.classList.remove('drop-active');
                event.target.classList.remove('drop-target');
            }
        });

    // Load saved state after initialization
    loadState();
});

// Save state to localStorage
function saveState() {
    const saveData = {
        items: state.items,
        currentLocation: {
            lat: state.map.getCenter().lat,
            lng: state.map.getCenter().lng,
            zoom: state.map.getZoom()
        }
    };
    localStorage.setItem('eventPlannerState', JSON.stringify(saveData));
    log('State saved');
}

// Load state from localStorage
function loadState() {
    try {
        const savedState = localStorage.getItem('eventPlannerState');
        if (savedState) {
            const parsedState = JSON.parse(savedState);
            
            // Restore location
            if (parsedState.currentLocation) {
                state.map.setView(
                    [parsedState.currentLocation.lat, parsedState.currentLocation.lng],
                    parsedState.currentLocation.zoom
                );
            }
            
            // Restore items
            if (parsedState.items) {
                state.items = parsedState.items;
                state.items.forEach(item => {
                    const point = state.map.latLngToContainerPoint([item.coordinates[0], item.coordinates[1]]);
                    const element = createItemElement(item.type, point.x, point.y);
                    element.setAttribute('data-id', item.id);
                    itemsContainer.appendChild(element);
                    initializeDraggable(element);
                });
            }
            
            log('State loaded');
        }
    } catch (error) {
        console.error('Error loading state:', error);
    }
}

// Update items positions when map moves
state.map.on('move', () => {
    state.items.forEach(item => {
        const element = document.querySelector(`[data-id="${item.id}"]`);
        if (element) {
            const point = state.map.latLngToContainerPoint([item.coordinates[0], item.coordinates[1]]);
            element.style.left = `${point.x - 24}px`;
            element.style.top = `${point.y - 24}px`;
            element.style.transform = 'none';
            element.removeAttribute('data-x');
            element.removeAttribute('data-y');
        }
    });
});