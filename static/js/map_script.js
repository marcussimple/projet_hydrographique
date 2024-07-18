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
            { name: 'limit', type: 'number', default: 28000, label: 'Nombre de thalwegs à afficher' }
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
    { 
        id: 5, 
        text: "Afficher les cours d'eau en aval", 
        type: "validation", 
        cypher: "CALL custom.getDownstreamThalwegs($thalwegId)",
        customizable: false
    },
    {
        id: 6,
        text: "Afficher les crêtes des cours d'eau en amont",
        type: "validation",
        cypher: "CALL custom.getUpstreamThalwegs($thalwegId)",
        customizable: false
    }
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

function showLoading() {
    console.log('Showing loading overlay');
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    console.log('Hiding loading overlay');
    document.getElementById('loading-overlay').style.display = 'none';
}

function populateQueryLists() {
    console.log("Populating query lists");
    
    // Vider les listes existantes
    document.getElementById('interrogation-list').innerHTML = '';
    document.getElementById('validation-list').innerHTML = '';
    document.getElementById('statistique-list').innerHTML = '';

    queries.forEach(query => {
        const queryItem = document.createElement('div');
        queryItem.textContent = query.text;
        queryItem.className = 'query-item';
        
        queryItem.onclick = function() { 
            console.log(`Query clicked: ${query.text}`);
            if (query.type === "validation") {
                if (selectedThalwegId) {
                    executeQuery(query.id, { thalwegId: selectedThalwegId });
                } else {
                    showMessage("Veuillez d'abord sélectionner un thalweg sur la carte.");
                }
            } else if (query.customizable) {
                showCustomizationModal(query);
            } else {
                executeQuery(query.id);
            }
        };

        const listElement = document.getElementById(`${query.type}-list`);
        if (listElement) {
            listElement.appendChild(queryItem);
        } else {
            console.error(`List element not found for type: ${query.type}`);
        }
    });

    // Afficher les listes qui contiennent des éléments
    ['interrogation', 'validation', 'statistique'].forEach(type => {
        const list = document.getElementById(`${type}-list`);
        const queryType = document.querySelector(`.query-type[data-type="${type}"]`);
        if (list.children.length > 0) {
            list.style.display = 'block';
            queryType.style.display = 'block';
        } else {
            list.style.display = 'none';
            queryType.style.display = 'none';
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

function parseLineString(geometryString) {
    const match = geometryString.match(/LINESTRING Z \((.*)\)/);
    if (match) {
        const coordinates = match[1].split(', ').map(coord => {
            const [lon, lat] = coord.split(' ').map(parseFloat);
            return [lon, lat];
        });
        return coordinates;
    }
    return null;
}

function setupThalwegSelection() {
    map.on('click', 'thalwegs', function(e) {
        const thalwegId = e.features[0].properties.id;
        selectThalweg(thalwegId);
    });

    document.getElementById('select-thalweg-button').addEventListener('click', function() {
        const thalwegId = document.getElementById('thalweg-id-input').value;
        if (thalwegId) {
            selectThalweg(parseInt(thalwegId));
        } else {
            showMessage("Veuillez entrer un ID de thalweg valide.");
        }
    });
}

function selectThalweg(thalwegId) {
    selectedThalwegId = thalwegId;
    document.getElementById('thalweg-id-input').value = thalwegId;
    
    //showLoading(); // Afficher l'animation de chargement

    // Mettre à jour la couleur du thalweg sélectionné sur la carte
    map.setPaintProperty('thalwegs', 'line-color', [
        'case',
        ['==', ['get', 'id'], selectedThalwegId],
        '#0000FF',  // Bleu foncé pour le thalweg sélectionné
        '#819FF7'   // Bleu pale pour les autres thalwegs                      ---------------------------------- SELECTED THALWEG COLOR--------------------
    ]);

    // Récupérer les informations du thalweg sélectionné
    fetch('/get_thalweg_info/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({ thalwegId: selectedThalwegId }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Erreur réseau lors de la récupération des informations du thalweg');
        }
        return response.json();
    })
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
        updateSelectedThalwegInfo(data);
        zoomToThalweg(data.coordinates);
    })
    .catch(error => {
        console.error('Erreur lors de la récupération des informations du thalweg:', error);
        showMessage("Erreur lors de la récupération des informations du thalweg.");
    })
    .finally(() => {
        hideLoading(); // Cacher l'animation de chargement, que la requête réussisse ou échoue
    });
}

