// Initialisation de Mapbox
mapboxgl.accessToken = 'pk.eyJ1IjoibWFyY3Vzc2ltcGxlIiwiYSI6ImNseTNvb3hobzA5cWsybHBvenRmdHNxcmwifQ.ZQAMdmO7CT--DCeE1pLF_g';
var map;
let selectedThalwegId = null;

// Liste des requêtes
const queries = [
    { 
        id: 1, 
        text: "Lister tous les nœuds", 
        type: "interrogation", 
        cypher: "MATCH (n:Node) RETURN n.id as id, n.longitude as longitude, n.latitude as latitude, n.z as altitude LIMIT $limit",
        customizable: true,
        customOptions: [
            { name: 'limit', type: 'number', default: 100, label: 'Nombre de nœuds à afficher' }
        ]
    },
    { 
        id: 2, 
        text: "Lister tous les cours d'eau", 
        type: "interrogation", 
        cypher: "MATCH (t:Thalweg) RETURN t.id as id, t.geometry as geometry, t.accumulation as accumulation, t.slope as slope LIMIT $limit",
        customizable: true,
        customOptions: [
            { name: 'limit', type: 'number', default: 100, label: 'Nombre de thalwegs à afficher' }
        ]
    },
    { 
        id: 3, 
        text: "Afficher les nœuds entre deux altitudes", 
        type: "interrogation", 
        cypher: `
        MATCH (t:Node)
        WITH t, CASE WHEN $X IS NULL THEN 0 ELSE $X END AS minZ, CASE WHEN $Y IS NULL THEN max(t.z) ELSE $Y END AS maxZ
        WHERE t.z > minZ AND t.z < maxZ
        RETURN t.id as id, t.longitude as longitude, t.latitude as latitude, t.z as altitude
        `,
        customizable: true,
        customOptions: [
            { name: 'X', type: 'number', default: null, label: 'Altitude minimale (laisser vide pour 0)' },
            { name: 'Y', type: 'number', default: null, label: 'Altitude maximale (laisser vide pour max)' }
        ]
    },
    { 
        id: 4, 
        text: "Afficher les cours d'eau en amont", 
        type: "validation", 
        cypher: "CALL custom.getUpstreamThalwegs($thalwegId)",
        customizable: false
    },
];

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded");
    initializeMap();
});

function initializeMap() {
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [-74.82608900230738, 45.76895453076196],
        zoom: 10
    });

    map.on('load', function() {
        console.log("Map loaded");
        setupEventListeners();
        populateQueryLists();
    });
}

function populateQueryLists() {
    console.log("Populating query lists");
    queries.forEach(query => {
        const listItem = document.createElement('li');
        listItem.textContent = query.text;
        listItem.className = 'query-item';
        listItem.onclick = function() { 
            console.log(`Query clicked: ${query.text}`);
            if (query.customizable) {
                showCustomizationModal(query);
            } else {
                executeQuery(query.id);
            }
        };
        const listElement = document.getElementById(`${query.type}-list`);
        if (listElement) {
            listElement.appendChild(listItem);
        } else {
            console.error(`List element not found for type: ${query.type}`);
        }
    });
}

function showCustomizationModal(query) {
    const modal = document.getElementById('customizationModal');
    const optionsContainer = document.getElementById('customizationOptions');
    optionsContainer.innerHTML = '';

    query.customOptions.forEach(option => {
        const label = document.createElement('label');
        label.textContent = option.label;
        const input = document.createElement('input');
        input.type = option.type;
        input.name = option.name;
        input.value = option.default;
        optionsContainer.appendChild(label);
        optionsContainer.appendChild(input);
    });

    modal.style.display = 'block';

    document.querySelector('.close').onclick = function() {
        modal.style.display = 'none';
    };

    document.getElementById('executeCustomQuery').onclick = function() {
        const customParams = {};
        query.customOptions.forEach(option => {
            const input = document.querySelector(`input[name="${option.name}"]`);
            customParams[option.name] = input.value;
        });
        console.log('Custom params before execution:', customParams);
        executeQuery(query.id, customParams);
        modal.style.display = 'none';
    };
}

function showValidationOptions(thalwegId) {
    const modal = document.getElementById('validationModal');
    const upstreamButton = document.getElementById('showUpstream');
    const downstreamButton = document.getElementById('showDownstream');

    upstreamButton.onclick = function() {
        executeQuery(4, { thalwegId: thalwegId });
        modal.style.display = 'none';
    };

    downstreamButton.onclick = function() {
        executeQuery(5, { thalwegId: thalwegId });
        modal.style.display = 'none';
    };

    modal.style.display = 'block';
}


function setupEventListeners() {
    document.querySelectorAll('.query-type').forEach(element => {
        element.addEventListener('click', function() {
            const type = this.getAttribute('data-type');
            console.log(`Clicked on query type: ${type}`);
            toggleQueryList(type);
        });
    });

    setupThalwegSelection();
}

function toggleQueryList(type) {
    const list = document.getElementById(`${type}-list`);
    if (list) {
        list.style.display = list.style.display === 'none' || list.style.display === '' ? 'block' : 'none';
    }
}

