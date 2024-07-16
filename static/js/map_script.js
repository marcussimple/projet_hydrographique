// Initialisation de Mapbox
mapboxgl.accessToken = 'pk.eyJ1IjoibWFyY3Vzc2ltcGxlIiwiYSI6ImNseTNvb3hobzA5cWsybHBvenRmdHNxcmwifQ.ZQAMdmO7CT--DCeE1pLF_g';
var map;

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded");
    
    // Initialisation de la carte
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
});

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

//fonction pour gérer la sélection des thalwegs
function setupThalwegSelection() {
    map.on('click', 'thalwegs', function(e) {
        const thalwegId = e.features[0].properties.id;
        showValidationOptions(thalwegId);
    });
}

// Ajoutez cette fonction pour afficher les options de validation
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

async function executeQuery(queryId, customParams = {}) {
    const query = queries.find(q => q.id === queryId);
    if (!query) {
        console.error('Requête non trouvée');
        return;
    }

    console.log(`Executing query: ${query.text}`);
    console.log('Custom params:', customParams);

    // Conversion des paramètres
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
            updateMap(data.results, queryId);  // Assurez-vous que queryId est passé ici
        } else {
            console.log("No results returned from the query");
        }
    } catch (error) {
        console.error('Erreur lors de l\'exécution de la requête:', error);
    }
}

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

        if (!map.getSource('nodes')) {
            map.addSource('nodes', { type: 'geojson', data: geojson });
            map.addLayer({
                id: 'nodes',
                type: 'circle',
                source: 'nodes',
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
        } else {
            map.getSource('nodes').setData(geojson);
        }
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

            // Ajouter les points de début et de fin
            if (thalweg.coordinates.length > 0) {
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
                            id: `${thalweg.id}-${index === 0 ? 'start' : 'end'}`,
                            thalwegId: thalweg.id,
                            pointType: index === 0 ? 'start' : 'end'
                        }
                    });
                });
            }
        });

        if (!map.getSource('thalwegs')) {
            map.addSource('thalwegs', { type: 'geojson', data: geojson });
            map.addLayer({
                id: 'thalwegs',
                type: 'line',
                source: 'thalwegs',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#3498DB',
                    'line-width': 3
                }
            });
        } else {
            map.getSource('thalwegs').setData(geojson);
        }

        if (!map.getSource('thalweg-endpoints')) {
            map.addSource('thalweg-endpoints', { type: 'geojson', data: endpointsGeojson });
            map.addLayer({
                id: 'thalweg-endpoints',
                type: 'circle',
                source: 'thalweg-endpoints',
                paint: {
                    'circle-radius': 3,
                    'circle-color': [
                        'match',
                        ['get', 'pointType'],
                        'start', '#000000',
                        'end', '#000000',
                        '#000000'
                    ],
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#000'
                }
            });
        } else {
            map.getSource('thalweg-endpoints').setData(endpointsGeojson);
        }
    } else if (queryId === 4) {   // Thalwegs en amont
        data.forEach(thalweg => {
            geojson.features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: thalweg.coordinates
                },
                properties: {
                    id: thalweg.upstreamId,
                    depth: thalweg.depth,
                    valleyId: thalweg.valleyId
                }
            });

            // Ajouter les points de début et de fin pour les thalwegs en amont
            if (thalweg.coordinates.length > 0) {
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
                            isUpstream: true
                        }
                    });
                });
            }
        });

        if (!map.getSource('upstream-thalwegs')) {
            map.addSource('upstream-thalwegs', { type: 'geojson', data: geojson });
            map.addLayer({
                id: 'upstream-thalwegs',
                type: 'line',
                source: 'upstream-thalwegs',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#00FF00',
                    'line-width': 3
                }
            });
        } else {
            map.getSource('upstream-thalwegs').setData(geojson);
        }

        if (!map.getSource('upstream-thalweg-endpoints')) {
            map.addSource('upstream-thalweg-endpoints', { type: 'geojson', data: endpointsGeojson });
            map.addLayer({
                id: 'upstream-thalweg-endpoints',
                type: 'circle',
                source: 'upstream-thalweg-endpoints',
                paint: {
                    'circle-radius': 3,
                    'circle-color': '#00FF00',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#000'
                }
            });
        } else {
            map.getSource('upstream-thalweg-endpoints').setData(endpointsGeojson);
        }
    }

    // Ajuster la vue de la carte seulement si c'est une nouvelle requête
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

    addPopupInteractions(queryId);
}

function addPopupInteractions(queryId) {
    const layers = ['nodes', 'thalwegs', 'upstream-thalwegs', 'thalweg-endpoints', 'upstream-thalweg-endpoints'];
    
    layers.forEach(layer => {
        if (map.getLayer(layer)) {
            map.off('click', layer);
            map.on('click', layer, function(e) {
                var coordinates = e.features[0].geometry.coordinates.slice();
                var properties = e.features[0].properties;
                var description = '';

                if (layer === 'nodes') {
                    description = `<strong>Node</strong><br>
                                   <strong>ID:</strong> ${properties.id}<br>
                                   <strong>Longitude:</strong> ${coordinates[0]}<br>
                                   <strong>Latitude:</strong> ${coordinates[1]}<br>
                                   <strong>Altitude:</strong> ${properties.altitude}`;
                } else if (layer === 'thalwegs' || layer === 'upstream-thalwegs') {
                    description = `<strong>Thalweg</strong><br>
                                   <strong>ID:</strong> ${properties.id}<br>`;
                    if (properties.accumulation !== undefined) {
                        description += `<strong>Accumulation:</strong> ${properties.accumulation}<br>
                                        <strong>Pente:</strong> ${properties.slope.toFixed(2)}°`;
                    } else if (properties.depth !== undefined) {
                        description += `<strong>Profondeur:</strong> ${properties.depth}<br>
                                        <strong>ID Vallée:</strong> ${properties.valleyId}`;
                    }
                } else if (layer === 'thalweg-endpoints' || layer === 'upstream-thalweg-endpoints') {
                    description = `<strong>${properties.pointType === 'start' ? 'Début' : 'Fin'} de Thalweg</strong><br>
                                   <strong>Thalweg ID:</strong> ${properties.thalwegId}<br>
                                   <strong>Longitude:</strong> ${coordinates[0]}<br>
                                   <strong>Latitude:</strong> ${coordinates[1]}`;
                    if (properties.isUpstream) {
                        description += '<br><strong>Thalweg en amont</strong>';
                    }
                }

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

function parseLineStringZ(geometryString) {
    const coords = geometryString.match(/\(([^)]+)\)/)[1].split(',').map(coord => {
        const [lon, lat, z] = coord.trim().split(' ').map(Number);
        return [lon, lat];  // Nous ignorons la valeur Z pour l'affichage 2D
    });
    return coords;
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