function zoomToThalweg(coordinates) {
    if (coordinates && coordinates.length > 0) {
        const bounds = coordinates.reduce((bounds, coord) => {
            return bounds.extend(coord);
        }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

        map.fitBounds(bounds, {
            padding: 50,  // Ajoute un peu d'espace autour du thalweg
            duration: 1000  // Durée de l'animation en millisecondes
        });
    }
}

function updateSelectedThalwegInfo(properties) {
    const infoDiv = document.getElementById('selected-thalweg-info');
    infoDiv.innerHTML = `
        <div class="thalweg-info">
            <h4>Cours d'eau sélectionné</h4>
            <p><strong>ID:</strong> ${properties.id}</p>
            <p><strong>Accumulation:</strong> ${properties.accumulation}</p>
            <p><strong>Pente:</strong> ${properties.slope ? properties.slope.toFixed(2) + '°' : 'N/A'}</p>
        </div>
    `;
}

function updateUpstreamThalwegsInfo(thalwegs) {
    const infoDiv = document.getElementById('upstream-thalwegs-info');
    infoDiv.innerHTML = thalwegs.map((thalweg, index) => `
        <div class="thalweg-info ${index % 2 === 0 ? 'even' : 'odd'}" style="background-color: #90EE90;">
            <p><strong>ID:</strong> ${thalweg.upstreamId}</p>
            <p><strong>Accumulation:</strong> ${thalweg.accumulation || 'N/A'}</p>
            <p><strong>Pente:</strong> ${thalweg.slope ? thalweg.slope.toFixed(2) + '°' : 'N/A'}</p>
            <p><strong>Profondeur:</strong> ${thalweg.depth}</p>
        </div>
    `).join('');
}

function updateDownstreamThalwegsInfo(thalwegs) {
    const infoDiv = document.getElementById('upstream-thalwegs-info');
    infoDiv.innerHTML = thalwegs.map((thalweg, index) => `
        <div class="thalweg-info ${index % 2 === 0 ? 'even' : 'odd'}" style="background-color: #FFB6C1;">
            <p><strong>ID:</strong> ${thalweg.downstreamId}</p>
            <p><strong>Accumulation:</strong> ${thalweg.accumulation || 'N/A'}</p>
            <p><strong>Pente:</strong> ${thalweg.slope ? thalweg.slope.toFixed(2) + '°' : 'N/A'}</p>
            <p><strong>Profondeur:</strong> ${thalweg.depth}</p>
        </div>
    `).join('');
}

async function executeQuery(queryId, customParams = {}) {
    const query = queries.find(q => q.id === queryId);
    if (!query) {
        console.error('Requête non trouvée');
        return;
    }

    console.log(`Executing query: ${query.text}`);
    console.log('Custom params:', customParams);

    showLoading(); // Afficher l'animation de chargement

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
        showMessage("Une erreur s'est produite lors de l'exécution de la requête.");
    } finally {
        hideLoading(); // Cacher l'animation de chargement, que la requête réussisse ou échoue
    }
}


function parseRidgeGeometry(geometryString) {
    const match = geometryString.match(/LINESTRING Z \((.*)\)/);
    if (match) {
        const coordinates = match[1].split(', ').map(coord => {
            const [lon, lat] = coord.split(' ').map(parseFloat);
            return [lon, lat];
        });
        return coordinates;
    }
    return null;
}