function setupThalwegSelection() {
    map.on('click', 'thalwegs', function(e) {
        if (!e.features.length) {
            console.log("No feature found at click location");
            return;
        }
        const thalwegId = e.features[0].properties.id;
        selectedThalwegId = thalwegId;
        
        map.setPaintProperty('thalwegs', 'line-color', [
            'case',
            ['==', ['get', 'id'], selectedThalwegId],
            '#FF0000',
            '#3498DB'
        ]);

        showValidationOptions(thalwegId);
    });
}

async function executeQuery(queryId, customParams = {}) {
    const query = queries.find(q => q.id === queryId);
    if (!query) {
        console.error('Requête non trouvée');
        return;
    }

    console.log(`Executing query: ${query.text}`);
    console.log('Custom params:', customParams);

    const convertedParams = {};
    for (const [key, value] of Object.entries(customParams)) {
        if (value === '') {
            convertedParams[key] = null;
        } else if (key === 'limit') {
            convertedParams[key] = parseInt(value, 10);
        } else if (['X', 'Y'].includes(key)) {
            convertedParams[key] = parseFloat(value);
        } else {
            convertedParams[key] = value;
        }
    }

    try {
        const response = await fetch('/execute_query/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({ 
                cypher: query.cypher, 
                queryId: query.id,
                params: convertedParams
            }),
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const data = await response.json();
        console.log("Received data:", data);

        if (data.results && data.results.length > 0) {
            console.log(`Updating map with ${data.results.length} results for query ${queryId}`);
            updateMap(data.results, queryId);
        } else {
            console.log("No results returned from the query");
            if (queryId === 4) {
                showNoUpstreamMessage();
            }
        }
    } catch (error) {
        console.error('Erreur lors de l\'exécution de la requête:', error);
    }
}

//----------------------------------------------------------------------------- UPDATE MAP ------------------------------------------------------------

function updateMap(data, queryId) {
    console.log("Updating map with data:", data);

    const geojson = {
        type: 'FeatureCollection',
        features: []
    };

    const endpointsGeojson = {
        type: 'FeatureCollection',
        features: []
    };

    if (queryId === 1 || queryId === 3) {   // Nœuds
        data.forEach(item => {
            geojson.features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [parseFloat(item.longitude), parseFloat(item.latitude)]
                },
                properties: {
                    id: item.id,
                    altitude: item.altitude
                }
            });
        });

        updateLayer('nodes', geojson, {
            type: 'circle',
            paint: {
                'circle-radius': 3,
                'circle-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'altitude'],
                    0, '#00ff00',
                    236, '#ffff00',
                    354, '#ff0000'
                ],
                'circle-stroke-width': 1,
                'circle-stroke-color': '#fff'
            }
        });
    } else if (queryId === 2) {   // Thalwegs initiaux
        data.forEach(thalweg => {
            geojson.features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: thalweg.coordinates
                },
                properties: {
                    id: thalweg.id,
                    accumulation: thalweg.accumulation,
                    slope: thalweg.slope
                }
            });

            addEndpoints(thalweg, endpointsGeojson);
        });

        updateLayer('thalwegs', geojson, {
            type: 'line',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': [
                    'case',
                    ['==', ['get', 'id'], selectedThalwegId],
                    '#FF0000',  // Rouge pour le thalweg sélectionné
                    '#3498DB'   // Bleu pour les autres thalwegs
                ],
                'line-width': 3
            }
        });

        updateLayer('thalweg-endpoints', endpointsGeojson, {
            type: 'circle',
            paint: {
                'circle-radius': 3,
                'circle-color': '#000000',
                'circle-stroke-width': 1,
                'circle-stroke-color': '#000'
            }
        });
    }else if (queryId === 4) {   // Thalwegs en amont
        console.log(`Processing ${data.length} upstream thalwegs`);
        const processedThalwegs = new Map();

        data.forEach((thalweg, index) => {
            console.log(`Processing upstream thalweg ${index + 1}:`, thalweg);
            if (!thalweg.coordinates || thalweg.coordinates.length === 0) {
                console.warn(`Thalweg ${thalweg.upstreamId} has no coordinates`);
                return;
            }

            const thalwegId = String(thalweg.upstreamId);
            
            // Si le thalweg n'a pas encore été traité ou si les nouvelles coordonnées sont géographiques
            if (!processedThalwegs.has(thalwegId) || 
                (thalweg.coordinates[0][0] > -180 && thalweg.coordinates[0][0] < 0)) {
                
                processedThalwegs.set(thalwegId, thalweg);
            }
        });

        processedThalwegs.forEach((thalweg, id) => {
            geojson.features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: thalweg.coordinates
                },
                properties: {
                    id: id,
                    depth: thalweg.depth,
                    valleyId: thalweg.valleyId
                }
            });

            addEndpoints(thalweg, endpointsGeojson, true);
        });

        console.log(`Added ${geojson.features.length} unique upstream thalwegs to the map`);

        updateLayer('upstream-thalwegs', geojson, {
            type: 'line',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#00FF00',
                'line-width': 3
            }
        });

        updateLayer('upstream-thalweg-endpoints', endpointsGeojson, {
            type: 'circle',
            paint: {
                'circle-radius': 3,
                'circle-color': '#00FF00',
                'circle-stroke-width': 1,
                'circle-stroke-color': '#000'
            }
        });
    }

    
    fitMapToFeatures(geojson);
    addPopupInteractions();

}