function updateMap(data, queryId) {
    console.log("Updating map with data:", data);
    console.log("Query ID:", queryId);

    const thalwegLinesGeojson = {
        type: 'FeatureCollection',
        features: []
    };

    const thalwegPointsGeojson = {
        type: 'FeatureCollection',
        features: []
    };

    const ridgesGeojson = {
        type: 'FeatureCollection',
        features: []
    };

    if (queryId === 1 || queryId === 3) {
        // Traitement des nœuds
        data.forEach(node => {
            thalwegPointsGeojson.features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [node.longitude, node.latitude]
                },
                properties: {
                    id: node.id,
                    altitude: node.altitude,
                    type: 'node'
                }
            });
        });
    } else if (queryId === 2 || queryId === 4 || queryId === 5 || queryId === 6) {
        // Traitement des thalwegs
        data.forEach(thalweg => {
            if (thalweg.coordinates && thalweg.coordinates.length >= 2) {
                // Ligne du thalweg
                thalwegLinesGeojson.features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: thalweg.coordinates
                    },
                    properties: {
                        id: thalweg.id || thalweg.upstreamId || thalweg.downstreamId,
                        accumulation: thalweg.accumulation,
                        slope: thalweg.slope,
                        depth: thalweg.depth,
                        valleyId: thalweg.valleyId
                    }
                });

                // Point de départ
                thalwegPointsGeojson.features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: thalweg.coordinates[0]
                    },
                    properties: {
                        id: `${thalweg.id || thalweg.upstreamId || thalweg.downstreamId}-start`,
                        thalwegId: thalweg.id || thalweg.upstreamId || thalweg.downstreamId,
                        type: 'start'
                    }
                });

                // Point d'arrivée
                thalwegPointsGeojson.features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: thalweg.coordinates[thalweg.coordinates.length - 1]
                    },
                    properties: {
                        id: `${thalweg.id || thalweg.upstreamId || thalweg.downstreamId}-end`,
                        thalwegId: thalweg.id || thalweg.upstreamId || thalweg.downstreamId,
                        type: 'end'
                    }
                });
            }

            // Traitement des ridges
            if (thalweg.ridges && thalweg.ridges.length > 0) {
                thalweg.ridges.forEach(ridge => {
                    if (ridge.coordinates && ridge.coordinates.length > 0) {
                        ridgesGeojson.features.push({
                            type: 'Feature',
                            geometry: {
                                type: 'LineString',
                                coordinates: ridge.coordinates
                            },
                            properties: {
                                id: ridge.id,
                                thalwegId: thalweg.id || thalweg.upstreamId || thalweg.downstreamId
                            }
                        });
                    }
                });
            }
        });
    }

    // Mise à jour des couches
    const layerPrefix = queryId === 4 ? 'upstream' : (queryId === 5 ? 'downstream' : '');
    const thalwegColor = queryId === 4 ? '#00FF00' : (queryId === 5 ? '#FE2E2E' : '#0000FF');

    // Mise à jour des lignes de thalwegs
    updateLayer(`${layerPrefix}thalwegs`, thalwegLinesGeojson, {
        type: 'line',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': thalwegColor,
            'line-width': 3
        }
    });

    // Mise à jour des points de thalwegs
    updateLayer(`${layerPrefix}thalweg-points`, thalwegPointsGeojson, {
        type: 'circle',
        paint: {
            'circle-radius': 3,
            'circle-color': [
                'match',
                ['get', 'type'],
                'start', '#000000',  // Vert pour le point de départ
                'end', '#000000',    // Rouge pour le point d'arrivée
                '#B42222'            // Couleur par défaut pour les autres points
            ],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#FFFFFF'
        }
    });

    if (queryId === 4 || queryId === 6) {
        updateLayer(`${layerPrefix}ridges`, ridgesGeojson, {
            type: 'line',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#FFA500', // orange pour les ridges
                'line-width': 2
            }
        });
    }

    // Mise à jour des informations affichées
    if (queryId === 4 || queryId === 5) {
        updateThalwegsInfo(data, queryId === 4 ? 'upstream' : 'downstream');
    } else if (queryId === 6) {
        updateUpstreamRidgesInfo(data);
    }

    // Ajuster la vue de la carte
    fitMapToFeatures(thalwegLinesGeojson);
}


function updateThalwegsInfo(thalwegs, type) {
    const infoDiv = document.getElementById('upstream-thalwegs-info');
    infoDiv.innerHTML = thalwegs.map((thalweg, index) => `
        <div class="thalweg-info ${index % 2 === 0 ? 'even' : 'odd'}" style="background-color: ${type === 'upstream' ? '#90EE90' : '#FFB6C1'};">
            <p><strong>ID:</strong> ${thalweg[type + 'Id']}</p>
            <p><strong>Profondeur:</strong> ${thalweg.depth}</p>
            <p><strong>ID Vallée:</strong> ${thalweg.valleyId}</p>
        </div>
    `).join('');
}


function updateUpstreamRidgesInfo(data) {
    const infoDiv = document.getElementById('upstream-thalwegs-info');
    infoDiv.innerHTML = data.flatMap(thalweg => 
        thalweg.ridges.map((ridge, index) => `
            <div class="ridge-info ${index % 2 === 0 ? 'even' : 'odd'}" style="background-color: #FFC0CB;">
                <p><strong>Ridge ID:</strong> ${ridge.id}</p>
                <p><strong>Thalweg associé:</strong> ${thalweg.upstreamId}</p>
                <p><strong>Profondeur du thalweg:</strong> ${thalweg.depth}</p>
            </div>
        `)
    ).join('');
}


function updateLayer(layerId, geojsonData, layerOptions) {
    if (map.getSource(layerId)) {
        map.getSource(layerId).setData(geojsonData);
    } else {
        map.addSource(layerId, {
            type: 'geojson',
            data: geojsonData
        });
        map.addLayer({
            id: layerId,
            source: layerId,
            ...layerOptions
        });
    }
}

function addEndpoints(thalweg, endpointsGeojson, isUpstream = false) {
    const startPoint = thalweg.coordinates[0];
    const endPoint = thalweg.coordinates[thalweg.coordinates.length - 1];
    const id = isUpstream ? thalweg.upstreamId : thalweg.downstreamId;
    
    [startPoint, endPoint].forEach((point, index) => {
        endpointsGeojson.features.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: point
            },
            properties: {
                id: `${id}-${index === 0 ? 'start' : 'end'}`,
                thalwegId: id,
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

function showMessage(message) {
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
    alertContainer.innerHTML = message;

    document.body.appendChild(alertContainer);

    setTimeout(() => {
        document.body.removeChild(alertContainer);
    }, 3000);
}