function updateLayer(layerId, geojsonData, layerOptions) {
    if (!map.getSource(layerId)) {
        map.addSource(layerId, {
            type: 'geojson',
            data: geojsonData
        });
        map.addLayer({
            id: layerId,
            source: layerId,
            ...layerOptions
        });
    } else {
        map.getSource(layerId).setData(geojsonData);
    }
}

function addEndpoints(thalweg, endpointsGeojson, isUpstream = false) {
    const startPoint = thalweg.coordinates[0];
    const endPoint = thalweg.coordinates[thalweg.coordinates.length - 1];
    
    [startPoint, endPoint].forEach((point, index) => {
        endpointsGeojson.features.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: point
            },
            properties: {
                id: `${thalweg.upstreamId}-${index === 0 ? 'start' : 'end'}`,
                thalwegId: thalweg.upstreamId,
                pointType: index === 0 ? 'start' : 'end',
                isUpstream: isUpstream
            }
        });
    });
}

function fitMapToFeatures(geojson) {
    if (geojson.features.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        geojson.features.forEach(feature => {
            if (feature.geometry.type === 'Point') {
                bounds.extend(feature.geometry.coordinates);
            } else if (feature.geometry.type === 'LineString') {
                feature.geometry.coordinates.forEach(coord => {
                    bounds.extend(coord);
                });
            }
        });
        map.fitBounds(bounds, { padding: 50 });
    }
}

function addPopupInteractions() {
    const layers = ['nodes', 'thalwegs', 'upstream-thalwegs', 'thalweg-endpoints', 'upstream-thalweg-endpoints'];
    
    layers.forEach(layer => {
        if (map.getLayer(layer)) {
            map.off('click', layer);
            map.on('click', layer, function(e) {
                const feature = e.features[0];
                const coordinates = feature.geometry.type === 'Point' ? 
                    feature.geometry.coordinates.slice() :
                    e.lngLat;
                
                let description = createPopupContent(feature, layer);

                new mapboxgl.Popup()
                    .setLngLat(coordinates)
                    .setHTML(description)
                    .addTo(map);
            });

            map.on('mouseenter', layer, function() {
                map.getCanvas().style.cursor = 'pointer';
            });

            map.on('mouseleave', layer, function() {
                map.getCanvas().style.cursor = '';
            });
        }
    });
}

function createPopupContent(feature, layer) {
    const properties = feature.properties;
    let description = '';

    switch(layer) {
        case 'nodes':
            description = `<strong>Node</strong><br>
                           <strong>ID:</strong> ${properties.id}<br>
                           <strong>Longitude:</strong> ${feature.geometry.coordinates[0]}<br>
                           <strong>Latitude:</strong> ${feature.geometry.coordinates[1]}<br>
                           <strong>Altitude:</strong> ${properties.altitude}`;
            break;
        case 'thalwegs':
        case 'upstream-thalwegs':
            description = `<strong>Thalweg</strong><br>
                           <strong>ID:</strong> ${properties.id}<br>`;
            if (properties.accumulation !== undefined) {
                description += `<strong>Accumulation:</strong> ${properties.accumulation}<br>
                                <strong>Pente:</strong> ${properties.slope.toFixed(2)}°`;
            } else if (properties.depth !== undefined) {
                description += `<strong>Profondeur:</strong> ${properties.depth}<br>
                                <strong>ID Vallée:</strong> ${properties.valleyId}`;
            }
            break;
        case 'thalweg-endpoints':
        case 'upstream-thalweg-endpoints':
            description = `<strong>${properties.pointType === 'start' ? 'Début' : 'Fin'} de Thalweg</strong><br>
                           <strong>Thalweg ID:</strong> ${properties.thalwegId}<br>
                           <strong>Longitude:</strong> ${feature.geometry.coordinates[0]}<br>
                           <strong>Latitude:</strong> ${feature.geometry.coordinates[1]}`;
            if (properties.isUpstream) {
                description += '<br><strong>Thalweg en amont</strong>';
            }
            break;
    }

    return description;
}

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

function showNoUpstreamMessage() {
    const alertContainer = document.createElement('div');
    alertContainer.style.position = 'absolute';
    alertContainer.style.top = '20px';
    alertContainer.style.left = '50%';
    alertContainer.style.transform = 'translateX(-50%)';
    alertContainer.style.backgroundColor = 'white';
    alertContainer.style.padding = '10px';
    alertContainer.style.borderRadius = '5px';
    alertContainer.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    alertContainer.style.zIndex = '1000';
    alertContainer.innerHTML = 'Aucun thalweg en amont trouvé pour le thalweg sélectionné.';

    document.body.appendChild(alertContainer);

    setTimeout(() => {
        document.body.removeChild(alertContainer);
    }, 3000);
}